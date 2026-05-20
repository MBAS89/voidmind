/**
 * VoidMind — API Key Authentication Middleware
 * Validates API keys for user-facing endpoints.
 * Keys are stored as sha256 hashes — we hash the provided key and compare.
 */

const { db, getAsync } = require('../config/database');
const { hashApiKey } = require('../utils/crypto');
const { alertKeyLimitWarning, alertKeyLimitExceeded } = require('../services/webhook');
const logger = require('../utils/logger');

function parseIPList(ipString) {
  if (!ipString) return null;
  return ipString.split(',').map(s => s.trim()).filter(Boolean);
}

function ipMatches(entry, clientIP) {
  if (entry.includes('/')) {
    const [subnet, prefix] = entry.split('/');
    const bits = parseInt(prefix, 10);
    const ipNum = clientIP.split('.').reduce((a, b) => (a << 8) | parseInt(b, 10), 0) >>> 0;
    const subNum = subnet.split('.').reduce((a, b) => (a << 8) | parseInt(b, 10), 0) >>> 0;
    const mask = bits === 32 ? 0xFFFFFFFF : (~((1 << (32 - bits)) - 1)) >>> 0;
    return (ipNum & mask) === (subNum & mask);
  }
  return entry === clientIP;
}

function checkKeyIPWhitelist(allowedIps, clientIP) {
  const list = parseIPList(allowedIps);
  if (!list || list.length === 0) return true; // No restriction
  for (const entry of list) {
    if (ipMatches(entry, clientIP)) return true;
  }
  return false;
}

async function apiKeyAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Missing or invalid Authorization header. Expected: Bearer <api_key>',
    });
  }

  const key = authHeader.slice(7).trim();
  if (!key) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'API key is empty',
    });
  }

  const keyHash = hashApiKey(key);

  try {
    const row = await getAsync(
      'SELECT id, name, is_active, expires_at, tokens_used, monthly_limit, daily_limit, tokens_used_today, last_reset_date, allowed_ips FROM api_keys WHERE key_hash = ?',
      [keyHash]
    );

    if (!row) {
      logger.safeLog('warn', 'Invalid API key attempt', {
        ip: req.ip,
        path: req.path,
      });
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid API key',
      });
    }

    if (!row.is_active) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'API key is revoked',
      });
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'API key has expired',
      });
    }

    // Check daily reset
    const today = new Date().toISOString().slice(0, 10);
    if (row.last_reset_date !== today) {
      // Reset daily counters
      await getAsync(
        "UPDATE api_keys SET tokens_used_today = 0, requests_today = 0, last_reset_date = date('now') WHERE id = ?",
        [row.id]
      );
      row.tokens_used_today = 0;
      row.requests_today = 0;
    }

    // Check per-key IP whitelist
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    if (!checkKeyIPWhitelist(row.allowed_ips, clientIP)) {
      logger.safeLog('warn', 'API key used from non-allowed IP', {
        key_id: row.id,
        ip: clientIP,
      });
      return res.status(403).json({
        error: 'forbidden',
        message: 'This API key is not authorized from this IP address',
      });
    }

    // Check limits with webhook alerts
    if (row.daily_limit > 0) {
      if (row.tokens_used_today >= row.daily_limit) {
        alertKeyLimitExceeded(row.id, row.name, 'daily', row.daily_limit);
        return res.status(429).json({
          error: 'rate_limit_exceeded',
          message: 'Daily token limit exceeded',
        });
      }
      // Warning at 80%
      if (row.tokens_used_today >= row.daily_limit * 0.8) {
        alertKeyLimitWarning(row.id, row.name, 'daily', row.tokens_used_today, row.daily_limit);
      }
    }

    if (row.monthly_limit > 0) {
      if (row.tokens_used >= row.monthly_limit) {
        alertKeyLimitExceeded(row.id, row.name, 'monthly', row.monthly_limit);
        return res.status(429).json({
          error: 'rate_limit_exceeded',
          message: 'Monthly token limit exceeded',
        });
      }
      // Warning at 80%
      if (row.tokens_used >= row.monthly_limit * 0.8) {
        alertKeyLimitWarning(row.id, row.name, 'monthly', row.tokens_used, row.monthly_limit);
      }
    }

    // Attach key info to request
    req.apiKey = {
      id: row.id,
      name: row.name,
      hash: keyHash,
      dailyLimit: row.daily_limit,
      monthlyLimit: row.monthly_limit,
      tokensUsedToday: row.tokens_used_today || 0,
      tokensUsed: row.tokens_used || 0,
    };

    next();
  } catch (err) {
    logger.error('API key auth error', { error: err.message });
    return res.status(500).json({
      error: 'internal_error',
      message: 'Authentication check failed',
    });
  }
}

module.exports = { apiKeyAuth };
