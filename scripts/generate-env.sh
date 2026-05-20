#!/bin/bash
# VoidMind — Environment Variables Generator
# Run this from the VoidMind project root (where node_modules exists)
# or install bcrypt globally first: npm install -g bcrypt
#
# This script generates:
#   - RSA key pair for JWT signing
#   - Bcrypt hash for admin password
#
# Usage: bash scripts/generate-env.sh "your-strong-password"

set -e

PASSWORD=${1:-""}

if [ -z "$PASSWORD" ]; then
    echo "ERROR: Admin password required."
    echo "Usage: bash scripts/generate-env.sh 'YourStrongPassword123!'"
    exit 1
fi

echo "========================================"
echo "  VoidMind Environment Generator"
echo "========================================"
echo ""

# Check for required tools
if ! command -v ssh-keygen &> /dev/null; then
    echo "ERROR: ssh-keygen not found. Install OpenSSH client tools."
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Install Node.js 20+."
    exit 1
fi

# Generate RSA key pair for JWT
echo "[1/3] Generating RSA key pair for JWT..."
KEY_DIR=$(mktemp -d)
ssh-keygen -t rsa -b 4096 -m PEM -f "$KEY_DIR/jwtRS256.key" -N "" -C "voidmind-jwt" > /dev/null 2>&1

PRIVATE_KEY=$(cat "$KEY_DIR/jwtRS256.key" | awk 'NF {sub(/\r/, ""); printf "%s\\n", $0}')
PUBLIC_KEY=$(cat "$KEY_DIR/jwtRS256.key.pub" | awk 'NF {sub(/\r/, ""); printf "%s\\n", $0}')

rm -rf "$KEY_DIR"

# Generate bcrypt hash
echo "[2/3] Generating bcrypt hash for admin password..."

# Try to use local bcrypt first (if run from project root)
if [ -f "node_modules/bcrypt/package.json" ]; then
    PASSWORD_HASH=$(node -e "require('./node_modules/bcrypt').hash('$PASSWORD', 12).then(h => { console.log(h); process.exit(0); })")
elif node -e "require('bcrypt')" > /dev/null 2>&1; then
    PASSWORD_HASH=$(node -e "require('bcrypt').hash('$PASSWORD', 12).then(h => { console.log(h); process.exit(0); })")
else
    echo "bcrypt not found. Installing temporarily..."
    TMP_DIR=$(mktemp -d)
    cd "$TMP_DIR"
    npm install bcrypt --silent > /dev/null 2>&1
    PASSWORD_HASH=$(node -e "require('$TMP_DIR/node_modules/bcrypt').hash('$PASSWORD', 12).then(h => { console.log(h); process.exit(0); })")
    rm -rf "$TMP_DIR"
fi

# Generate random API key prefix
echo "[3/3] Done."

# Output
echo ""
echo "========================================"
echo "  Copy these values into your .env file"
echo "========================================"
echo ""
echo "# === Admin JWT Keys ==="
echo "ADMIN_JWT_PRIVATE_KEY=\"$PRIVATE_KEY\""
echo ""
echo "# === Admin JWT Public Key ==="
echo "ADMIN_JWT_PUBLIC_KEY=\"$PUBLIC_KEY\""
echo ""
echo "# === Admin Password Hash ==="
echo "# Password used: $PASSWORD"
echo "ADMIN_PASSWORD_HASH=$PASSWORD_HASH"
echo ""
echo "# === Example Admin Email ==="
echo "ADMIN_EMAIL=admin@your-domain.com"
echo ""
echo "========================================"
echo "  IMPORTANT SECURITY NOTES"
echo "========================================"
echo ""
echo "1. SAVE the private key securely. If you lose it, ALL existing admin"
echo "   tokens become invalid and you must regenerate keys."
echo ""
echo "2. The password above was used to generate the hash. Store it in"
echo "   your password manager — you need it to log in."
echo ""
echo "3. NEVER commit .env to git. It should already be in .gitignore."
echo ""
