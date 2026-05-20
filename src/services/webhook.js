/**
 * VoidMind — Webhook Alert Service
 * Sends alerts to external systems (Slack, Discord, generic webhook)
 * when operational thresholds are crossed.
 */

const http = require('http');
const https = require('https');
const logger = require('../utils/logger');

const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

function sendWebhook(payload) {
  if (!WEBHOOK_URL) return Promise.resolve();

  return new Promise((resolve) => {
    const url = new URL(WEBHOOK_URL);
    const data = JSON.stringify(payload);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 10000,
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true });
        } else {
          logger.warn('Webhook returned non-2xx status', { status: res.statusCode, body: body.slice(0, 200) });
          resolve({ success: false });
        }
      });
    });

    req.on('error', (err) => {
      logger.error('Webhook request failed', { error: err.message });
      resolve({ success: false });
    });

    req.on('timeout', () => {
      req.destroy();
      logger.warn('Webhook request timed out');
      resolve({ success: false });
    });

    req.write(data);
    req.end();
  });
}

async function alertKeyLimitWarning(keyId, keyName, limitType, current, max) {
  logger.safeLog('warn', `Key limit warning: ${limitType}`, { key_id: keyId, current, max });
  await sendWebhook({
    event: 'key_limit_warning',
    severity: 'warning',
    key_id: keyId,
    key_name: keyName,
    limit_type: limitType,
    current_usage: current,
    limit: max,
    timestamp: new Date().toISOString(),
    message: `API key "${keyName}" has used ${current} of ${max} ${limitType} tokens`,
  });
}

async function alertKeyLimitExceeded(keyId, keyName, limitType, max) {
  logger.safeLog('warn', `Key limit exceeded: ${limitType}`, { key_id: keyId, max });
  await sendWebhook({
    event: 'key_limit_exceeded',
    severity: 'critical',
    key_id: keyId,
    key_name: keyName,
    limit_type: limitType,
    limit: max,
    timestamp: new Date().toISOString(),
    message: `API key "${keyName}" has exceeded its ${limitType} limit of ${max} tokens`,
  });
}

async function alertOllamaDown() {
  logger.error('Ollama is down');
  await sendWebhook({
    event: 'ollama_down',
    severity: 'critical',
    timestamp: new Date().toISOString(),
    message: 'Ollama inference engine is not responding',
  });
}

async function alertOllamaRecovered() {
  logger.info('Ollama is back up');
  await sendWebhook({
    event: 'ollama_recovered',
    severity: 'info',
    timestamp: new Date().toISOString(),
    message: 'Ollama inference engine has recovered',
  });
}

async function alertSuspiciousLogin(email, ip, reason) {
  logger.safeLog('warn', 'Suspicious admin login attempt', { email, ip, reason });
  await sendWebhook({
    event: 'suspicious_login',
    severity: 'warning',
    email,
    ip_address: ip,
    reason,
    timestamp: new Date().toISOString(),
    message: `Suspicious login attempt for ${email} from ${ip}: ${reason}`,
  });
}

module.exports = {
  sendWebhook,
  alertKeyLimitWarning,
  alertKeyLimitExceeded,
  alertOllamaDown,
  alertOllamaRecovered,
  alertSuspiciousLogin,
};
