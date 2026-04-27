#!/bin/bash
# PostgreSQL Backup Script
# Usage: ./database/backup.sh [output_dir]

set -e

# Configuration
BACKUP_DIR="${1:-./.backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/cafe_db_backup_$TIMESTAMP.sql"
LOG_FILE="$BACKUP_DIR/backup_$TIMESTAMP.log"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Function for logging
log_msg() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Start backup
log_msg "=== PostgreSQL Backup Started ==="
log_msg "Backup destination: $BACKUP_FILE"

# Check if running in Docker
if command -v docker &> /dev/null && docker ps | grep -q cafe_db; then
  # Backup from Docker container
  log_msg "Backing up from Docker container 'cafe_db'..."
  docker exec cafe_db pg_dump \
    -U "${POSTGRES_USER:-cafe_user}" \
    -d "${POSTGRES_DB:-cafe_payment}" \
    --no-password \
    --format=plain \
    --compress=9 \
    --if-exists \
    --clean \
    > "$BACKUP_FILE" 2>> "$LOG_FILE"
else
  # Backup from local PostgreSQL
  log_msg "Backing up from local PostgreSQL..."
  pg_dump \
    -U "${POSTGRES_USER:-cafe_user}" \
    -h "${POSTGRES_HOST:-localhost}" \
    -d "${POSTGRES_DB:-cafe_payment}" \
    --format=plain \
    --compress=9 \
    --if-exists \
    --clean \
    > "$BACKUP_FILE" 2>> "$LOG_FILE"
fi

# Verify backup file exists and has content
if [ ! -s "$BACKUP_FILE" ]; then
  log_msg "ERROR: Backup file is empty or was not created"
  exit 1
fi

# Get file size
FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log_msg "Backup completed successfully - Size: $FILE_SIZE"

# Delete backups older than 30 days
log_msg "Cleaning up old backups (keeping last 30 days)..."
find "$BACKUP_DIR" -name "cafe_db_backup_*.sql" -mtime +30 -delete -print | while read file; do
  log_msg "Deleted old backup: $file"
done

# Count current backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "cafe_db_backup_*.sql" | wc -l)
log_msg "Current backup count: $BACKUP_COUNT"
log_msg "=== PostgreSQL Backup Completed Successfully ==="

exit 0
