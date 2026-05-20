/**
 * VoidMind — Model Keep-Alive / Warm-Up Service
 * Prevents Ollama from unloading models by sending periodic pings.
 * Keeps the default model hot in RAM for faster first responses.
 */

const http = require('http');
const cron = require('node-cron');
const logger = require('../utils/logger');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'qwen2.5:3b';
const KEEP_ALIVE_INTERVAL_MIN = parseInt(process.env.KEEP_ALIVE_INTERVAL_MIN, 10) || 3;

let task = null;

function parseHost() {
  const url = new URL(OLLAMA_HOST);
  return { hostname: url.hostname, port: parseInt(url.port, 10) || 11434 };
}

function sendKeepAlive() {
  return new Promise((resolve, reject) => {
    const { hostname, port } = parseHost();
    const payload = JSON.stringify({
      model: DEFAULT_MODEL,
      keep_alive: `${KEEP_ALIVE_INTERVAL_MIN + 2}m`,
    });

    const req = http.request({
      hostname,
      port,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            logger.warn('Keep-alive ping failed', { error: json.error });
            reject(new Error(json.error));
          } else {
            logger.debug('Keep-alive ping successful', { model: DEFAULT_MODEL });
            resolve(json);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(payload);
    req.end();
  });
}

function startKeepAlive() {
  if (task) return;
  logger.info('Starting model keep-alive service', {
    model: DEFAULT_MODEL,
    interval_min: KEEP_ALIVE_INTERVAL_MIN,
  });

  // Send immediate ping on startup
  sendKeepAlive().catch(() => {});

  // Schedule recurring pings
  task = cron.schedule(`*/${KEEP_ALIVE_INTERVAL_MIN} * * * *`, () => {
    sendKeepAlive().catch((err) => {
      logger.warn('Keep-alive cron failed', { error: err.message });
    });
  });
}

function stopKeepAlive() {
  if (task) {
    task.stop();
    task = null;
    logger.info('Model keep-alive service stopped');
  }
}

module.exports = { startKeepAlive, stopKeepAlive, sendKeepAlive };
