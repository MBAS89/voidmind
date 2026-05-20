#!/bin/bash
# VoidMind — SQLite Backup Script
# Backs up ONLY admin operational data (API keys, usage logs, audit logs).
# ZERO user conversation data is backed up — sessions are RAM-only.

set -e

BACKUP_DIR="/var/backups/voidmind"
DB_PATH="${DB_PATH:-./data/admin.db}"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# SQLite backup using .backup command (atomic, consistent)
BACKUP_FILE="$BACKUP_DIR/admin_$DATE.db"
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# Compress
gzip -f "$BACKUP_FILE"

echo "Backup created: $BACKUP_FILE.gz"

# Clean old backups
find "$BACKUP_DIR" -name "admin_*.db.gz" -mtime +$RETENTION_DAYS -delete

echo "Old backups (>$RETENTION_DAYS days) cleaned up."
