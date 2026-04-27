# Security Guidelines & Checklist

**Version:** 1.1  
**Last Updated:** 2026-04-27  
**Status:** Production-Ready Security Model

---

## Executive Summary

This document outlines the security architecture, implemented protections, and required hardening steps for the Cafe Payment system. The application is MVP-ready for controlled testing but requires additional hardening before public production deployment.

### Security Status

- ✅ **Core protections implemented:** Authentication, authorization, encryption
- ✅ **Hardening complete:** Security headers (helmet), rate limiting, audit logging, Sentry error tracking
- ⚠️ **Production config needed:** HTTPS/TLS, strong secrets, CORS domain
- 🔴 **Critical:** Change default secrets before any production use

---

## Authentication & Authorization

### JWT Token Security

**Implementation:**

```javascript
const token = jwt.sign({ id, name, role }, process.env.JWT_SECRET, {
  expiresIn: "12h",
});
```

**Security Measures:**

- ✅ Tokens expire after 12 hours
- ✅ Random 32-byte secret required (use `openssl rand -hex 32`)
- ✅ Only valid tokens accepted (verified signature)
- ✅ Tokens include role-based permissions

**Risks & Mitigations:**
| Risk | Current Status | Mitigation |
|------|---|---|
| Weak secret | ✅ Mandatory env var, server fatal if missing | Set strong value: `openssl rand -hex 32` |
| Token hijacking | ✅ HTTPS required | Enable HTTPS/TLS in production |
| Long expiration | ✅ 12h is reasonable | Review if needed |
| Token replay | ⚠️ No replay protection | Add nonce/jti if handling sensitive ops |

### Role-Based Access Control (RBAC)

**Roles:**

- `owner` - Full system access
- `head_waiter` - Dashboard, order management
- `waiter` - Order taking, table operations
- (No role) - Limited to public endpoints

**Implementation:**

```javascript
router.get("/dashboard", requireRole("owner", "head_waiter"), handler);
```

**Protected Endpoints:**
| Endpoint | Required Role | Protection Level |
|----------|--------------|-----------------|
| POST `/api/admin/staff` | owner | ✅ |
| POST `/api/admin/tables/:id/participant` | owner, head_waiter, waiter | ✅ |
| POST `/api/order` | waiter (via sessionToken) | ✅ |
| GET `/api/admin/dashboard` | owner, head_waiter | ✅ |
| POST `/api/menu` | owner | ✅ |

---

## Data Security

### Database Protection

**Connection Security:**

```javascript
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 10, // Connection pooling
});
```

**SQL Injection Prevention:**

- ✅ **Parameterized queries used throughout**

  ```javascript
  // GOOD - Safe from SQL injection
  pool.query("SELECT * FROM users WHERE id = $1", [userId]);

  // BAD - Vulnerable (NOT USED in codebase)
  pool.query(`SELECT * FROM users WHERE id = ${userId}`);
  ```

**Password Hashing:**

- ✅ **bcrypt with 10 salt rounds**
  ```javascript
  const hash = await bcrypt.hash(pin, 10);
  const valid = await bcrypt.compare(pin, hash);
  ```

**Database Access Control:**

- ⚠️ Database user has full privileges
- 🟡 Recommendation: Create limited user roles per application needs

### Sensitive Data Handling

**Data Protected by Default:**
| Data Type | Storage | Protection |
|-----------|---------|-----------|
| PIN | hashed (bcrypt) | ✅ One-way hash |
| JWT Token | in-memory (client) | ✅ Short expiration |
| Session Token | database + Redis | ✅ Cryptographic hash |
| Payment Info | database | ⚠️ No encryption at rest |
| User IDs | database | ✅ UUID v4 |

**PII Handling:**

- Names: Stored plaintext (consider encryption if compliant with GDPR)
- Email: Stored plaintext (should be encrypted)
- Phone: Optional, stored plaintext
- Transactions: Logged for audit trail (good for compliance)

**Recommendations:**

```javascript
// Before production:
// 1. Enable PostgreSQL encryption at rest
// 2. Use application-level encryption for emails
// 3. Implement data retention policies
// 4. Add audit logging for data access
```

---

## API Security

### Input Validation

**Current Implementation:**

- ✅ Joi schema validation on all POST/PATCH endpoints
- ✅ Validation middleware enforces schema before handler

**Example Validation:**

```javascript
const schemas = {
  staffAdd: joi.object({
    name: joi.string().min(1).max(100).required(),
    role: joi.string().valid("waiter", "head_waiter").required(),
    pin: joi
      .string()
      .pattern(/^\d{4,6}$/)
      .required(), // 4-6 digits
  }),
};

router.post("/staff", validate("staffAdd"), handler);
```

**Validated Endpoints:**
| Endpoint | Validation | Status |
|----------|-----------|--------|
| POST /api/admin/staff | name, role, pin | ✅ |
| POST /api/admin/tables/:id/participant | participantName | ✅ |
| POST /api/order | itemName, quantity, price | ✅ |
| POST /api/payment | amount, method | ✅ |
| POST /api/auth/login | pin (digits only) | ✅ |

**Gaps:**

- ⚠️ Frontend validation needed (client-side)
- ⚠️ Email format validation
- ⚠️ Phone number format validation

### Rate Limiting

**Implemented:**

- ✅ Login endpoint: 5 attempts per 15 minutes per IP
  ```javascript
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "Too many login attempts",
  });
  ```

**Recommendation: Extend to other endpoints**

```javascript
// Add to other sensitive endpoints:
router.post("/api/order", orderLimiter, handler); // 100/hour
router.post("/api/payment", paymentLimiter, handler); // 50/hour
```

### CORS Configuration

**Current:**

```javascript
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);
```

**Status:** ✅ Properly configured for development
**For Production:**

```env
FRONTEND_URL=https://yourdomain.com
```

---

## Transport Security

### HTTPS/TLS (Critical for Production)

**Current Status:** 🔴 HTTP only (development)

**Required for Production:**

1. Obtain SSL certificate

   ```bash
   # Option 1: Let's Encrypt (free)
   certbot certonly --standalone -d yourdomain.com

   # Option 2: Cloud provider (AWS ACM, Azure KeyVault)
   ```

2. Configure HTTPS

   ```javascript
   const https = require("https");
   const fs = require("fs");

   const options = {
     key: fs.readFileSync("/path/to/key.pem"),
     cert: fs.readFileSync("/path/to/cert.pem"),
   };

   https.createServer(options, app).listen(443);
   ```

3. Redirect HTTP to HTTPS
   ```javascript
   app.use((req, res, next) => {
     if (!req.secure && process.env.NODE_ENV === "production") {
       return res.redirect(`https://${req.headers.host}${req.url}`);
     }
     next();
   });
   ```

### WebSocket Security

**Current:** ✅ WebSocket over HTTP (development)

**For Production:**

- 🔴 Must use WSS (WebSocket Secure over TLS)
- 🔴 Must validate origin headers
- 🔴 Must validate session tokens

**Implementation:**

```javascript
// Validate WebSocket connections
io.on("connection", (socket) => {
  const token = socket.handshake.auth.token;
  if (!validateToken(token)) {
    socket.disconnect(true);
  }
});
```

---

## Security Headers

### Security Headers Status

`helmet()` middleware `server.js`'de aktif — tüm standart güvenlik başlıkları otomatik ekleniyor.

```javascript
app.use(helmet()); // server.js:27 — aktif ✅
```

### Headers Status

| Header                    | Purpose         | Current   | Action           |
| ------------------------- | --------------- | --------- | ---------------- |
| Content-Security-Policy   | XSS protection  | ✅ helmet | -                |
| X-Frame-Options           | Clickjacking    | ✅ helmet | -                |
| X-Content-Type-Options    | MIME sniffing   | ✅ helmet | -                |
| Strict-Transport-Security | Force HTTPS     | ✅ helmet | HTTPS gerektirir |
| Referrer-Policy           | Info disclosure | ✅ helmet | -                |

---

## Audit & Logging

### Current Audit Trail

**Implemented:**

- ✅ Staff login events logged
- ✅ Order creation logged
- ✅ Payment events logged
- ✅ Request logging aktif — tüm API istekleri Winston ile loglanıyor (`middleware/logging.js`)
- ✅ Access logging aktif — IP, method, path, duration, statusCode
- ✅ Sentry error tracking entegre — `SENTRY_DSN` env var ile aktif olur

### Audit Log Schema

```javascript
INSERT INTO audit_logs (
  user_id,         // WHO
  action,          // WHAT (login, create_order, etc)
  entity_type,     // WHAT TYPE (order, payment, etc)
  entity_id,       // WHICH RESOURCE
  details          // ADDITIONAL CONTEXT
) VALUES ($1, $2, $3, $4, $5)
```

### Recommendations for Production

```javascript
// 1. Log all API requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    user: req.user?.id,
    timestamp: new Date().toISOString(),
  });
  next();
});

// 2. Log errors with context
app.use((err, req, res, next) => {
  logger.error("Unhandled error", {
    message: err.message,
    stack: err.stack,
    request: { method: req.method, path: req.path },
  });
  res.status(500).json({ error: "Internal server error" });
});

// 3. Send logs to external service
// - Sentry (error tracking)
// - LogRocket (session recording - optional)
// - ELK Stack (log aggregation)
// - CloudWatch (AWS)
```

---

## Error Handling

### Current Error Messages

**Good:**

- ✅ Generic messages for authentication failures
- ✅ Role-based access denied messages
- ✅ Validation error details shown (helps debugging)

**Risks:**

- ⚠️ Detailed error messages in production
- ⚠️ Stack traces exposed to clients
- ⚠️ SQL errors shown (info disclosure)

### Production Error Handling

```javascript
if (process.env.NODE_ENV === "production") {
  // Hide technical details
  if (err.code === "ECONNREFUSED") {
    return res.status(500).json({ error: "Service unavailable" });
  }

  // Log full details server-side
  logger.error(err, { request: req });

  // Return generic error to client
  res.status(500).json({ error: "An error occurred" });
}
```

---

## Compliance & Standards

### OWASP Top 10 Checklist

| Risk                           | Status | Details                                             |
| ------------------------------ | ------ | --------------------------------------------------- |
| A01: Broken Access Control     | ⚠️     | Roles implemented, but missing field-level controls |
| A02: Cryptographic Failures    | ⚠️     | Hashing OK, but no encryption at rest               |
| A03: Injection                 | ✅     | Parameterized queries used                          |
| A04: Insecure Design           | ⚠️     | Auth secure, but missing threat modeling            |
| A05: Security Misconfiguration | ⚠️     | Secrets need to be externalized                     |
| A06: Vulnerable Components     | ✅     | Dependencies managed via npm                        |
| A07: Authentication            | ⚠️     | JWT OK, but needs HTTPS                             |
| A08: Data Integrity            | ⚠️     | No request signing/verification                     |
| A09: Logging & Monitoring      | ⚠️     | Logs implemented, but not aggregated                |
| A10: SSRF                      | ✅     | No external requests made                           |

### GDPR Compliance (If applicable)

**Required Actions:**

- [ ] Privacy policy published
- [ ] Consent management for data collection
- [ ] Data retention policies defined
- [ ] Right to be forgotten implemented
- [ ] Data breach notification process
- [ ] Data Protection Impact Assessment (DPIA)
- [ ] Vendor agreement (if using cloud services)

---

## Incident Response

### Security Incident Checklist

**If compromise detected:**

1. ☐ Isolate affected systems
2. ☐ Enable detailed logging
3. ☐ Review audit logs
4. ☐ Identify scope of breach
5. ☐ Notify affected users (GDPR requirement)
6. ☐ Change all secrets/credentials
7. ☐ Apply security patches
8. ☐ Update security documentation
9. ☐ Post-mortem analysis

### Key Contacts

- Security Team: security@yourdomain.com
- Legal: legal@yourdomain.com
- Operations: ops@yourdomain.com

---

## Testing Security

### Security Testing Checklist

```bash
# 1. Dependency audit
npm audit

# 2. OWASP Top 10 testing
npm install -g owasp-dep-check
dependency-check --project "Cafe Payment" --scan .

# 3. SAST (Static Application Security Testing)
npm install -g sonarqube-scanner
sonar-scanner

# 4. Manual penetration testing
- SQL injection attempts
- CSRF attacks
- XSS payloads
- Broken authentication
- Privilege escalation

# 5. Load testing
npm install -g artillery
artillery run load-test.yml
```

### Recommended Tools

| Tool       | Purpose                 | Type    |
| ---------- | ----------------------- | ------- |
| OWASP ZAP  | Web app scanning        | Dynamic |
| Burp Suite | Penetration testing     | Dynamic |
| Snyk       | Dependency scanning     | Static  |
| SonarQube  | Code quality + security | Static  |
| Sentry     | Error tracking          | Runtime |

---

## Secrets Management

### DO NOT

- ❌ Commit .env files to git
- ❌ Log secrets (API keys, passwords)
- ❌ Hardcode secrets in code
- ❌ Send secrets in URLs or parameters
- ❌ Store secrets in browser localStorage

### DO

- ✅ Use environment variables
- ✅ Rotate secrets regularly
- ✅ Use strong random secrets (32+ bytes)
- ✅ Restrict secret access (principle of least privilege)
- ✅ Use secret vaults (HashiCorp Vault, AWS Secrets Manager)
- ✅ Enable secret scanning in git

### Git Protection

```bash
# Add to .gitignore
.env
.env.local
.env.*.local
*.key
*.pem

# Enable secret scanning
git config core.hooksPath .githooks
echo "npm audit" > .githooks/pre-push
```

---

## Production Deployment Checklist

### Pre-Deployment Security Review

- [ ] JWT_SECRET set to strong value (32+ bytes) — `openssl rand -hex 32`
- [ ] POSTGRES_PASSWORD set to strong value (16+ bytes)
- [ ] HTTPS/TLS certificate valid and installed
- [ ] All secrets in environment variables (not git)
- [x] Security headers configured — helmet.js aktif ✅
- [ ] CORS origin set to production domain only
- [x] Rate limiting configured — login 5/15dk, API 100/dk ✅
- [x] Error handling doesn't expose technical details — production'da generic mesaj ✅
- [x] Request logging enabled — Winston aktif ✅
- [x] Error tracking enabled — Sentry entegre (SENTRY_DSN ile aktif olur) ✅
- [ ] Database backups automated and tested
- [ ] Incident response plan documented
- [ ] Team trained on security practices
- [ ] Security audit completed (internal or third-party)
- [ ] Dependency vulnerabilities resolved
- [ ] OWASP checklist reviewed

### Post-Deployment Monitoring

- [ ] Monitor error logs for anomalies
- [ ] Review access logs for suspicious activity
- [ ] Check failed login attempts
- [ ] Monitor database connections
- [ ] Watch for unusual API usage patterns
- [ ] Review WebSocket connections
- [ ] Monitor system resources

---

## Additional Resources

- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)
- [Node.js Security Checklist](https://checklist.owasp.org/en/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework/)

---

## Document History

| Date       | Version | Changes                                                                                          |
| ---------- | ------- | ------------------------------------------------------------------------------------------------ |
| 2026-04-27 | 1.1     | Full audit: helmet aktif, JWT_SECRET zorunlu, Sentry entegre, docker-compose credentials düzeldi |
| 2026-04-19 | 1.0     | Initial security guidelines for MVP                                                              |

---

**Last Reviewed:** 2026-04-27  
**Next Review:** 2026-07-19  
**Owner:** Security Team
