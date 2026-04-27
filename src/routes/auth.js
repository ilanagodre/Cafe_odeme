const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const logger = require('../config/logger');
const { validate } = require('../middleware/validation');
const { loginLimiter } = require('../middleware/rateLimiting');
const { logAuditEvent } = require('../middleware/logging');

// ─── Validate JWT_SECRET is set ──────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Cannot start server.');
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

// ─── LOGIN (PIN based) ──────────────────────────────────
router.post('/auth/login', loginLimiter, validate('login'), async (req, res) => {
  const { pin } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE is_active = true AND role IN ($1, $2, $3)',
      ['waiter', 'head_waiter', 'owner']
    );

    let user = null;
    for (const row of result.rows) {
      const valid = await bcrypt.compare(pin, row.pin_hash);
      if (valid) {
        user = row;
        break;
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'PIN hatalı' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Update last_login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Audit log successful login
    logAuditEvent(user.id, 'user_login', 'user', user.id, { role: user.role });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      }
    });
  } catch (err) {
    console.error('[ERR] Auth login:', err);
    res.status(500).json({ error: 'Giriş başarısız' });
  }
});

// ─── VERIFY TOKEN ───────────────────────────────────────
router.get('/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token required' });

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const result = await pool.query(
      'SELECT id, name, role, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ─── AUTH MIDDLEWARE ────────────────────────────────────
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    }
    next();
  };
}

// ─── ROLE HIERARCHY ─────────────────────────────────────
// owner > head_waiter > waiter
function hasPermission(userRole, requiredRole) {
  const hierarchy = { waiter: 1, head_waiter: 2, owner: 3 };
  return (hierarchy[userRole] || 0) >= (hierarchy[requiredRole] || 999);
}

module.exports = { router, requireAuth, requireRole, hasPermission, JWT_SECRET };
