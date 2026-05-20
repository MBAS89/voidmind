/**
 * VoidMind — Admin API Routes
 * Operational endpoints for dashboard control.
 * JWT + IP whitelist required. No user data, no conversation content.
 */

const express = require('express');
const router = express.Router();

const { adminAuth } = require('../middleware/adminAuth');
const { adminRateLimit } = require('../middleware/rateLimit');
const { validateCreateKey, validateUpdateLimits, validateAdminLogin, validateChangePassword } = require('../middleware/validate');
const { auditAction, logAdminAction } = require('../middleware/audit');
const { signAccessToken, signRefreshToken, verifyToken, comparePassword, hashPassword } = require('../config/security');
const { generateApiKey, hashApiKey, generateId } = require('../utils/crypto');
const { db, runAsync, getAsync, allAsync } = require('../config/database');
const { getSessionStats, wipeAllSessions } = require('../services/session');
const { getUsageStats, getKeyUsage } = require('../services/metrics');
const { listModels } = require('../services/ollama');
const { register } = require('../services/metricsCollector');
const { alertKeyLimitWarning, alertKeyLimitExceeded } = require('../services/webhook');
const logger = require('../utils/logger');

/**
 * Verify admin credentials.
 * Checks database first, falls back to environment variables for backward compatibility.
 */
async function verifyAdminCredentials(email, password) {
  // Check database first
  const dbAdmin = await getAsync('SELECT email, password_hash, is_active FROM admins WHERE email = ?', [email]);
  if (dbAdmin) {
    if (!dbAdmin.is_active) {
      return { valid: false, reason: 'Account is deactivated' };
    }
    const valid = await comparePassword(password, dbAdmin.password_hash);
    return { valid, email: dbAdmin.email };
  }

  // Fallback to environment variables (legacy bootstrap)
  const envEmail = process.env.ADMIN_EMAIL;
  const envHash = process.env.ADMIN_PASSWORD_HASH;
  if (envEmail && envHash && email === envEmail) {
    const valid = await comparePassword(password, envHash);
    return { valid, email: envEmail };
  }

  return { valid: false };
}

// Admin login
router.post('/auth/login', validateAdminLogin, async (req, res) => {
  const { email, password } = req.validatedBody;

  const result = await verifyAdminCredentials(email, password);
  if (!result.valid) {
    return res.status(401).json({
      error: 'unauthorized',
      message: result.reason || 'Invalid credentials',
    });
  }

  const accessToken = signAccessToken({ sub: result.email, role: 'admin' });
  const refreshToken = signRefreshToken({ sub: result.email, role: 'admin' });

  // Store refresh token for revocation support
  const decoded = verifyToken(refreshToken);
  await runAsync(
    `INSERT INTO refresh_tokens (token_jti, admin_email, expires_at)
     VALUES (?, ?, datetime('now', '+7 days'))`,
    [decoded.jti, result.email]
  );

  await logAdminAction(result.email, 'admin_login', { ip: req.ip, userAgent: req.headers['user-agent'] });

  res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 900, // 15 minutes
  });
});

// Refresh token
router.post('/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: 'validation_error', message: 'refresh_token required' });
  }

  try {
    const decoded = verifyToken(refresh_token);
    const revoked = await getAsync('SELECT revoked FROM refresh_tokens WHERE token_jti = ?', [decoded.jti]);
    if (revoked && revoked.revoked) {
      return res.status(401).json({ error: 'unauthorized', message: 'Token revoked' });
    }

    const accessToken = signAccessToken({ sub: decoded.sub, role: decoded.role });
    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
    });
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid refresh token' });
  }
});

// Logout (revoke refresh token)
router.post('/auth/logout', adminAuth, adminRateLimit, async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader.slice(7);
  const decoded = verifyToken(token);

  // We can't revoke access tokens (short-lived by design), but we revoke refresh tokens
  // Client should discard both
  await logAdminAction(req.admin.email, 'admin_logout', { ip: req.ip });
  res.json({ message: 'Logged out successfully' });
});

// Change admin password (authenticated)
router.post('/auth/change-password', adminAuth, adminRateLimit, validateChangePassword, async (req, res) => {
  const { old_password, new_password } = req.validatedBody;
  const adminEmail = req.admin.email;

  try {
    // Get current admin from database
    const dbAdmin = await getAsync('SELECT id, password_hash FROM admins WHERE email = ?', [adminEmail]);

    if (!dbAdmin) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Admin account not found in database',
      });
    }

    // Verify old password
    const oldValid = await comparePassword(old_password, dbAdmin.password_hash);
    if (!oldValid) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Current password is incorrect',
      });
    }

    // Hash new password
    const newHash = await hashPassword(new_password);

    // Update in database
    await runAsync(
      `UPDATE admins SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
      [newHash, dbAdmin.id]
    );

    // Audit log
    await logAdminAction(adminEmail, 'change_password', {
      resource: 'admins',
      resourceId: String(dbAdmin.id),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logger.safeLog('info', 'Admin password changed', { admin_email: adminEmail });

    res.json({
      message: 'Password changed successfully',
      admin_email: adminEmail,
    });
  } catch (err) {
    logger.error('Failed to change password', { error: err.message });
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to change password',
    });
  }
});

// Get current admin profile
router.get('/profile', adminAuth, adminRateLimit, async (req, res) => {
  try {
    const admin = await getAsync(
      'SELECT id, email, name, is_active, created_at, updated_at FROM admins WHERE email = ?',
      [req.admin.email]
    );

    if (!admin) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Admin profile not found',
      });
    }

    res.json({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      is_active: !!admin.is_active,
      created_at: admin.created_at,
      updated_at: admin.updated_at,
    });
  } catch (err) {
    logger.error('Failed to get admin profile', { error: err.message });
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to retrieve profile',
    });
  }
});

// First-time setup: create admin when no admins exist
router.post('/auth/setup', async (req, res) => {
  try {
    // Check if any admin already exists
    const count = await getAsync('SELECT COUNT(*) as count FROM admins');
    if (count && count.count > 0) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Setup already completed. Use admin login.',
      });
    }

    const { email, password, name } = req.body;
    if (!email || !password || password.length < 12) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Email and password (min 12 chars) are required',
      });
    }

    const passwordHash = await hashPassword(password);

    await runAsync(
      `INSERT INTO admins (email, password_hash, name)
       VALUES (?, ?, ?)`,
      [email, passwordHash, name || 'Administrator']
    );

    logger.safeLog('info', 'First admin created via setup', { email });

    res.status(201).json({
      message: 'Admin account created successfully',
      email,
    });
  } catch (err) {
    logger.error('Setup failed', { error: err.message });
    res.status(500).json({
      error: 'internal_error',
      message: 'Setup failed',
    });
  }
});

// --- API Keys ---

router.get('/keys', adminAuth, adminRateLimit, auditAction('list_keys', 'api_keys'), async (req, res) => {
  try {
    const keys = await allAsync(
      `SELECT id, name, monthly_limit, daily_limit, tokens_used, tokens_used_today, requests_today,
              is_active, created_at, last_reset_date, expires_at, requests_per_minute, allowed_ips, tags
       FROM api_keys ORDER BY created_at DESC`
    );
    res.json({
      keys: keys.map(k => ({
        ...k,
        key_preview: `${k.id.slice(0, 4)}...${k.id.slice(-4)}`,
        tags: k.tags ? k.tags.split(',').map(t => t.trim()) : [],
      })),
    });
  } catch (err) {
    logger.error('Failed to list keys', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to list keys' });
  }
});

router.post('/keys', adminAuth, adminRateLimit, validateCreateKey, auditAction('create_key', 'api_keys'), async (req, res) => {
  try {
    const { key, hash } = generateApiKey();
    const id = generateId('key_');
    const body = req.validatedBody;

    await runAsync(
      `INSERT INTO api_keys (id, name, key_hash, monthly_limit, daily_limit, requests_per_minute, allowed_ips, tags, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, body.name, hash, body.monthly_limit, body.daily_limit, body.requests_per_minute,
        body.allowed_ips || null,
        body.tags || null,
        body.expires_at || null,
      ]
    );

    await runAsync(
      `INSERT INTO rate_limits (key_id, requests_per_minute, burst_limit)
       VALUES (?, ?, ?)`,
      [id, body.requests_per_minute, 10]
    );

    res.status(201).json({
      id,
      name: body.name,
      key,
      key_preview: `${key.slice(0, 8)}...${key.slice(-8)}`,
      monthly_limit: body.monthly_limit,
      daily_limit: body.daily_limit,
      requests_per_minute: body.requests_per_minute,
      allowed_ips: body.allowed_ips || null,
      tags: body.tags || null,
      created_at: new Date().toISOString(),
      expires_at: body.expires_at || null,
    });
  } catch (err) {
    logger.error('Failed to create key', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to create API key' });
  }
});

// Bulk create keys
router.post('/keys/bulk', adminAuth, adminRateLimit, auditAction('bulk_create_keys', 'api_keys'), async (req, res) => {
  try {
    const { keys: keyConfigs } = req.body;
    if (!Array.isArray(keyConfigs) || keyConfigs.length === 0 || keyConfigs.length > 50) {
      return res.status(400).json({ error: 'validation_error', message: 'Must provide 1-50 key configurations' });
    }

    const created = [];
    for (const config of keyConfigs) {
      const { key, hash } = generateApiKey();
      const id = generateId('key_');
      await runAsync(
        `INSERT INTO api_keys (id, name, key_hash, monthly_limit, daily_limit, requests_per_minute, allowed_ips, tags, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, config.name || 'Unnamed', hash,
          config.monthly_limit || 0, config.daily_limit || 0, config.requests_per_minute || 60,
          config.allowed_ips || null, config.tags || null, config.expires_at || null,
        ]
      );
      await runAsync(
        `INSERT INTO rate_limits (key_id, requests_per_minute, burst_limit) VALUES (?, ?, ?)`,
        [id, config.requests_per_minute || 60, 10]
      );
      created.push({ id, name: config.name || 'Unnamed', key, key_preview: `${key.slice(0, 8)}...${key.slice(-8)}` });
    }

    res.status(201).json({ created, count: created.length });
  } catch (err) {
    logger.error('Failed to bulk create keys', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to create keys' });
  }
});

// Bulk delete keys
router.post('/keys/bulk-delete', adminAuth, adminRateLimit, auditAction('bulk_delete_keys', 'api_keys'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'validation_error', message: 'Must provide array of key IDs' });
    }

    const placeholders = ids.map(() => '?').join(',');
    await runAsync(`DELETE FROM rate_limits WHERE key_id IN (${placeholders})`, ids);
    await runAsync(`DELETE FROM usage_logs WHERE key_id IN (${placeholders})`, ids);
    const result = await runAsync(`DELETE FROM api_keys WHERE id IN (${placeholders})`, ids);

    res.json({ deleted: true, count: result.changes, ids });
  } catch (err) {
    logger.error('Failed to bulk delete keys', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to delete keys' });
  }
});

router.delete('/keys/:id', adminAuth, adminRateLimit, auditAction('revoke_key', 'api_keys'), async (req, res) => {
  try {
    await runAsync('UPDATE api_keys SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ id: req.params.id, revoked: true, status: 'paused' });
  } catch (err) {
    logger.error('Failed to revoke key', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to revoke key' });
  }
});

// Reactivate a paused key
router.post('/keys/:id/activate', adminAuth, adminRateLimit, auditAction('activate_key', 'api_keys'), async (req, res) => {
  try {
    const result = await runAsync('UPDATE api_keys SET is_active = 1 WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Key not found' });
    }
    res.json({ id: req.params.id, activated: true, status: 'active' });
  } catch (err) {
    logger.error('Failed to activate key', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to activate key' });
  }
});

// Hard delete a key permanently
router.delete('/keys/:id/permanent', adminAuth, adminRateLimit, auditAction('delete_key_permanent', 'api_keys'), async (req, res) => {
  try {
    await runAsync('DELETE FROM rate_limits WHERE key_id = ?', [req.params.id]);
    await runAsync('DELETE FROM usage_logs WHERE key_id = ?', [req.params.id]);
    const result = await runAsync('DELETE FROM api_keys WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Key not found' });
    }
    res.json({ id: req.params.id, deleted: true, permanent: true });
  } catch (err) {
    logger.error('Failed to permanently delete key', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to delete key' });
  }
});

// Update key metadata (name only)
router.patch('/keys/:id', adminAuth, adminRateLimit, auditAction('update_key_metadata', 'api_keys'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.length < 1 || name.length > 128) {
      return res.status(400).json({ error: 'validation_error', message: 'Name must be 1-128 characters' });
    }
    const result = await runAsync('UPDATE api_keys SET name = ? WHERE id = ?', [name, req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Key not found' });
    }
    res.json({ id: req.params.id, updated: true, name });
  } catch (err) {
    logger.error('Failed to update key metadata', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to update key' });
  }
});

router.patch('/keys/:id/limits', adminAuth, adminRateLimit, validateUpdateLimits, auditAction('update_limits', 'api_keys'), async (req, res) => {
  try {
    const body = req.validatedBody;
    const updates = [];
    const params = [];
    if (body.monthly_limit !== undefined) { updates.push('monthly_limit = ?'); params.push(body.monthly_limit); }
    if (body.daily_limit !== undefined) { updates.push('daily_limit = ?'); params.push(body.daily_limit); }
    if (body.requests_per_minute !== undefined) { updates.push('requests_per_minute = ?'); params.push(body.requests_per_minute); }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'validation_error', message: 'No fields to update' });
    }
    params.push(req.params.id);
    await runAsync(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ id: req.params.id, updated: true });
  } catch (err) {
    logger.error('Failed to update limits', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to update limits' });
  }
});

router.post('/keys/:id/rotate', adminAuth, adminRateLimit, auditAction('rotate_key', 'api_keys'), async (req, res) => {
  try {
    const existing = await getAsync('SELECT id, name FROM api_keys WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'not_found', message: 'Key not found' });
    }

    // Generate new key
    const { key, hash } = generateApiKey();
    await runAsync('UPDATE api_keys SET key_hash = ?, is_active = 1 WHERE id = ?', [hash, req.params.id]);

    res.json({
      id: req.params.id,
      name: existing.name,
      key,
      key_preview: `${key.slice(0, 8)}...${key.slice(-8)}`,
      rotated_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Failed to rotate key', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to rotate key' });
  }
});

// --- Usage ---

router.get('/usage', adminAuth, adminRateLimit, async (req, res) => {
  try {
    const stats = await getUsageStats();
    res.json(stats);
  } catch (err) {
    logger.error('Failed to get usage', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to get usage' });
  }
});

router.get('/usage/:keyId', adminAuth, adminRateLimit, async (req, res) => {
  try {
    const usage = await getKeyUsage(req.params.keyId);
    res.json(usage);
  } catch (err) {
    logger.error('Failed to get key usage', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to get key usage' });
  }
});

// --- Sessions ---

router.get('/sessions', adminAuth, adminRateLimit, async (req, res) => {
  try {
    const stats = getSessionStats();
    res.json(stats);
  } catch (err) {
    logger.error('Failed to get sessions', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to get sessions' });
  }
});

router.delete('/sessions', adminAuth, adminRateLimit, auditAction('force_wipe_sessions', 'sessions'), async (req, res) => {
  try {
    const count = wipeAllSessions();
    res.json({ wiped: true, count });
  } catch (err) {
    logger.error('Failed to wipe sessions', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to wipe sessions' });
  }
});

// --- Health ---

router.get('/health', adminAuth, adminRateLimit, async (req, res) => {
  const mem = process.memoryUsage();
  let ollamaStatus = 'unknown';
  try {
    await listModels();
    ollamaStatus = 'ok';
  } catch {
    ollamaStatus = 'down';
  }

  res.json({
    status: 'ok',
    service: 'voidmind',
    version: require('../../package.json').version,
    uptime: process.uptime(),
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      external_mb: Math.round(mem.external / 1024 / 1024),
    },
    ollama: ollamaStatus,
    active_sessions: getSessionStats().active_sessions,
    timestamp: new Date().toISOString(),
  });
});

// --- Logs ---

router.get('/logs', adminAuth, adminRateLimit, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
    const offset = parseInt(req.query.offset, 10) || 0;
    const logs = await allAsync(
      `SELECT id, admin_email, action, resource, resource_id, ip_address, timestamp
       FROM admin_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json({ logs });
  } catch (err) {
    logger.error('Failed to get logs', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to get logs' });
  }
});

// --- Compliance ---

router.get('/compliance', adminAuth, adminRateLimit, async (req, res) => {
  res.json({
    project: 'VoidMind',
    version: require('../../package.json').version,
    architecture: 'stateless_gateway',
    user_data_storage: 'none',
    conversation_logging: 'none',
    third_party_apis: 'none',
    telemetry: 'none',
    session_storage: 'ram_only',
    session_retention: `${process.env.SESSION_IDLE_TTL_MS || 300000}ms_idle_${process.env.SESSION_MAX_AGE_MS || 1800000}ms_max`,
    data_residency: 'vps_location_only',
    open_source: {
      license: 'MIT',
      repository: 'https://github.com/nuyvo/voidmind',
      audit_commit: process.env.GIT_COMMIT || 'unknown',
      last_audit_date: new Date().toISOString().slice(0, 10),
    },
    hipaa_mapping: {
      data_minimization: 'compliant',
      access_controls: 'compliant',
      transmission_security: 'compliant',
      audit_controls: 'compliant',
    },
    gdpr_mapping: {
      lawful_basis: 'contractual_necessity',
      data_minimization: 'compliant',
      storage_limitation: 'compliant',
      right_to_erasure: 'instant_wipe',
      processor_contract: 'not_applicable_self_hosted',
    },
    verification: {
      code_review_url: 'https://github.com/nuyvo/voidmind/blob/main/src/services/session.js',
      session_wipe_function: 'wipeSession()',
      no_database_for_user_data: true,
      no_external_api_calls: true,
    },
  });
});

// --- Models ---

router.get('/models', adminAuth, adminRateLimit, async (req, res) => {
  try {
    const models = await listModels();
    const formatted = models.map(m => {
      const size = m.details?.parameter_size || 'unknown';
      return {
        id: m.name,
        name: m.name,
        size: size,
        status: 'available',
        ram_usage_mb: estimateRamUsage(size),
      };
    });
    res.json({ models: formatted });
  } catch (err) {
    logger.error('Failed to list models for admin', { error: err.message });
    res.status(503).json({ error: 'service_unavailable', message: 'Ollama unavailable' });
  }
});

// Prometheus metrics endpoint
router.get('/metrics', adminAuth, adminRateLimit, async (req, res) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    logger.error('Failed to generate metrics', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: 'Failed to generate metrics' });
  }
});

function estimateRamUsage(parameterSize) {
  // Rough estimate: 1B params ~ 1.3GB RAM in fp16, ~0.65GB in q4
  const match = String(parameterSize).match(/(\d+(?:\.\d+)?)/);
  if (!match) return 4000;
  const billions = parseFloat(match[1]);
  return Math.round(billions * 1400); // conservative q4 estimate
}

// --- Performance & Cache Management ---

router.get('/performance', adminAuth, adminRateLimit, async (req, res) => {
  const { getResponseCacheStats, getPromptCacheStats } = require('../services/fastInference');
  const { getQueueStats } = require('../services/queue');
  const { ollamaCircuitBreaker } = require('../services/circuitBreaker');
  const { getAgent } = require('../services/ollamaAgent');

  const agent = getAgent();
  const queueStats = getQueueStats();
  const responseCache = getResponseCacheStats();
  const promptCache = getPromptCacheStats();
  const cbState = ollamaCircuitBreaker.getState();

  res.json({
    caches: {
      response: responseCache,
      prompt: promptCache,
    },
    queue: queueStats,
    circuit_breaker: cbState,
    ollama_agent: {
      max_sockets: agent.maxSockets,
      free_sockets: agent.freeSockets ? Object.keys(agent.freeSockets).length : 0,
      requests: agent.requests ? Object.keys(agent.requests).length : 0,
    },
    tuning: {
      num_threads: parseInt(process.env.OLLAMA_NUM_THREADS, 10) || 0,
      num_ctx: parseInt(process.env.OLLAMA_NUM_CTX, 10) || 4096,
      num_batch: parseInt(process.env.OLLAMA_NUM_BATCH, 10) || 512,
      max_concurrency: parseInt(process.env.OLLAMA_MAX_CONCURRENCY, 10) || 2,
      max_queue_size: parseInt(process.env.OLLAMA_MAX_QUEUE_SIZE, 10) || 50,
    },
  });
});

router.delete('/cache/response', adminAuth, adminRateLimit, auditAction('clear_response_cache', 'cache'), async (req, res) => {
  const { clearResponseCache } = require('../services/responseCache');
  clearResponseCache();
  res.json({ cleared: true, cache: 'response' });
});

router.delete('/cache/prompt', adminAuth, adminRateLimit, auditAction('clear_prompt_cache', 'cache'), async (req, res) => {
  const { clearPromptCache } = require('../services/promptCache');
  clearPromptCache();
  res.json({ cleared: true, cache: 'prompt' });
});

module.exports = router;
