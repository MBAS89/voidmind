# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in VoidMind, please report it responsibly:

1. **Do NOT open a public issue.**
2. Email the maintainer directly with details.
3. Include steps to reproduce, impact assessment, and suggested fix if possible.
4. We will acknowledge within 48 hours and provide a timeline for a fix.
5. After the fix is released, we will credit you (with your permission) in the release notes.

## Security Design

### What We Protect Against

| Threat | Mitigation |
|--------|------------|
| VPS compromise | No user data stored — attacker finds nothing |
| Subpoena / legal seizure | No data to hand over — architecture is open source proof |
| API key leak | Rate limiting, key rotation, app server IP whitelist |
| Admin JWT leak | Short expiry (15 min), IP whitelist, action logging |
| Session data leak | RAM-only, auto-wiped, explicit null before delete |
| Inference tampering | Ollama bound to localhost, no external network calls |
| Brute-force attacks | Fail2ban, rate limiting, key-only SSH |

### What Is NOT Stored

- User conversations
- User identities
- Message content
- PII of any kind
- Application-specific data

### What IS Stored (Admin Operational Data Only)

- API key hashes (sha256)
- Token usage counts per key
- Endpoint hit counts
- Admin action audit log (who did what, when, from where)
- Rate limit configurations

All stored in a local SQLite database (`data/admin.db`).

## Verification

You can verify our security claims by:

1. Reading the source code (MIT license, fully open)
2. Checking `src/services/session.js` — RAM-only Map
3. Checking `src/utils/logger.js` — content is stripped before logging
4. Checking `src/config/database.js` — schema contains no user data tables
5. Running the compliance tests: `npm run test:compliance`
