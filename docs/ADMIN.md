# Admin Dashboard Integration Guide

## Authentication Flow

1. Admin logs in via `POST /admin/auth/login` with email + password
2. Server returns access token (15 min) and refresh token (7 days)
3. Include access token in all subsequent requests: `Authorization: Bearer <token>`
4. Refresh before expiry via `POST /admin/auth/refresh`

## Dashboard Features

### API Key Management

- **List keys:** `GET /admin/keys`
- **Create key:** `POST /admin/keys` — returns key once, store it securely
- **Bulk create:** `POST /admin/keys/bulk` — create up to 50 keys at once
- **Bulk delete:** `POST /admin/keys/bulk-delete` — delete multiple keys
- **Pause key:** `DELETE /admin/keys/:id` — deactivates (can reactivate later)
- **Reactivate key:** `POST /admin/keys/:id/activate` — reactivates paused key
- **Permanently delete:** `DELETE /admin/keys/:id/permanent` — removes from database
- **Update name:** `PATCH /admin/keys/:id` — change key display name
- **Update limits:** `PATCH /admin/keys/:id/limits` — change rate/token limits
- **Rotate key:** `POST /admin/keys/:id/rotate` — generates new key value

Key fields:
- `allowed_ips` — comma-separated IP/CIDR whitelist (e.g., `192.168.1.0/24,10.0.0.1`)
- `tags` — comma-separated labels (e.g., `env:prod,team:clinic`)
- `expires_at` — ISO 8601 expiration date (auto-deleted after expiry)

### Usage Monitoring

- **Global usage:** `GET /admin/usage`
- **Per-key usage:** `GET /admin/usage/:keyId`

### Session Control

- **Active sessions:** `GET /admin/sessions` — count only, no content
- **Force wipe:** `DELETE /admin/sessions` — immediate RAM wipe

### Health & Compliance

- **Health:** `GET /admin/health` — RAM, CPU, Ollama status
- **Metrics:** `GET /admin/metrics` — Prometheus metrics for Grafana
- **Compliance:** `GET /admin/compliance` — live compliance report
- **Audit logs:** `GET /admin/logs` — admin action history

## Frontend Examples

```javascript
// Login
const login = await fetch('/admin/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const { access_token } = await login.json();

// List all keys
const keys = await fetch('/admin/keys', {
  headers: { Authorization: `Bearer ${access_token}` },
});

// Pause a key (temporarily disable)
await fetch('/admin/keys/key_7f3a9d2e', {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${access_token}` },
});

// Reactivate a paused key
await fetch('/admin/keys/key_7f3a9d2e/activate', {
  method: 'POST',
  headers: { Authorization: `Bearer ${access_token}` },
});

// Permanently delete a key (removes all usage history too)
await fetch('/admin/keys/key_7f3a9d2e/permanent', {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${access_token}` },
});

// Update key name
await fetch('/admin/keys/key_7f3a9d2e', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${access_token}`,
  },
  body: JSON.stringify({ name: 'Production App V2' }),
});

// Update limits
await fetch('/admin/keys/key_7f3a9d2e/limits', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${access_token}`,
  },
  body: JSON.stringify({
    monthly_limit: 100000,
    daily_limit: 5000,
    requests_per_minute: 120,
  }),
});
```

## Security Notes

- Admin API is IP-whitelisted. Only your app server can access it.
- JWTs are short-lived. Implement refresh logic in your frontend.
- Never expose admin credentials or JWTs to end users.
