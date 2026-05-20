/**
 * VoidMind — Response Cache (RAM LRU)
 * Caches AI responses for identical queries to deliver instant replies.
 * RAM-only, no user data, content is hashed for lookup.
 * Ideal for FAQs, repeated system prompts, and common queries.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const CACHE_ENABLED = process.env.RESPONSE_CACHE_ENABLED !== 'false';
const CACHE_SIZE = parseInt(process.env.RESPONSE_CACHE_SIZE, 10) || 200;
const CACHE_TTL_MS = parseInt(process.env.RESPONSE_CACHE_TTL_MS, 10) || 60000; // 1 min default (short for AI)
const MAX_CACHED_LENGTH = 2000; // Don't cache very long responses

// Map<hash, { content, tokens, timestamp }>
const cache = new Map();

function hashRequest(model, messages, temperature, maxTokens) {
  const canonical = JSON.stringify({ model, messages, temperature, maxTokens });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function getCachedResponse(model, messages, temperature, maxTokens) {
  if (!CACHE_ENABLED) return null;

  const key = hashRequest(model, messages, temperature, maxTokens);
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  logger.safeLog('info', 'Response cache hit — instant reply', {
    cache_key: key.slice(0, 16),
    tokens: entry.tokens,
  });

  return {
    content: entry.content,
    promptTokens: entry.promptTokens,
    completionTokens: entry.completionTokens,
    totalTokens: entry.totalTokens,
    cached: true,
    latency: 0,
  };
}

function setCachedResponse(model, messages, temperature, maxTokens, result) {
  if (!CACHE_ENABLED) return;
  if (result.content.length > MAX_CACHED_LENGTH) return; // Skip long responses
  if (result.cached) return; // Don't double-cache

  const key = hashRequest(model, messages, temperature, maxTokens);

  // Evict oldest if at capacity
  if (cache.size >= CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }

  cache.set(key, {
    content: result.content,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
    timestamp: Date.now(),
  });

  logger.debug('Response cached', { cache_key: key.slice(0, 16), cache_size: cache.size });
}

function clearResponseCache() {
  cache.clear();
  logger.info('Response cache cleared');
}

function getResponseCacheStats() {
  return {
    enabled: CACHE_ENABLED,
    size: cache.size,
    max_size: CACHE_SIZE,
    ttl_ms: CACHE_TTL_MS,
  };
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  let cleared = 0;
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
      cleared++;
    }
  }
  if (cleared > 0) {
    logger.debug('Response cache expired entries cleared', { cleared });
  }
}, 60000);

module.exports = {
  getCachedResponse,
  setCachedResponse,
  clearResponseCache,
  getResponseCacheStats,
};
