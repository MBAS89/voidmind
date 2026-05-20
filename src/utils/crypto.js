/**
 * VoidMind — Cryptographic Utilities
 * Key generation, hashing, and secure randomness.
 */

const crypto = require('crypto');
const constants = require('../config/constants');

function generateApiKey() {
  const raw = crypto.randomBytes(constants.API_KEY_LENGTH);
  const key = constants.API_KEY_PREFIX + raw.toString('base64url');
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return { key, hash };
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generateId(prefix = '') {
  return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString('base64url');
}

function generateSessionId() {
  return crypto.randomUUID();
}

module.exports = {
  generateApiKey,
  hashApiKey,
  generateId,
  generateSecret,
  generateSessionId,
};
