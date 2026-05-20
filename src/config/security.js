/**
 * VoidMind — Security Configuration
 * JWT, bcrypt, key generation, hashing utilities.
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const constants = require('./constants');
const logger = require('../utils/logger');

let privateKey = null;
let publicKey = null;

function loadKeys() {
  const priv = process.env.ADMIN_JWT_PRIVATE_KEY;
  const pub = process.env.ADMIN_JWT_PUBLIC_KEY;

  if (!priv || !pub) {
    logger.warn('JWT keys not configured — generating ephemeral keys (DO NOT USE IN PRODUCTION)');
    // Generate ephemeral keys for development only
    const { privateKey: epriv, publicKey: epub } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    privateKey = epriv;
    publicKey = epub;
    return;
  }

  privateKey = priv.replace(/\\n/g, '\n');
  publicKey = pub.replace(/\\n/g, '\n');
}

loadKeys();

// --- JWT ---

function signAccessToken(payload) {
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: constants.ADMIN_JWT_ACCESS_EXPIRY,
    issuer: process.env.ADMIN_JWT_ISSUER || 'voidmind',
    audience: process.env.ADMIN_JWT_AUDIENCE || 'voidmind-admin',
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: constants.ADMIN_JWT_REFRESH_EXPIRY,
    issuer: process.env.ADMIN_JWT_ISSUER || 'voidmind',
    audience: process.env.ADMIN_JWT_AUDIENCE || 'voidmind-admin',
    jwtid: crypto.randomUUID(),
  });
}

function verifyToken(token) {
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: process.env.ADMIN_JWT_ISSUER || 'voidmind',
    audience: process.env.ADMIN_JWT_AUDIENCE || 'voidmind-admin',
  });
}

function decodeToken(token) {
  return jwt.decode(token, { complete: true });
}

// --- bcrypt ---

async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// --- API Key Generation ---

function generateApiKey() {
  const raw = crypto.randomBytes(constants.API_KEY_LENGTH);
  const key = constants.API_KEY_PREFIX + raw.toString('base64url');
  // Hash for storage (bcrypt is slow, use sha256 for lookup + bcrypt for verification)
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return { key, hash };
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// --- General Crypto ---

function generateId(prefix = '') {
  return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString('base64url');
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  decodeToken,
  hashPassword,
  comparePassword,
  generateApiKey,
  hashApiKey,
  generateId,
  generateSecret,
};
