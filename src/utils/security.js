/**
 * VoidMind — Security Utilities
 * PII detection, input sanitization, output filtering.
 * No data is stored — these operate on transient requests only.
 */

// Patterns that might indicate PII slipping through
const PII_PATTERNS = [
  { type: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: 'phone', regex: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g },
  { type: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'credit_card', regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g },
  { type: 'ip_address', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
];

/**
 * Detect PII in text. Returns array of detected patterns.
 * Used for validation — reject if PII is found (app server should anonymize first).
 */
function detectPII(text) {
  if (typeof text !== 'string') return [];
  const findings = [];
  for (const pattern of PII_PATTERNS) {
    const matches = text.match(pattern.regex);
    if (matches) {
      findings.push({ type: pattern.type, count: matches.length });
    }
  }
  return findings;
}

/**
 * Strip PII from text. Returns sanitized string.
 * Fallback if app server didn't anonymize properly.
 */
function stripPII(text) {
  if (typeof text !== 'string') return text;
  let sanitized = text;
  for (const pattern of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern.regex, `[${pattern.type.toUpperCase()}_REDACTED]`);
  }
  return sanitized;
}

/**
 * Validate that message size is within limits.
 */
function validateMessageSize(content, maxSize) {
  const size = Buffer.byteLength(content, 'utf8');
  return size <= maxSize;
}

/**
 * Sanitize a string for safe logging (no newlines, no control chars).
 */
function sanitizeForLog(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, 200);
}

module.exports = {
  detectPII,
  stripPII,
  validateMessageSize,
  sanitizeForLog,
};
