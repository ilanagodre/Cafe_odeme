const rateLimit = require('express-rate-limit');

// ─── Rate Limiting Strategies ──────────────────────────

// Strict rate limit for login (prevent PIN brute-forcing)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 attempts per 15 minutes
  message: 'Çok fazla başarısız giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin.',
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  skipSuccessfulRequests: false, // Count successful requests too
  keyGenerator: (req, res) => {
    // Rate limit by IP address
    return req.ip || req.connection.remoteAddress;
  }
});

// General API rate limit (prevent DoS)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Max 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.ip || req.connection.remoteAddress;
  }
});

module.exports = { loginLimiter, apiLimiter };
