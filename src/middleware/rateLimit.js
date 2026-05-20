/**
 * VoidMind — Rate Limiting Middleware
 * Per-API-key in-memory rate limiting with configurable windows.
 * Admin endpoints have a separate, stricter limit.
 */

const constants = require('../config/constants');
const logger = require('../utils/logger');

// In-memory store: Map<keyHash, { count, resetTime }>
// This is NOT user data — it's operational rate-limit counters.
const userStore = new Map();
const adminStore = new Map();

function cleanupStore(store) {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetTime <= now) {
      store.delete(key);
    }
  }
}

// Periodic cleanup every minute
setInterval(() => {
  cleanupStore(userStore);
  cleanupStore(adminStore);
}, 60000);

function createRateLimiter(store, maxRequests, windowMs, keyExtractor) {
  return function rateLimitMiddleware(req, res, next) {
    const key = keyExtractor(req);
    if (!key) {
      return next();
    }

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetTime <= now) {
      // New window
      store.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - 1));
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));
      return next();
    }

    if (entry.count >= maxRequests) {
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));
      res.setHeader('Retry-After', Math.ceil((entry.resetTime - now) / 1000));
      logger.safeLog('warn', 'Rate limit exceeded', {
        key: key.slice(0, 8) + '...',
        path: req.path,
      });
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: 'Too many requests. Please try again later.',
      });
    }

    entry.count += 1;
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));
    next();
  };
}

const userRateLimit = createRateLimiter(
  userStore,
  constants.RATE_LIMIT_USER_RPM,
  constants.RATE_LIMIT_WINDOW_MS,
  (req) => req.apiKey?.hash || req.ip
);

const adminRateLimit = createRateLimiter(
  adminStore,
  constants.RATE_LIMIT_ADMIN_RPM,
  constants.RATE_LIMIT_WINDOW_MS,
  (req) => req.admin?.email || req.ip
);

module.exports = { userRateLimit, adminRateLimit };
