/**
 * VoidMind — Request ID Tracing Middleware
 * Assigns a unique X-Request-ID to every request for distributed tracing.
 * Propagates through logs without exposing content.
 */

const { generateId } = require('../utils/crypto');

function requestIdMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || generateId('req_');
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

module.exports = { requestIdMiddleware };
