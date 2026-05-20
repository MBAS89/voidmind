# VoidMind Deployment Guide

## Phase 1: VPS Setup (Day 1)

### 1. Provision VPS

- Provider: Hetzner (Germany for GDPR), DigitalOcean, Vultr, etc.
- Spec: 6 vCPU, 12GB RAM, 100GB NVMe
- OS: Ubuntu 22.04 LTS

### 2. Run Setup Script

```bash
git clone https://github.com/nuyvo/voidmind.git /opt/voidmind
cd /opt/voidmind
bash scripts/setup.sh your-domain.com admin@your-domain.com
```

### 3. Configure Environment

```bash
cp .env.example .env
nano .env
```

Set:
- `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` (bcrypt)
- `ADMIN_JWT_PRIVATE_KEY` and `ADMIN_JWT_PUBLIC_KEY` (RS256)
- `ADMIN_IP_WHITELIST` (your app server IP)
- `CORS_ORIGIN` (your app domain)

### 4. Start Services

```bash
# Start with PM2
npm install
pm2 start src/server.js --name voidmind
pm2 save
pm2 startup

# Ensure Ollama is running
systemctl enable ollama
systemctl start ollama
```

### 5. Test Endpoints

```bash
curl https://your-domain.com/health

# Create admin token first, then test chat
```

## Phase 2: Integration (Day 2)

1. Generate admin account + initial API key
2. Configure app server IP whitelist
3. Update your app: replace DeepSeek/OpenAI URL with VoidMind
4. Deploy anonymizer service on your app server
5. Test end-to-end: user message -> AI response
6. Verify no data persists on VoidMind after session
7. Test admin dashboard: view usage, create keys, wipe sessions
8. Load test: 10 concurrent sessions

## Phase 3: Monitoring (Ongoing)

| Check | Frequency | Tool |
|-------|-----------|------|
| VPS uptime | Continuous | UptimeRobot |
| RAM usage | Every 5 min | Custom script |
| Ollama response | Every 5 min | Health endpoint |
| API key abuse | Real-time | Express middleware |
| Admin logins | Real-time | Alert on suspicious IP |
| SSL expiry | Weekly | Certbot auto-renew |
| File integrity | Daily | AIDE check |

Add health-check cron:
```bash
crontab -e
# Add:
*/5 * * * * /opt/voidmind/scripts/health-check.sh
```

## Backup

```bash
# Daily backup via cron
0 2 * * * /opt/voidmind/scripts/backup.sh
```

Backups contain ONLY admin operational data. No user conversations are ever backed up.
