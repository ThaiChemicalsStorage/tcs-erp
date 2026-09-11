#!/usr/bin/env bash
#
# TCS ERP — nightly backup to Google Drive via rclone.
#
# Runs ON THE SERVER (not the dev machine), as root, from anywhere; STACK_DIR must
# point at the directory holding docker-compose.yml + .env + nginx/certs.
#
# What it uploads, per run:
#   db-YYYY-MM-DD_HHMM.archive.gz     mongodump of the whole database (attachments included)
#   config-YYYY-MM-DD_HHMM.tar.gz     .env + docker-compose.yml + nginx/certs (needed to rebuild the stack)
#
# Setup, restore, and cron instructions: docs/DEPLOYMENT.md → "Backups → Google Drive (rclone)".
#
set -euo pipefail

STACK_DIR="${STACK_DIR:-/root}"                  # where docker-compose.yml lives (the real server: /root)
REMOTE="${REMOTE:-gdrive:backup server}"        # rclone remote + the Drive folder
LOCAL_DIR="${LOCAL_DIR:-/var/backups/tcs-erp}"  # staging copy kept on the server
LOG_FILE="${LOG_FILE:-/var/log/tcs-erp-backup.log}"
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-7}"         # local staging retention
KEEP_DAILY_DAYS="${KEEP_DAILY_DAYS:-30}"        # Drive daily/ retention
KEEP_MONTHLY_DAYS="${KEEP_MONTHLY_DAYS:-400}"   # Drive monthly/ retention (1st of month)

STAMP="$(date +%F_%H%M)"
log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"; }
fail() { log "FAILED: $*"; exit 1; }

# --- one run at a time ------------------------------------------------------
exec 9>"/var/lock/tcs-erp-backup.lock"
flock -n 9 || { log "another backup is still running — skipping this run"; exit 0; }

mkdir -p "$LOCAL_DIR" "$(dirname "$LOG_FILE")"
cd "$STACK_DIR" || fail "STACK_DIR not found: $STACK_DIR"

command -v rclone >/dev/null || fail "rclone is not installed"
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi

log "=== backup $STAMP start ==="

# --- 1. database ------------------------------------------------------------
DB_FILE="$LOCAL_DIR/db-$STAMP.archive.gz"
log "dumping MongoDB -> $DB_FILE"
$DC exec -T mongodb sh -c '
  mongodump --quiet \
    -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin --archive --gzip
' > "$DB_FILE" || fail "mongodump failed"

gzip -t "$DB_FILE" 2>/dev/null || fail "dump is not a valid gzip archive (mongodump probably wrote an error into it)"
DB_BYTES="$(stat -c %s "$DB_FILE")"
[ "$DB_BYTES" -gt 100000 ] || fail "dump is suspiciously small ($DB_BYTES bytes)"
log "dump ok: $(du -h "$DB_FILE" | cut -f1)"

# --- 2. config (env, compose file, TLS certs) -------------------------------
CFG_FILE="$LOCAL_DIR/config-$STAMP.tar.gz"
tar czf "$CFG_FILE" -C "$STACK_DIR" \
  $( [ -f .env ] && echo .env ) \
  $( [ -f docker-compose.yml ] && echo docker-compose.yml ) \
  $( [ -d nginx ] && echo nginx ) 2>/dev/null || fail "config tar failed"
chmod 600 "$CFG_FILE" "$DB_FILE"
log "config ok: $(du -h "$CFG_FILE" | cut -f1)"

# --- 3. upload --------------------------------------------------------------
log "uploading to $REMOTE/daily/"
rclone copy "$DB_FILE"  "$REMOTE/daily/" --log-file "$LOG_FILE" --log-level INFO || fail "upload of db failed"
rclone copy "$CFG_FILE" "$REMOTE/daily/" --log-file "$LOG_FILE" --log-level INFO || fail "upload of config failed"

# Keep the 1st-of-month run as a long-term copy.
if [ "$(date +%d)" = "01" ]; then
  log "1st of the month — also copying to $REMOTE/monthly/"
  rclone copy "$DB_FILE"  "$REMOTE/monthly/" --log-file "$LOG_FILE" --log-level INFO || log "WARN: monthly db copy failed"
  rclone copy "$CFG_FILE" "$REMOTE/monthly/" --log-file "$LOG_FILE" --log-level INFO || log "WARN: monthly config copy failed"
fi

# --- 4. verify what landed on Drive ----------------------------------------
REMOTE_BYTES="$(rclone lsl "$REMOTE/daily/" | awk -v f="db-$STAMP.archive.gz" '$4 == f { print $1 }')"
[ "${REMOTE_BYTES:-0}" = "$DB_BYTES" ] || fail "size mismatch on Drive (local $DB_BYTES, remote ${REMOTE_BYTES:-none})"
log "verified on Drive: $DB_BYTES bytes"

# --- 5. retention -----------------------------------------------------------
# monthly/ only exists once a 1st-of-month run has happened — sweeping a folder that is not
# there yet is not a failure, so skip it instead of logging three retries and a WARN.
sweep() {
  rclone lsf "$1/" >/dev/null 2>&1 || { log "retention: $1 does not exist yet — skipped"; return 0; }
  rclone delete "$1/" --min-age "$2" --rmdirs 2>>"$LOG_FILE" || log "WARN: retention sweep failed for $1"
}
sweep "$REMOTE/daily"   "${KEEP_DAILY_DAYS}d"
sweep "$REMOTE/monthly" "${KEEP_MONTHLY_DAYS}d"
find "$LOCAL_DIR" -type f -name '*.gz' -mtime "+$KEEP_LOCAL_DAYS" -delete

log "=== backup $STAMP done ==="
