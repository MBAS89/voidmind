#!/bin/bash
# VoidMind — Health Check Script
# Run via cron every 5 minutes. Alerts if services are down.

set -e

ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"  # Optional: Slack/Discord webhook
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"
LOG_FILE="/var/log/voidmind-health.log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

# Check Node.js app
if ! curl -fsS "http://$HOST:$PORT/health" > /dev/null 2>&1; then
    log "ERROR: VoidMind app is not responding on $HOST:$PORT"
    # Restart via PM2 if available
    if command -v pm2 &> /dev/null; then
        pm2 restart voidmind || true
        log "INFO: Attempted PM2 restart"
    fi
    # Send alert if webhook configured
    if [ -n "$ALERT_WEBHOOK" ]; then
        curl -s -X POST -H 'Content-type: application/json' \
            --data '{"text":"VoidMind health check FAILED on '"$(hostname)"'"}' \
            "$ALERT_WEBHOOK" > /dev/null 2>&1 || true
    fi
    exit 1
fi

# Check Ollama
if ! curl -fsS "http://127.0.0.1:11434/api/tags" > /dev/null 2>&1; then
    log "WARNING: Ollama is not responding on 127.0.0.1:11434"
    systemctl restart ollama || true
    log "INFO: Attempted Ollama restart"
    exit 1
fi

log "OK: VoidMind and Ollama are healthy"
exit 0
