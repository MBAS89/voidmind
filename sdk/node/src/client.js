/**
 * VoidMind SDK — Node.js Client
 * Official client for the VoidMind Zero-Knowledge AI Gateway.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const {
  VoidMindError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  ServerError,
  CircuitBreakerError,
} = require('./errors');

class VoidMindClient {
  /**
   * @param {Object} options
   * @param {string} options.baseUrl - VoidMind URL (e.g., 'https://voidmind.example.com')
   * @param {string} options.apiKey - API key (starts with 'vm_')
   * @param {number} [options.timeout=30000] - Request timeout in ms
   * @param {number} [options.maxRetries=2] - Max retries for transient errors
   */
  constructor(options) {
    if (!options.baseUrl) throw new Error('baseUrl is required');
    if (!options.apiKey) throw new Error('apiKey is required');

    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 2;
  }

  // --- User API ---

  /**
   * Send a chat completion request.
   * @param {Object} params
   * @param {string} [params.model='qwen2.5:3b']
   * @param {Array<{role:string,content:string}>} params.messages
   * @param {string} [params.sessionId] - Existing session ID for continuity
   * @param {number} [params.temperature=0.7]
   * @param {number} [params.maxTokens=512]
   * @param {boolean} [params.stream=false]
   * @returns {Promise<Object>} Chat completion response
   */
  async chat(params) {
    const body = {
      model: params.model || 'qwen2.5:3b',
      messages: params.messages,
      session_id: params.sessionId || undefined,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 512,
      stream: false,
    };

    return this._request('POST', '/api/v1/chat/completions', body);
  }

  /**
   * Stream a chat completion.
   * Yields chunk objects in OpenAI-compatible format.
   * @param {Object} params - Same as chat()
   * @returns {AsyncGenerator<Object>}
   */
  async *streamChat(params) {
    const body = {
      model: params.model || 'qwen2.5:3b',
      messages: params.messages,
      session_id: params.sessionId || undefined,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 512,
      stream: true,
    };

    const url = new URL('/api/v1/chat/completions', this.baseUrl);
    const payload = JSON.stringify(body);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: this.timeout,
    };

    const client = url.protocol === 'https:' ? https : http;

    const response = await new Promise((resolve, reject) => {
      const req = client.request(options, resolve);
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.write(payload);
      req.end();
    });

    if (response.statusCode !== 200) {
      const body = await this._readBody(response);
      throw this._parseError(response.statusCode, body);
    }

    response.setEncoding('utf8');
    let buffer = '';

    for await (const chunk of response) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data);
        } catch {
          // skip malformed
        }
      }
    }
  }

  /**
   * End a session explicitly.
   * @param {string} sessionId
   * @returns {Promise<Object>}
   */
  async endSession(sessionId) {
    return this._request('POST', '/api/v1/session/end', { session_id: sessionId });
  }

  /**
   * List available models.
   * @returns {Promise<Object>}
   */
  async listModels() {
    return this._request('GET', '/api/v1/models');
  }

  /**
   * Get usage for the current API key.
   * @returns {Promise<Object>}
   */
  async getUsage() {
    return this._request('GET', '/api/v1/usage');
  }

  // --- Admin API (requires admin JWT) ---

  /**
   * Create an admin client from an access token.
   * @param {string} baseUrl
   * @param {string} accessToken - JWT from /admin/auth/login
   */
  static createAdminClient(baseUrl, accessToken) {
    return new VoidMindAdminClient(baseUrl, accessToken);
  }

  // --- Internal ---

  async _request(method, path, body = null) {
    const url = new URL(path, this.baseUrl);
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: this.timeout,
    };

    const client = url.protocol === 'https:' ? https : http;

    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await new Promise((resolve, reject) => {
          const req = client.request(options, resolve);
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
          if (payload) req.write(payload);
          req.end();
        });

        const responseBody = await this._readBody(response);

        if (response.statusCode >= 200 && response.statusCode < 300) {
          return JSON.parse(responseBody);
        }

        throw this._parseError(response.statusCode, responseBody, response.headers);
      } catch (err) {
        lastError = err;
        if (err.statusCode === 429 || err.statusCode === 503) {
          // Retry after rate limit or circuit breaker
          const delay = Math.pow(2, attempt) * 1000;
          await this._sleep(delay);
          continue;
        }
        if (err.statusCode >= 400 && err.statusCode < 500) {
          throw err; // Don't retry client errors
        }
        if (attempt < this.maxRetries) {
          await this._sleep(Math.pow(2, attempt) * 1000);
          continue;
        }
        throw err;
      }
    }

    throw lastError;
  }

  _readBody(response) {
    return new Promise((resolve, reject) => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => resolve(data));
      response.on('error', reject);
    });
  }

  _parseError(statusCode, body, headers = {}) {
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = { message: body }; }
    const message = parsed.message || parsed.error || `HTTP ${statusCode}`;

    switch (statusCode) {
      case 401: return new AuthenticationError(message, parsed);
      case 429: return new RateLimitError(message, parsed, headers['retry-after']);
      case 400: return new ValidationError(message, parsed);
      case 503: return new CircuitBreakerError(message, parsed);
      default:
        if (statusCode >= 500) return new ServerError(message, parsed);
        return new VoidMindError(message, statusCode, parsed);
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// --- Admin Client ---

class VoidMindAdminClient {
  constructor(baseUrl, accessToken) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.accessToken = accessToken;
    this.timeout = 30000;
  }

  async _request(method, path, body = null) {
    const url = new URL(path, this.baseUrl);
    const payload = body ? JSON.stringify(body) : null;
    const client = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: this.timeout,
    };

    return new Promise((resolve, reject) => {
      const req = client.request(options, async (res) => {
        const data = await new Promise((r, e) => {
          let d = '';
          res.on('data', c => { d += c; });
          res.on('end', () => r(d));
          res.on('error', e);
        });
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      if (payload) req.write(payload);
      req.end();
    });
  }

  // Auth
  async login(email, password) {
    return this._request('POST', '/admin/auth/login', { email, password });
  }

  // Keys
  async listKeys() { return this._request('GET', '/admin/keys'); }
  async createKey(params) { return this._request('POST', '/admin/keys', params); }
  async revokeKey(id) { return this._request('DELETE', `/admin/keys/${id}`); }
  async rotateKey(id) { return this._request('POST', `/admin/keys/${id}/rotate`); }
  async updateKeyLimits(id, limits) { return this._request('PATCH', `/admin/keys/${id}/limits`, limits); }

  // Usage & Sessions
  async getUsage() { return this._request('GET', '/admin/usage'); }
  async getKeyUsage(keyId) { return this._request('GET', `/admin/usage/${keyId}`); }
  async getSessions() { return this._request('GET', '/admin/sessions'); }
  async wipeAllSessions() { return this._request('DELETE', '/admin/sessions'); }

  // Health & Performance
  async getHealth() { return this._request('GET', '/admin/health'); }
  async getPerformance() { return this._request('GET', '/admin/performance'); }
  async getCompliance() { return this._request('GET', '/admin/compliance'); }

  // Cache
  async clearResponseCache() { return this._request('DELETE', '/admin/cache/response'); }
  async clearPromptCache() { return this._request('DELETE', '/admin/cache/prompt'); }
}

module.exports = { VoidMindClient, VoidMindAdminClient };
