/**
 * VoidMind — Cleanup & Maintenance Service
 * Periodic tasks: key expiration, session cleanup, metrics refresh.
 */

const cron = require('node-cron');
const { runAsync, getAsync, allAsync } = require('../config/database');
const { cleanupExpiredSessions, getSessionStats } = require('./session');
const { setActiveSessions, setApiKeysTotal, setOllamaUp } = require('./metricsCollector');
const { listModels } = require('./ollama');
const { alertOllamaDown, alertOllamaRecovered } = require('./webhook');
const logger = require('../utils/logger');

let ollamaWasUp = true;

async function checkOllamaHealth() {
  try {
    await listModels();
    if (!ollamaWasUp) {
      ollamaWasUp = true;
      await alertOllamaRecovered();
    }
    setOllamaUp(true);
  } catch {
    if (ollamaWasUp) {
      ollamaWasUp = false;
      await alertOllamaDown();
    }
    setOllamaUp(false);
  }
}

async function cleanupExpiredKeys() {
  try {
    const result = await runAsync(
      `DELETE FROM api_keys WHERE expires_at IS NOT NULL AND expires_at < datetime('now')`
    );
    if (result.changes > 0) {
      logger.safeLog('info', 'Expired API keys cleaned up', { count: result.changes });
    }
  } catch (err) {
    logger.error('Failed to clean up expired keys', { error: err.message });
  }
}

async function updateMetrics() {
  try {
    const stats = getSessionStats();
    setActiveSessions(stats.active_sessions);

    const activeKeys = await getAsync("SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1");
    const pausedKeys = await getAsync("SELECT COUNT(*) as count FROM api_keys WHERE is_active = 0");
    setApiKeysTotal(activeKeys?.count || 0, pausedKeys?.count || 0);
  } catch (err) {
    logger.error('Failed to update metrics', { error: err.message });
  }
}

function startCleanupTasks() {
  // Clean expired sessions every 30 seconds
  cron.schedule('*/30 * * * * *', () => {
    cleanupExpiredSessions();
  });

  // Check Ollama health every minute
  cron.schedule('* * * * *', () => {
    checkOllamaHealth();
  });

  // Clean expired API keys daily at 3 AM
  cron.schedule('0 3 * * *', () => {
    cleanupExpiredKeys();
  });

  // Update Prometheus metrics every 15 seconds
  cron.schedule('*/15 * * * * *', () => {
    updateMetrics();
  });

  logger.info('Cleanup and maintenance tasks scheduled');
}

module.exports = { startCleanupTasks };
