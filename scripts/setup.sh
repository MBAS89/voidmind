#!/bin/bash
# VoidMind — One-Command VPS Setup Script
# Run as root on a fresh Ubuntu 22.04 LTS VPS

set -e

DOMAIN=${1:-"your-domain.com"}
ADMIN_EMAIL=${2:-"admin@your-domain.com"}

echo "========================================"
echo "  VoidMind VPS Setup"
echo "  Domain: $DOMAIN"
echo "========================================"

# Update system
echo "[1/12] Updating system..."
apt-get update && apt-get upgrade -y

# Install essentials
echo "[2/12] Installing essentials..."
apt-get install -y curl wget git build-essential nginx certbot python3-certbot-nginx ufw fail2ban sqlite3

# Configure UFW
echo "[3/12] Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# SSH hardening
echo "[4/12] Hardening SSH..."
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#MaxAuthTries 6/MaxAuthTries 3/' /etc/ssh/sshd_config
systemctl restart sshd

# Disable unnecessary services
echo "[5/12] Disabling unnecessary services..."
systemctl disable --now snapd || true
systemctl disable --now apport || true
systemctl disable --now motd-news || true

# Install Node.js 20
echo "[6/12] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2
echo "[7/12] Installing PM2..."
npm install -g pm2

# Install Ollama
echo "[8/12] Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh

# Pull default model
echo "[9/12] Pulling default model (qwen2.5:3b)..."
ollama pull qwen2.5:3b

# Configure Ollama to bind localhost only
echo "[10/12] Configuring Ollama..."
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf <<EOF
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
EOF
systemctl daemon-reload
systemctl restart ollama

# Setup Nginx
echo "[11/12] Configuring Nginx..."
cp nginx/voidmind.conf /etc/nginx/sites-available/voidmind
sed -i "s/your-domain.com/$DOMAIN/g" /etc/nginx/sites-available/voidmind
ln -sf /etc/nginx/sites-available/voidmind /etc/nginx/sites-enabled/voidmind
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# SSL certificate
echo "[12/12] Obtaining SSL certificate..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" || true

# File integrity monitoring
echo "[Bonus] Installing AIDE..."
apt-get install -y aide
aideinit || true

# Create voidmind user
echo "[Bonus] Creating voidmind user..."
useradd -r -s /bin/false voidmind || true
mkdir -p /opt/voidmind
chown -R voidmind:voidmind /opt/voidmind

echo ""
echo "========================================"
echo "  VPS Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Clone VoidMind repo to /opt/voidmind"
echo "  2. Copy .env.example to .env and configure"
echo "  3. Run: npm install && npm start"
echo "  4. Configure PM2: pm2 start src/server.js --name voidmind"
echo "  5. Save PM2 config: pm2 save && pm2 startup"
echo ""
echo "Ollama is running on 127.0.0.1:11434 (localhost only)"
echo "Nginx is proxying to Node.js on 127.0.0.1:3000"
echo ""
