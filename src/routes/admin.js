const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcrypt');
const logger = require('../config/logger');
const { validate } = require('../middleware/validation');
const { requireAuth, requireRole } = require('./auth');

// All admin routes under /api/admin require auth
router.use('/staff', requireAuth);
router.use('/dashboard', requireAuth);
router.use('/tables', requireAuth);
router.use('/orders', requireAuth);
router.use('/reports', requireAuth);
router.use('/audit-logs', requireAuth);
router.use('/menu', (req, res, next) => {
  if (req.method === 'GET') return next(); // Public for menu viewing
  requireAuth(req, res, next);
});

// ─── LIST STAFF (owner + head_waiter) ──────────────────
router.get('/staff', requireRole('owner', 'head_waiter'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, role, is_active, last_login, created_at FROM users WHERE role IN ($1, $2, $3) ORDER BY role, name',
      ['owner', 'head_waiter', 'waiter']
    );
    res.json({ staff: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

// ─── ADD STAFF (owner only) ─────────────────────────────
router.post('/staff', requireRole('owner'), validate('staffAdd'), async (req, res) => {
  const { name, role, pin } = req.body;

  try {
    const pinHash = await bcrypt.hash(pin, 10);

    const result = await pool.query(
      'INSERT INTO users (name, role, pin_hash, is_active) VALUES ($1, $2, $3, true) RETURNING id, name, role',
      [name, role, pinHash]
    );

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, 'staff_added', 'user', $2)",
      [req.user.id, result.rows[0].id]
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add staff' });
  }
});

// ─── UPDATE ROLE (owner only) ───────────────────────────
router.patch('/staff/:id/role', requireRole('owner'), validate('staffUpdateRole'), async (req, res) => {
  const { role } = req.body;

  try {
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
    res.json({ message: 'Role updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// ─── TOGGLE ACTIVE (owner only) ─────────────────────────
router.patch('/staff/:id/active', requireRole('owner'), validate('staffToggleActive'), async (req, res) => {
  const { is_active } = req.body;

  try {
    await pool.query('UPDATE users SET is_active = $1 WHERE id = $2', [is_active, req.params.id]);
    res.json({ message: 'Status updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ─── RESET PIN (owner only) ─────────────────────────────
router.post('/staff/:id/reset-pin', requireRole('owner'), validate('staffResetPin'), async (req, res) => {
  const { newPin } = req.body;

  try {
    const pinHash = await bcrypt.hash(newPin, 10);
    await pool.query('UPDATE users SET pin_hash = $1 WHERE id = $2', [pinHash, req.params.id]);
    res.json({ message: 'PIN reset' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset PIN' });
  }
});

// ─── DASHBOARD STATS (head_waiter + owner) ──────────────
router.get('/dashboard', requireRole('owner', 'head_waiter'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [todayRevenue, activeTables, topItems, paymentMethods, recentSessions] = await Promise.all([
      // Today's revenue
      pool.query(`
        SELECT COALESCE(SUM(p.amount), 0) as total
        FROM payments p
        WHERE p.status = 'completed'
        AND DATE(p.created_at) = $1
      `, [today]),

      // Active tables
      pool.query(`
        SELECT t.id, t.table_number, ts.total_bill, ts.paid_amount,
               (SELECT get_remaining_balance(ts.id)) as remaining,
               (SELECT COUNT(*) FROM participants WHERE session_id = ts.id) as participant_count
        FROM table_sessions ts
        JOIN tables t ON ts.table_id = t.id
        WHERE ts.status = 'active'
        ORDER BY t.table_number
      `),

      // Top selling items today
      pool.query(`
        SELECT o.name, SUM(o.quantity) as total_qty, SUM(o.total_price) as total_revenue
        FROM orders o
        JOIN table_sessions ts ON o.session_id = ts.id
        WHERE o.status != 'cancelled'
        AND DATE(o.created_at) = $1
        GROUP BY o.name
        ORDER BY total_qty DESC
        LIMIT 5
      `, [today]),

      // Payment methods breakdown
      pool.query(`
        SELECT p.payment_type, COUNT(*) as count, SUM(p.amount) as total
        FROM payments p
        WHERE p.status = 'completed'
        AND DATE(p.created_at) = $1
        GROUP BY p.payment_type
      `, [today]),

      // Recently closed sessions
      pool.query(`
        SELECT ts.id, t.table_number, ts.session_number, ts.total_bill, ts.paid_amount, ts.closed_at
        FROM table_sessions ts
        JOIN tables t ON ts.table_id = t.id
        WHERE ts.status = 'closed'
        AND DATE(ts.closed_at) = $1
        ORDER BY ts.closed_at DESC
        LIMIT 10
      `, [today])
    ]);

    res.json({
      todayRevenue: parseFloat(todayRevenue.rows[0].total),
      activeTables: activeTables.rows,
      topItems: topItems.rows,
      paymentMethods: paymentMethods.rows,
      recentSessions: recentSessions.rows
    });
  } catch (err) {
    logger.error('[ERR] Dashboard:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// ─── REPORTS (owner + head_waiter) ─────────────────────
router.get('/reports', requireRole('owner', 'head_waiter'), async (req, res) => {
  const { period = 'daily' } = req.query;

  try {
    let dateFilter;
    const now = new Date();
    
    if (period === 'daily') {
      dateFilter = now.toISOString().split('T')[0];
    } else if (period === 'weekly') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      dateFilter = weekAgo.toISOString().split('T')[0];
    } else if (period === 'monthly') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      dateFilter = monthAgo.toISOString().split('T')[0];
    }

    const [revenue, topItems, paymentMethods, tableRevenue, hourlyBreakdown] = await Promise.all([
      // Revenue breakdown
      pool.query(`
        SELECT 
          DATE(p.created_at) as date,
          COUNT(DISTINCT p.session_id) as session_count,
          COUNT(p.id) as payment_count,
          SUM(p.amount) as total_revenue,
          AVG(p.amount) as avg_payment
        FROM payments p
        WHERE p.status = 'completed'
        AND DATE(p.created_at) >= $1
        GROUP BY DATE(p.created_at)
        ORDER BY date DESC
      `, [dateFilter]),

      // Top selling items
      pool.query(`
        SELECT o.name, 
               SUM(o.quantity) as total_qty, 
               SUM(o.total_price) as total_revenue,
               COUNT(DISTINCT o.session_id) as order_sessions
        FROM orders o
        WHERE o.status != 'cancelled'
        AND DATE(o.created_at) >= $1
        GROUP BY o.name
        ORDER BY total_qty DESC
        LIMIT 10
      `, [dateFilter]),

      // Payment methods breakdown
      pool.query(`
        SELECT p.payment_type, 
               COUNT(*) as count, 
               SUM(p.amount) as total,
               ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER() * 100, 1) as percentage
        FROM payments p
        WHERE p.status = 'completed'
        AND DATE(p.created_at) >= $1
        GROUP BY p.payment_type
        ORDER BY total DESC
      `, [dateFilter]),

      // Table revenue
      pool.query(`
        SELECT t.table_number,
               COUNT(DISTINCT ts.id) as session_count,
               SUM(ts.total_bill) as total_revenue,
               AVG(ts.total_bill) as avg_session_revenue,
               COUNT(DISTINCT CASE WHEN ts.status = 'closed' THEN ts.id END) as closed_sessions
        FROM tables t
        LEFT JOIN table_sessions ts ON t.id = ts.table_id
        WHERE ts.closed_at IS NULL OR DATE(ts.closed_at) >= $1
        GROUP BY t.table_number
        ORDER BY total_revenue DESC NULLS LAST
      `, [dateFilter]),

      // Hourly breakdown (for today)
      pool.query(`
        SELECT 
          EXTRACT(HOUR FROM p.created_at) as hour,
          COUNT(p.id) as payment_count,
          SUM(p.amount) as hourly_revenue
        FROM payments p
        WHERE p.status = 'completed'
        AND DATE(p.created_at) = CURRENT_DATE
        GROUP BY EXTRACT(HOUR FROM p.created_at)
        ORDER BY hour
      `)
    ]);

    res.json({
      revenue: revenue.rows,
      topItems: topItems.rows,
      paymentMethods: paymentMethods.rows,
      tableRevenue: tableRevenue.rows,
      hourlyBreakdown: hourlyBreakdown.rows,
      period
    });
  } catch (err) {
    logger.error('[ERR] Reports:', err);
    res.status(500).json({ error: 'Raporlar yüklenemedi' });
  }
});

// ============================================
// MENU MODULE
// ============================================

// ─── LIST MENU ITEMS (public) ────────────────────────────
router.get('/menu', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM menu_items 
      WHERE is_available = true
      ORDER BY category, name
    `);
    res.json({ items: result.rows });
  } catch (err) {
    logger.error('[ERR] Menu list:', err);
    res.status(500).json({ error: 'Menü yüklenemedi' });
  }
});

// ─── ADD MENU ITEM (owner only) ────────────────────────
router.post('/menu', requireRole('owner'), async (req, res) => {
  const { name, category, price, is_available } = req.body;

  if (!name || !category || price === undefined) {
    return res.status(400).json({ error: 'Name, category, and price required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO menu_items (name, category, price, is_available) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, category, parseFloat(price), is_available !== false]
    );

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, 'menu_item_added', 'menu_item', $2)",
      [req.user.id, result.rows[0].id]
    );

    res.json({ item: result.rows[0] });
  } catch (err) {
    logger.error('[ERR] Add menu item:', err);
    res.status(500).json({ error: 'Ürün eklenemedi' });
  }
});

// ─── UPDATE MENU ITEM (owner only) ─────────────────────
router.patch('/menu/:id', requireRole('owner'), async (req, res) => {
  const { id } = req.params;
  const { name, category, price, is_available } = req.body;

  try {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(category);
    }
    if (price !== undefined) {
      updates.push(`price = $${paramIndex++}`);
      values.push(parseFloat(price));
    }
    if (is_available !== undefined) {
      updates.push(`is_available = $${paramIndex++}`);
      values.push(is_available);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(id);
    await pool.query(`UPDATE menu_items SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, 'menu_item_updated', 'menu_item', $2)",
      [req.user.id, id]
    );

    res.json({ message: 'Ürün güncellendi' });
  } catch (err) {
    logger.error('[ERR] Update menu item:', err);
    res.status(500).json({ error: 'Ürün güncellenemedi' });
  }
});

// ─── DELETE MENU ITEM (owner only) ─────────────────────
router.delete('/menu/:id', requireRole('owner'), async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM menu_items WHERE id = $1', [id]);

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, 'menu_item_deleted', 'menu_item', $2)",
      [req.user.id, id]
    );

    res.json({ message: 'Ürün silindi' });
  } catch (err) {
    logger.error('[ERR] Delete menu item:', err);
    res.status(500).json({ error: 'Ürün silinemedi' });
  }
});

// ─── AUDIT LOG (owner) ──────────────────────────────────
router.get('/audit-logs', requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT al.id, al.action, al.entity_type, al.entity_id, 
             al.created_at, u.name as user_name, u.role as user_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 100
    `);
    res.json({ logs: result.rows });
  } catch (err) {
    logger.error('[ERR] Audit logs:', err);
    res.status(500).json({ error: 'Kayıtlar yüklenemedi' });
  }
});

// ============================================
// TABLES MODULE
// ============================================

// ─── ADD TABLE (owner only) ─────────────────────────────
router.post('/tables', requireRole('owner'), async (req, res) => {
  const { table_number, qr_code } = req.body;

  if (!table_number || !qr_code) {
    return res.status(400).json({ error: 'Masa numarası ve QR kod gerekli' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO tables (table_number, qr_code) VALUES ($1, $2) RETURNING id, table_number, qr_code',
      [table_number, qr_code]
    );

    res.json({ table: result.rows[0] });
  } catch (err) {
    logger.error('[ERR] Add table:', err);
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Masa eklenemedi' : 'Masa eklenemedi: ' + err.message });
  }
});

// ─── OPEN TABLE SESSION (waiter order-taking) ──────────
router.post('/tables/:tableId/open-session',
  requireRole('owner', 'head_waiter', 'waiter'),
  async (req, res) => {
    const { tableId } = req.params;
    const userId = req.user.id;

    try {
      // 1. Validate table exists
      const tableResult = await pool.query(
        'SELECT id, table_number FROM tables WHERE id = $1',
        [tableId]
      );
      if (tableResult.rows.length === 0) {
        return res.status(404).json({ error: 'Masa bulunamadı' });
      }

      // 2. Check if active session already exists
      const sessionResult = await pool.query(
        "SELECT id, session_token FROM table_sessions WHERE table_id = $1 AND status = 'active' LIMIT 1",
        [tableId]
      );

      if (sessionResult.rows.length > 0) {
        // Already open
        return res.json({
          message: 'Masa zaten açık',
          sessionId: sessionResult.rows[0].id,
          sessionToken: sessionResult.rows[0].session_token
        });
      }

      // 3. Create new session
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM table_sessions WHERE table_id = $1',
        [tableId]
      );
      const nextSessionNumber = parseInt(countResult.rows[0].count) + 1;

      const newSession = await pool.query(
        'INSERT INTO table_sessions (table_id, session_number) VALUES ($1, $2) RETURNING id, session_token',
        [tableId, nextSessionNumber]
      );

      // 4. Audit log
      await pool.query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, 'opened_table_session', 'table_session', $2)",
        [userId, newSession.rows[0].id]
      );

      res.json({
        message: 'Masa açıldı',
        sessionId: newSession.rows[0].id,
        sessionToken: newSession.rows[0].session_token
      });
    } catch (err) {
      logger.error('[ERR] Open table session:', err);
      res.status(500).json({ error: 'Masa açılamadı' });
    }
  }
);

// ─── ADD PARTICIPANT TO TABLE (waiter order-taking) ────
router.post('/tables/:tableId/participant',
  requireRole('owner', 'head_waiter', 'waiter'),
  validate('adminAddParticipant'),
  async (req, res) => {
    const { tableId } = req.params;
    const { participantName } = req.body;
    const userId = req.user.id;

    try {
      // 1. Validate table exists
      const tableResult = await pool.query(
        'SELECT id, table_number FROM tables WHERE id = $1',
        [tableId]
      );
      if (tableResult.rows.length === 0) {
        return res.status(404).json({ error: 'Masa bulunamadı' });
      }

      // 2. Find or create active session
      let sessionId, sessionToken;
      const sessionResult = await pool.query(
        "SELECT id, session_token FROM table_sessions WHERE table_id = $1 AND status = 'active' ORDER BY opened_at DESC LIMIT 1",
        [tableId]
      );

      if (sessionResult.rows.length > 0) {
        // Active session exists, use it
        sessionId = sessionResult.rows[0].id;
        sessionToken = sessionResult.rows[0].session_token;
      } else {
        // No active session, create one
        const countResult = await pool.query(
          'SELECT COUNT(*) FROM table_sessions WHERE table_id = $1',
          [tableId]
        );
        const nextSessionNumber = parseInt(countResult.rows[0].count) + 1;
        const newSession = await pool.query(
          'INSERT INTO table_sessions (table_id, session_number) VALUES ($1, $2) RETURNING id, session_token',
          [tableId, nextSessionNumber]
        );
        sessionId = newSession.rows[0].id;
        sessionToken = newSession.rows[0].session_token;
      }

      // 3. Add participant (waiter adding on behalf of customer)
      const participant = await pool.query(
        'INSERT INTO participants (session_id, name, is_host) VALUES ($1, $2, false) RETURNING id, name, color_code, is_host',
        [sessionId, participantName]
      );

      // 4. Audit log
      await pool.query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, 'waiter_added_participant', 'participant', $2)",
        [userId, participant.rows[0].id]
      );

      res.json({
        sessionId,
        sessionToken,
        participant: participant.rows[0]
      });
    } catch (err) {
      logger.error('[ERR] Admin add participant:', err);
      res.status(500).json({ error: 'Katılımcı eklenemedi' });
    }
  }
);

// ─── UPDATE TABLE (owner only) ──────────────────────────
router.patch('/tables/:tableId', requireRole('owner'), async (req, res) => {
  const { tableId } = req.params;
  const { table_number, qr_code } = req.body;

  try {
    await pool.query(
      'UPDATE tables SET table_number = $1, qr_code = $2 WHERE id = $3',
      [table_number, qr_code, tableId]
    );

    res.json({ message: 'Masa güncellendi' });
  } catch (err) {
    logger.error('[ERR] Update table:', err);
    res.status(500).json({ error: 'Masa güncellenemedi' });
  }
});

// ─── DELETE TABLE (owner only) ──────────────────────────
router.delete('/tables/:tableId', requireRole('owner'), async (req, res) => {
  const { tableId } = req.params;

  try {
    // Check if table has active sessions
    const activeSessions = await pool.query(
      'SELECT COUNT(*) FROM table_sessions WHERE table_id = $1 AND status = $2',
      [tableId, 'active']
    );

    if (parseInt(activeSessions.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Aktif oturumu olan masa silinemez' });
    }

    await pool.query('DELETE FROM tables WHERE id = $1', [tableId]);

    res.json({ message: 'Masa silindi' });
  } catch (err) {
    logger.error('[ERR] Delete table:', err);
    res.status(500).json({ error: 'Masa silinemedi' });
  }
});

// ─── ALL TABLES (active + history) ─────────────────────
router.get('/tables', requireRole('owner', 'head_waiter', 'waiter'), async (req, res) => {
  try {
    // All tables from database with active session data
    const allTablesResult = await pool.query(`
      SELECT t.id, t.table_number, t.qr_code,
             COALESCE(ts.total_bill, 0) as total_bill,
             COALESCE((SELECT COUNT(*)::int FROM participants WHERE session_id = ts.id), 0) as participant_count,
             ts.id as session_id, ts.session_token
      FROM tables t
      LEFT JOIN table_sessions ts ON t.id = ts.table_id AND ts.status = 'active'
      ORDER BY t.table_number::integer
    `);

    // Active tables
    const active = await pool.query(`
      SELECT t.id as table_id, t.table_number, t.qr_code,
             ts.id as session_id, ts.session_token, ts.session_number,
             ts.total_bill, ts.paid_amount, ts.opened_at,
             (SELECT get_remaining_balance(ts.id)) as remaining,
             (SELECT COUNT(*)::int FROM participants WHERE session_id = ts.id) as participant_count,
             (SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'color_code', p.color_code, 'is_host', p.is_host))
              FROM participants p WHERE p.session_id = ts.id) as participants,
             (SELECT json_agg(json_build_object('id', o.id, 'name', o.name, 'quantity', o.quantity, 'price', o.price, 'total_price', o.total_price, 'status', o.status, 'created_at', o.created_at, 'ordered_by', o.ordered_by, 'paid_by', o.paid_by) ORDER BY o.created_at)
               FROM orders o WHERE o.session_id = ts.id AND o.status != 'cancelled') as orders,
             (SELECT json_agg(json_build_object('id', p2.id, 'amount', p2.amount, 'payment_type', p2.payment_type, 'participant_id', p2.participant_id, 'created_at', p2.created_at) ORDER BY p2.created_at)
               FROM payments p2 WHERE p2.session_id = ts.id AND p2.status = 'completed') as payments
      FROM tables t
      INNER JOIN table_sessions ts ON t.id = ts.table_id
      WHERE ts.status = 'active'
      ORDER BY t.table_number::integer
    `);

    // Recent session history (closed sessions)
    const history = await pool.query(`
      SELECT t.table_number, ts.session_number, ts.total_bill, ts.paid_amount,
             ts.opened_at, ts.closed_at,
             (SELECT COUNT(*)::int FROM participants WHERE session_id = ts.id) as participant_count,
             (SELECT COUNT(*)::int FROM orders WHERE session_id = ts.id) as order_count
      FROM table_sessions ts
      INNER JOIN tables t ON ts.table_id = t.id
      WHERE ts.status = 'closed'
      ORDER BY ts.closed_at DESC
      LIMIT 50
    `);

    res.json({
      allTables: allTablesResult.rows,
      active: active.rows,
      history: history.rows
    });
  } catch (err) {
    logger.error('[ERR] Tables list:', err);
    res.status(500).json({ error: 'Masalar yüklenemedi' });
  }
});

// ─── CASH PAYMENT (cash, transfer, credit card, etc.) ─
router.post('/tables/:sessionId/cash-payment',
  requireRole('owner', 'head_waiter'),
  validate('cashPayment'),
  async (req, res) => {
    const { sessionId } = req.params;
    const { paymentType } = req.body;
    const userId = req.user.id;

    try {
      // 1. Validate session exists and is active
      const sessionResult = await pool.query(
        "SELECT id FROM table_sessions WHERE id = $1 AND status = 'active'",
        [sessionId]
      );
      if (sessionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Aktif oturum bulunamadı' });
      }

      // 2. Get remaining balance
      const balanceResult = await pool.query('SELECT get_remaining_balance($1)', [sessionId]);
      const remaining = parseFloat(balanceResult.rows[0].get_remaining_balance);

      if (remaining <= 0) {
        return res.status(400).json({ error: 'Hesap zaten ödendi' });
      }

      // 3. Record payment
      const payment = await pool.query(
        `INSERT INTO payments (session_id, amount, payment_type, status, completed_at)
         VALUES ($1, $2, $3, 'completed', NOW()) RETURNING *`,
        [sessionId, remaining, paymentType]
      );

      // 4. Close session
      await pool.query(
        "UPDATE table_sessions SET status = 'closed', closed_at = NOW() WHERE id = $1",
        [sessionId]
      );

      // 5. Audit log
      await pool.query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, 'cash_payment', 'table_session', $2)",
        [userId, sessionId]
      );

      // 6. Broadcast session closed event via WebSocket
      const wsService = require('../websocket/websocket.service');
      if (wsService && wsService.broadcast) {
        wsService.broadcast(sessionId, 'session_closed', {
          sessionId,
          closedBy: userId,
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        message: 'Hesap ödendi',
        amount: remaining,
        paymentType
      });
    } catch (err) {
      logger.error('[ERR] Cash payment:', err);
      res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Ödeme işlemi başarısız' : 'Ödeme işlemi başarısız: ' + err.message });
    }
  }
);

// ─── CLOSE TABLE SESSION (head_waiter + owner) ─────────
router.post('/tables/:sessionId/close', requireRole('owner', 'head_waiter'), async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.id;

  try {
    // Check remaining balance
    const balanceResult = await pool.query('SELECT get_remaining_balance($1)', [sessionId]);
    const remaining = parseFloat(balanceResult.rows[0].get_remaining_balance);

    if (remaining > 0) {
      return res.status(400).json({
        error: `Hesap kapanmıyor — ${remaining.toFixed(2)}₺ kalan borç var`
      });
    }

    await pool.query(
      "UPDATE table_sessions SET status = 'closed', closed_at = NOW() WHERE id = $1",
      [sessionId]
    );

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, 'session_close', 'table_session', $2)",
      [userId, sessionId]
    );

    // Broadcast session closed event via WebSocket
    const wsService = require('../websocket/websocket.service');
    if (wsService && wsService.broadcast) {
      wsService.broadcast(sessionId, 'session_closed', {
        sessionId,
        closedBy: userId,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ message: 'Masa kapatıldı' });
  } catch (err) {
    logger.error('[ERR] Close table:', err);
    res.status(500).json({ error: 'Masa kapatılamadı' });
  }
});

// ─── LIST ALL ORDERS (with filters) ────────────────────
router.get('/orders', requireRole('owner', 'head_waiter', 'waiter'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, 
             p.name as participant_name,
             t.table_number
      FROM orders o
      LEFT JOIN participants p ON o.ordered_by = p.id
      LEFT JOIN table_sessions ts ON o.session_id = ts.id
      LEFT JOIN tables t ON ts.table_id = t.id
      ORDER BY o.created_at DESC
      LIMIT 200
    `);
    res.json({ orders: result.rows });
  } catch (err) {
    logger.error('[ERR] Orders list:', err);
    res.status(500).json({ error: 'Siparişler yüklenemedi' });
  }
});

// ─── UPDATE ORDER STATUS ───────────────────────────────
router.patch('/orders/:orderId/status', requireRole('owner', 'head_waiter', 'waiter'), async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  if (!['pending', 'preparing', 'served'].includes(status)) {
    return res.status(400).json({ error: 'Geçersiz durum' });
  }

  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
    res.json({ message: 'Durum güncellendi' });
  } catch (err) {
    logger.error('[ERR] Update order status:', err);
    res.status(500).json({ error: 'Durum güncellenemedi' });
  }
});

// ─── CANCEL ORDER (head_waiter + owner, soft-delete) ───
router.post('/orders/:orderId/cancel', requireRole('owner', 'head_waiter'), async (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;

  try {
    const order = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Sipariş bulunamadı' });
    }

    if (order.rows[0].status === 'cancelled') {
      return res.status(400).json({ error: 'Sipariş zaten iptal' });
    }

    await pool.query(
      "UPDATE orders SET status = 'cancelled', cancelled_by = $1, cancel_reason = $2, cancelled_at = NOW() WHERE id = $3",
      [userId, reason || 'İptal', orderId]
    );

    // Update session total_bill after cancel
    const orderData = order.rows[0];
    await pool.query(
      'UPDATE table_sessions SET total_bill = (SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE session_id = $1 AND status != \'cancelled\') WHERE id = $2',
      [orderData.session_id, orderData.session_id]
    );

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, 'order_cancel', 'order', $2)",
      [userId, orderId]
    );

    res.json({ message: 'Sipariş iptal edildi' });
  } catch (err) {
    logger.error('[ERR] Cancel order:', err);
    res.status(500).json({ error: 'Sipariş iptal edilemedi' });
  }
});

module.exports = router;
