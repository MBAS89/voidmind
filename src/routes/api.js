/**
 * VoidMind — User API Routes
 * Stateless endpoints for chat completions, session management, and health.
 * Supports streaming (SSE), queue-based concurrency, circuit breaker, and response formatting.
 */

const express = require('express');
const router = express.Router();

const { apiKeyAuth } = require('../middleware/auth');
const { userRateLimit } = require('../middleware/rateLimit');
const { validateChatCompletion } = require('../middleware/validate');
const { modelRouter } = require('../middleware/modelRouter');
const { formatResponse } = require('../middleware/responseFormat');
const constants = require('../config/constants');
const { createSession, getSession, appendMessage, wipeSession, summarizeSessionMessages } = require('../services/session');
const { fastChatCompletion, fastStreamChatCompletion } = require('../services/fastInference');
const { listModels } = require('../services/ollama');
const { enqueue, getQueueStats } = require('../services/queue');
const { recordUsage } = require('../services/metrics');
const { recordTokens } = require('../services/metricsCollector');
const logger = require('../utils/logger');

// Health check (public)
router.get('/health', (req, res) => {
  const queueStats = getQueueStats();
  res.json({
    status: 'ok',
    service: 'voidmind',
    version: require('../../package.json').version,
    uptime: process.uptime(),
    queue: queueStats,
    timestamp: new Date().toISOString(),
  });
});

// Models list (authenticated)
router.get('/models', apiKeyAuth, userRateLimit, async (req, res) => {
  try {
    const models = await listModels();
    res.json({
      object: 'list',
      data: models.map(m => ({
        id: m.name,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'local',
      })),
    });
  } catch (err) {
    logger.error('Failed to list models', { error: err.message, request_id: req.requestId });
    res.status(503).json({
      error: 'service_unavailable',
      message: 'Ollama is not available',
    });
  }
});

// Usage for current key (authenticated)
router.get('/usage', apiKeyAuth, userRateLimit, async (req, res) => {
  try {
    const { getKeyUsage } = require('../services/metrics');
    const usage = await getKeyUsage(req.apiKey.id);
    res.json(usage);
  } catch (err) {
    logger.error('Failed to get key usage', { error: err.message, request_id: req.requestId });
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to retrieve usage data',
    });
  }
});

// Chat completions (authenticated, validated, rate-limited, queued, circuit-breaker protected)
router.post('/chat/completions', apiKeyAuth, userRateLimit, validateChatCompletion, modelRouter, async (req, res) => {
  const startTime = Date.now();
  const body = req.validatedBody;
  const isStream = body.stream === true;
  const acceptFormat = req.headers.accept || 'application/json';
  const selectedModel = req.selectedModel || body.model;

  try {
    // Resolve or create session
    let session;
    if (body.session_id) {
      session = getSession(body.session_id);
    }

    if (!session) {
      session = createSession(body.session_id, {}, body.messages);
    } else {
      const lastUserMessages = body.messages.filter(m => m.role === 'user');
      for (const msg of lastUserMessages) {
        appendMessage(session.id, msg);
      }
    }

    // Optional: summarize old messages if session is getting long
    if (session.messages.length > constants.SESSION_MAX_MESSAGES * 0.8) {
      session.messages = summarizeSessionMessages(session.messages);
    }

    // Inference task (will be queued if at concurrency limit)
    const inferenceTask = async () => {
      if (isStream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const result = await fastStreamChatCompletion(
          selectedModel,
          session.messages,
          { temperature: body.temperature, max_tokens: body.max_tokens },
          (chunk) => {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          },
          { requestId: req.requestId }
        );

        res.write(`data: ${JSON.stringify({
          id: `chatcmpl-${Math.floor(Date.now() / 1000)}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: selectedModel,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();

        appendMessage(session.id, {
          role: 'assistant',
          content: result.content,
        });

        return result;
      } else {
        const result = await fastChatCompletion(
          selectedModel,
          session.messages,
          { temperature: body.temperature, max_tokens: body.max_tokens },
          { requestId: req.requestId }
        );

        appendMessage(session.id, {
          role: 'assistant',
          content: result.content,
        });

        return result;
      }
    };

    const result = await enqueue(inferenceTask, { requestId: req.requestId });

    // If cached response, return immediately without re-recording usage
    if (result.cached) {
      const formattedContent = formatResponse(result.content, {
        prefix: req.apiKey.responsePrefix,
        suffix: req.apiKey.responseSuffix,
      });
      res.json({
        id: `chatcmpl-${Math.floor(Date.now() / 1000)}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: selectedModel,
        session_id: session.id,
        cached: true,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: formattedContent },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
          total_tokens: result.totalTokens,
        },
      });
      return;
    }

    // Record usage (NO content, only counts)
    const latency = Date.now() - startTime;
    await recordUsage({
      keyId: req.apiKey.id,
      endpoint: '/api/v1/chat/completions',
      tokensUsed: result.totalTokens,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      status: 200,
      latency,
      model: selectedModel,
    });
    recordTokens(selectedModel, req.apiKey.id, result.totalTokens);

    // Non-streaming response formatting
    if (!isStream) {
      const formattedContent = formatResponse(result.content, {
        prefix: req.apiKey.responsePrefix,
        suffix: req.apiKey.responseSuffix,
      });

      if (acceptFormat.includes('text/plain')) {
        res.setHeader('Content-Type', 'text/plain');
        res.send(formattedContent);
      } else if (acceptFormat.includes('text/markdown')) {
        res.setHeader('Content-Type', 'text/markdown');
        res.send(formattedContent);
      } else {
        // Default JSON (OpenAI-compatible)
        res.json({
          id: `chatcmpl-${Math.floor(Date.now() / 1000)}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: selectedModel,
          session_id: session.id,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: formattedContent,
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: result.promptTokens,
            completion_tokens: result.completionTokens,
            total_tokens: result.totalTokens,
          },
        });
      }
    }
  } catch (err) {
    const latency = Date.now() - startTime;
    logger.error('Chat completion failed', { error: err.message, latency, request_id: req.requestId });

    await recordUsage({
      keyId: req.apiKey.id,
      endpoint: '/api/v1/chat/completions',
      tokensUsed: 0,
      promptTokens: 0,
      completionTokens: 0,
      status: err.status || 500,
      latency,
      model: selectedModel,
    });

    if (isStream && !res.headersSent) {
      res.status(err.status || 500).json({ error: 'inference_error', message: err.message });
    } else if (isStream) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    } else {
      res.status(err.status || 500).json({ error: 'inference_error', message: err.message || 'Inference failed' });
    }
  }
});

// End session explicitly (authenticated)
router.post('/session/end', apiKeyAuth, userRateLimit, async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'session_id is required',
    });
  }

  const existed = wipeSession(session_id);
  res.json({
    session_id,
    wiped: existed,
    message: existed ? 'Session wiped successfully' : 'Session not found or already expired',
  });
});

module.exports = router;
