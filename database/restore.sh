#!/bin/bash
# PostgreSQL Restore Script
# Usage: ./database/restore.sh <backup_file>

set -e

if [ $# -eq 0 ]; then
  echo "Usage: ./database/restore.sh <backup_file>"
  echo ""
  echo "Available backups:"
  ls -lhS ./.backups/cafe_db_backup_*.sql 2>/dev/null || echo "No backups found"
  exit 1
fi

BACKUP_FILE="$1"
LOG_FILE="./.backups/restore_$(date +%Y%m%d_%H%M%S).log"

# Function for logging
log_msg() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Verify backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  log_msg "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

log_msg "=== PostgreSQL Restore Started ==="
log_msg "Restoring from: $BACKUP_FILE"
log_msg "WARNING: This will DROP and RECREATE the database!"
read -p "Are you sure you want to restore from this backup? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  log_msg "Restore cancelled by user"
  exit 0
fi

# Check if running in Docker
if command -v docker &> /dev/null && docker ps | grep -q cafe_db; then
  log_msg "Restoring to Docker container 'cafe_db'..."

  # Copy backup to container and restore
  log_msg "Copying backup to container..."
  docker cp "$BACKUP_FILE" cafe_db:/tmp/backup.sql

  log_msg "Executing restore in container..."
  docker exec cafe_db psql \
    -U "${POSTGRES_USER:-cafe_user}" \
    -d "${POSTGRES_DB:-cafe_payment}" \
    --no-password \
    < /tmp/backup.sql 2>> "$LOG_FILE"

  log_msg "Cleaning up temporary file..."
  docker exec cafe_db rm /tmp/backup.sql
else
  log_msg "Restoring from local PostgreSQL..."
  psql \
    -U "${POSTGRES_USER:-cafe_user}" \
    -h "${POSTGRES_HOST:-localhost}" \
    -d "${POSTGRES_DB:-cafe_payment}" \
    < "$BACKUP_FILE" 2>> "$LOG_FILE"
fi

log_msg "=== PostgreSQL Restore Completed Successfully ==="
log_msg "Restore log: $LOG_FILE"

exit 0
