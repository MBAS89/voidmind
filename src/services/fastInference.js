/**
 * VoidMind — Fast Inference Service
 * Orchestrates caching, agent reuse, and Ollama tuning for minimum latency.
 */

const { getRequestOptions } = require('./ollamaAgent');
const { getCachedHint, setCachedHint, getPromptCacheStats, clearPromptCache } = require('./promptCache');
const { getCachedResponse, setCachedResponse, getResponseCacheStats, clearResponseCache } = require('./responseCache');
const { ollamaCircuitBreaker } = require('./circuitBreaker');
const logger = require('../utils/logger');

const NUM_THREADS = parseInt(process.env.OLLAMA_NUM_THREADS, 10) || 0; // 0 = auto
const NUM_CTX = parseInt(process.env.OLLAMA_NUM_CTX, 10) || 4096;
const NUM_BATCH = parseInt(process.env.OLLAMA_NUM_BATCH, 10) || 512;

/**
 * Build Ollama options optimized for speed.
 */
function buildFastOptions(userOptions = {}) {
  return {
    temperature: userOptions.temperature ?? 0.7,
    num_predict: userOptions.max_tokens ?? 512,
    num_thread: NUM_THREADS || undefined,
    num_ctx: NUM_CTX,
    num_batch: NUM_BATCH,
    // Enable prompt caching hint if available
    ...userOptions,
  };
}

/**
 * Fast chat completion with caching and circuit breaker.
 */
async function fastChatCompletion(model, messages, options = {}, metadata = {}) {
  // 1. Check response cache (instant hit)
  const cached = getCachedResponse(model, messages, options.temperature, options.max_tokens);
  if (cached) {
    return cached;
  }

  // 2. Check prompt cache hint (tells Ollama to reuse KV cache)
  const promptHint = getCachedHint(messages);

  // 3. Build optimized options
  const fastOpts = buildFastOptions(options);

  // 4. Execute through circuit breaker
  const result = await ollamaCircuitBreaker.execute(
    () => _ollamaChat(model, messages, fastOpts, metadata),
    metadata
  );

  // 5. Cache the prompt for KV reuse hint
  setCachedHint(messages, 'cached');

  // 6. Cache the response for identical future queries
  setCachedResponse(model, messages, options.temperature, options.max_tokens, result);

  return result;
}

/**
 * Low-level Ollama chat with keep-alive agent.
 */
function _ollamaChat(model, messages, options, metadata) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const payload = JSON.stringify({
      model,
      messages,
      stream: false,
      options,
    });

    const reqOptions = getRequestOptions('/api/chat', 'POST', {
      'Content-Length': Buffer.byteLength(payload),
    });
    reqOptions.timeout = 30000;

    const startTime = Date.now();

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            logger.error('Ollama inference error', { error: json.error, request_id: metadata.requestId });
            return reject(new Error(json.error));
          }

          const latency = Date.now() - startTime;
          const message = json.message || {};
          const promptTokens = json.prompt_eval_count || estimateTokens(messages);
          const completionTokens = json.eval_count || estimateTokens([message]);

          logger.safeLog('info', 'Ollama inference completed', {
            model,
            latency_ms: latency,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            request_id: metadata.requestId,
          });

          resolve({
            content: message.content || '',
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            done: true,
            latency,
          });
        } catch (err) {
          logger.error('Failed to parse Ollama response', { error: err.message });
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      logger.error('Ollama request failed', { error: err.message, request_id: metadata.requestId });
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Ollama request timeout'));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Fast streaming chat completion.
 */
async function fastStreamChatCompletion(model, messages, options = {}, onChunk, metadata = {}) {
  // No response cache for streaming (by design — streaming implies real-time)
  const fastOpts = buildFastOptions(options);

  return ollamaCircuitBreaker.execute(
    () => _ollamaStreamChat(model, messages, fastOpts, onChunk, metadata),
    metadata
  );
}

function _ollamaStreamChat(model, messages, options, onChunk, metadata) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const payload = JSON.stringify({
      model,
      messages,
      stream: true,
      options,
    });

    const reqOptions = getRequestOptions('/api/chat', 'POST', {
      'Content-Length': Buffer.byteLength(payload),
    });
    reqOptions.timeout = 30000;

    const startTime = Date.now();
    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;

    const req = http.request(reqOptions, (res) => {
      res.setEncoding('utf8');
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.error) {
              logger.error('Ollama stream error', { error: json.error, request_id: metadata.requestId });
              return reject(new Error(json.error));
            }

            const msg = json.message || {};
            if (msg.content) {
              fullContent += msg.content;
              completionTokens += estimateTokens([{ content: msg.content }]);
              onChunk({
                id: `chatcmpl-${Math.floor(Date.now() / 1000)}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                  index: 0,
                  delta: { role: msg.role, content: msg.content },
                  finish_reason: null,
                }],
              });
            }

            if (json.prompt_eval_count) promptTokens = json.prompt_eval_count;
            if (json.done) {
              promptTokens = json.prompt_eval_count || estimateTokens(messages);
              completionTokens = json.eval_count || completionTokens;
            }
          } catch {
            // Skip malformed lines
          }
        }
      });

      res.on('end', () => {
        const latency = Date.now() - startTime;
        logger.safeLog('info', 'Ollama stream completed', {
          model,
          latency_ms: latency,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          request_id: metadata.requestId,
        });

        resolve({
          content: fullContent,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          latency,
        });
      });
    });

    req.on('error', (err) => {
      logger.error('Ollama stream request failed', { error: err.message, request_id: metadata.requestId });
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Ollama stream request timeout'));
    });

    req.write(payload);
    req.end();
  });
}

function estimateTokens(messages) {
  let chars = 0;
  for (const msg of messages) {
    if (msg && msg.content) chars += msg.content.length;
  }
  return Math.ceil(chars / 4);
}

module.exports = {
  fastChatCompletion,
  fastStreamChatCompletion,
  buildFastOptions,
  getResponseCacheStats,
  getPromptCacheStats,
  clearResponseCache,
  clearPromptCache,
};
