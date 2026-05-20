/**
 * VoidMind — Constants Configuration
 * All time-to-live values, limits, and defaults in one auditable place.
 */

const SESSION_IDLE_TTL_MS = parseInt(process.env.SESSION_IDLE_TTL_MS, 10) || 300000;      // 5 min
const SESSION_MAX_AGE_MS = parseInt(process.env.SESSION_MAX_AGE_MS, 10) || 1800000;       // 30 min
const SESSION_MAX_MESSAGES = parseInt(process.env.SESSION_MAX_MESSAGES, 10) || 20;
const SESSION_MAX_MESSAGE_SIZE = parseInt(process.env.SESSION_MAX_MESSAGE_SIZE, 10) || 4096; // 4KB

const RATE_LIMIT_USER_RPM = parseInt(process.env.RATE_LIMIT_USER_REQUESTS_PER_MINUTE, 10) || 60;
const RATE_LIMIT_ADMIN_RPM = parseInt(process.env.RATE_LIMIT_ADMIN_REQUESTS_PER_MINUTE, 10) || 30;
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000;

const OLLAMA_REQUEST_TIMEOUT = parseInt(process.env.OLLAMA_REQUEST_TIMEOUT, 10) || 30000;
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 30000;

const API_KEY_PREFIX = process.env.API_KEY_PREFIX || 'vm_';
const API_KEY_LENGTH = 32;

const ADMIN_JWT_ACCESS_EXPIRY = '15m';
const ADMIN_JWT_REFRESH_EXPIRY = '7d';

const MAX_PAYLOAD_SIZE = process.env.MAX_PAYLOAD_SIZE || '1mb';

module.exports = {
  SESSION_IDLE_TTL_MS,
  SESSION_MAX_AGE_MS,
  SESSION_MAX_MESSAGES,
  SESSION_MAX_MESSAGE_SIZE,

  RATE_LIMIT_USER_RPM,
  RATE_LIMIT_ADMIN_RPM,
  RATE_LIMIT_WINDOW_MS,

  OLLAMA_REQUEST_TIMEOUT,
  REQUEST_TIMEOUT_MS,

  API_KEY_PREFIX,
  API_KEY_LENGTH,

  ADMIN_JWT_ACCESS_EXPIRY,
  ADMIN_JWT_REFRESH_EXPIRY,

  MAX_PAYLOAD_SIZE,
};
