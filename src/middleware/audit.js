/**
 * VoidMind — Admin Action Audit Middleware
 * Logs all admin actions to SQLite for compliance.
 * No user data, no conversation content — only who did what, when, from where.
 */

const { runAsync } = require('../config/database');
const logger = require('../utils/logger');

function auditAction(action, resource, resourceId) {
  return async function auditMiddleware(req, res, next) {
    // Defer logging until after response is sent, so we can capture status
    res.on('finish', async () => {
      try {
        const adminEmail = req.admin?.email || 'unknown';
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';

        await runAsync(
          `INSERT INTO admin_logs (admin_email, action, resource, resource_id, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [adminEmail, action, resource, resourceId || req.params.id || null, ip, userAgent]
        );
      } catch (err) {
        logger.error('Failed to write audit log', { error: err.message });
      }
    });
    next();
  };
}

// Convenience wrapper for inline logging
async function logAdminAction(adminEmail, action, details = {}) {
  try {
    await runAsync(
      `INSERT INTO admin_logs (admin_email, action, resource, resource_id, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        adminEmail,
        action,
        details.resource || null,
        details.resourceId || null,
        details.ip || 'system',
        details.userAgent || 'system',
      ]
    );
  } catch (err) {
    logger.error('Failed to write admin action log', { error: err.message });
  }
}

module.exports = { auditAction, logAdminAction };
