/**
 * VoidMind SDK — Error Classes
 */

class VoidMindError extends Error {
  constructor(message, statusCode, responseBody) {
    super(message);
    this.name = 'VoidMindError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

class AuthenticationError extends VoidMindError {
  constructor(message, responseBody) {
    super(message, 401, responseBody);
    this.name = 'AuthenticationError';
  }
}

class RateLimitError extends VoidMindError {
  constructor(message, responseBody, retryAfter) {
    super(message, 429, responseBody);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

class ValidationError extends VoidMindError {
  constructor(message, responseBody) {
    super(message, 400, responseBody);
    this.name = 'ValidationError';
  }
}

class ServerError extends VoidMindError {
  constructor(message, responseBody) {
    super(message, 500, responseBody);
    this.name = 'ServerError';
  }
}

class CircuitBreakerError extends VoidMindError {
  constructor(message, responseBody) {
    super(message, 503, responseBody);
    this.name = 'CircuitBreakerError';
  }
}

module.exports = {
  VoidMindError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  ServerError,
  CircuitBreakerError,
};
