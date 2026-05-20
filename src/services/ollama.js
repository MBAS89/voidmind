/**
 * VoidMind — Ollama Client
 * Communicates with local Ollama instance (localhost only).
 * No external API calls. No telemetry. 100% local inference.
 */

const http = require('http');
const constants = require('../config/constants');
const logger = require('../utils/logger');
const { ollamaCircuitBreaker } = require('./circuitBreaker');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

function parseOllamaHost() {
  const url = new URL(OLLAMA_HOST);
  return {
    hostname: url.hostname,
    port: parseInt(url.port, 10) || 11434,
  };
}

/**
 * Send chat completion request to Ollama.
 * Returns { content, promptTokens, completionTokens, totalTokens, done }.
 */
function _chatCompletion(model, messages, options = {}) {
  return new Promise((resolve, reject) => {
    const { hostname, port } = parseOllamaHost();
    const payload = JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.max_tokens ?? 512,
      },
    });

    const requestOptions = {
      hostname,
      port,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: constants.OLLAMA_REQUEST_TIMEOUT,
    };

    const startTime = Date.now();

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            logger.error('Ollama inference error', { error: json.error });
            return reject(new Error(json.error));
          }

          const latency = Date.now() - startTime;
          const message = json.message || {};
          // Ollama doesn't always return token counts; estimate if missing
          const promptTokens = json.prompt_eval_count || estimateTokens(messages);
          const completionTokens = json.eval_count || estimateTokens([message]);

          logger.safeLog('info', 'Ollama inference completed', {
            model,
            latency_ms: latency,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
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
      logger.error('Ollama request failed', { error: err.message });
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
 * Stream chat completion from Ollama.
 * Yields chunks in OpenAI-compatible SSE format.
 */
function _streamChatCompletion(model, messages, options = {}, onChunk) {
  return new Promise((resolve, reject) => {
    const { hostname, port } = parseOllamaHost();
    const payload = JSON.stringify({
      model,
      messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.max_tokens ?? 512,
      },
    });

    const requestOptions = {
      hostname,
      port,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: constants.OLLAMA_REQUEST_TIMEOUT,
    };

    const startTime = Date.now();
    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;

    const req = http.request(requestOptions, (res) => {
      res.setEncoding('utf8');
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.error) {
              logger.error('Ollama stream error', { error: json.error });
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
          } catch (err) {
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
      logger.error('Ollama stream request failed', { error: err.message });
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

/**
 * List available models from Ollama.
 */
function listModels() {
  return new Promise((resolve, reject) => {
    const { hostname, port } = parseOllamaHost();
    const requestOptions = {
      hostname,
      port,
      path: '/api/tags',
      method: 'GET',
      timeout: 10000,
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.models || []);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

/**
 * Rough token estimation (4 chars ~= 1 token).
 * Fallback when Ollama doesn't return counts.
 */
function estimateTokens(messages) {
  let chars = 0;
  for (const msg of messages) {
    if (msg && msg.content) chars += msg.content.length;
  }
  return Math.ceil(chars / 4);
}

/**
 * Wrapped chat completion with circuit breaker protection.
 */
function chatCompletion(model, messages, options = {}, metadata = {}) {
  return ollamaCircuitBreaker.execute(
    () => _chatCompletion(model, messages, options),
    metadata
  );
}

/**
 * Wrapped streaming chat completion with circuit breaker protection.
 */
function streamChatCompletion(model, messages, options = {}, onChunk, metadata = {}) {
  return ollamaCircuitBreaker.execute(
    () => _streamChatCompletion(model, messages, options, onChunk),
    metadata
  );
}

module.exports = {
  chatCompletion,
  streamChatCompletion,
  listModels,
  ollamaCircuitBreaker,
};
