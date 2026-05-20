/**
 * VoidMind — Admin Authentication Middleware
 * JWT (RS256) + IP whitelist enforcement.
 */

const { verifyToken } = require('../config/security');
const { getAsync } = require('../config/database');
const logger = require('../utils/logger');

function parseIPWhitelist() {
  const raw = process.env.ADMIN_IP_WHITELIST || '127.0.0.1/32,::1/128';
  return raw.split(',').map(s => s.trim());
}

function ipMatchesCidr(ip, cidr) {
  if (cidr.includes('/')) {
    // Simple CIDR check for IPv4
    const [subnet, prefix] = cidr.split('/');
    const bits = parseInt(prefix, 10);
    const ipNum = ip.split('.').reduce((a, b) => (a << 8) | parseInt(b, 10), 0) >>> 0;
    const subNum = subnet.split('.').reduce((a, b) => (a << 8) | parseInt(b, 10), 0) >>> 0;
    const mask = bits === 32 ? 0xFFFFFFFF : (~((1 << (32 - bits)) - 1)) >>> 0;
    return (ipNum & mask) === (subNum & mask);
  }
  return ip === cidr;
}

function checkIPWhitelist(ip) {
  const whitelist = parseIPWhitelist();
  for (const entry of whitelist) {
    if (ipMatchesCidr(ip, entry)) return true;
  }
  return false;
}

async function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

  // IP whitelist check first
  if (!checkIPWhitelist(clientIP)) {
    logger.safeLog('warn', 'Admin access from non-whitelisted IP', {
      ip: clientIP,
      path: req.path,
    });
    return res.status(403).json({
      error: 'forbidden',
      message: 'Access denied from this IP address',
    });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Missing or invalid Authorization header',
    });
  }

  const token = authHeader.slice(7).trim();

  try {
    const decoded = verifyToken(token);

    // Check if refresh token is revoked (only for refresh tokens used as access — safety)
    if (decoded.jti) {
      const revoked = await getAsync(
        'SELECT revoked FROM refresh_tokens WHERE token_jti = ?',
        [decoded.jti]
      );
      if (revoked && revoked.revoked) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Token has been revoked',
        });
      }
    }

    req.admin = {
      email: decoded.sub || decoded.email,
      role: decoded.role || 'admin',
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'token_expired',
        message: 'Access token has expired',
      });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid token',
      });
    }
    logger.error('Admin auth error', { error: err.message });
    return res.status(500).json({
      error: 'internal_error',
      message: 'Authentication check failed',
    });
  }
}

module.exports = { adminAuth };
