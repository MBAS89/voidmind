/**
 * VoidMind — Secure Wipe Service
 * Explicit secure deletion utilities for session data.
 * All operations are auditable and open source.
 */

const { wipeSession, wipeAllSessions } = require('./session');
const { logAdminAction } = require('../middleware/audit');
const logger = require('../utils/logger');

/**
 * Wipe a single session by ID.
 * Returns true if session existed and was wiped.
 */
function secureWipeSession(sessionId, adminEmail = 'system') {
  const existed = wipeSession(sessionId);
  if (existed) {
    logAdminAction(adminEmail, 'session_wipe', { resourceId: sessionId });
    logger.safeLog('info', 'Session securely wiped', { session_id: sessionId });
  }
  return existed;
}

/**
 * Wipe all active sessions.
 * Returns count of wiped sessions.
 */
function secureWipeAllSessions(adminEmail = 'system') {
  const count = wipeAllSessions();
  logAdminAction(adminEmail, 'session_wipe_all', { resourceId: `count:${count}` });
  logger.safeLog('info', 'All sessions securely wiped', { count });
  return count;
}

module.exports = {
  secureWipeSession,
  secureWipeAllSessions,
};
