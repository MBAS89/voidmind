/**
 * VoidMind — Circuit Breaker for Ollama
 * Fails fast when Ollama is down or unresponsive.
 * States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing recovery)
 */

const logger = require('../utils/logger');

const FAILURE_THRESHOLD = parseInt(process.env.CB_FAILURE_THRESHOLD, 10) || 3;
const SUCCESS_THRESHOLD = parseInt(process.env.CB_SUCCESS_THRESHOLD, 10) || 2;
const TIMEOUT_MS = parseInt(process.env.CB_TIMEOUT_MS, 10) || 30000;
const RECOVERY_MS = parseInt(process.env.CB_RECOVERY_MS, 10) || 30000;

const State = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

class CircuitBreaker {
  constructor() {
    this.state = State.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
  }

  async execute(fn, metadata = {}) {
    if (this.state === State.OPEN) {
      if (Date.now() < this.nextAttempt) {
        const err = new Error('Ollama is temporarily unavailable. Please try again later.');
        err.status = 503;
        logger.safeLog('warn', 'Circuit breaker OPEN, rejecting request', {
          request_id: metadata.requestId,
          next_attempt_in_ms: this.nextAttempt - Date.now(),
        });
        throw err;
      }
      this.state = State.HALF_OPEN;
      logger.safeLog('info', 'Circuit breaker entering HALF_OPEN state', {
        request_id: metadata.requestId,
      });
    }

    try {
      const result = await fn();
      this.onSuccess(metadata);
      return result;
    } catch (err) {
      this.onFailure(metadata);
      throw err;
    }
  }

  onSuccess(metadata) {
    this.failureCount = 0;
    if (this.state === State.HALF_OPEN) {
      this.successCount += 1;
      if (this.successCount >= SUCCESS_THRESHOLD) {
        this.state = State.CLOSED;
        this.successCount = 0;
        logger.safeLog('info', 'Circuit breaker CLOSED (recovered)', {
          request_id: metadata.requestId,
        });
      }
    }
  }

  onFailure(metadata) {
    this.failureCount += 1;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= FAILURE_THRESHOLD) {
      this.state = State.OPEN;
      this.nextAttempt = Date.now() + RECOVERY_MS;
      logger.safeLog('warn', 'Circuit breaker OPEN (too many failures)', {
        request_id: metadata.requestId,
        failures: this.failureCount,
        recovery_in_ms: RECOVERY_MS,
      });
    }
  }

  getState() {
    return {
      state: this.state,
      failure_count: this.failureCount,
      success_count: this.successCount,
      last_failure_time: this.lastFailureTime,
      next_attempt: this.nextAttempt,
    };
  }
}

const ollamaCircuitBreaker = new CircuitBreaker();

module.exports = {
  CircuitBreaker,
  ollamaCircuitBreaker,
  State,
};
