#!/bin/bash
# Health Check Script
# Verifies all critical systems are operational and data integrity is good

set -e

HEALTH_DIR="./.health-checks"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
HEALTH_LOG="$HEALTH_DIR/health_$TIMESTAMP.json"
ERROR_COUNT=0

# Create health checks directory if it doesn't exist
mkdir -p "$HEALTH_DIR"

# Initialize JSON response
{
  echo "{"
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"status\": \"checking\","
  echo "  \"checks\": {"
} > "$HEALTH_LOG"

check_status() {
  local name=$1
  local result=$2
  local message=$3

  if [ "$result" = "success" ]; then
    echo "  ✅ $name: $message" >&2
    echo "    \"$name\": { \"status\": \"ok\", \"message\": \"$message\" }," >> "$HEALTH_LOG"
  elif [ "$result" = "warning" ]; then
    echo "  ⚠️  $name: $message" >&2
    echo "    \"$name\": { \"status\": \"warning\", \"message\": \"$message\" }," >> "$HEALTH_LOG"
  else
    echo "  ❌ $name: $message" >&2
    echo "    \"$name\": { \"status\": \"error\", \"message\": \"$message\" }," >> "$HEALTH_LOG"
    ERROR_COUNT=$((ERROR_COUNT + 1))
  fi
}

echo ""
echo "🏥 Cafe Payment API Health Check"
echo "=================================="

# 1. Check PostgreSQL
echo -n "PostgreSQL: "
if docker exec cafe_db pg_isready -U cafe_user -d cafe_payment > /dev/null 2>&1; then
  TABLE_COUNT=$(docker exec cafe_db psql -U cafe_user -d cafe_payment -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || echo "0")
  check_status "postgresql" "success" "Database running with $TABLE_COUNT tables"
else
  check_status "postgresql" "error" "Cannot connect to PostgreSQL"
fi

# 2. Check Redis
echo -n "Redis: "
if docker exec cafe_redis redis-cli PING > /dev/null 2>&1; then
  KEYS=$(docker exec cafe_redis redis-cli DBSIZE | awk '{print $2}')
  check_status "redis" "success" "Redis running with $KEYS keys"
else
  check_status "redis" "error" "Cannot connect to Redis"
fi

# 3. Check API Health Endpoint
echo -n "API Server: "
if curl -s http://localhost:3000/health | grep -q '"status":"ok"'; then
  check_status "api_server" "success" "API responding to health check"
else
  check_status "api_server" "error" "API health check failed"
fi

# 4. Check Backup Status
echo -n "Backups: "
BACKUP_COUNT=$(find ./.backups -name "cafe_db_backup_*.sql" -type f 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt 0 ]; then
  LATEST_BACKUP=$(ls -t ./.backups/cafe_db_backup_*.sql 2>/dev/null | head -1)
  LATEST_TIME=$(stat -f %m "$LATEST_BACKUP" 2>/dev/null || stat -c %Y "$LATEST_BACKUP")
  CURRENT_TIME=$(date +%s)
  HOURS_AGO=$(( ($CURRENT_TIME - $LATEST_TIME) / 3600 ))

  if [ "$HOURS_AGO" -lt 25 ]; then
    BACKUP_FILE=$(basename "$LATEST_BACKUP")
    SIZE=$(du -h "$LATEST_BACKUP" | cut -f1)
    check_status "backups" "success" "Latest backup: $BACKUP_FILE ($SIZE) - $HOURS_AGO hours ago"
  else
    check_status "backups" "error" "Latest backup is $HOURS_AGO hours old (> 24h threshold)"
  fi
else
  check_status "backups" "error" "No backups found"
fi

# 5. Check Disk Space
echo -n "Disk Space: "
DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$DISK_USAGE" -lt 80 ]; then
  AVAILABLE=$(df -h . | awk 'NR==2 {print $4}')
  check_status "disk_space" "success" "Using ${DISK_USAGE}% of disk ($AVAILABLE available)"
else
  check_status "disk_space" "error" "Disk usage at ${DISK_USAGE}% - consider cleanup"
fi

# 6. Check Docker Containers
echo -n "Docker Containers: "
RUNNING=$(docker ps --filter "name=cafe_" -q | wc -l | tr -d ' ')
if [ "$RUNNING" = "4" ]; then
  check_status "docker_containers" "success" "All 4 containers running (api, frontend, db, redis)"
else
  check_status "docker_containers" "error" "Only $RUNNING/4 containers running"
fi

# 7. Check Log Files Size
echo -n "Log Files: "
if [ -d ./logs ]; then
  LOGS_SIZE=$(du -sh ./logs | cut -f1)
  LOG_COUNT=$(find ./logs -type f | wc -l | tr -d ' ')
  if [ "$LOG_COUNT" -gt 0 ]; then
    check_status "log_files" "success" "$LOG_COUNT log files totaling $LOGS_SIZE"
  else
    check_status "log_files" "warning" "Logs directory exists but is empty"
  fi
else
  check_status "log_files" "warning" "Logs directory not yet created (will be created on first request)"
fi

# 8. Check Database Size
echo -n "Database Size: "
DB_SIZE=$(docker exec cafe_db psql -U cafe_user -d cafe_payment -t -c "SELECT pg_size_pretty(pg_database_size(current_database()));" 2>/dev/null || echo "unknown")
check_status "database_size" "success" "Database size: $DB_SIZE"

# Finish JSON response
{
  echo "    \"database_size\": { \"status\": \"ok\", \"message\": \"Database size: $DB_SIZE\" }"
  echo "  },"
  if [ "$ERROR_COUNT" = "0" ]; then
    echo "  \"status\": \"healthy\","
    echo "  \"errors\": 0"
  else
    echo "  \"status\": \"unhealthy\","
    echo "  \"errors\": $ERROR_COUNT"
  fi
  echo "}"
} >> "$HEALTH_LOG"

# Print summary
echo ""
echo "=================================="
if [ "$ERROR_COUNT" = "0" ]; then
  echo "✅ All systems operational"
  EXIT_CODE=0
else
  echo "⚠️  $ERROR_COUNT issue(s) found"
  EXIT_CODE=1
fi
echo "📄 Health check log: $HEALTH_LOG"
echo ""

exit $EXIT_CODE
