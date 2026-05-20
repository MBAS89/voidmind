#!/bin/bash
# VoidMind — One-Command VPS Setup Script
# Run as root on a fresh Ubuntu 22.04 LTS VPS
# Usage: bash scripts/setup.sh your-domain.com admin@your-domain.com

set -e

DOMAIN=${1:-""}
ADMIN_EMAIL=${2:-""}

if [ -z "$DOMAIN" ]; then
    echo "ERROR: Domain name required."
    echo "Usage: bash scripts/setup.sh your-domain.com admin@your-domain.com"
    exit 1
fi

if [ -z "$ADMIN_EMAIL" ]; then
    echo "ERROR: Admin email required for SSL certificate."
    echo "Usage: bash scripts/setup.sh your-domain.com admin@your-domain.com"
    exit 1
fi

echo "========================================"
echo "  VoidMind VPS Setup"
echo "  Domain: $DOMAIN"
echo "  Email:  $ADMIN_EMAIL"
echo "========================================"

# Update system
echo "[1/14] Updating system..."
apt-get update && apt-get upgrade -y

# Install essentials
echo "[2/14] Installing essentials..."
apt-get install -y curl wget git build-essential nginx certbot python3-certbot-nginx ufw fail2ban sqlite3 jq

# Configure UFW
echo "[3/14] Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# SSH hardening
echo "[4/14] Hardening SSH..."
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#MaxAuthTries 6/MaxAuthTries 3/' /etc/ssh/sshd_config
systemctl restart sshd

# Disable unnecessary services
echo "[5/14] Disabling unnecessary services..."
systemctl disable --now snapd || true
systemctl disable --now apport || true
systemctl disable --now motd-news || true

# Install Node.js 20
echo "[6/14] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2
echo "[7/14] Installing PM2..."
npm install -g pm2

# Install Ollama
echo "[8/14] Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh

# Configure Ollama to bind localhost only
echo "[9/14] Configuring Ollama security..."
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf <<EOF
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
EOF
systemctl daemon-reload
systemctl enable ollama
systemctl restart ollama

# Pull default model
echo "[10/14] Pulling default model (qwen2.5:3b)..."
ollama pull qwen2.5:3b || echo "WARNING: Model pull failed. Run 'ollama pull qwen2.5:3b' manually later."

# Create voidmind user
echo "[11/14] Creating voidmind user..."
useradd -r -m -s /bin/bash voidmind || true
mkdir -p /opt/voidmind
chown voidmind:voidmind /opt/voidmind

# Setup Nginx main config
echo "[12/14] Configuring Nginx..."
cp nginx/nginx.conf /etc/nginx/nginx.conf

# Create a temporary HTTP-only site config for initial certbot
cat > /etc/nginx/sites-available/voidmind <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
}
EOF

mkdir -p /var/www/certbot
ln -sf /etc/nginx/sites-available/voidmind /etc/nginx/sites-enabled/voidmind
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# SSL certificate
echo "[13/14] Obtaining SSL certificate..."
if certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" 2>/dev/null; then
    echo "SSL certificate obtained successfully."
else
    echo "WARNING: Certbot failed. Trying standalone mode..."
    systemctl stop nginx || true
    certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" || true
    systemctl start nginx || true
fi

# Now apply the real production Nginx config with SSL
cp nginx/voidmind.conf /etc/nginx/sites-available/voidmind
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" /etc/nginx/sites-available/voidmind
nginx -t && systemctl reload nginx

# Setup certbot auto-renewal
echo "0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'" | crontab -

# File integrity monitoring
echo "[14/14] Installing AIDE file integrity monitor..."
apt-get install -y aide aide-common
aideinit || true
mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db || true

# Create data directory
mkdir -p /opt/voidmind/data
chown -R voidmind:voidmind /opt/voidmind

echo ""
echo "========================================"
echo "  VPS Base Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. SSH as voidmind user (or use sudo -u voidmind)"
echo "  2. Clone repo: git clone https://github.com/MBAS89/voidmind.git /opt/voidmind"
echo "  3. Copy .env.example to .env and configure (see docs/DEPLOYMENT.md)"
echo "  4. Run: npm install"
echo "  5. Start with PM2: pm2 start src/server.js --name voidmind"
echo "  6. Save PM2 config: pm2 save && pm2 startup systemd"
echo ""
echo "Ollama is running on 127.0.0.1:11434 (localhost only)"
echo "Nginx will proxy to Node.js on 127.0.0.1:3000"
echo "SSL certificate: /etc/letsencrypt/live/$DOMAIN/"
echo ""
