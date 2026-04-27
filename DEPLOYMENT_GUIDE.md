# Production Deployment Guide

Complete step-by-step guide for deploying Cafe Payment API to production environment.

---

## Overview

This guide covers:
- **Pre-Deployment:** Security verification, backup strategy, capacity planning
- **Deployment:** Step-by-step production setup on your server
- **Post-Deployment:** Monitoring, alerting, disaster recovery setup
- **Maintenance:** Backup automation, log rotation, health monitoring

**Deployment Time:** 2-3 hours (including testing)

---

## Part 1: Pre-Deployment Preparation

### 1.1 Security Checklist

**⚠️ CRITICAL:** Complete before any deployment

```bash
# Run security audit
grep -r "password\|secret\|token" src/ | grep -v node_modules | grep -v ".env"

# Check for hardcoded secrets
grep -r "cafe_secret_2024\|jwt_secret" src/

# Verify .gitignore
cat .gitignore | grep -E "\.env|secrets|\.key"
```

**Security Requirements:**

- [ ] **Secrets Management**
  - [ ] All secrets in `.env.production` (not in code)
  - [ ] `.env.production` NOT committed to git
  - [ ] Secrets sourced from environment variables only

- [ ] **Authentication**
  - [ ] JWT_SECRET: 32+ random characters (generate: `openssl rand -hex 32`)
  - [ ] PASSWORD_HASH: Bcrypt algorithm (min. rounds: 10)
  - [ ] Session tokens: Secure, httpOnly, sameSite=Strict

- [ ] **Network Security**
  - [ ] HTTPS/TLS enabled on load balancer
  - [ ] CORS configured for production domain only
  - [ ] Rate limiting enabled (login: 5/15min, API: 100/min)
  - [ ] SQL injection prevention (parameterized queries)
  - [ ] XSS prevention (Helmet, sanitization)
  - [ ] CSRF protection enabled

- [ ] **Infrastructure**
  - [ ] Database credentials rotated from development
  - [ ] Firewall rules: only allow HTTP(S) + SSH
  - [ ] Database accessible only from API server
  - [ ] Redis accessible only from API server
  - [ ] No public access to admin panel (restrict to company IP)

### 1.2 Capacity Planning

**Estimate System Requirements:**

```
Concurrent Users × Data Volume = Server Size
```

**Example Calculations:**

```
Small Cafe (20-50 covers/day):
- Users: ~50 concurrent (peak hour)
- Storage: ~100 MB/month
- CPU: 2 cores, RAM: 4 GB

Medium Cafe (100-200 covers/day):
- Users: ~100 concurrent
- Storage: ~300 MB/month
- CPU: 4 cores, RAM: 8 GB

Large/Multi-location:
- Users: 200+ concurrent
- Storage: 1+ GB/month
- CPU: 8+ cores, RAM: 16+ GB
```

**Server Specs (Recommended):**

| Size | CPU | RAM | Storage | Cost (Monthly) |
|------|-----|-----|---------|---|
| Small | 2 vCPU | 4 GB | 50 GB | $20-30 |
| Medium | 4 vCPU | 8 GB | 100 GB | $50-80 |
| Large | 8 vCPU | 16 GB | 250 GB | $120-200 |

**Hosting Options:**
- **AWS:** EC2 + RDS + ElastiCache
- **DigitalOcean:** App Platform + Managed Database
- **Heroku:** Simple but pricier
- **Self-hosted:** Full control, requires DevOps expertise

### 1.3 Domain & SSL Certificate

**Get Domain:**
```bash
# Register domain: example.com, cafe.local, etc.
# Point DNS to your server IP
```

**Get SSL Certificate (Free with Let's Encrypt):**
```bash
# Use certbot for automatic certificate
# More details in TLS Setup section below
```

### 1.4 Test Deployment (Staging)

**Deploy to staging environment first:**

```bash
# Create staging branch
git checkout -b staging

# Update .env for staging
cp .env.example .env.staging
# Edit: change URLs, secrets, etc.

# Test on staging before production
# Run all test suites
npm test
npm run test:integration
npm run test:e2e

# Manual testing on staging
```

---

## Part 2: Server Setup

### 2.1 Prerequisites on Server

**SSH into Server:**
```bash
ssh user@your-server-ip

# Verify prerequisites
docker --version          # Docker 20.10+
docker compose version    # Docker Compose 2.0+
node --version           # Node.js 18+
npm --version            # npm 8+
git --version            # Git 2.25+
```

**If Missing: Install Required Software**

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y docker.io docker-compose git nodejs npm curl

# macOS
brew install docker docker-compose nodejs git

# Start Docker daemon
sudo systemctl start docker
sudo systemctl enable docker
```

### 2.2 Clone Repository

```bash
# Create app directory
mkdir -p /opt/cafe-api
cd /opt/cafe-api

# Clone repository
git clone https://github.com/your-org/Cafe_odeme.git .

# Create required directories
mkdir -p ./.backups ./.logs ./logs
chmod 700 ./.backups

# Verify structure
ls -la
```

### 2.3 Configure Environment Variables

**Create Production .env File:**

```bash
# Copy example
cp .env.example .env

# Edit with production values
nano .env
```

**Production .env Template:**

```env
# ─── Node & Framework ──────────────────────
NODE_ENV=production
PORT=3000

# ─── Database ──────────────────────────────
POSTGRES_DB=cafe_payment
POSTGRES_USER=cafe_user
POSTGRES_PASSWORD=$(openssl rand -hex 16)  # Generate random password
DATABASE_URL=postgresql://cafe_user:PASSWORD@postgres:5432/cafe_payment

# ─── Redis ─────────────────────────────────
REDIS_URL=redis://:PASSWORD@redis:6379

# ─── JWT & Security ────────────────────────
JWT_SECRET=$(openssl rand -hex 32)         # Generate random secret
JWT_EXPIRES_IN=7d

# ─── API URLs ──────────────────────────────
FRONTEND_URL=https://cafe.example.com
API_URL=https://cafe.example.com/api

# ─── Logging ────────────────────────────────
LOG_LEVEL=warn
LOG_FILE=/app/logs/api.log
LOG_MAX_SIZE=5m
LOG_MAX_FILES=10

# ─── Monitoring ─────────────────────────────
SENTRY_DSN=https://your-sentry-project@sentry.io/project-id
HEALTH_CHECK_INTERVAL=300

# ─── Email (for alerts) ─────────────────────
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@cafe.example.com
SMTP_PASS=generated_password
ADMIN_EMAIL=admin@cafe.example.com
```

**Secure .env File:**
```bash
# Restrict access to .env
chmod 600 .env

# Verify
ls -la .env
# Output: -rw------- (owner read/write only)
```

### 2.4 Generate Secrets

**Generate Strong Secrets:**

```bash
# JWT Secret (32 bytes, hex)
openssl rand -hex 32

# Database Password (16 bytes, hex)
openssl rand -hex 16

# Redis Password (16 bytes, hex)
openssl rand -hex 16

# Copy to .env:
JWT_SECRET=<output_from_above>
POSTGRES_PASSWORD=<output_from_above>
REDIS_PASSWORD=<output_from_above>
```

### 2.5 Configure TLS/HTTPS

**Option A: Let's Encrypt with Certbot (Recommended, Free)**

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate (automatic renewal)
sudo certbot certonly --standalone -d cafe.example.com -d www.cafe.example.com

# Certificates stored in: /etc/letsencrypt/live/cafe.example.com/

# Update nginx.conf
# - fullchain.pem → certificate
# - privkey.pem → private key
```

**Option B: Self-Signed Certificate (Development/Testing)**

```bash
# Generate self-signed certificate (valid 365 days)
openssl req -x509 -newkey rsa:4096 -keyout /opt/cafe-api/key.pem \
  -out /opt/cafe-api/cert.pem -days 365 -nodes

# Update docker-compose.yml volumes
# - ./cert.pem:/etc/nginx/cert.pem
# - ./key.pem:/etc/nginx/key.pem
```

**Option C: Reverse Proxy (Recommended for Production)**

Use AWS ALB, nginx, or Caddy to terminate TLS:

```nginx
# /etc/nginx/sites-available/cafe
server {
  listen 80;
  server_name cafe.example.com;
  return 301 https://$host$request_uri;  # Redirect to HTTPS
}

server {
  listen 443 ssl http2;
  server_name cafe.example.com;

  ssl_certificate /etc/letsencrypt/live/cafe.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/cafe.example.com/privkey.pem;

  # Security headers
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Frame-Options "DENY" always;
  add_header X-Content-Type-Options "nosniff" always;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

---

## Part 3: Docker Deployment

### 3.1 Build Docker Images

```bash
# Navigate to project
cd /opt/cafe-api

# Build images (takes 3-5 minutes)
docker compose build

# Verify images
docker images | grep cafe
```

### 3.2 Start Services

```bash
# Start in background
docker compose up -d

# Watch startup (wait 30 seconds)
sleep 30

# Check status
docker compose ps
```

**Expected Output:**

```
NAME                IMAGE               STATUS             PORTS
cafe_api            cafe_api:latest     Up (healthy)       0.0.0.0:3000->3000
cafe_frontend       cafe_frontend:...   Up (healthy)       0.0.0.0:5173->5173
cafe_db             postgres:16-alpine  Up (healthy)       5432
cafe_redis          redis:7-alpine      Up (healthy)       6379
```

### 3.3 Verify Services

```bash
# Health check
./database/health-check.sh

# Test API
curl https://cafe.example.com/health

# Check logs
docker compose logs --tail=20 api
docker compose logs --tail=20 postgres
```

---

## Part 4: Database Configuration

### 4.1 Automated Backups

**Set Up Cron Job:**

```bash
# Open crontab editor
crontab -e

# Add backup schedule (2 AM daily)
0 2 * * * cd /opt/cafe-api && ./database/backup.sh >> ./.backups/cron.log 2>&1

# Verify
crontab -l | grep backup
```

**Test Backup:**

```bash
# Run manual backup
./database/backup.sh

# Check backup
ls -lh ./.backups/cafe_db_backup_*.sql
```

### 4.2 Off-Site Backup (S3 Example)

**Install AWS CLI:**

```bash
pip install awscli

# Configure AWS credentials
aws configure
# Enter: AWS Access Key ID
# Enter: AWS Secret Access Key
# Enter: Default region (us-east-1)
```

**Create S3 Sync Script:**

```bash
cat > ./.backups/sync-to-s3.sh << 'EOF'
#!/bin/bash
# Sync backups to S3 (runs after backup)

BUCKET="cafe-api-backups"
REGION="us-east-1"
PROJECT="cafe_payment"

echo "[$(date)] Starting S3 sync..." >> ./.backups/s3-sync.log

aws s3 sync ./.backups/ \
  s3://$BUCKET/$PROJECT/ \
  --region $REGION \
  --exclude "*.log" \
  --delete

echo "[$(date)] S3 sync complete" >> ./.backups/s3-sync.log
EOF

chmod +x ./.backups/sync-to-s3.sh
```

**Add to Crontab (3 AM, after backup):**

```bash
crontab -e

# Add line:
0 3 * * * cd /opt/cafe-api && ./.backups/sync-to-s3.sh
```

### 4.3 Monitor Backup Age

**Create Backup Age Check:**

```bash
cat > ./.backups/check-backup-age.sh << 'EOF'
#!/bin/bash
# Alert if backup is stale

MAX_AGE_HOURS=25
LATEST_BACKUP=$(ls -t ./.backups/cafe_db_backup_*.sql 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
  echo "ERROR: No backups found!"
  exit 1
fi

LATEST_TIME=$(stat -c %Y "$LATEST_BACKUP")
CURRENT_TIME=$(date +%s)
HOURS_AGO=$(( ($CURRENT_TIME - $LATEST_TIME) / 3600 ))

if [ "$HOURS_AGO" -gt "$MAX_AGE_HOURS" ]; then
  echo "ERROR: Latest backup is $HOURS_AGO hours old (threshold: 24h)"
  # Send alert email
  echo "Backup Alert: $LATEST_BACKUP is $HOURS_AGO hours old" | \
    mail -s "⚠️ Database Backup Stale" admin@cafe.example.com
  exit 1
fi
EOF

chmod +x ./.backups/check-backup-age.sh
```

**Add to Crontab (check every 6 hours):**

```bash
# 0, 6, 12, 18 hours
0 */6 * * * cd /opt/cafe-api && ./.backups/check-backup-age.sh
```

---

## Part 5: Monitoring & Alerting

### 5.1 Health Check Setup

**Automated Health Checks (Every 5 minutes):**

```bash
crontab -e

# Add health check
*/5 * * * * cd /opt/cafe-api && ./database/health-check.sh >> ./.health-checks/cron.log 2>&1
```

### 5.2 Log Monitoring

**Structured Logging (Winston):**

Logs are automatically configured in `server.js`:
- **File:** `/app/logs/api.log`
- **Rotation:** 5MB max file, 5 files retention
- **Format:** JSON (parseable by log aggregators)

**View Logs:**

```bash
# Real-time logs
docker compose logs -f api

# Last 50 lines
docker compose logs --tail=50 api

# Error logs only
docker compose logs api | grep -i error

# Specific time range
docker compose logs --since 1h api
```

### 5.3 Error Alerting

**Option A: Sentry (Free tier available)**

```bash
# 1. Create Sentry account at sentry.io
# 2. Create project → copy DSN
# 3. Add to .env
SENTRY_DSN=https://key@sentry.io/project

# 4. Initialize in server.js
const Sentry = require("@sentry/node");
Sentry.init({ dsn: process.env.SENTRY_DSN });

# 5. Errors automatically captured and sent to Sentry dashboard
```

**Option B: Email Alerts**

```bash
# Configure cron to check for errors and email
cat > ./.logs/email-errors.sh << 'EOF'
#!/bin/bash
# Email critical errors from last hour

ERRORS=$(docker logs cafe_api --since 1h | grep -i "error\|fatal" | tail -20)

if [ ! -z "$ERRORS" ]; then
  echo -e "Critical Errors in Last Hour:\n\n$ERRORS" | \
    mail -s "🚨 Cafe API Errors" admin@cafe.example.com
fi
EOF

chmod +x ./.logs/email-errors.sh

# Add to crontab (hourly check)
0 * * * * cd /opt/cafe-api && ./.logs/email-errors.sh
```

### 5.4 Uptime Monitoring

**Use External Service (Uptime Robot - Free):**

```
1. Create account at uptimerobot.com
2. Add monitor: https://cafe.example.com/health
3. Check interval: Every 5 minutes
4. Set email alerts if down
```

---

## Part 6: Security Hardening

### 6.1 Firewall Configuration

```bash
# Allow only essential ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirect to HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Verify
sudo ufw status
```

### 6.2 Database Security

```bash
# Change default password (already done in .env)
# Restrict database access to API container only
# Database should NOT be exposed to internet

# Create database user with restricted permissions
docker exec cafe_db psql -U cafe_user -d cafe_payment << 'EOF'
-- Create read-only user for backups
CREATE USER cafe_backup WITH PASSWORD 'backup_password';
GRANT CONNECT ON DATABASE cafe_payment TO cafe_backup;
GRANT USAGE ON SCHEMA public TO cafe_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cafe_backup;
EOF
```

### 6.3 API Rate Limiting

Already configured in `server.js`:

```javascript
// Login: 5 requests per 15 minutes
// API: 100 requests per minute
// Protects against brute force and DDoS
```

### 6.4 Security Headers

Already configured via Helmet:

```javascript
- X-Frame-Options: DENY (prevent clickjacking)
- X-Content-Type-Options: nosniff (prevent MIME sniffing)
- Strict-Transport-Security: max-age=31536000 (force HTTPS)
- Content-Security-Policy: (prevent XSS)
```

---

## Part 7: Post-Deployment Checklist

### 7.1 Verify Everything Works

**Run All Verification Steps:**

```bash
# 1. Health check
./database/health-check.sh

# 2. Test API endpoints
curl https://cafe.example.com/health
curl https://cafe.example.com/api/admin/menu

# 3. Test database
docker exec cafe_db psql -U cafe_user -d cafe_payment -c "SELECT COUNT(*) FROM users;"

# 4. Test Redis
docker exec cafe_redis redis-cli PING

# 5. Check logs for errors
docker compose logs --tail=50 api | grep -i error
```

### 7.2 Performance Baseline

**Measure Initial Performance:**

```bash
# Response time test (should be < 200ms)
time curl https://cafe.example.com/health

# Load test (basic)
# Using Apache Bench or wrk
ab -n 1000 -c 10 https://cafe.example.com/health

# Monitor during load test
docker stats
```

### 7.3 Backup Testing

**Test Restore Procedure:**

```bash
# Create test database
docker exec cafe_db createdb -U cafe_user cafe_payment_test

# Restore from backup
./database/restore.sh ./.backups/cafe_db_backup_*.sql cafe_payment_test

# Verify restore
docker exec cafe_db psql -U cafe_user -d cafe_payment_test -c "SELECT COUNT(*) FROM users;"

# Clean up
docker exec cafe_db dropdb -U cafe_user cafe_payment_test
```

### 7.4 Document Deployment

**Create Deployment Record:**

```bash
cat > ./.deployments/deployment-20260419.txt << 'EOF'
Deployment Date: 2026-04-19
Environment: Production
Server: cafe.example.com

Deployed by: Your Name
Duration: 2 hours
Status: ✅ Success

Services Started:
- API: http://localhost:3000 (behind reverse proxy)
- Frontend: http://localhost:5173
- PostgreSQL: Running
- Redis: Running

Backups: Configured (daily at 2 AM)
Monitoring: Health checks running every 5 min
SSL Certificate: Let's Encrypt (renews automatically)

Next Steps:
- Monitor logs for 24 hours
- Verify backup runs tomorrow
- Schedule disaster recovery drill
EOF
```

---

## Part 8: Ongoing Maintenance

### 8.1 Daily Tasks

```bash
# Check health
./database/health-check.sh

# Review logs for errors
docker compose logs --since 24h | grep -i error

# Verify backup ran
ls -lh ./.backups/cafe_db_backup_*.sql | head -1
```

### 8.2 Weekly Tasks

```bash
# Test restore procedure
./database/restore.sh ./.backups/cafe_db_backup_*.sql

# Review performance metrics
docker stats

# Check disk usage
df -h
du -sh ./.backups/

# Review security logs
docker exec cafe_db psql -U cafe_user -d cafe_payment \
  -c "SELECT action, COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY action;"
```

### 8.3 Monthly Tasks

```bash
# Database maintenance
docker exec cafe_db psql -U cafe_user -d cafe_payment << 'EOF'
ANALYZE;  -- Update statistics for query planner
REINDEX; -- Rebuild all indexes
EOF

# Review and archive old logs
find ./.logs -name "*.log" -mtime +30 -exec gzip {} \;
find ./.logs -name "*.log.gz" -mtime +90 -delete

# Review costs (for cloud deployments)
# AWS: Check Cost Explorer
# DigitalOcean: Check billing

# Security updates
docker images

# Update base images if security patches available
docker compose pull
docker compose build --no-cache
docker compose up -d
```

### 8.4 Quarterly Tasks

```bash
# Full disaster recovery drill
# 1. Backup database
# 2. Restore to test environment
# 3. Verify all features work
# 4. Document issues found
# 5. Update recovery procedures

# Performance analysis
# Review slow query logs
# Identify optimization opportunities
# Test index efficiency

# Capacity planning
# Review growth trends
# Plan for scaling if needed
```

---

## Part 9: Troubleshooting

### Problem: Services Won't Start

```bash
# Check what's actually failing
docker compose up --no-detach

# Check Docker daemon
docker ps

# Review logs
docker compose logs postgres
docker compose logs redis
docker compose logs api
```

### Problem: Database Connection Fails

```bash
# Test connection manually
docker exec cafe_db psql -U cafe_user -d cafe_payment -c "SELECT 1;"

# Check credentials in .env match
grep DATABASE_URL .env

# Check PostgreSQL password
grep POSTGRES_PASSWORD .env

# Restart database
docker compose restart postgres
sleep 5

# Try again
./database/health-check.sh
```

### Problem: Backup Fails

```bash
# Check backup script permissions
ls -la database/backup.sh
# Should show: -rwxr-xr-x

# Run backup manually
./database/backup.sh

# Check backups directory
ls -lh ./.backups/

# Check disk space
df -h

# Review backup logs
tail -20 ./.backups/cron.log
```

### Problem: SSL Certificate Renewal Fails

```bash
# Manual renewal
sudo certbot renew --dry-run

# Check certificate expiry
echo | openssl s_client -servername cafe.example.com -connect cafe.example.com:443 2>/dev/null | openssl x509 -noout -dates

# Auto-renewal should be handled by certbot, verify:
sudo systemctl status certbot.timer
```

### Problem: High CPU or Memory Usage

```bash
# Check container resource usage
docker stats

# Find memory leaks
docker exec cafe_api npm ls

# Restart problematic service
docker compose restart api

# Monitor memory over time
docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}" > memory.log
```

---

## Quick Reference

### Deployment Commands

```bash
# Start
docker compose up -d

# Stop
docker compose stop

# Restart
docker compose restart api

# View logs
docker compose logs -f api

# Remove all containers (⚠️ keeps data)
docker compose down

# Full reset (⚠️ deletes data)
docker compose down -v
```

### Useful Paths

```
Project Root: /opt/cafe-api
Backups:      /opt/cafe-api/.backups
Logs:         /opt/cafe-api/logs
Configs:      /opt/cafe-api/.env
SSL Certs:    /etc/letsencrypt/live/cafe.example.com
```

### Monitoring

```bash
# System status
./database/health-check.sh

# Recent logs
docker compose logs --tail=50 api

# Database size
docker exec cafe_db psql -U cafe_user -d cafe_payment \
  -c "SELECT pg_size_pretty(pg_database_size('cafe_payment'));"

# Backup status
ls -lh ./.backups/ | tail -5
```

---

## Rollback Procedure

**If Critical Issue Found After Deployment:**

```bash
# 1. Stop current deployment
docker compose stop

# 2. Restore database from backup
./database/restore.sh ./.backups/cafe_db_backup_YYYYMMDD_HHMMSS.sql

# 3. Revert code to previous version
git checkout previous-stable-tag

# 4. Rebuild and restart
docker compose build
docker compose up -d

# 5. Verify
./database/health-check.sh
```

---

## Scaling Considerations

### If Load Increases

1. **Horizontal Scaling (Multiple API Instances)**
   ```bash
   # Use load balancer (nginx, AWS ALB)
   # Run multiple API instances behind load balancer
   # Each instance connects to same database
   ```

2. **Vertical Scaling (Bigger Server)**
   ```bash
   # Upgrade server CPU/RAM
   # Docker will automatically use additional resources
   ```

3. **Database Optimization**
   ```bash
   # Add read replicas for reporting
   # Use connection pooling (pgBouncer)
   # Archive old data (payments > 1 year old)
   ```

4. **Caching Layer**
   ```bash
   # Redis (already implemented)
   # CDN for static assets (frontend)
   # Database query caching
   ```

---

## Documentation & Support

**Related Documentation:**
- [INSTALLATION_GUIDE.md](./INSTALLATION_GUIDE.md) - Local development setup
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Database structure
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - API endpoints
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - Pre-deployment checklist

**Emergency Contacts:**

Create `EMERGENCY.md`:
```
Primary Contact: [Name] - [Email/Phone]
Secondary Contact: [Name] - [Email/Phone]
On-Call Schedule: [Link to schedule]

Emergency Hotline: +90-XXX-XXXX-XXXX
Support Email: support@cafe.example.com

Critical Issues:
- Database down: pg_isready -U cafe_user
- API not responding: curl https://cafe.example.com/health
- Backup missing: ls -lh ./.backups/
```

---

For detailed information, see:
- [BACKUP_SETUP_GUIDE.md](./BACKUP_SETUP_GUIDE.md) - Backup procedures
- [BACKUP_STRATEGY.md](./BACKUP_STRATEGY.md) - Backup philosophy & recovery scenarios
