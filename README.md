# VoidMind — Zero-Knowledge AI Gateway

> **Think. Respond. Vanish.**
>
> A stateless, self-hosted AI API gateway that stores zero conversation data.
> Open source so you can verify our claims.
> Works with any application: healthcare, e-commerce, legal, finance, education, SaaS.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)

---

## Table of Contents

- [What is VoidMind?](#what-is-voidmind)
- [Features](#features)
- [Security & Compliance](#security--compliance)
- [Speed & Performance](#speed--performance)
- [Universal Use Cases](#universal-use-cases)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Interactive API Docs](#interactive-api-docs)
- [Admin Dashboard API](#admin-dashboard-api)
- [Performance Tuning](#performance-tuning)
- [Verification](#verification)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## What is VoidMind?

VoidMind is a **universal stateless AI gateway** that any application can use to add AI capabilities without compromising user privacy or data security.

### Core Promise

| Feature | Status |
|---------|--------|
| Local AI inference | No third-party APIs (DeepSeek, OpenAI, etc.) |
| Zero data retention | Conversations live only in RAM, wiped automatically |
| No user data stored | Not even anonymized — just gone |
| Admin dashboard control | Full remote management via secure API |
| Universal | Works for clinics, e-commerce, legal, finance, education, any SaaS |
| Open source | MIT license, fully auditable |

### The VoidMind Guarantee

> *"If someone seizes the server, subpoenas the provider, or hacks the VPS — they find **nothing**. No conversations. No user data. No logs of what anyone said. Just an empty machine running an AI model."*

---

## Features

### Inference
- **Streaming responses** — Server-Sent Events (SSE), OpenAI-compatible chunks
- **Multi-model routing** — Automatically routes to available models, falls back to default
- **Response caching** — LRU cache delivers instant replies for identical queries
- **Prompt caching** — Tracks KV cache hints so Ollama reuses computed state
- **Session summarization** — Compresses old messages automatically to prevent slowdown

### Reliability
- **Circuit breaker** — Fails fast when Ollama is down, auto-recovers when healthy
- **Request queue** — Concurrency-limited queue prevents CPU meltdown under load
- **Graceful shutdown** — Finishes in-flight requests, wipes sessions, closes DB cleanly
- **Model keep-alive** — Periodic pings keep the model hot in RAM (no cold starts)

### Security
- **API key authentication** — Per-key rate limits, usage quotas, IP whitelisting
- **Admin JWT (RS256)** — Short-lived access tokens + refresh tokens with revocation
- **IP whitelisting** — Admin API restricted by CIDR blocks; per-key IP restrictions
- **PII detection** — Flags potential PII in requests for audit (does not store)
- **Webhook alerts** — Slack/Discord notifications for limit breaches, Ollama downtime

### Observability
- **Prometheus metrics** — `/metrics` endpoint for Grafana scraping
- **Request ID tracing** — Every request gets `X-Request-ID` for distributed tracing
- **Structured logging** — Winston JSON logs with zero content/PII
- **Performance dashboard** — `GET /admin/performance` shows caches, queue, circuit breaker

### Operations
- **OpenAPI spec** — Full `docs/openapi.yaml` for Postman/Swagger
- **Benchmark suite** — `scripts/benchmark.js` for load testing
- **One-command VPS setup** — `scripts/setup.sh` for Ubuntu 22.04
- **Docker support** — Sidecar compose stack with Ollama
- **Terraform** — Hetzner Cloud infrastructure-as-code
- **GitHub Actions CI/CD** — Automated testing on push

---

## Security & Compliance

### Zero-Data Guarantee

- No user database on VPS
- No conversation logs
- No Redis, no MongoDB, no PostgreSQL for user data
- No cloud logging services
- No telemetry or phone-home
- Sessions: RAM-only JavaScript Map, auto-wiped after 5-30 minutes
- Admin data: SQLite (API keys, usage counts, NO content)
- Open source: verify everything

### HIPAA Mapping

| Requirement | How VoidMind Satisfies |
|-------------|------------------------|
| Data Minimization | VoidMind stores zero PHI. All user data stays on your app server. |
| Access Controls | API key auth (user) + JWT + IP whitelist (admin). |
| Audit Controls | Admin logs all actions. Your app server logs "AI used" with token count. No content logged. |
| Transmission Security | TLS 1.3 end-to-end. No plaintext ever. |

### GDPR Mapping

| Requirement | How VoidMind Satisfies |
|-------------|------------------------|
| Lawful Basis | Processing is contractual (service provision). Consent managed on your app server. |
| Data Minimization | Only anonymized context sent. No PII on VoidMind. |
| Storage Limitation | Sessions auto-wipe in 5-30 minutes. No retention. |
| Right to Erasure | Session end API = immediate wipe. No backup to delete. |
| Processor Contract | You are the processor. No third-party AI involved. |
| Cross-Border | No data leaves your jurisdiction. VPS location = your choice. |
| Transparency | Open source code proves claims. Anyone can audit. |

---

## Speed & Performance

VoidMind is built for **minimum latency** on CPU inference:

| Optimization | Expected Gain |
|--------------|---------------|
| Response cache (identical queries) | **95%** — sub-millisecond vs seconds |
| Prompt cache (repeated contexts) | **30-50%** — Ollama reuses KV state |
| HTTP keep-alive agent | **10-20%** — no TCP handshake per request |
| `num_thread` tuning | **20-40%** — pin threads to vCPU count |
| Model keep-alive | **Eliminates cold start** — model stays in RAM |
| Streaming (first token) | **Perceived 10x faster** — tokens appear immediately |
| Session summarization | **Prevents exponential slowdown** from long contexts |
| Request queue | **Predictable latency** under concurrent load |

### Response Cache

Identical `(model, messages, temperature, max_tokens)` queries are cached in RAM for 60 seconds (configurable). Perfect for FAQs, repeated greetings, and common support questions.

```json
// Cached response includes flag
{
  "cached": true,
  "choices": [{ "message": { "content": "Hello!" } }]
}
```

### Streaming

Enable streaming for the best perceived speed:

```json
POST /api/v1/chat/completions
{
  "model": "qwen2.5:3b",
  "messages": [{"role":"user","content":"Hello"}],
  "stream": true
}
```

Returns OpenAI-compatible SSE chunks.

---

## Universal Use Cases

### The Pattern is Always the Same

```
Your App (Any SaaS)  --anonymized-->  VoidMind (VPS)  --response-->  Your App
                                            |
                                            v
                                    RAM Session (auto-wiped 5-30 min)
```

### Examples

| Industry | Use Case |
|----------|----------|
| Healthcare | Clinic booking, patient support |
| E-commerce | Product Q&A, order support |
| Legal | Client intake, general guidance |
| Finance | Financial education, account help |
| Education | Tutoring, course support |
| SaaS | General customer support, onboarding |

---

## Architecture

```
User Device
    |
    v
Nginx (TLS 1.3, gzip, keepalive, rate limit)
    |
    v
Express API Gateway
    |-- Request ID middleware
    |-- API Key Auth (sha256, IP whitelist)
    |-- Rate Limit (per-key, in-memory)
    |-- Validation (Zod schema)
    |-- Model Router (fallback to default)
    |
    |-- /api/v1/chat/completions
    |   |-- Response Cache (RAM LRU)
    |   |-- Request Queue (max concurrency)
    |   |-- Circuit Breaker (fail fast)
    |   |-- Prompt Cache (KV hint)
    |   |-- Ollama HTTP Agent (keep-alive)
    |   |-- Ollama (localhost:11434)
    |   |-- Streaming / JSON response
    |
    |-- /admin/* (JWT + IP whitelist)
    |   |-- API key CRUD, usage stats
    |   |-- Session wipe, health, compliance
    |   |-- Performance metrics, cache clear
    |
    |-- /metrics (Prometheus scrape)
    |-- /health (public)
    |
Background Tasks
    |-- Cleanup cron (session expiry, key expiry)
    |-- Ollama health check + webhook alerts
    |-- Model keep-alive ping
    |-- Metrics refresh for Prometheus
```

---

## Quick Start

### Prerequisites

- Ubuntu 22.04 LTS VPS (6 vCPU, 12GB RAM recommended)
- Node.js 20+
- Ollama
- Nginx + Certbot

### One-Command Setup

```bash
# On your VPS
git clone https://github.com/nuyvo/voidmind.git /opt/voidmind
cd /opt/voidmind
bash scripts/setup.sh your-domain.com admin@your-domain.com
```

### Manual Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env
# Edit .env with your values (see Environment Variables below)

# 3. Start the server
npm start

# 4. (In another terminal) Start Ollama
OLLAMA_HOST=127.0.0.1:11434 ollama serve
```

### Docker (Optional)

```bash
cd docker
docker-compose up -d
```

---

## API Reference

### User API (Stateless)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/chat/completions` | API Key | Main inference (streaming + cache) |
| POST | `/api/v1/session/end` | API Key | Explicitly end + wipe session |
| GET | `/api/v1/health` | None | Health check + queue stats |
| GET | `/api/v1/models` | API Key | List available models |
| GET | `/api/v1/usage` | API Key | Token usage (no content) |

**Chat Completions (Streaming):**

```bash
curl -N -X POST https://your-domain.com/api/v1/chat/completions \
  -H "Authorization: Bearer vm_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:3b",
    "messages": [{"role":"user","content":"Hello"}],
    "stream": true
  }'
```

**Content-Type Negotiation:**
- `application/json` → OpenAI-compatible response (default)
- `text/plain` → Raw text response
- `text/markdown` → Markdown response

### Admin API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/admin/auth/setup` | None | First-time admin setup |
| POST | `/admin/auth/login` | None | Admin login |
| POST | `/admin/auth/refresh` | Refresh JWT | New access token |
| POST | `/admin/auth/logout` | Access JWT | Revoke session |
| POST | `/admin/auth/change-password` | Access JWT | Change password |
| GET | `/admin/profile` | Access JWT + IP | Admin profile |
| GET | `/admin/keys` | Access JWT + IP | List API keys |
| POST | `/admin/keys` | Access JWT + IP | Create new API key |
| POST | `/admin/keys/bulk` | Access JWT + IP | Bulk create keys |
| DELETE | `/admin/keys/:id` | Access JWT + IP | Pause key |
| POST | `/admin/keys/:id/activate` | Access JWT + IP | Reactivate key |
| DELETE | `/admin/keys/:id/permanent` | Access JWT + IP | Permanently delete |
| PATCH | `/admin/keys/:id` | Access JWT + IP | Update key name |
| PATCH | `/admin/keys/:id/limits` | Access JWT + IP | Update limits |
| POST | `/admin/keys/:id/rotate` | Access JWT + IP | Rotate key |
| GET | `/admin/usage` | Access JWT + IP | Usage stats |
| GET | `/admin/usage/:keyId` | Access JWT + IP | Per-key usage |
| GET | `/admin/sessions` | Access JWT + IP | Active session count |
| DELETE | `/admin/sessions` | Access JWT + IP | Force-wipe all sessions |
| GET | `/admin/health` | Access JWT + IP | VPS health |
| GET | `/admin/performance` | Access JWT + IP | Caches, queue, tuning |
| DELETE | `/admin/cache/response` | Access JWT + IP | Clear response cache |
| DELETE | `/admin/cache/prompt` | Access JWT + IP | Clear prompt cache |
| GET | `/admin/logs` | Access JWT + IP | Admin audit log |
| GET | `/admin/compliance` | Access JWT + IP | Compliance report |
| GET | `/admin/metrics` | Access JWT + IP | Prometheus metrics snapshot |
| GET | `/admin/models` | Access JWT + IP | List/manage AI models |

Full API docs: [docs/openapi.yaml](docs/openapi.yaml)  
**Interactive Swagger UI:** `https://your-domain.com/api-docs`

---

## Interactive API Docs

VoidMind ships with **Swagger UI** — a free, interactive API explorer built into the server.

### Access

Once the server is running, open your browser:

```
http://localhost:3000/api-docs
```

Or on your production domain:

```
https://your-domain.com/api-docs
```

### What You Can Do

- **Browse all endpoints** — User API + Admin API in one view
- **See request/response schemas** — Every field, type, and validation rule
- **Test requests live** — Fill in parameters and click "Try it out"
- **Copy curl commands** — Auto-generated for any endpoint
- **Download OpenAPI spec** — `docs/openapi.yaml` for Postman/Insomnia import

**No Postman needed.** The Swagger UI is generated automatically from `docs/openapi.yaml` and stays in sync with the code.

---

## Admin Dashboard API

Your application server's backend connects to `/admin/*` endpoints to build a dashboard:

- View API keys, usage, limits, IP restrictions
- Create / revoke / rotate keys
- Set per-key rate limits and allowed IPs
- View active sessions (count only, no content)
- Force-wipe all sessions
- Monitor health, performance, cache hit rates
- View compliance audit trail
- Receive webhook alerts for limits / downtime

Integration guide: [docs/ADMIN.md](docs/ADMIN.md)

---

## Performance Tuning

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_NUM_THREADS` | `0` (auto) | Set to your vCPU count for best speed |
| `OLLAMA_NUM_CTX` | `4096` | Context window size |
| `OLLAMA_NUM_BATCH` | `512` | Batch size for prompt processing |
| `OLLAMA_MAX_CONCURRENCY` | `2` | Max simultaneous inference jobs |
| `OLLAMA_MAX_QUEUE_SIZE` | `50` | Max queued requests before 503 |
| `RESPONSE_CACHE_ENABLED` | `true` | Enable identical-query caching |
| `RESPONSE_CACHE_SIZE` | `200` | Max cached responses |
| `RESPONSE_CACHE_TTL_MS` | `60000` | Cache TTL (ms) |
| `KEEP_ALIVE_INTERVAL_MIN` | `3` | Minutes between model warm pings |
| `CB_FAILURE_THRESHOLD` | `3` | Failures before circuit opens |
| `CB_RECOVERY_MS` | `30000` | Milliseconds before retry |

### Model Speed Tips

On CPU, **quantization matters more than size**:

```bash
# Faster variants (recommended)
ollama pull qwen2.5:3b-q4_K_M     # 1.3x faster, same quality
ollama pull phi3:3.8b-mini-q4     # 1.5x faster
ollama pull llama3.2:3b-q4_K_M    # 1.2x faster

# Update default
export OLLAMA_DEFAULT_MODEL=qwen2.5:3b-q4_K_M
```

### Benchmark

```bash
# Load test: 5 concurrent, 20 total requests
node scripts/benchmark.js https://your-domain.com 5 20
```

---

## Verification

### How to Verify No Data is Stored

1. **Check disk after sessions:** `find /opt/voidmind -type f | grep -v node_modules | grep -v .git` — no user data files.
2. **Check SQLite:** `sqlite3 data/admin.db "SELECT * FROM usage_logs;"` — only token counts, no content.
3. **Read the code:** `src/services/session.js` — sessions are a JavaScript Map, never written to disk.
4. **Check logs:** `grep -i "content" /var/log/voidmind*` — no message content in logs.
5. **Restart test:** Restart the server mid-conversation. Sessions are gone (by design).

---

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed step-by-step deployment.

### Terraform (Hetzner Cloud)

```bash
cd terraform
terraform init
terraform apply -var="hcloud_token=YOUR_TOKEN" -var="domain=voidmind.yourdomain.com"
```

### Scaling Path

| Phase | Trigger | Action | Cost |
|-------|---------|--------|------|
| 1 | Now | qwen2.5:3b-q4_K_M on CPU | ~$7/mo |
| 2 | 50+ daily users | Upgrade to 16GB RAM VPS | ~$12/mo |
| 3 | 200+ users or speed issues | Add GPU or 7B model | $50-200/mo |
| 4 | 1000+ users / multi-tenant | Kubernetes cluster | $500+/mo |

---

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

### Security

If you discover a security issue, please email security@voidmind.local (or the project maintainer) privately. Do not open a public issue.

See [SECURITY.md](SECURITY.md) for our security policy.

---

## License

MIT — see [LICENSE](LICENSE)

---

> **Think. Respond. Vanish.**
>
> *VoidMind ensures that even if the VPS is physically seized, legally subpoenaed, or remotely compromised — the attacker gains zero user information.*
er information.*
