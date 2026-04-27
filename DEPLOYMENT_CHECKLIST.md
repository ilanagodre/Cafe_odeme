# Production Deployment Checklist

Before deploying to production, verify all security, backup, and operational requirements are met.

## Security ✅

- [ ] **JWT_SECRET** is set to a strong random value (min 32 characters)
- [ ] **DATABASE_PASSWORD** is strong and unique (not development password)
- [ ] **POSTGRES_PASSWORD** is strong and unique
- [ ] All environment variables are set in `.env.production`
- [ ] `.env` file is NOT committed to git (check `.gitignore`)
- [x] Helmet security headers are enabled (in server.js) ✅
- [x] Rate limiting is configured (login: 5/15min, api: 100/min) ✅
- [x] Input validation is active on all endpoints ✅
- [ ] CORS is configured for production domain only
- [ ] HTTPS/TLS is enabled on load balancer or reverse proxy
- [ ] Database credentials are rotated from development values

## Backup & Recovery ✅

- [ ] `./.backups/` directory exists and is writable
- [ ] Backup scripts are executable: `ls -la database/*.sh`
- [ ] Test backup successful: `./database/backup.sh`
- [ ] Test restore procedure:
  ```bash
  ./database/restore.sh ./.backups/cafe_db_backup_*.sql
  ```
- [ ] Automated backup cron job is configured:
  ```bash
  crontab -e
  # 0 2 * * * cd /path/to/Cafe_odeme && ./database/backup.sh >> ./.backups/cron.log 2>&1
  ```
- [ ] External backup storage is configured (e.g., AWS S3, GCS)
- [ ] Backup retention policy is documented (currently: 30 days)
- [ ] Recovery runbook is accessible to on-call team
- [ ] PostgreSQL data volume is backed by persistent storage
- [ ] Redis persistence is enabled (AOF mode)

## Logging & Monitoring ✅

- [x] Winston logging is configured ✅
- [x] Log rotation is enabled (5MB max file size, 5 files retention) ✅
- [ ] Logs are written to persistent storage (not ephemeral)
- [x] Audit logging is enabled for critical operations: ✅
  - [x] User login (tracked) ✅
  - [x] Staff creation/updates ✅
  - [x] Payment processing ✅
- [ ] Health check endpoint responds: `GET /health`
- [ ] Health check script works: `./database/health-check.sh`
- [ ] Monitoring alerts are configured:
  - [ ] API response time > 1000ms
  - [ ] Backup older than 24 hours
  - [ ] Disk usage > 80%
  - [ ] Error rate > threshold

## Database ✅

- [ ] PostgreSQL is version 16+ (from docker-compose.yml)
- [ ] Database schema is initialized (SQL files in `./database/`)
- [ ] All tables are created and indexed
- [ ] Foreign keys are enforced
- [ ] Database backup completed successfully
- [ ] Test data is removed from production
- [ ] Database credentials match environment variables
- [ ] Connection pooling is configured (if using pgbouncer)

## Redis ✅

- [ ] Redis is running with persistence enabled
- [ ] Memory limit is set (512MB in docker-compose.yml)
- [ ] Eviction policy is set to `noeviction` (fail safely)
- [ ] AOF (Append-Only File) is enabled for durability
- [ ] Redis data is backed by persistent volume
- [ ] Redis has a password configured (for production)
- [ ] Redis is not exposed publicly

## Docker & Infrastructure ✅

- [ ] All services are containerized (api, frontend, postgres, redis)
- [ ] Image tags are explicit (not `latest`)
- [ ] Dockerfile builds are optimized (multi-stage)
- [ ] Container resource limits are set (CPU, memory)
- [ ] Container restart policies are configured (`restart: unless-stopped`)
- [ ] Healthchecks are configured for all services
- [ ] Networks are properly segmented
- [ ] Volumes are persistent and encrypted (if on cloud)
- [x] Secrets are NOT embedded in images or docker-compose.yml ✅
- [ ] Images are scanned for vulnerabilities

## Application ✅

- [x] Environment variables are validated at startup ✅
- [x] Error handling doesn't leak sensitive information ✅
- [x] No hardcoded secrets in code ✅
- [x] API rate limiting is enforced ✅
- [x] Database connection pooling is configured ✅
- [x] Request logging includes relevant context ✅
- [x] Error logging includes full stack traces (production: masked) ✅
- [ ] WebSocket connections are secure (WSS in production)

## Testing ✅

- [ ] Unit tests pass: `npm test`
- [ ] Integration tests pass: `npm run test:integration`
- [ ] E2E tests pass: `npm run test:e2e`
- [ ] Load testing completed
- [ ] Backup/restore procedures tested
- [ ] Failover scenarios tested
- [ ] Disaster recovery plan verified

## Documentation ✅

- [ ] Backup & Recovery procedures documented (BACKUP_STRATEGY.md)
- [ ] Deployment procedures documented
- [ ] On-call runbook is prepared
- [ ] Architecture diagram is updated
- [ ] API documentation is current (OpenAPI/Swagger)
- [ ] Database schema documentation exists
- [ ] Environment variables are documented (.env.example)
- [ ] Known issues and workarounds are documented

## Pre-Deployment Verification

### 1. Start Fresh Deployment

```bash
# Pull latest code
git pull origin main

# Build images
docker compose build

# Start services
docker compose up -d

# Verify all services are healthy
docker compose ps
```

### 2. Run Health Check

```bash
./database/health-check.sh
```

Expected output: ✅ All systems operational

### 3. Test Critical Flows

```bash
# Test API health
curl http://localhost:3000/health

# Test database connection
docker exec cafe_db psql -U cafe_user -d cafe_payment -c "SELECT 1;"

# Test Redis connection
docker exec cafe_redis redis-cli PING

# Test backup
./database/backup.sh
```

### 4. Check Logs

```bash
# API logs
docker logs cafe_api | tail -50

# Database logs
docker logs cafe_db | tail -20

# Frontend logs
docker logs cafe_frontend | tail -20
```

### 5. Verify Data Integrity

```bash
# Count records in critical tables
docker exec cafe_db psql -U cafe_user -d cafe_payment << EOF
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'payments', COUNT(*) FROM payments;
EOF
```

## Post-Deployment

- [ ] Monitor logs for errors (first 24 hours)
- [ ] Verify backup cron job runs on schedule
- [ ] Test restore procedure weekly
- [ ] Set up monitoring alerts
- [ ] Schedule regular security scans
- [ ] Plan disaster recovery drill (monthly)
- [ ] Review and update security policies

---

## Sign-Off

- [ ] Security review completed
- [ ] Database backup verified
- [ ] Monitoring configured
- [ ] Team trained on runbooks
- [ ] Deployment approved by team lead

**Deployed by:** **\*\*\*\***\_**\*\*\*\***  
**Date:** **\*\*\*\***\_**\*\*\*\***  
**Version:** **\*\*\*\***\_**\*\*\*\***

---

For more details, see:

- [BACKUP_STRATEGY.md](./BACKUP_STRATEGY.md) - Backup and recovery procedures
- [README.md](./README.md) - Project overview
- [.env.example](./.env.example) - Environment variables
