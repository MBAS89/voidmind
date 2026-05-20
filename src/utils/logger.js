/**
 * VoidMind — Structured Logger (NO PII, NO user content)
 * Logs operational events only: token counts, status codes, latency, admin actions.
 * Never logs message content, user IDs, or session context.
 */

const winston = require('winston');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FORMAT = process.env.LOG_FORMAT || 'json';

const formats = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  LOG_FORMAT === 'json'
    ? winston.format.json()
    : winston.format.printf(({ level, message, timestamp, ...meta }) => {
        return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
      })
);

const transports = [
  new winston.transports.Console({ format: formats }),
];

// In production, you may add a file transport, but ONLY for operational logs.
// No user data, no conversation content, no PII.
// If you add file transport, ensure logrotate is configured.

const logger = winston.createLogger({
  level: LOG_LEVEL,
  defaultMeta: { service: 'voidmind' },
  transports,
  exitOnError: false,
});

// Explicit safety: never log content, only metadata
logger.safeLog = (level, message, meta = {}) => {
  // Strip any potentially dangerous keys before logging
  const safeMeta = { ...meta };
  delete safeMeta.content;
  delete safeMeta.messages;
  delete safeMeta.prompt;
  delete safeMeta.response;
  delete safeMeta.body;
  delete safeMeta.password;
  delete safeMeta.token;
  delete safeMeta.authorization;
  logger.log(level, message, safeMeta);
};

// Child logger with request ID for tracing
logger.withRequestId = (requestId) => {
  return logger.child({ request_id: requestId });
};

module.exports = logger;
