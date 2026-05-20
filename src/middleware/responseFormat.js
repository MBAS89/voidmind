/**
 * VoidMind — Response Formatting Middleware
 * Optional post-processing: trim, length limits, disclaimers, safety prefixes.
 * Operates on transient response only — never stored.
 */

const logger = require('../utils/logger');

const MAX_RESPONSE_LENGTH = parseInt(process.env.MAX_RESPONSE_LENGTH, 10) || 4096;
const RESPONSE_DISCLAIMER = process.env.RESPONSE_DISCLAIMER || '';

function formatResponse(content, options = {}) {
  let formatted = content;

  // Trim whitespace
  formatted = formatted.trim();

  // Enforce max length
  if (formatted.length > MAX_RESPONSE_LENGTH) {
    formatted = formatted.slice(0, MAX_RESPONSE_LENGTH) + '...';
    logger.safeLog('warn', 'Response truncated to max length', {
      original_length: content.length,
      max_length: MAX_RESPONSE_LENGTH,
    });
  }

  // Append disclaimer if configured
  if (RESPONSE_DISCLAIMER && !formatted.includes(RESPONSE_DISCLAIMER)) {
    formatted += `\n\n${RESPONSE_DISCLAIMER}`;
  }

  // Optional custom formatter from key metadata
  if (options.prefix) {
    formatted = options.prefix + formatted;
  }
  if (options.suffix) {
    formatted = formatted + options.suffix;
  }

  return formatted;
}

module.exports = { formatResponse, MAX_RESPONSE_LENGTH };
