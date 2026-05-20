# VoidMind — Complete Usage Example

This guide shows you how to use VoidMind from start to finish with real examples.

---

## The Big Picture

```
Your App (clinic, shop, SaaS)
    |
    | 1. User sends message
    | 2. You ANONYMIZE it (strip PII)
    | 3. You send to VoidMind with API key
    v
VoidMind VPS (RAM-only gateway)
    |
    | 4. Receives request (no PII)
    | 5. Stores session in RAM Map
    | 6. Calls Ollama (localhost)
    | 7. Gets AI response
    | 8. Returns response to you
    | 9. Auto-wipes session after 5-30 min
    v
Your App
    |
    | 10. Show response to user
    | 11. Store conversation in YOUR database (encrypted)
```

**Key rule:** VoidMind NEVER stores conversations. YOU store them on your own server.

---

## Step 1: Start VoidMind

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env and set at minimum:
#   ADMIN_EMAIL=admin@voidmind.local
#   ADMIN_PASSWORD_HASH=$2b$12$... (bcrypt hash of your password)
#   ADMIN_JWT_PRIVATE_KEY=... (RS256 private key)
#   ADMIN_JWT_PUBLIC_KEY=... (RS256 public key)

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

Server runs on `http://127.0.0.1:3000`

---

## Step 2: Get Admin Access

Login as admin to create API keys:

```bash
curl -X POST http://localhost:3000/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@voidmind.local","password":"admin123"}'
```

Response:
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

Save the `access_token`. It expires in 15 minutes.

---

## Step 3: Create an API Key

```bash
curl -X POST http://localhost:3000/admin/keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -d '{
    "name": "My Clinic App",
    "monthly_limit": 50000,
    "daily_limit": 2000,
    "requests_per_minute": 60
  }'
```

Response:
```json
{
  "id": "key_7f3a9d2e",
  "name": "My Clinic App",
  "key": "vm_aB3xK9mPqR2sT5vW8yZ0cD4fG7hJ1kL",
  "key_preview": "vm_aB3xK9...mPqR2sT5",
  "monthly_limit": 50000,
  "daily_limit": 2000,
  "requests_per_minute": 60,
  "created_at": "2026-05-20T10:00:00Z",
  "expires_at": null
}
```

**IMPORTANT:** Save the `key` value — it's shown only once!

---

## Step 4: Send a Message (Your App -> VoidMind)

### Example: Dental Clinic Booking

```javascript
// Your app server code
const VOIDMIND_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'vm_aB3xK9mPqR2sT5vW8yZ0cD4fG7hJ1kL';

// Store session ID in YOUR database (not on VoidMind)
let patientSessionId = null;

async function chatWithPatient(patientMessage) {
  // Step 1: ANONYMIZE before sending to VoidMind
  const anonymizedMessage = patientMessage
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    .replace(/\b(?:\d{3}[-.]?){2}\d{4}\b/g, '[PHONE]');

  // Step 2: Send to VoidMind
  const response = await fetch(`${VOIDMIND_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      session_id: patientSessionId,  // Reuse existing session or null for new
      model: 'qwen2.5:3b',
      messages: [
        {
          role: 'system',
          content: 'You are a dental clinic assistant. Available doctors: Dr. Ahmed (ID:7), Dr. Sara (ID:12). Hours: 09:00-17:00. Help patients book appointments.'
        },
        {
          role: 'user',
          content: anonymizedMessage
        }
      ],
      temperature: 0.7,
      max_tokens: 512,
    }),
  });

  const data = await response.json();

  // Step 3: Save session ID in YOUR database for continuity
  patientSessionId = data.session_id;

  // Step 4: Store conversation in YOUR encrypted database
  await saveToYourDatabase({
    patient_id: 'P-4829',  // Your internal ID
    session_id: patientSessionId,
    message: patientMessage,        // Original (in YOUR DB)
    response: data.choices[0].message.content,
    tokens_used: data.usage.total_tokens,
    timestamp: new Date(),
  });

  // Step 5: Return response to patient
  return data.choices[0].message.content;
}

// Patient sends message
const reply = await chatWithPatient(
  'I have a toothache, can I book with Dr. Ahmed tomorrow at 3pm?'
);
console.log(reply);
// "I can book you with Dr. Ahmed tomorrow (May 21) at 15:00. Please reply YES to confirm."
```

---

## Step 5: Continue the Conversation

Send the same `session_id` to maintain context:

```javascript
const reply2 = await fetch(`${VOIDMIND_URL}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
  },
  body: JSON.stringify({
    session_id: patientSessionId,  // Same session = context preserved
    model: 'qwen2.5:3b',
    messages: [
      { role: 'system', content: 'You are a dental clinic assistant...' },
      { role: 'user', content: 'I have a toothache, can I book with Dr. Ahmed tomorrow at 3pm?' },
      { role: 'assistant', content: 'I can book you with Dr. Ahmed tomorrow at 15:00...' },
      { role: 'user', content: 'Yes please confirm it' }
    ],
    temperature: 0.7,
    max_tokens: 512,
  }),
});
```

VoidMind appends new messages to the existing RAM session.

---

## Step 6: End the Session (Explicit Wipe)

When the patient is done:

```javascript
await fetch(`${VOIDMIND_URL}/session/end`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
  },
  body: JSON.stringify({
    session_id: patientSessionId,
  }),
});

// Session is immediately wiped from RAM
patientSessionId = null;
```

Even if you don't call this, the session auto-wipes after:
- **5 minutes** of no activity (idle TTL)
- **30 minutes** from creation (absolute max)

---

## What Exists on VoidMind After Response

| Location | Content |
|----------|---------|
| **RAM** | Empty (session wiped or will auto-wipe) |
| **Disk** | Only Ollama model file + SQLite admin DB |
| **SQLite** | `"200 POST /api/v1/chat/completions — 142 tokens — key:key_7f3a"` (NO message content) |
| **Logs** | `"Ollama inference completed — latency: 2100ms — tokens: 142"` (NO content) |
| **Network** | Nothing cached |

---

## Admin Dashboard Operations

### View Active Sessions (Count Only)

```bash
curl http://localhost:3000/admin/sessions \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

Response:
```json
{
  "active_sessions": 7,
  "oldest_session_age_seconds": 180,
  "total_sessions_today": 45,
  "memory_used_mb": 456,
  "sessions": [
    {
      "session_id": "550e8400-e29b-41d4-a716-446655440000",
      "age_seconds": 45,
      "message_count": 3,
      "token_count": 156
    }
  ]
}
```

**Notice:** You see counts, NOT content. Content is gone.

### Force-Wipe All Sessions

```bash
curl -X DELETE http://localhost:3000/admin/sessions \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

Response:
```json
{ "wiped": true, "count": 7 }
```

### View Usage Stats

```bash
curl http://localhost:3000/admin/usage \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

Response:
```json
{
  "total_keys": 3,
  "active_keys": 3,
  "total_tokens_today": 12450,
  "total_tokens_this_month": 89234,
  "average_latency_ms": 2340,
  "requests_today": 156,
  "top_keys": [
    {
      "key_id": "key_7f3a9d2e",
      "name": "My Clinic App",
      "tokens_today": 8450,
      "requests_today": 98,
      "avg_latency_ms": 2100
    }
  ]
}
```

### Get Compliance Report

```bash
curl http://localhost:3000/admin/compliance \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

Returns a full compliance report proving zero data storage.

---

## Change Admin Password

### Current Admin Changes Their Password

```bash
curl -X POST http://localhost:3000/admin/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -d '{
    "old_password": "admin123",
    "new_password": "MyN3wStr0ngP@ssw0rd!"
  }'
```

Response:
```json
{
  "message": "Password changed successfully",
  "admin_email": "admin@voidmind.local"
}
```

**Security notes:**
- Requires current password verification
- New password must be at least 12 characters
- Admin JWT token is still valid until expiry (15 min)
- All future logins use the new password
- Stored in SQLite (not env vars)

### First-Time Setup (When No Admin Exists)

If you start VoidMind without `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` in `.env`, or want to create a new admin:

```bash
curl -X POST http://localhost:3000/admin/auth/setup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@voidmind.local",
    "password": "MyStr0ngP@ssw0rd!",
    "name": "Administrator"
  }'
```

Response:
```json
{
  "message": "Admin account created successfully",
  "email": "admin@voidmind.local"
}
```

**This only works once.** After the first admin is created, use `/admin/auth/login`.

### View Admin Profile

```bash
curl http://localhost:3000/admin/profile \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

Response:
```json
{
  "id": 1,
  "email": "admin@voidmind.local",
  "name": "Administrator",
  "is_active": true,
  "created_at": "2026-05-20T10:00:00Z",
  "updated_at": "2026-05-20T10:00:00Z"
}
```

---

## Example: E-Commerce Product Support

```javascript
const API_KEY = 'vm_aB3xK9mPqR2sT5vW8yZ0cD4fG7hJ1kL';

async function answerProductQuestion(customerQuestion) {
  const response = await fetch('http://localhost:3000/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'qwen2.5:3b',
      messages: [
        {
          role: 'system',
          content: 'You are a tech support agent for an electronics store. Be concise and accurate.'
        },
        {
          role: 'user',
          content: customerQuestion  // "Does this laptop support USB-C charging?"
        }
      ],
      max_tokens: 256,
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
  // "Yes, this laptop supports USB-C Power Delivery up to 65W."
}
```

---

## Example: Legal Assistant

```javascript
async function legalGuidance(clientQuestion) {
  const response = await fetch('http://localhost:3000/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'qwen2.5:3b',
      messages: [
        {
          role: 'system',
          content: 'You are a legal assistant. Provide general information only. Always include: "This is not legal advice. Consult a licensed attorney."'
        },
        {
          role: 'user',
          content: clientQuestion
        }
      ],
      temperature: 0.3,  // Lower temperature for factual responses
      max_tokens: 512,
    }),
  });

  return (await response.json()).choices[0].message.content;
}
```

---

## Health Check

```bash
# Anyone can check if VoidMind is alive
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "service": "voidmind",
  "version": "1.0.0",
  "uptime": 3600,
  "timestamp": "2026-05-20T10:00:00.000Z"
}
```

---

## Summary: The VoidMind Promise in Action

| What You Do | What VoidMind Does | What Gets Stored |
|-------------|-------------------|------------------|
| Send anonymized message | Processes in RAM, calls Ollama | Token count only |
| Continue conversation | Appends to RAM session | Token count only |
| End session | Wipes immediately | Nothing |
| Do nothing | Auto-wipes after 5 min idle | Nothing |
| Check usage stats | Returns counts | Token counts in SQLite |
| Admin views sessions | Returns counts + ages | Nothing new |

**Result:** Even if someone seizes the VPS, they find zero conversations, zero user data, zero PII. Just an empty machine running an AI model.
