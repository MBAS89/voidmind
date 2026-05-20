# VoidMind API Reference

## Interactive Documentation

Visit `https://your-domain.com/api-docs` for **interactive Swagger UI** — browse all endpoints, see schemas, and test requests directly in your browser.

## Base URL

```
https://your-domain.com/api/v1
```

## Authentication

All user endpoints require an API key in the Authorization header:

```
Authorization: Bearer vm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Endpoints

### POST /chat/completions

Main inference endpoint. OpenAI-compatible request/response format.
Supports **streaming** (`"stream": true`) for real-time token delivery.

**Request:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "model": "qwen2.5:3b",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "temperature": 0.7,
  "max_tokens": 512,
  "stream": false
}
```

**Response (non-streaming):**
```json
{
  "id": "chatcmpl-1716192000",
  "object": "chat.completion",
  "created": 1716192000,
  "model": "qwen2.5:3b",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 10,
    "total_tokens": 30
  }
}
```

**Streaming Response (SSE):**
When `"stream": true`, the server returns `text/event-stream`:

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant"}}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"delta":{"content":"!"}}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}

data: [DONE]

```

**Response Formatters:**
Use the `Accept` header to change output format:
- `Accept: application/json` — Default OpenAI-compatible JSON
- `Accept: text/plain` — Returns only the text content
- `Accept: text/markdown` — Returns content as Markdown

### POST /session/end

Explicitly end and wipe a session.

**Request:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### GET /health

Public health check.

### GET /models

List available Ollama models.

### GET /usage

Token usage for the current API key.

## Admin API

Base URL: `https://your-domain.com/admin`

Admin endpoints require:
1. JWT access token in `Authorization: Bearer <token>`
2. Request from whitelisted IP

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/admin/auth/login` | None | Admin login (email + password) |
| POST | `/admin/auth/refresh` | Refresh JWT | Get new access token |
| POST | `/admin/auth/logout` | Access JWT | Revoke session |
| POST | `/admin/auth/change-password` | Access JWT | Change own password |
| POST | `/admin/auth/setup` | None | First-time setup (once only) |
| GET | `/admin/profile` | Access JWT + IP | Current admin profile |

### API Key Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/admin/keys` | Access JWT + IP | List all API keys |
| POST | `/admin/keys` | Access JWT + IP | Create new API key |
| POST | `/admin/keys/bulk` | Access JWT + IP | Bulk create up to 50 keys |
| POST | `/admin/keys/bulk-delete` | Access JWT + IP | Bulk delete keys |
| DELETE | `/admin/keys/:id` | Access JWT + IP | **Pause** (deactivate) key |
| POST | `/admin/keys/:id/activate` | Access JWT + IP | **Reactivate** paused key |
| DELETE | `/admin/keys/:id/permanent` | Access JWT + IP | **Permanently delete** key |
| PATCH | `/admin/keys/:id` | Access JWT + IP | Update key **name** |
| PATCH | `/admin/keys/:id/limits` | Access JWT + IP | Update rate/token limits |
| POST | `/admin/keys/:id/rotate` | Access JWT + IP | Rotate key (new value) |

### Usage & Monitoring

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/admin/usage` | Access JWT + IP | Global usage stats |
| GET | `/admin/usage/:keyId` | Access JWT + IP | Per-key usage |
| GET | `/admin/sessions` | Access JWT + IP | Active session count |
| DELETE | `/admin/sessions` | Access JWT + IP | Force-wipe all sessions |
| GET | `/admin/health` | Access JWT + IP | VPS health |
| GET | `/admin/logs` | Access JWT + IP | Admin audit log |
| GET | `/admin/compliance` | Access JWT + IP | Compliance report |
| GET | `/admin/metrics` | Access JWT + IP | Prometheus metrics |
| GET | `/admin/performance` | Access JWT + IP | Performance dashboard (caches, queue, tuning) |
| DELETE | `/admin/cache/response` | Access JWT + IP | Clear response cache |
| DELETE | `/admin/cache/prompt` | Access JWT + IP | Clear prompt cache |
| GET | `/admin/models` | Access JWT + IP | List/manage AI models |
