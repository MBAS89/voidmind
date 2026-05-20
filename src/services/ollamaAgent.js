/**
 * VoidMind — Ollama HTTP Agent with Keep-Alive
 * Reuses TCP connections to Ollama, eliminating connection setup latency.
 */

const http = require('http');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

function parseHost() {
  const url = new URL(OLLAMA_HOST);
  return {
    hostname: url.hostname,
    port: parseInt(url.port, 10) || 11434,
  };
}

// Persistent agent with keep-alive for Ollama
const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 10,        // Max concurrent connections to Ollama
  maxFreeSockets: 5,     // Keep warm connections ready
  timeout: 30000,
  freeSocketTimeout: 30000,
});

function getAgent() {
  return agent;
}

function getRequestOptions(path, method = 'POST', extraHeaders = {}) {
  const { hostname, port } = parseHost();
  return {
    hostname,
    port,
    path,
    method,
    agent,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  };
}

module.exports = {
  getAgent,
  getRequestOptions,
  parseHost,
};
