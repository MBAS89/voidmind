# VoidMind Architecture

## Overview

VoidMind is a stateless AI API gateway built on Node.js/Express. It proxies requests to a local Ollama instance and manages sessions entirely in RAM.

## Components

### 1. Nginx (Reverse Proxy)

- Terminates TLS 1.3
- Rate limits per endpoint
- Forwards to Express on localhost

### 2. Express API Gateway

- **User API** (`/api/v1/*`): API key auth, stateless, RAM-only sessions
- **Admin API** (`/admin/*`): JWT + IP whitelist, operational data only
- **Public Health** (`/health`): No auth required

### 3. Session Manager (RAM-Only)

- JavaScript `Map<string, Session>`
- Auto-expire: 5 min idle, 30 min absolute
- Explicit wipe on session end or admin force-wipe
- On server restart: all sessions lost (by design)

### 4. Ollama Client

- HTTP client to `127.0.0.1:11434`
- 100% local inference
- No external API calls

### 5. SQLite Database (Admin Only)

- `api_keys`: hashed keys, limits
- `usage_logs`: token counts, latency, status (NO content)
- `admin_logs`: audit trail of admin actions
- `rate_limits`: per-key rate limit config
- `refresh_tokens`: JWT revocation support

## Data Flow

```
User -> Your App -> Anonymizer -> VoidMind API -> RAM Session -> Ollama
                                              <- Response <-
                                              -> Session wiped
```

## Security Layers

1. Network: UFW, Fail2ban, SSH hardening
2. Transport: TLS 1.3, HSTS
3. Application: API keys, JWT, rate limiting, input validation
4. Data: RAM-only sessions, no conversation logs, PII detection
5. Infrastructure: Ollama localhost-only, no Docker, minimal attack surface
