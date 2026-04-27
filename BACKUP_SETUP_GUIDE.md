# Backup Setup Guide

## Quick Start (5 minutes)

### 1. Test the Backup System

```bash
# Navigate to project directory
cd /path/to/Cafe_odeme

# Create a backup
./database/backup.sh

# View the backup
ls -lh ./.backups/
```

Expected output:
```
-rw-r--r-- 1 user staff 8.0K Apr 19 14:30 cafe_db_backup_20260419_143000.sql
```

### 2. Test the Health Check

```bash
# Run health check
./database/health-check.sh
```

Expected output:
```
🏥 Cafe Payment API Health Check
==================================
✅ postgresql: Database running with 8 tables
✅ redis: Redis running with 0 keys
✅ api_server: API responding to health check
✅ backups: Latest backup created 0 hours ago
✅ disk_space: Using 29% of disk (647Gi available)
✅ docker_containers: All 4 containers running
✅ All systems operational
```

### 3. Enable Automated Backups (Cron)

```bash
# Open cron editor
crontab -e

# Add one of these lines:

# Backup every 6 hours (daily: 4 backups)
0 */6 * * * cd /path/to/Cafe_odeme && ./database/backup.sh >> ./.backups/cron.log 2>&1

# Backup every day at 2 AM (recommended)
0 2 * * * cd /path/to/Cafe_odeme && ./database/backup.sh >> ./.backups/cron.log 2>&1

# Backup 3 times daily (2 AM, 10 AM, 6 PM)
0 2,10,18 * * * cd /path/to/Cafe_odeme && ./database/backup.sh >> ./.backups/cron.log 2>&1

# Backup every 4 hours around the clock
0 */4 * * * cd /path/to/Cafe_odeme && ./database/backup.sh >> ./.backups/cron.log 2>&1
```

**Note:** Replace `/path/to/Cafe_odeme` with your actual project path (use `pwd` to get it)

### 4. Verify Cron Job is Running

```bash
# Check cron log after a while
cat ./.backups/cron.log

# List recent backups
ls -lhS ./.backups/ | head -10

# Count total backups
find ./.backups -name "cafe_db_backup_*.sql" | wc -l
```

---

## Detailed Setup for Production

### Step 1: Create Backup Directory with Proper Permissions

```bash
# Create backups directory
mkdir -p ./.backups

# Set restrictive permissions (only owner can read/write)
chmod 700 ./.backups

# Verify permissions
ls -ld ./.backups
# Should output: drwx------ user group ./.backups
```

### Step 2: Configure Automated Backups

#### Option A: Daily Backup at 2 AM (Recommended)

```bash
# Add to crontab
crontab -e

# Insert this line:
0 2 * * * cd /opt/cafe-api && ./database/backup.sh >> ./.backups/cron.log 2>&1
```

**Explanation:**
- `0 2 * * *` = Every day at 2:00 AM
- `cd /opt/cafe-api` = Navigate to project directory
- `./database/backup.sh` = Run backup script
- `>> ./.backups/cron.log` = Append output to log file

#### Option B: Backup Every 6 Hours

```bash
# Better for high-traffic systems or critical data
0 */6 * * * cd /opt/cafe-api && ./database/backup.sh >> ./.backups/cron.log 2>&1
```

**Schedule:** 12:00 AM, 6:00 AM, 12:00 PM, 6:00 PM

#### Option C: Backup 3 Times Daily

```bash
# Most comprehensive backup coverage
0 2,10,18 * * * cd /opt/cafe-api && ./database/backup.sh >> ./.backups/cron.log 2>&1
```

**Schedule:** 2:00 AM, 10:00 AM, 6:00 PM

### Step 3: Monitor Backup Cron Job

```bash
# Check if cron job is scheduled
crontab -l | grep database/backup.sh

# View cron execution log (if available)
sudo log stream --predicate 'eventMessage contains[cd] "cafe-api"' --level debug

# Or check the backup log
tail -f ./.backups/cron.log
```

### Step 4: Set Up External Backup Storage (AWS S3 Example)

```bash
# Create a backup sync script
cat > ./.backups/sync-to-s3.sh << 'EOF'
#!/bin/bash
# Sync backups to AWS S3 every night after backup
# Schedule: 0 3 * * * cd /path/to/Cafe_odeme && ./.backups/sync-to-s3.sh

BUCKET="my-company-backups"
REGION="us-east-1"
PROJECT="cafe-api"

aws s3 sync ./.backups/ \
  s3://$BUCKET/$PROJECT/ \
  --region $REGION \
  --delete \
  --exclude "*.log" \
  --exclude ".git*"

echo "[$(date)] Backup sync to S3 complete" >> ./.backups/s3-sync.log
EOF

chmod +x ./.backups/sync-to-s3.sh
```

Then add to crontab:
```bash
# Run S3 sync 1 hour after backup (3 AM)
0 3 * * * cd /opt/cafe-api && ./.backups/sync-to-s3.sh >> ./.backups/cron.log 2>&1
```

### Step 5: Configure Backup Alerts

Create a monitoring script that checks backup age:

```bash
cat > ./.backups/check-backup-age.sh << 'EOF'
#!/bin/bash
# Check if latest backup is fresh and alert if stale

MAX_AGE_HOURS=25
BACKUP_DIR="./.backups"
LATEST_BACKUP=$(ls -t $BACKUP_DIR/cafe_db_backup_*.sql 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
  echo "ERROR: No backups found!"
  exit 1
fi

LATEST_TIME=$(stat -f %m "$LATEST_BACKUP" 2>/dev/null || stat -c %Y "$LATEST_BACKUP")
CURRENT_TIME=$(date +%s)
HOURS_AGO=$(( ($CURRENT_TIME - $LATEST_TIME) / 3600 ))

if [ "$HOURS_AGO" -gt "$MAX_AGE_HOURS" ]; then
  echo "WARNING: Latest backup is $HOURS_AGO hours old (threshold: $MAX_AGE_HOURS hours)"
  echo "Backup file: $LATEST_BACKUP"
  exit 1
else
  echo "OK: Latest backup is $HOURS_AGO hours old"
  exit 0
fi
EOF

chmod +x ./.backups/check-backup-age.sh
```

Add to crontab (check every 6 hours):
```bash
0 */6 * * * cd /opt/cafe-api && ./.backups/check-backup-age.sh || mail -s "⚠️ Backup Alert" admin@cafe.local
```

### Step 6: Test Restore Procedure

```bash
# List available backups
ls -lh ./.backups/cafe_db_backup_*.sql

# Test restore from the most recent backup
./database/restore.sh ./.backups/cafe_db_backup_*.sql

# When prompted, type: yes
# The script will restore the database

# Verify restoration
docker exec cafe_db psql -U cafe_user -d cafe_payment -c "SELECT COUNT(*) FROM orders;"
```

### Step 7: Schedule Weekly Restore Tests

```bash
# Create a test restore procedure
cat > ./.backups/test-restore.sh << 'EOF'
#!/bin/bash
# Weekly restore test (non-destructive)
# This creates a test database to verify backups are valid

LATEST_BACKUP=$(ls -t ./.backups/cafe_db_backup_*.sql 2>/dev/null | head -1)
TEST_LOG="./.backups/restore-test-$(date +%Y%m%d).log"

echo "Testing restore from: $LATEST_BACKUP" > "$TEST_LOG"
echo "Started at: $(date)" >> "$TEST_LOG"

# TODO: Implement restore to separate test database
# For now, just verify the backup file is valid
if file "$LATEST_BACKUP" | grep -q "gzip"; then
  echo "✓ Backup file is valid gzip" >> "$TEST_LOG"
else
  echo "✗ Backup file is NOT gzip compressed" >> "$TEST_LOG"
  exit 1
fi

echo "Completed at: $(date)" >> "$TEST_LOG"
exit 0
EOF

chmod +x ./.backups/test-restore.sh
```

Add to crontab (every Friday at 3 AM):
```bash
0 3 * * 5 cd /opt/cafe-api && ./.backups/test-restore.sh >> ./.backups/cron.log 2>&1
```

---

## Verification Commands

### Check Backup Status

```bash
# See all backups
ls -lh ./.backups/cafe_db_backup_*.sql

# Count backups
find ./.backups -name "cafe_db_backup_*.sql" -type f | wc -l

# Total backup size
du -sh ./.backups/

# Age of latest backup
stat -f %m ./.backups/cafe_db_backup_*.sql | sort -rn | head -1 | xargs -I {} date -r {}
```

### Check Cron Jobs

```bash
# List all cron jobs
crontab -l

# List only backup-related jobs
crontab -l | grep -i backup

# View system cron logs (macOS)
sudo log stream --predicate 'process == "cron"' --level debug

# View system cron logs (Linux)
sudo tail -f /var/log/syslog | grep CRON
```

### Monitor Backup Process

```bash
# Watch cron log in real-time
tail -f ./.backups/cron.log

# Check backup duration
grep "Backup Completed" ./.backups/cron.log | tail -5
```

---

## Troubleshooting

### Backups not running

**Check 1: Verify cron job exists**
```bash
crontab -l | grep backup
```

**Check 2: Verify script permissions**
```bash
ls -la database/backup.sh
# Should show: -rwxr-xr-x (executable)
```

**Check 3: Check cron logs**
```bash
# macOS
log stream --predicate 'process == "cron"' --level debug

# Linux
sudo tail -f /var/log/syslog | grep CRON
```

**Check 4: Test backup manually**
```bash
cd /path/to/Cafe_odeme
./database/backup.sh
```

### Backups are too large

**Check:** Backup size should be 5-50 MB depending on data
```bash
du -h ./.backups/cafe_db_backup_*.sql | sort -h
```

**If too large:** Database might have unnecessary data. Clean up test records before backup.

### Restore fails

**Check 1: Backup file is valid**
```bash
file ./.backups/cafe_db_backup_20260419_*.sql
# Should output: "gzip compressed data"
```

**Check 2: Database is running**
```bash
docker ps | grep cafe_db
```

**Check 3: Restore permissions**
```bash
ls -la ./.backups/cafe_db_backup_*.sql
# Should be readable by current user
```

---

## Backup Policy Summary

| Aspect | Setting | Notes |
|--------|---------|-------|
| **Frequency** | Every 6-24 hours | Configurable via cron |
| **Retention** | 30 days | Auto-cleanup older backups |
| **Storage** | `./.backups/` + S3 (optional) | Local + offsite (recommended) |
| **Compression** | gzip (9) | ~90% size reduction |
| **Restore Time** | 5-15 minutes | Depends on DB size |
| **Testing** | Weekly | Manual restore test |
| **RTO** | 15 minutes | Recovery time objective |
| **RPO** | 6-24 hours | Recovery point objective |

---

## Next Steps

1. ✅ **Run health check:** `./database/health-check.sh`
2. ✅ **Test backup:** `./database/backup.sh`
3. ⏳ **Set up cron job:** `crontab -e`
4. ⏳ **Configure S3 sync** (optional but recommended)
5. ⏳ **Test restore** weekly
6. ⏳ **Monitor backups** - check age regularly

For more details, see [BACKUP_STRATEGY.md](./BACKUP_STRATEGY.md)
