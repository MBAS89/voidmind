/**
 * VoidMind — Request Queue Service
 * Limits concurrent Ollama inference requests to prevent CPU meltdown.
 * RAM-only queue — no disk, no persistence.
 */

const logger = require('../utils/logger');

const MAX_CONCURRENCY = parseInt(process.env.OLLAMA_MAX_CONCURRENCY, 10) || 2;
const MAX_QUEUE_SIZE = parseInt(process.env.OLLAMA_MAX_QUEUE_SIZE, 10) || 50;

let running = 0;
const queue = [];

function enqueue(taskFn, metadata = {}) {
  return new Promise((resolve, reject) => {
    if (queue.length >= MAX_QUEUE_SIZE) {
      const err = new Error('Server is at capacity. Please try again later.');
      err.status = 503;
      logger.safeLog('warn', 'Queue full, rejecting request', {
        queue_depth: queue.length,
        running,
        request_id: metadata.requestId,
      });
      return reject(err);
    }

    const job = {
      taskFn,
      resolve,
      reject,
      metadata,
      enqueuedAt: Date.now(),
    };

    queue.push(job);
    logger.safeLog('debug', 'Job enqueued', {
      queue_depth: queue.length,
      running,
      request_id: metadata.requestId,
    });

    processQueue();
  });
}

async function processQueue() {
  if (running >= MAX_CONCURRENCY || queue.length === 0) {
    return;
  }

  const job = queue.shift();
  running += 1;

  const waitTime = Date.now() - job.enqueuedAt;
  logger.safeLog('debug', 'Job started', {
    queue_depth: queue.length,
    running,
    wait_time_ms: waitTime,
    request_id: job.metadata.requestId,
  });

  try {
    const result = await job.taskFn();
    job.resolve(result);
  } catch (err) {
    job.reject(err);
  } finally {
    running -= 1;
    logger.safeLog('debug', 'Job finished', {
      queue_depth: queue.length,
      running,
      request_id: job.metadata.requestId,
    });
    // Process next job
    setImmediate(processQueue);
  }
}

function getQueueStats() {
  return {
    running,
    queued: queue.length,
    max_concurrency: MAX_CONCURRENCY,
    max_queue_size: MAX_QUEUE_SIZE,
  };
}

function drainQueue() {
  const pending = queue.length;
  while (queue.length > 0) {
    const job = queue.shift();
    const err = new Error('Server is shutting down');
    err.status = 503;
    job.reject(err);
  }
  return pending;
}

module.exports = {
  enqueue,
  getQueueStats,
  drainQueue,
};
