# Cafe Payment System - Deployment Guide

**Version:** 1.0  
**Last Updated:** 2026-04-19  
**Status:** MVP Ready for Production with Security Hardening

---

## Quick Start (Development)

```bash
# 1. Clone and setup
git clone <repo>
cd Cafe_odeme

# 2. Create environment file
cp .env.example .env

# 3. Start all services
docker compose up -d

# 4. Access services
- Admin Panel: http://localhost:5173
- Customer Page: http://localhost:5173
- API: http://localhost:3000
- WebSocket: ws://localhost:3000 (built-in to API)
```

**Default credentials:**
- PIN: 1234 (Owner - Patron)
- Waiter PIN: 1234 (Mehmet, Elif)
- Head Waiter PIN: 1234 (Ahmet)

---

## Environment Configuration

### Development (.env.example)

```env
# API Configuration
NODE_ENV=development
API_PORT=3000
FRONTEND_URL=http://localhost:5173

# JWT Security
JWT_SECRET=dev-secret-change-in-prod
JWT_EXPIRES_IN=12h

# Database
POSTGRES_DB=cafe_payment
POSTGRES_USER=cafe_user
POSTGRES_PASSWORD=cafe_secret_2024
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# Redis
REDIS_URL=redis://redis:6379

# Logging
LOG_LEVEL=info
```

### Production (.env.prod)

```env
# API Configuration
NODE_ENV=production
API_PORT=3000
FRONTEND_URL=https://yourdomain.com

# JWT Security (MUST change this!)
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=12h

# Database (Use strong password!)
POSTGRES_DB=cafe_payment_prod
POSTGRES_USER=cafe_app
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_HOST=postgres.internal
POSTGRES_PORT=5432

# Redis (Use Redis authentication in prod)
REDIS_URL=redis://:PASSWORD@redis.internal:6379

# Logging
LOG_LEVEL=error
```

---

## Docker Deployment

### Services Overview

| Service | Port | Health Check | Role |
|---------|------|--------------|------|
| API | 3000 | `GET /health` | Express server + WebSocket |
| Frontend | 5173 | HTTP 200 | Vite dev server (development) |
| PostgreSQL | 5432 | Connection test | Primary database |
| Redis | 6379 | PING response | Session/WebSocket broker |

### Docker Compose Files

**Production Override** (`docker-compose.prod.yml`):
```yaml
version: '3.8'
services:
  api:
    environment:
      - NODE_ENV=production
    restart: always
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G

  frontend:
    build:
      target: production  # Use production build
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G

  postgres:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

### Starting Services

**Development:**
```bash
docker compose up -d
docker compose logs -f api
```

**Production:**
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose exec api npm run migrate
docker compose ps
```

**Stopping:**
```bash
docker compose down
docker compose down -v  # Also remove volumes
```

---

## Database Setup

### Initial Setup (Automatic)

On first `docker compose up`, the database automatically runs:
1. `database/schema.sql` - Creates tables
2. `database/seed.sql` - Adds demo data
3. `database/migration_phase1.sql` - Creates users and functions

### Manual Migration

```bash
# Connect to database
docker exec cafe_db psql -U cafe_user -d cafe_payment -f migration.sql

# Verify schema
docker exec cafe_db psql -U cafe_user -d cafe_payment -c "\dt"
```

### Backup & Recovery

**Create Backup:**
```bash
docker exec cafe_db pg_dump -U cafe_user -d cafe_payment > backup.sql
```

**Restore from Backup:**
```bash
docker exec -i cafe_db psql -U cafe_user -d cafe_payment < backup.sql
```

---

## API Endpoints

### Authentication
- `POST /api/auth/login` - Staff login with PIN
- Response: JWT token (expires in 12h)

### Admin Panel (Protected)
- `GET /api/admin/tables` - List all tables with active sessions
- `POST /api/admin/tables/:tableId/participant` - **Add customer to table** (waiter order flow)
- `POST /api/admin/staff` - Create staff member (owner only)
- `PATCH /api/admin/staff/:id/role` - Update staff role (owner only)
- `GET /api/admin/dashboard` - Dashboard data (owner/head_waiter)
- `GET /api/admin/menu` - Menu items
- `POST /api/admin/orders/:orderId/status` - Update order status
- `POST /api/admin/tables/:sessionId/close` - Close session

### Customer (Public)
- `POST /api/session/join` - Join session with QR code
- `GET /api/menu` - Get menu items
- `POST /api/order` - Place order
- `GET /api/orders/:sessionToken` - Get session orders
- `POST /api/payment` - Process payment (full or split)
- `GET /api/payment/summary/:sessionToken` - Payment summary

### Health Check
- `GET /health` - API health status

---

## Monitoring & Health Checks

### Health Endpoint Response

```json
{
  "status": "healthy",
  "timestamp": "2026-04-19T12:00:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "websocket": "ready"
  }
}
```

### Docker Health Check

```bash
# Check container health
docker compose ps

# View logs
docker compose logs api
docker compose logs postgres
docker compose logs redis
```

### Manual Health Check

```bash
# API Health
curl http://localhost:3000/health

# Database Connection
docker exec cafe_db psql -U cafe_user -d cafe_payment -c "SELECT 1"

# Redis Connection
docker exec cafe_redis redis-cli ping
```

---

## Security Hardening for Production

### REQUIRED Before Production Deployment

1. **JWT Secret** (CRITICAL)
   ```bash
   JWT_SECRET=$(openssl rand -hex 32)
   # Save to .env - DO NOT commit
   ```

2. **Database Password** (CRITICAL)
   ```bash
   POSTGRES_PASSWORD=$(openssl rand -hex 16)
   # Save to .env - DO NOT commit
   ```

3. **HTTPS/TLS Setup** (CRITICAL)
   - Use reverse proxy (nginx/Apache)
   - Install SSL certificate (Let's Encrypt)
   - Force HTTPS redirect

4. **Rate Limiting** (CRITICAL)
   - Already implemented for `/api/auth/login`
   - Protects against brute force attacks

5. **Security Headers** (HIGH)
   ```
   X-Content-Type-Options: nosniff
   X-Frame-Options: DENY
   Content-Security-Policy: default-src 'self'
   Strict-Transport-Security: max-age=31536000
   ```
   *(Implement via nginx or helmet.js)*

6. **Input Validation** (HIGH)
   - All endpoints validate request data
   - Joi schema validation on POST/PATCH endpoints

### Recommended for Production

- [ ] Enable database encryption at rest
- [ ] Setup automated backups (daily)
- [ ] Configure error logging (Sentry, LogRocket)
- [ ] Setup monitoring (Prometheus, Grafana)
- [ ] Enable WebSocket TLS (WSS protocol)
- [ ] Configure CORS for production domain
- [ ] Setup API rate limiting beyond auth
- [ ] Implement request logging/audit trail
- [ ] Configure CI/CD pipeline
- [ ] Setup load balancing
- [ ] Database connection pooling (already done: 10 connections)

---

## Reverse Proxy Setup (nginx)

### Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # API Proxy
    location /api/ {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://api:3000/socket.io;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }

    # Frontend
    location / {
        proxy_pass http://frontend:5173;
        proxy_set_header Host $host;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Troubleshooting

### API Won't Start

```bash
# Check logs
docker compose logs api

# Common issues:
# 1. PORT 3000 already in use
lsof -i :3000

# 2. Database not ready (wait 5-10 seconds)
docker compose logs postgres

# 3. Redis connection issues
docker compose logs redis
```

### Database Connection Failed

```bash
# Check database is running
docker compose logs postgres

# Check connection
docker exec cafe_db psql -U cafe_user -d cafe_payment -c "SELECT version();"

# Reset database
docker compose down -v
docker compose up postgres
```

### WebSocket Not Connecting

```bash
# Check Redis connection
docker exec cafe_redis redis-cli ping
# Should respond: PONG

# Check logs for WebSocket errors
docker compose logs api | grep -i "websocket\|socket"
```

### Performance Issues

```bash
# Check resource usage
docker stats

# Check database slow queries
docker exec cafe_db psql -U cafe_user -d cafe_payment \
  -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Check database connections
docker exec cafe_db psql -U cafe_user -d cafe_payment \
  -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"
```

---

## Scaling & Load Balancing

For production deployment with multiple API instances:

1. **Add Load Balancer** (nginx/HAProxy)
2. **Scale API Service**
   ```bash
   docker compose up -d --scale api=3
   ```
3. **Use Redis for Session Sharing** (already configured)
4. **Configure Sticky Sessions** (if using WebSocket)
5. **Add Database Read Replicas** (PostgreSQL replication)

---

## Maintenance

### Regular Tasks

- **Weekly:** Check logs for errors
- **Monthly:** Review security logs
- **Quarterly:** Run backups test
- **Annually:** Update dependencies, SSL certificates

### Update Process

```bash
# 1. Pull latest code
git pull

# 2. Rebuild containers
docker compose down
docker compose build

# 3. Start with migration (if needed)
docker compose up postgres
# Wait for DB to be ready
docker compose up -d

# 4. Run any migrations
docker compose exec api npm run migrate

# 5. Verify
docker compose logs api
curl http://localhost:3000/health
```

---

## Checklist Before Going Live

- [ ] JWT_SECRET set to strong random value
- [ ] POSTGRES_PASSWORD set to strong random value
- [ ] HTTPS/TLS configured and working
- [ ] Database backup strategy implemented
- [ ] Error logging/monitoring configured
- [ ] Rate limiting tested and working
- [ ] All endpoints tested in production environment
- [ ] Security headers configured
- [ ] CORS configured for production domain
- [ ] Firewall rules configured
- [ ] Database access restricted to application only
- [ ] Monitoring and alerting setup
- [ ] Team training on incident response
- [ ] Disaster recovery plan documented
- [ ] Performance tested under load

---

## Support & Documentation

- API Documentation: `API.md`
- Security Guidelines: `SECURITY.md`
- Development Setup: `README.md`
- Architecture: `ARCHITECTURE.md`
- Testing: `TESTING.md`

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-19 | 1.0 | Initial deployment guide with waiter order module, security requirements, and scaling guidelines |

---

**Last Reviewed:** 2026-04-19  
**Next Review:** 2026-07-19
