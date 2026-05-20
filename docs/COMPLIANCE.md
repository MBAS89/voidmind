# VoidMind Compliance Mapping

## HIPAA

### Data Minimization

VoidMind stores zero PHI. All user data stays on your application server.

**Code reference:** `src/services/session.js` — sessions are stored in a JavaScript Map, never persisted.

### Access Controls

- API key authentication for user endpoints
- JWT (RS256) + IP whitelist for admin endpoints
- No human VPS login needed for daily operations

**Code reference:** `src/middleware/auth.js`, `src/middleware/adminAuth.js`

### Audit Controls

- Admin action logging to SQLite
- Your app server logs "AI used" with token count
- No conversation content is ever logged

**Code reference:** `src/middleware/audit.js`, `src/utils/logger.js`

### Transmission Security

- TLS 1.3 end-to-end (Nginx terminates)
- No plaintext ever

**Code reference:** `nginx/voidmind.conf`

## GDPR

### Lawful Basis

Processing is contractual necessity (service provision). Consent is managed on your application server.

### Data Minimization

Only anonymized context is sent to VoidMind. No PII is stored.

### Storage Limitation

Sessions auto-wipe after 5-30 minutes. No retention.

**Code reference:** `src/services/session.js` — `SESSION_IDLE_TTL_MS` and `SESSION_MAX_AGE_MS`

### Right to Erasure

`POST /api/v1/session/end` = immediate wipe. No backup to delete.

**Code reference:** `src/services/session.js` — `wipeSession()`

### Processor Contract

You are the processor. No third-party AI involved (local Ollama inference).

### Cross-Border

No data leaves your jurisdiction. VPS location is your choice.

### Transparency

Open source code proves claims. Anyone can audit.

## Verification Checklist

- [ ] Read `src/services/session.js` — confirm RAM-only Map
- [ ] Read `src/config/database.js` — confirm no user data tables
- [ ] Read `src/utils/logger.js` — confirm content stripping
- [ ] Run `npm run test:compliance` — verify no disk persistence
- [ ] Check `/admin/compliance` endpoint — live compliance report
