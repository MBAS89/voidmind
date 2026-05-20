# VoidMind — Complete Deployment Guide

This guide covers deploying VoidMind to production. Choose the method that fits your needs:

| Method | Best For | Complexity |
|--------|----------|------------|
| **A. Terraform + Setup Script** | New VPS on Hetzner Cloud | Medium |
| **B. Manual VPS Setup** | Any VPS provider (DigitalOcean, Vultr, AWS, etc.) | Medium |
| **C. Docker Compose** | Local development, testing, or simple deployments | Low |

---

## Table of Contents

1. [Before You Start](#1-before-you-start)
2. [Method A: Terraform + Setup Script (Recommended)](#method-a-terraform--setup-script-recommended)
3. [Method B: Manual VPS Setup](#method-b-manual-vps-setup)
4. [Method C: Docker Compose](#method-c-docker-compose)
5. [Post-Deployment: First Admin & API Key](#post-deployment-first-admin--api-key)
6. [Post-Deployment: Monitoring & Backups](#post-deployment-monitoring--backups)
7. [Troubleshooting](#troubleshooting)

---

## 1. Before You Start

### 1.1 Prerequisites

| Item | Why You Need It |
|------|----------------|
| **Domain name** | For HTTPS (Let's Encrypt requires a real domain) |
| **VPS** | 4+ vCPU, 8GB+ RAM, 50GB+ SSD. 6 vCPU / 12GB RAM recommended. |
| **SSH key pair** | To log into the VPS securely (no passwords) |
| **Node.js 20+** | On your local machine to generate secrets |

### 1.2 Generate Secrets (Do This First)

VoidMind requires three secrets before it can run:

1. **RSA key pair** — for signing admin JWT tokens
2. **Bcrypt password hash** — for the first admin account
3. **Admin email** — for login and SSL certificate

You have two options:

#### Option 1: Use the Helper Script (Easiest)

```bash
# From the VoidMind repo on your local machine
bash scripts/generate-env.sh 'YourStrongAdminPassword123!'
```

This prints all the values you need. **Copy and save them securely.**

#### Option 2: Manual Generation

```bash
# 1. Generate RSA key pair
ssh-keygen -t rsa -b 4096 -m PEM -f jwtRS256.key -N ""
cat jwtRS256.key          # Private key → ADMIN_JWT_PRIVATE_KEY
cat jwtRS256.key.pub      # Public key → ADMIN_JWT_PUBLIC_KEY

# 2. Generate bcrypt password hash
node -e "require('bcrypt').hash('YourStrongPassword123!', 12).then(console.log)"
# Output → ADMIN_PASSWORD_HASH
```

**⚠️ Save these values in a password manager. Losing the private key invalidates all admin tokens.**

### 1.3 What You Need to Know

```
┌─────────────────────────────────────────────────────────────┐
│                        INTERNET                              │
│                           │                                  │
│                    your-domain.com                          │
│                    (HTTPS, port 443)                        │
│                           │                                  │
│    ┌──────────────────────┴──────────────────────┐          │
│    │                  NGINX                       │          │
│    │  - SSL termination                           │          │
│    │  - Rate limiting                             │          │
│    │  - Reverse proxy                             │          │
│    └──────────────────────┬──────────────────────┘          │
│                           │ localhost:3000                   │
│    ┌──────────────────────┴──────────────────────┐          │
│    │              VoidMind (Node.js)              │          │
│    │  - API gateway                               │          │
│    │  - RAM-only sessions                         │          │
│    │  - SQLite admin DB                           │          │
│    └──────────────────────┬──────────────────────┘          │
│                           │ localhost:11434                  │
│    ┌──────────────────────┴──────────────────────┐          │
│    │              Ollama (AI Engine)              │          │
│    │  - Local LLM inference                       │          │
│    │  - qwen2.5:3b or similar                     │          │
│    └──────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

**Key ports:**
- `22` — SSH (admin only)
- `80` — HTTP (redirects to HTTPS)
- `443` — HTTPS (public API)
- `3000` — VoidMind (localhost only, via Nginx)
- `11434` — Ollama (localhost only)

---

## Method A: Terraform + Setup Script (Recommended)

### Step A1: Configure Terraform

```bash
cd terraform
```

Create `terraform.tfvars`:

```hcl
hcloud_token = "your-hetzner-api-token"
domain       = "voidmind.yourdomain.com"
server_type  = "cpx31"  # 8 vCPU, 16GB RAM (~$18/mo). Use cpx21 for 4 vCPU, 8GB (~$12/mo)
location     = "nbg1"   # nbg1 = Nuremberg (GDPR). Also: fsn1, hel1
```

Get a Hetzner API token: https://console.hetzner.cloud/projects → Security → API Tokens

### Step A2: Create the Server

```bash
terraform init
terraform plan
terraform apply
```

After ~2 minutes, you'll see:
```
server_ip    = "78.46.xxx.xxx"
floating_ip  = "78.46.xxx.xxx"
```

### Step A3: Point Your Domain

Create an A record in your DNS:
```
voidmind.yourdomain.com  →  78.46.xxx.xxx
```

Wait 2-5 minutes for DNS propagation.

### Step A4: SSH and Run Setup

```bash
# Replace with your actual IP
ssh root@78.46.xxx.xxx

# On the server:
apt-get update && apt-get install -y git
git clone https://github.com/MBAS89/voidmind.git /opt/voidmind
cd /opt/voidmind
bash scripts/setup.sh voidmind.yourdomain.com admin@yourdomain.com
```

The setup script will:
1. Update Ubuntu
2. Install Node.js 20, Nginx, Ollama, PM2
3. Configure firewall (UFW)
4. Harden SSH (disable password auth, disable root login)
5. Install fail2ban (blocks brute force)
6. Pull the default AI model
7. Configure Nginx
8. Obtain SSL certificate
9. Install file integrity monitoring (AIDE)

### Step A5: Configure Environment

```bash
cd /opt/voidmind
cp .env.example .env
nano .env
```

Fill in the values you generated earlier:

```env
# Server
NODE_ENV=production
PORT=3000
HOST=127.0.0.1

# JWT Keys (from generate-env.sh or manual generation)
ADMIN_JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAxYZ..."
ADMIN_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxYZ..."

# Admin credentials (from generate-env.sh)
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD_HASH=$2b$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# IP whitelist — add YOUR app server's IP here
ADMIN_IP_WHITELIST=127.0.0.1/32,::1/128,YOUR_APP_SERVER_IP/32

# CORS — your app's domain
CORS_ORIGIN=https://your-app.com

# Ollama (localhost only, already configured)
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_DEFAULT_MODEL=qwen2.5:3b

# Optional: Webhook for alerts
WEBHOOK_URL=https://hooks.slack.com/services/xxx/xxx/xxx
```

### Step A6: Start VoidMind

```bash
cd /opt/voidmind
npm install

# Start with PM2
pm2 start src/server.js --name voidmind
pm2 save
pm2 startup systemd

# Check status
pm2 status
pm2 logs voidmind --lines 20
```

### Step A7: Verify

```bash
# Test health endpoint
curl https://voidmind.yourdomain.com/health

# Expected: {"status":"ok","timestamp":"..."}
```

**Continue to [Post-Deployment](#post-deployment-first-admin--api-key) to create your first admin and API key.**

---

## Method B: Manual VPS Setup

Use this if you already have a VPS from any provider (DigitalOcean, Vultr, AWS, etc.).

### Step B1: Provision VPS

- **OS:** Ubuntu 22.04 LTS
- **Spec:** Minimum 4 vCPU / 8GB RAM. Recommended: 6 vCPU / 12GB RAM.
- **Disk:** 50GB+ SSD (100GB+ if running multiple models)
- **Location:** EU for GDPR compliance (Germany, Netherlands)

### Step B2: SSH as Root

```bash
ssh root@YOUR_VPS_IP
```

### Step B3: Run the Setup Script

```bash
apt-get update && apt-get install -y git
git clone https://github.com/MBAS89/voidmind.git /opt/voidmind
cd /opt/voidmind
bash scripts/setup.sh your-domain.com admin@yourdomain.com
```

### Step B4-B7: Same as Method A

Follow [Step A5](#step-a5-configure-environment) through [Step A7](#step-a7-verify) above.

---

## Method C: Docker Compose

For local development, testing, or simple deployments where you don't need the full VPS optimization.

### Step C1: Prerequisites

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin (usually included with Docker now)
docker compose version
```

### Step C2: Prepare Environment

```bash
cd /opt/voidmind  # or wherever you cloned the repo

# Generate secrets (same as Method A)
bash scripts/generate-env.sh 'YourStrongPassword123!'

# Create .env
cp .env.example .env
nano .env  # Fill in the generated values
```

### Step C3: Start Services

```bash
cd docker
docker compose up -d

# Watch logs
docker compose logs -f

# Pull a model
docker exec -it voidmind-ollama ollama pull qwen2.5:3b
```

### Step C4: Access

- API: `http://localhost:3000` (or your VPS IP if remote)
- Health: `http://localhost:3000/health`
- For production, put Nginx in front with SSL (see Method A/B)

**Note:** Docker performance is ~10-20% slower than bare-metal for AI inference. For production workloads, use Method A or B.

---

## Post-Deployment: First Admin & API Key

### 1. Login as Admin

```bash
# Request a JWT token
curl -X POST https://voidmind.yourdomain.com/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourdomain.com",
    "password": "YourStrongPassword123!"
  }'
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJSUzI1NiIs...",
  "expiresIn": 900
}
```

Save the `accessToken` — it expires in 15 minutes.

### 2. Create Your First API Key

```bash
export TOKEN="eyJhbGciOiJSUzI1NiIs..."

curl -X POST https://voidmind.yourdomain.com/admin/keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production App",
    "monthlyLimit": 100000,
    "dailyLimit": 5000,
    "requestsPerMinute": 60,
    "allowedIps": ["YOUR_APP_SERVER_IP"]
  }'
```

Response:
```json
{
  "id": "vm_xxxxxxxx",
  "name": "Production App",
  "key": "vm_AbcDefGhiJklMnoPqrStuVwxYz123456789",
  "keyHash": "sha256:...",
  "monthlyLimit": 100000,
  "dailyLimit": 5000,
  "isActive": true
}
```

**⚠️ SAVE THE `key` VALUE. It is shown ONLY ONCE.**

### 3. Test the API

```bash
export API_KEY="vm_AbcDefGhiJklMnoPqrStuVwxYz123456789"

curl -X POST https://voidmind.yourdomain.com/api/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:3b",
    "messages": [{"role": "user", "content": "Hello, what is 2+2?"}]
  }'
```

Expected response:
```json
{
  "id": "vm_chat_...",
  "model": "qwen2.5:3b",
  "message": { "role": "assistant", "content": "2 + 2 = 4" },
  "usage": { "promptTokens": 15, "completionTokens": 8, "totalTokens": 23 }
}
```

### 4. Test Streaming

```bash
curl -X POST https://voidmind.yourdomain.com/api/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "model": "qwen2.5:3b",
    "messages": [{"role": "user", "content": "Say hi"}],
    "stream": true
  }'
```

### 5. View Available Models

```bash
curl https://voidmind.yourdomain.com/models \
  -H "Authorization: Bearer $API_KEY"
```

---

## Post-Deployment: Monitoring & Backups

### Health Check Cron

Check every 5 minutes and auto-restart if down:

```bash
# As root
crontab -e

# Add this line:
*/5 * * * * /opt/voidmind/scripts/health-check.sh >> /var/log/voidmind-cron.log 2>&1
```

Optional: Set a webhook for alerts:
```bash
export ALERT_WEBHOOK="https://hooks.slack.com/services/xxx/xxx/xxx"
```

### Daily Backup

```bash
# As root
crontab -e

# Add this line (runs at 2 AM daily):
0 2 * * * DB_PATH=/opt/voidmind/data/admin.db /opt/voidmind/scripts/backup.sh >> /var/log/voidmind-backup.log 2>&1
```

Backups are saved to `/var/backups/voidmind/` and only contain admin operational data. **Zero user conversations are ever backed up.**

### PM2 Monitoring

```bash
# View dashboard
pm2 monit

# View logs
pm2 logs voidmind

# Restart
pm2 restart voidmind

# Update env and restart
pm2 restart voidmind --update-env
```

### System Resource Monitoring

```bash
# Check RAM usage
free -h

# Check CPU usage
htop

# Check disk usage
df -h

# Check Ollama models (disk usage)
du -sh /usr/share/ollama/.ollama/models/
```

---

## Troubleshooting

### "Cannot connect to server"

```bash
# Check if VoidMind is running
pm2 status

# Check logs
pm2 logs voidmind --lines 50

# Check if it's listening on port 3000
ss -tlnp | grep 3000

# Check Nginx
systemctl status nginx
nginx -t
```

### "502 Bad Gateway"

```bash
# VoidMind is not running or crashed
pm2 restart voidmind
pm2 logs voidmind

# Check if Ollama is running
curl http://127.0.0.1:11434/api/tags
systemctl status ollama
```

### "SSL certificate error"

```bash
# Check cert status
certbot certificates

# Renew manually
certbot renew --force-renewal
systemctl reload nginx
```

### "Admin login fails"

```bash
# Check if admin was bootstrapped
cd /opt/voidmind
node -e "
  const { getAsync } = require('./src/config/database');
  getAsync('SELECT * FROM admins').then(r => console.log(r));
"

# If empty, your ADMIN_EMAIL or ADMIN_PASSWORD_HASH is wrong in .env
# Fix .env, then restart: pm2 restart voidmind --update-env
```

### "Model not found"

```bash
# List available models
ollama list

# Pull the model
ollama pull qwen2.5:3b

# Or pull a different model
ollama pull llama3.2:3b
```

### "Out of memory"

- Reduce context window: `OLLAMA_NUM_CTX=2048` in `.env`
- Use a smaller model: `qwen2.5:3b` instead of `qwen2.5:7b`
- Reduce `OLLAMA_MAX_CONCURRENCY` to 1
- Add swap space:
  ```bash
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ```

### "Permission denied" when running scripts

```bash
chmod +x scripts/*.sh
```

### Update After Code Changes

```bash
cd /opt/voidmind
git pull origin main
npm install
pm2 restart voidmind
```

---

## Security Checklist

After deployment, verify:

- [ ] SSH password auth disabled (`PasswordAuthentication no` in `/etc/ssh/sshd_config`)
- [ ] Root login disabled (`PermitRootLogin no`)
- [ ] UFW active and only allows 22, 80, 443
- [ ] Ollama bound to localhost only (`OLLAMA_HOST=127.0.0.1:11434`)
- [ ] VoidMind bound to localhost only (`HOST=127.0.0.1`)
- [ ] Nginx handles all external traffic
- [ ] SSL certificate valid and auto-renews
- [ ] Admin IP whitelist includes only your app server
- [ ] API keys have per-key IP whitelists
- [ ] `.env` file is NOT in git (`git check-ignore .env` should say `.env`)
- [ ] fail2ban is running (`systemctl status fail2ban`)
- [ ] AIDE file integrity monitoring initialized
- [ ] Backups are scheduled and working
- [ ] Health checks are scheduled and working

---

## Next Steps

1. **Integrate with your app** — Replace OpenAI/DeepSeek API URL with `https://your-domain.com/api/v1`
2. **Install the SDK** — `npm install voidmind-sdk` or `pip install voidmind`
3. **Set up monitoring** — Connect Prometheus to `/metrics` or use UptimeRobot for external monitoring
4. **Load test** — Run `node scripts/benchmark.js` to verify performance
5. **Review logs** — Check `/var/log/voidmind-health.log` and PM2 logs regularly
