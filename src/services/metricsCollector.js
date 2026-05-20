/**
 * VoidMind — Prometheus Metrics Collector
 * Exposes operational metrics for Grafana/Prometheus monitoring.
 * No user data, no conversation content — only counts and durations.
 */

const client = require('prom-client');

// Create a Registry
const register = new client.Registry();

// Add default metrics (GC, event loop, memory, CPU)
client.collectDefaultMetrics({ register, prefix: 'voidmind_' });

// Custom metrics
const httpRequestsTotal = new client.Counter({
  name: 'voidmind_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'voidmind_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const activeSessions = new client.Gauge({
  name: 'voidmind_active_sessions',
  help: 'Number of active RAM sessions',
  registers: [register],
});

const tokensTotal = new client.Counter({
  name: 'voidmind_tokens_total',
  help: 'Total tokens processed',
  labelNames: ['model', 'key_id'],
  registers: [register],
});

const ollamaUp = new client.Gauge({
  name: 'voidmind_ollama_up',
  help: 'Ollama availability (1 = up, 0 = down)',
  registers: [register],
});

const apiKeysTotal = new client.Gauge({
  name: 'voidmind_api_keys_total',
  help: 'Total number of API keys',
  labelNames: ['status'],
  registers: [register],
});

function recordHttpRequest(method, route, statusCode, durationMs) {
  const durationSec = durationMs / 1000;
  httpRequestsTotal.inc({ method, route, status_code: statusCode });
  httpRequestDuration.observe({ method, route, status_code: statusCode }, durationSec);
}

function setActiveSessions(count) {
  activeSessions.set(count);
}

function recordTokens(model, keyId, count) {
  tokensTotal.inc({ model, key_id: keyId });
}

function setOllamaUp(isUp) {
  ollamaUp.set(isUp ? 1 : 0);
}

function setApiKeysTotal(active, paused) {
  apiKeysTotal.set({ status: 'active' }, active);
  apiKeysTotal.set({ status: 'paused' }, paused);
}

module.exports = {
  register,
  recordHttpRequest,
  setActiveSessions,
  recordTokens,
  setOllamaUp,
  setApiKeysTotal,
};
