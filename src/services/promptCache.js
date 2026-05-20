/**
 * VoidMind — Prompt Cache
 * Caches prompt evaluation results to avoid re-processing identical system prompts.
 * RAM-only, auto-expires. No user data stored — only prompt hashes.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const CACHE_SIZE = parseInt(process.env.PROMPT_CACHE_SIZE, 10) || 100;
const CACHE_TTL_MS = parseInt(process.env.PROMPT_CACHE_TTL_MS, 10) || 300000; // 5 min

// Map<hash, { embeddingHint, timestamp }>
// We don't cache full embeddings (too large), but we track which prompts
// Ollama has already seen so we can hint it to reuse KV cache.
const cache = new Map();

function hashPrompt(messages) {
  const canonical = JSON.stringify(messages.map(m => ({ role: m.role, content: m.content })));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function getCachedHint(messages) {
  const key = hashPrompt(messages);
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  logger.debug('Prompt cache hit', { hash: key.slice(0, 16) });
  return entry.hint;
}

function setCachedHint(messages, hint = 'cached') {
  const key = hashPrompt(messages);

  // Evict oldest if at capacity
  if (cache.size >= CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }

  cache.set(key, {
    hint,
    timestamp: Date.now(),
  });

  logger.debug('Prompt cached', { hash: key.slice(0, 16), cache_size: cache.size });
}

function clearPromptCache() {
  cache.clear();
}

function getPromptCacheStats() {
  return {
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
    logger.debug('Prompt cache expired entries cleared', { cleared });
  }
}, 60000);

module.exports = {
  getCachedHint,
  setCachedHint,
  clearPromptCache,
  getPromptCacheStats,
  hashPrompt,
};
