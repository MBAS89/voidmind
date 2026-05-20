/**
 * VoidMind — Metrics Service
 * Records token usage and latency to SQLite.
 * NO content, NO user data — only counts and operational metadata.
 */

const { runAsync } = require('../config/database');
const logger = require('../utils/logger');

async function recordUsage({ keyId, endpoint, tokensUsed, promptTokens, completionTokens, status, latency, model }) {
  try {
    await runAsync(
      `INSERT INTO usage_logs (key_id, endpoint, tokens_used, prompt_tokens, completion_tokens, status, latency_ms, model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [keyId, endpoint, tokensUsed, promptTokens, completionTokens, status, latency, model]
    );

    // Update aggregated counters on api_keys
    await runAsync(
      `UPDATE api_keys
       SET tokens_used = tokens_used + ?,
           tokens_used_today = tokens_used_today + ?,
           requests_today = requests_today + 1
       WHERE id = ?`,
      [tokensUsed, tokensUsed, keyId]
    );
  } catch (err) {
    logger.error('Failed to record usage metrics', { error: err.message });
  }
}

async function getUsageStats(period = 'today') {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';

  try {
    const totalKeysRow = await runAsync.constructor.name === 'Promise'
      ? null
      : null; // placeholder — we use allAsync below

    const totalKeys = await require('../config/database').getAsync(
      'SELECT COUNT(*) as count FROM api_keys'
    );
    const activeKeys = await require('../config/database').getAsync(
      'SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1'
    );

    const todayUsage = await require('../config/database').getAsync(
      `SELECT COALESCE(SUM(tokens_used), 0) as total, COALESCE(COUNT(*), 0) as requests, COALESCE(AVG(latency_ms), 0) as avg_latency
       FROM usage_logs WHERE date(timestamp) = date('now')`
    );

    const monthUsage = await require('../config/database').getAsync(
      `SELECT COALESCE(SUM(tokens_used), 0) as total
       FROM usage_logs WHERE date(timestamp) >= date('now', 'start of month')`
    );

    const topKeys = await require('../config/database').allAsync(
      `SELECT
         u.key_id,
         k.name,
         COALESCE(SUM(u.tokens_used), 0) as tokens_today,
         COALESCE(COUNT(u.id), 0) as requests_today,
         COALESCE(AVG(u.latency_ms), 0) as avg_latency_ms
       FROM usage_logs u
       LEFT JOIN api_keys k ON u.key_id = k.id
       WHERE date(u.timestamp) = date('now')
       GROUP BY u.key_id
       ORDER BY tokens_today DESC
       LIMIT 10`
    );

    return {
      total_keys: totalKeys?.count || 0,
      active_keys: activeKeys?.count || 0,
      total_tokens_today: todayUsage?.total || 0,
      total_tokens_this_month: monthUsage?.total || 0,
      average_latency_ms: Math.round(todayUsage?.avg_latency || 0),
      requests_today: todayUsage?.requests || 0,
      top_keys: topKeys.map(k => ({
        key_id: k.key_id,
        name: k.name,
        tokens_today: k.tokens_today,
        requests_today: k.requests_today,
        avg_latency_ms: Math.round(k.avg_latency_ms || 0),
      })),
    };
  } catch (err) {
    logger.error('Failed to get usage stats', { error: err.message });
    throw err;
  }
}

async function getKeyUsage(keyId) {
  try {
    const todayUsage = await require('../config/database').getAsync(
      `SELECT COALESCE(SUM(tokens_used), 0) as total, COALESCE(COUNT(*), 0) as requests
       FROM usage_logs WHERE key_id = ? AND date(timestamp) = date('now')`,
      [keyId]
    );

    const monthUsage = await require('../config/database').getAsync(
      `SELECT COALESCE(SUM(tokens_used), 0) as total
       FROM usage_logs WHERE key_id = ? AND date(timestamp) >= date('now', 'start of month')`,
      [keyId]
    );

    return {
      key_id: keyId,
      tokens_today: todayUsage?.total || 0,
      tokens_this_month: monthUsage?.total || 0,
      requests_today: todayUsage?.requests || 0,
    };
  } catch (err) {
    logger.error('Failed to get key usage', { error: err.message, keyId });
    throw err;
  }
}

module.exports = {
  recordUsage,
  getUsageStats,
  getKeyUsage,
};
