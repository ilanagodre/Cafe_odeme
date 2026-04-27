# Installation & Setup Guide

Complete step-by-step guide for setting up the Cafe Payment API development environment.

## Prerequisites

### System Requirements

- **OS:** macOS, Linux, or Windows (WSL2)
- **RAM:** Minimum 4GB (8GB recommended)
- **Disk Space:** 5GB free space
- **Internet:** Required for downloading Docker images and npm packages

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Docker** | 20.10+ | Container runtime |
| **Docker Compose** | 2.0+ | Multi-container orchestration |
| **Node.js** | 18+ | Backend & frontend runtime |
| **npm** | 8+ | Package manager |
| **Git** | 2.25+ | Version control |
| **curl** | 7.0+ | Testing API endpoints |

### Optional Tools (Recommended)

- **VS Code** - Code editor
- **Postman** or **Insomnia** - API testing tools
- **PostgreSQL client** (`psql`) - Direct database access (install with: `brew install postgresql`)
- **Redis CLI** (`redis-cli`) - Direct Redis access (install with: `brew install redis`)

## Installation Steps

### Step 1: Verify Prerequisites

```bash
# Check Docker
docker --version
# Output should be: Docker version 20.10.x or higher

# Check Docker Compose
docker compose version
# Output should be: Docker Compose version 2.x.x or higher

# Check Node.js
node --version
# Output should be: v18.x.x or higher

# Check npm
npm --version
# Output should be: 8.x.x or higher
```

**Troubleshooting:**
- Docker not found? [Download Docker Desktop](https://www.docker.com/products/docker-desktop)
- Node.js not found? [Download Node.js](https://nodejs.org/) (LTS version recommended)
- Docker Compose not included? Update Docker Desktop to latest version

### Step 2: Clone Repository

```bash
# Clone the repository
git clone https://github.com/your-org/Cafe_odeme.git
cd Cafe_odeme

# Verify directory structure
ls -la
# Should show: docker-compose.yml, Dockerfile.api, package.json, frontend/, database/, src/
```

### Step 3: Configure Environment Variables

#### 3a. Backend Configuration

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

**Minimum Required Variables:**

```env
# Database Configuration
POSTGRES_DB=cafe_payment
POSTGRES_USER=cafe_user
POSTGRES_PASSWORD=cafe_secret_2024
DATABASE_URL=postgresql://cafe_user:cafe_secret_2024@postgres:5432/cafe_payment

# Redis Configuration
REDIS_URL=redis://redis:6379

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_minimum_32_characters_long
JWT_EXPIRES_IN=7d

# Frontend Configuration
FRONTEND_URL=http://localhost:5173

# API Configuration
NODE_ENV=development
PORT=3000

# Logging
LOG_LEVEL=debug
```

**Security Notes:**
- `JWT_SECRET`: Must be 32+ characters. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `POSTGRES_PASSWORD`: Change from default in production
- Never commit `.env` file to git (already in `.gitignore`)

#### 3b. Frontend Configuration

```bash
# Frontend uses environment variables from docker-compose.yml
# No additional setup needed for development
```

### Step 4: Build Docker Images

```bash
# Build all services
docker compose build

# This may take 3-5 minutes on first run
# Output will show:
# ✔ Container cafe_db built
# ✔ Container cafe_redis built
# ✔ Container cafe_api built
# ✔ Container cafe_frontend built
```

**Troubleshooting:**
```bash
# If build fails, check Docker daemon
docker ps
# If error: "Cannot connect to Docker daemon", start Docker Desktop

# Clear build cache if needed
docker compose build --no-cache
```

### Step 5: Start Services

```bash
# Start all containers in background
docker compose up -d

# Wait for services to be ready (~15 seconds)
sleep 15

# Verify all containers are running
docker compose ps
```

**Expected Output:**

```
CONTAINER ID   IMAGE                      STATUS             PORTS
abc123         cafe_api                   Up (healthy)       0.0.0.0:3000->3000/tcp
def456         cafe_frontend              Up (healthy)       0.0.0.0:5173->5173/tcp
ghi789         postgres:16-alpine         Up (healthy)       5432/tcp
jkl012         redis:7-alpine             Up (healthy)       6379/tcp
```

**If containers fail to start:**

```bash
# Check logs for specific service
docker compose logs postgres
docker compose logs redis
docker compose logs api

# Common issues:
# 1. Port 3000 already in use: docker compose down && docker compose up -d
# 2. Out of disk space: docker system prune -a
# 3. Database won't start: docker compose down -v && docker compose up -d
```

### Step 6: Verify Installation

```bash
# Run health check script
./database/health-check.sh
```

**Expected Output:**

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

### Step 7: Access the Application

#### Frontend (Customer Interface)

```
URL: http://localhost:5173
```

**Test:** 
- Open browser → http://localhost:5173
- Should see landing page with "Enter Table Number" form

#### Admin Dashboard

```
URL: http://localhost:5173/staff-login
```

**Test Login Credentials (Development Only):**
```
Username: owner
Password: owner_password
```

**Available Roles:**
- `owner` - Full system access
- `head_waiter` - Staff management, reports
- `waiter` - Order management only

#### API Server

```
Base URL: http://localhost:3000
Health Check: http://localhost:3000/health
```

**Test API:**
```bash
curl http://localhost:3000/health
# Output: {"status":"ok","timestamp":"2026-04-19T18:30:00Z"}
```

---

## Development Workflow

### Backend Development

```bash
# Backend code is hot-reloaded from ./src
# Changes are automatically applied

# View backend logs
docker compose logs -f api

# To manually restart backend
docker compose restart api
```

### Frontend Development

```bash
# Frontend code is hot-reloaded from ./frontend
# Changes are automatically applied

# View frontend logs
docker compose logs -f frontend

# To manually restart frontend
docker compose restart frontend
```

### Database Access (Development)

```bash
# Connect directly to PostgreSQL
docker exec -it cafe_db psql -U cafe_user -d cafe_payment

# Common commands in psql:
# \dt              - List all tables
# \d orders        - Describe 'orders' table
# SELECT * FROM users LIMIT 5; - Query data
# \q              - Quit psql
```

### Redis Access (Development)

```bash
# Connect directly to Redis
docker exec -it cafe_redis redis-cli

# Common commands in redis-cli:
# PING              - Test connection
# KEYS *            - List all keys
# GET key_name      - Get value by key
# DBSIZE            - Total keys in database
# FLUSHDB           - Clear all data (⚠️ DEVELOPMENT ONLY)
# exit              - Quit redis-cli
```

---

## Running Tests

### Unit Tests

```bash
# Run all unit tests
npm test

# Run specific test file
npm test -- tests/unit/authFunctions.test.js

# Watch mode (re-run on code changes)
npm test -- --watch

# Coverage report
npm test -- --coverage
```

**Expected Coverage:**
```
Statements   : 85%+ 
Branches     : 80%+
Functions    : 85%+
Lines        : 85%+
```

### Integration Tests

```bash
# Run integration tests
npm run test:integration

# Run specific integration test
npm run test:integration -- tests/integration/session.test.js

# Watch mode
npm run test:integration -- --watch
```

**Prerequisites for Integration Tests:**
- Docker containers must be running
- Database must be initialized
- Redis must be accessible

### E2E Tests (Frontend)

```bash
# Run E2E tests
npm run test:e2e

# Run in headed mode (see browser)
npm run test:e2e -- --headed

# Run specific test file
npm run test:e2e -- frontend/e2e/landing.spec.js

# Debug mode
npm run test:e2e -- --debug
```

**Prerequisites for E2E Tests:**
- Frontend must be running on port 5173
- API must be running on port 3000
- Browser (Chrome) installed

### Test Coverage Targets

```bash
# Generate HTML coverage report
npm test -- --coverage --coverageReporters=html

# View report
open coverage/index.html  # macOS
# or
xdg-open coverage/index.html  # Linux
```

---

## Database Management

### Initial Data Seeding

```bash
# Database is automatically seeded on first run with:
# - schema.sql (tables and indexes)
# - seed.sql (sample data)
# - migration_phase1.sql (schema updates)
# - migration_phase2.sql (more schema updates)

# Verify seed data
docker exec cafe_db psql -U cafe_user -d cafe_payment -c "SELECT COUNT(*) FROM users;"
```

### Reset Database (Development)

```bash
# ⚠️ WARNING: This deletes all data
docker compose down -v
docker compose up -d

# Containers will restart and re-seed
sleep 15
./database/health-check.sh
```

### Backup Database

```bash
# Create manual backup
./database/backup.sh

# Check backup
ls -lh ./.backups/

# View backup contents (do not extract!)
file ./.backups/cafe_db_backup_*.sql
```

### Restore from Backup

```bash
# List available backups
ls -lh ./.backups/cafe_db_backup_*.sql

# Restore from specific backup
./database/restore.sh ./.backups/cafe_db_backup_20260419_143000.sql

# When prompted, type: yes
```

---

## Troubleshooting

### "Port 3000 already in use"

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change port in docker-compose.yml
# Change: "3000:3000" to "3001:3000"
```

### "Cannot connect to PostgreSQL"

```bash
# Check if database container is healthy
docker compose ps

# If not healthy, check logs
docker compose logs postgres

# Restart database
docker compose restart postgres
sleep 5
./database/health-check.sh
```

### "Redis connection refused"

```bash
# Check Redis container
docker compose ps redis

# Verify Redis is accepting connections
docker exec cafe_redis redis-cli PING
# Should output: PONG

# If not, restart Redis
docker compose restart redis
```

### "API server not responding"

```bash
# Check if API container is running
docker compose ps api

# View API logs
docker compose logs api

# Restart API
docker compose restart api

# Test health endpoint
curl http://localhost:3000/health
```

### "Tests timeout or fail"

```bash
# Ensure all containers are healthy
./database/health-check.sh

# Clear node modules and reinstall
rm -rf node_modules
npm install

# Run tests with extended timeout
npm test -- --testTimeout=10000
```

### "Database won't initialize"

```bash
# Check database logs
docker compose logs postgres

# Full reset (⚠️ deletes all data)
docker compose down -v
docker compose up -d

# Wait for initialization
sleep 30

# Verify
./database/health-check.sh
```

### "Docker out of disk space"

```bash
# Check Docker disk usage
docker system df

# Clean up unused resources
docker system prune -a

# Remove all containers, networks, images, build cache
# ⚠️ WARNING: This will delete all local Docker data
docker system prune -a --volumes
```

### "npm install fails with permission errors"

```bash
# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# If still failing, check file permissions
ls -la node_modules
```

---

## Environment-Specific Configuration

### Development (Default)

```env
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_URL=postgresql://cafe_user:cafe_secret_2024@postgres:5432/cafe_payment
```

### Staging (Pre-Production Testing)

Create `.env.staging`:
```env
NODE_ENV=staging
LOG_LEVEL=info
DATABASE_URL=postgresql://cafe_user:${POSTGRES_PASSWORD}@staging-db:5432/cafe_payment
JWT_SECRET=${STAGING_JWT_SECRET}
```

### Production (Deployment)

Create `.env.production`:
```env
NODE_ENV=production
LOG_LEVEL=warn
DATABASE_URL=postgresql://cafe_user:${PROD_DB_PASSWORD}@prod-db:5432/cafe_payment
JWT_SECRET=${PROD_JWT_SECRET}
FRONTEND_URL=https://cafe.example.com
```

**Security Checklist for Production:**
- [ ] All secrets are in environment variables (not in code)
- [ ] `.env` file is NOT in git
- [ ] Secrets are stored in secure secret manager
- [ ] JWT_SECRET is 32+ random characters
- [ ] Database password is strong and unique

---

## Common Tasks

### Add New Environment Variable

```bash
# 1. Add to .env.example
echo "NEW_VAR=default_value" >> .env.example

# 2. Add to .env
echo "NEW_VAR=actual_value" >> .env

# 3. Update docker-compose.yml (if needed)
# Add to service environment section:
# - NEW_VAR=${NEW_VAR}

# 4. Use in code
process.env.NEW_VAR
```

### Update Dependencies

```bash
# Check for outdated packages
npm outdated

# Update all packages
npm update

# Update major version of specific package
npm install package-name@latest

# After updating, run tests
npm test
npm run test:integration
```

### Clean Build (Fresh Start)

```bash
# Stop all containers
docker compose down

# Remove volumes (⚠️ deletes data)
docker compose down -v

# Remove node modules
rm -rf node_modules

# Clear Docker cache
docker system prune -a

# Rebuild everything
npm install
docker compose build --no-cache
docker compose up -d

# Verify
./database/health-check.sh
```

### Generate Test Data

```bash
# Database comes pre-seeded with sample data
# To add more data, use admin API:

# 1. Login as owner
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"owner","password":"owner_password"}'

# 2. Create new staff member
TOKEN="<jwt_token_from_login>"
curl -X POST http://localhost:3000/api/admin/staff \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username":"waiter1",
    "password":"secure_password",
    "role":"waiter",
    "fullName":"John Doe"
  }'
```

---

## Monitoring Development Environment

### View Logs (All Containers)

```bash
# View all logs
docker compose logs

# View logs for specific service
docker compose logs api
docker compose logs postgres

# Follow logs in real-time
docker compose logs -f api

# Last 50 lines
docker compose logs --tail=50 api

# Logs for specific time period
docker compose logs --since 10m api
```

### Monitor Container Resources

```bash
# Real-time resource usage
docker stats

# Kill excessive CPU usage
docker top cafe_api
```

### Database Monitoring

```bash
# Active connections
docker exec cafe_db psql -U cafe_user -d cafe_payment \
  -c "SELECT usename, application_name, state FROM pg_stat_activity;"

# Table sizes
docker exec cafe_db psql -U cafe_user -d cafe_payment \
  -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) \
      FROM pg_tables ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

---

## IDE Setup (VS Code)

### Recommended Extensions

1. **REST Client** - Test API directly in editor
2. **Docker** - Manage containers from sidebar
3. **PostgreSQL** - Direct database connection
4. **ESLint** - JavaScript linting
5. **Prettier** - Code formatting
6. **Jest Runner** - Run tests from editor
7. **Playwright Test for VSCode** - Run E2E tests from editor

### Workspace Settings

Create `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.exclude": {
    "node_modules": true,
    ".jest_cache": true,
    "dist": true
  },
  "search.exclude": {
    "node_modules": true,
    ".jest_cache": true,
    "dist": true
  }
}
```

---

## Next Steps

After successful installation:

1. **Review API Documentation** → Read [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
2. **Test API Endpoints** → Use Postman/Insomnia or REST Client
3. **Run Tests** → `npm test && npm run test:integration`
4. **Create Your First Endpoint** → Follow backend development workflow
5. **Check Database Schema** → `docker exec cafe_db psql -U cafe_user -d cafe_payment -c "\dt"`

---

## Getting Help

### Common Resources

- **API Documentation** → [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- **Backup & Recovery** → [BACKUP_STRATEGY.md](./BACKUP_STRATEGY.md)
- **Deployment Guide** → [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
- **Backup Setup** → [BACKUP_SETUP_GUIDE.md](./BACKUP_SETUP_GUIDE.md)

### Debugging Tips

```bash
# Complete system diagnosis
./database/health-check.sh

# Check all running processes
docker compose ps

# View all logs
docker compose logs

# Test critical endpoints
curl http://localhost:3000/health
docker exec cafe_db psql -U cafe_user -d cafe_payment -c "SELECT 1;"
docker exec cafe_redis redis-cli PING
```

### Support Checklist

Before asking for help:
- [ ] Run `./database/health-check.sh` and provide output
- [ ] Provide `docker compose ps` output
- [ ] Provide relevant logs from `docker compose logs service_name`
- [ ] Confirm you've tried the troubleshooting steps above
- [ ] Confirm all prerequisites are installed and correct versions

---

## Version Information

Current setup uses:

| Component | Version | Image |
|-----------|---------|-------|
| Node.js | 18+ | node:18-alpine (in Dockerfile.api) |
| PostgreSQL | 16 | postgres:16-alpine |
| Redis | 7 | redis:7-alpine |
| npm | 8+ | Bundled with Node.js |

For version upgrades, update corresponding sections in:
- `Dockerfile.api` (Node.js base image)
- `docker-compose.yml` (PostgreSQL and Redis images)
- `package.json` (npm dependencies)

---

For more information, see:
- [README.md](./README.md) - Project overview
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - API reference
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - Production deployment
