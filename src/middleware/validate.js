/**
 * VoidMind — Request Validation Middleware
 * JSON Schema strict validation using Zod.
 * Enforces message size limits, max messages per session, and structure.
 */

const { z } = require('zod');
const constants = require('../config/constants');
const { detectPII, validateMessageSize } = require('../utils/security');
const logger = require('../utils/logger');

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(constants.SESSION_MAX_MESSAGE_SIZE),
});

const chatCompletionSchema = z.object({
  session_id: z.string().uuid().optional(),
  model: z.string().min(1).max(64).default(process.env.OLLAMA_DEFAULT_MODEL || 'qwen2.5:3b'),
  messages: z.array(messageSchema).min(1).max(constants.SESSION_MAX_MESSAGES),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  max_tokens: z.number().int().min(1).max(8192).optional().default(512),
  stream: z.boolean().optional().default(false),
});

const createKeySchema = z.object({
  name: z.string().min(1).max(128),
  monthly_limit: z.number().int().min(0).optional().default(0),
  daily_limit: z.number().int().min(0).optional().default(0),
  requests_per_minute: z.number().int().min(1).max(1000).optional().default(60),
  allowed_ips: z.string().max(512).optional().nullable(),
  tags: z.string().max(256).optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
});

const updateLimitsSchema = z.object({
  monthly_limit: z.number().int().min(0).optional(),
  daily_limit: z.number().int().min(0).optional(),
  requests_per_minute: z.number().int().min(1).max(1000).optional(),
});

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const changePasswordSchema = z.object({
  old_password: z.string().min(8).max(128),
  new_password: z.string().min(12).max(128),
});

function validateChatCompletion(req, res, next) {
  const result = chatCompletionSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid request body',
      details: result.error.issues,
    });
  }

  // Validate message sizes
  for (const msg of result.data.messages) {
    if (!validateMessageSize(msg.content, constants.SESSION_MAX_MESSAGE_SIZE)) {
      return res.status(400).json({
        error: 'validation_error',
        message: `Message exceeds maximum size of ${constants.SESSION_MAX_MESSAGE_SIZE} bytes`,
      });
    }

    // Check for PII (app server should anonymize, but we double-check)
    const pii = detectPII(msg.content);
    if (pii.length > 0) {
      logger.safeLog('warn', 'PII detected in request', {
        types: pii.map(p => p.type),
        ip: req.ip,
        key_id: req.apiKey?.id,
      });
      // We don't reject — we trust the app server to anonymize.
      // But we log it for audit purposes.
    }
  }

  req.validatedBody = result.data;
  next();
}

function validateCreateKey(req, res, next) {
  const result = createKeySchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid request body',
      details: result.error.issues,
    });
  }
  req.validatedBody = result.data;
  next();
}

function validateUpdateLimits(req, res, next) {
  const result = updateLimitsSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid request body',
      details: result.error.issues,
    });
  }
  req.validatedBody = result.data;
  next();
}

function validateAdminLogin(req, res, next) {
  const result = adminLoginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid login credentials format',
      details: result.error.issues,
    });
  }
  req.validatedBody = result.data;
  next();
}

function validateChangePassword(req, res, next) {
  const result = changePasswordSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid password format',
      details: result.error.issues,
    });
  }
  req.validatedBody = result.data;
  next();
}

module.exports = {
  validateChatCompletion,
  validateCreateKey,
  validateUpdateLimits,
  validateAdminLogin,
  validateChangePassword,
};
