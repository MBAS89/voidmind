/**
 * VoidMind — Multi-Model Routing Middleware
 * Validates model exists in Ollama registry before forwarding.
 * Falls back to default model if unavailable.
 */

const logger = require('../utils/logger');

const DEFAULT_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'qwen2.5:3b';

// Cache of available models (refreshed periodically)
let availableModels = new Set([DEFAULT_MODEL]);
let lastModelRefresh = 0;
const MODEL_CACHE_TTL_MS = 60000;

function updateAvailableModels(models) {
  availableModels = new Set(models.map(m => m.name));
  availableModels.add(DEFAULT_MODEL);
  lastModelRefresh = Date.now();
}

function isModelAvailable(model) {
  if (Date.now() - lastModelRefresh > MODEL_CACHE_TTL_MS) {
    // Stale cache — allow pass-through, refresh in background
    refreshModelCache().catch(() => {});
  }
  return availableModels.has(model);
}

async function refreshModelCache() {
  try {
    const { listModels } = require('../services/ollama');
    const models = await listModels();
    updateAvailableModels(models);
    logger.debug('Model cache refreshed', { count: availableModels.size });
  } catch (err) {
    logger.warn('Failed to refresh model cache', { error: err.message });
  }
}

function modelRouter(req, res, next) {
  const requestedModel = req.validatedBody?.model || req.body?.model || DEFAULT_MODEL;

  if (!isModelAvailable(requestedModel)) {
    logger.safeLog('warn', 'Requested model unavailable, falling back', {
      requested: requestedModel,
      fallback: DEFAULT_MODEL,
      request_id: req.requestId,
    });
    if (req.validatedBody) req.validatedBody.model = DEFAULT_MODEL;
    else if (req.body) req.body.model = DEFAULT_MODEL;
  }

  req.selectedModel = req.validatedBody?.model || req.body?.model || DEFAULT_MODEL;
  next();
}

module.exports = { modelRouter, refreshModelCache, updateAvailableModels, isModelAvailable };
