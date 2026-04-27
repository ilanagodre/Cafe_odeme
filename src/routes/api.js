const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const logger = require('../config/logger');
const { validate } = require('../middleware/validation');
const { calculateEqualSplit, calculateItemBased, calculateIndividualOwed } = require('../algorithms/splitAlgorithms');

// ─── JOIN TABLE (QR Scan) ─────────────────────────────
// When customer scans QR code, create/join session
router.post('/session/join', validate('sessionJoin'), async (req, res) => {
  const { qrCode, participantName } = req.body;

  try {
    // Find table by QR code
    const tableResult = await pool.query(
      'SELECT id FROM tables WHERE qr_code = $1', [qrCode]
    );

    if (tableResult.rows.length === 0) {
      return res.status(404).json({ error: 'Geçersiz QR kod' });
    }

    const tableId = tableResult.rows[0].id;

    // Find active session or create one
    let sessionResult = await pool.query(
      'SELECT id, session_token FROM table_sessions WHERE table_id = $1 AND status = $2',
      [tableId, 'active']
    );

    let sessionId;
    let sessionToken;

    if (sessionResult.rows.length > 0) {
      sessionId = sessionResult.rows[0].id;
      sessionToken = sessionResult.rows[0].session_token;
    } else {
      // Get next session number for this table
      const maxSessionResult = await pool.query(
        'SELECT COALESCE(MAX(session_number), 0) as max_num FROM table_sessions WHERE table_id = $1',
        [tableId]
      );
      const nextSessionNumber = maxSessionResult.rows[0].max_num + 1;

      const newSession = await pool.query(
        'INSERT INTO table_sessions (table_id, session_number) VALUES ($1, $2) RETURNING id, session_token, session_number',
        [tableId, nextSessionNumber]
      );
      sessionId = newSession.rows[0].id;
      sessionToken = newSession.rows[0].session_token;
    }

    // Add participant
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM participants WHERE session_id = $1', [sessionId]
    );
    const isFirst = countResult.rows[0].count === '0';

    const participant = await pool.query(
      `INSERT INTO participants (session_id, name, is_host)
       VALUES ($1, $2, $3) RETURNING *`,
      [sessionId, participantName, isFirst]
    );

    res.json({
      sessionId,
      sessionToken,
      participant: participant.rows[0]
    });
  } catch (err) {
    console.error('[ERR] Join session:', err.message, err.stack);
    res.status(500).json({ error: 'Masaya katılamadı: ' + err.message });
  }
});

// ─── GET SESSION STATE ─────────────────────────────────
router.get('/session/:sessionToken', async (req, res) => {
  const { sessionToken } = req.params;

  try {
    const session = await pool.query(
      'SELECT * FROM table_sessions WHERE session_token = $1', [sessionToken]
    );

    if (session.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const [participants, orders, payments, balanceResult] = await Promise.all([
      pool.query('SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at', [session.rows[0].id]),
      pool.query('SELECT * FROM orders WHERE session_id = $1 ORDER BY created_at', [session.rows[0].id]),
      pool.query('SELECT * FROM payments WHERE session_id = $1 ORDER BY created_at', [session.rows[0].id]),
      pool.query('SELECT get_remaining_balance($1)', [session.rows[0].id])
    ]);

    res.json({
      session: session.rows[0],
      participants: participants.rows,
      orders: orders.rows,
      payments: payments.rows,
      remainingBalance: parseFloat(balanceResult.rows[0].get_remaining_balance)
    });
  } catch (err) {
    console.error('[ERR] Get session:', err);
    res.status(500).json({ error: 'Failed to get session state' });
  }
});

// ─── PLACE ORDER ───────────────────────────────────────
router.post('/order', validate('placeOrder'), async (req, res) => {
  const { sessionToken, itemName, quantity, price, orderedBy } = req.body;

  try {
    const sessionResult = await pool.query(
      'SELECT id FROM table_sessions WHERE session_token = $1 AND status = $2',
      [sessionToken, 'active']
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    const sessionId = sessionResult.rows[0].id;
    const totalPrice = (quantity * price).toFixed(2);

    const order = await pool.query(
      `INSERT INTO orders (session_id, name, quantity, price, total_price, ordered_by) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [sessionId, itemName, quantity, price, totalPrice, orderedBy]
    );

    // Update session total_bill
    await pool.query(
      'UPDATE table_sessions SET total_bill = (SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE session_id = $1 AND status != \'cancelled\') WHERE id = $2',
      [sessionId, sessionId]
    );

    res.json({ order: order.rows[0] });
  } catch (err) {
    console.error('[ERR] Place order:', err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// ─── SPLIT CALCULATION ─────────────────────────────────
router.post('/split/calculate', async (req, res) => {
  const { sessionToken, strategy } = req.body;

  try {
    const sessionResult = await pool.query(
      'SELECT id FROM table_sessions WHERE session_token = $1 AND status = $2',
      [sessionToken, 'active']
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    const sessionId = sessionResult.rows[0].id;

    const [participants, orders] = await Promise.all([
      pool.query('SELECT * FROM participants WHERE session_id = $1', [sessionId]),
      pool.query("SELECT * FROM orders WHERE session_id = $1 AND status != 'cancelled'", [sessionId])
    ]);

    let result;
    if (strategy === 'equal_split') {
      result = calculateEqualSplit(orders.rows, participants.rows);
    } else if (strategy === 'item_based') {
      result = calculateItemBased(orders.rows, participants.rows, req.body.itemClaims || {});
    } else if (strategy === 'individual') {
      result = calculateIndividualOwed(orders.rows, participants.rows);
    } else {
      return res.status(400).json({ error: 'Invalid strategy' });
    }

    res.json(result);
  } catch (err) {
    console.error('[ERR] Split calculation:', err);
    res.status(500).json({ error: 'Failed to calculate split' });
  }
});

// ─── PROCESS PAYMENT (Mock for MVP) ────────────────────
router.post('/payment', validate('payment'), async (req, res) => {
  const { sessionToken, participantId, amount, paymentType } = req.body;

  try {
    const sessionResult = await pool.query(
      'SELECT id FROM table_sessions WHERE session_token = $1 AND status = $2',
      [sessionToken, 'active']
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    const sessionId = sessionResult.rows[0].id;

    // Mock payment - always succeeds for MVP demo
    const payment = await pool.query(
      `INSERT INTO payments (session_id, participant_id, amount, payment_type, status, completed_at) 
       VALUES ($1, $2, $3, $4, 'completed', NOW()) RETURNING *`,
      [sessionId, participantId, amount, paymentType || 'full']
    );

    // Update session paid amount
    await pool.query(
      'UPDATE table_sessions SET paid_amount = (SELECT SUM(amount) FROM payments WHERE session_id = $1 AND status = $2) WHERE id = $3',
      [sessionId, 'completed', sessionId]
    );

    // Get remaining balance
    const balanceResult = await pool.query('SELECT get_remaining_balance($1)', [sessionId]);
    const remainingBalance = parseFloat(balanceResult.rows[0].get_remaining_balance);

    res.json({
      payment: payment.rows[0],
      remainingBalance,
      message: 'Payment successful (mock)'
    });
  } catch (err) {
    console.error('[ERR] Payment:', err);
    res.status(500).json({ error: 'Payment failed' });
  }
});

// ─── PAY FULL SESSION (one person pays everything) ────
router.post('/payment/full', validate('paymentFull'), async (req, res) => {
  const { sessionToken, paidBy } = req.body;

  try {
    const sessionResult = await pool.query(
      'SELECT id FROM table_sessions WHERE session_token = $1 AND status = $2',
      [sessionToken, 'active']
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    const sessionId = sessionResult.rows[0].id;
    const remainingBalance = parseFloat(
      (await pool.query('SELECT get_remaining_balance($1)', [sessionId])).rows[0].get_remaining_balance
    );

    if (remainingBalance <= 0) {
      return res.json({ payment: null, remainingBalance: 0, message: 'Already paid' });
    }

    // Single payment for the full remaining amount
    const payment = await pool.query(
      `INSERT INTO payments (session_id, participant_id, amount, payment_type, status, completed_at) 
       VALUES ($1, $2, $3, 'full', 'completed', NOW()) RETURNING *`,
      [sessionId, paidBy, remainingBalance]
    );

    // Check if fully paid and close session
    const newBalance = parseFloat(
      (await pool.query('SELECT get_remaining_balance($1)', [sessionId])).rows[0].get_remaining_balance
    );

    if (newBalance <= 0) {
      await pool.query(
        "UPDATE table_sessions SET status = 'closed', closed_at = NOW() WHERE id = $1",
        [sessionId]
      );
    }

    res.json({
      payment: payment.rows[0],
      remainingBalance: newBalance,
      allSettled: newBalance <= 0,
      message: newBalance <= 0 ? 'Tüm hesap ödendi! 🎉' : 'Ödeme alındı'
    });
  } catch (err) {
    console.error('[ERR] Full payment:', err);
    res.status(500).json({ error: 'Payment failed' });
  }
});

// ─── PAY FOR ANOTHER PERSON ───────────────────────────
router.post('/payment/for', validate('paymentFor'), async (req, res) => {
  const { sessionToken, paidBy, targetParticipantId, amount } = req.body;

  try {
    const sessionResult = await pool.query(
      'SELECT id FROM table_sessions WHERE session_token = $1 AND status = $2',
      [sessionToken, 'active']
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    const sessionId = sessionResult.rows[0].id;

    // Get target participant info
    const target = await pool.query(
      'SELECT name FROM participants WHERE id = $1 AND session_id = $2',
      [targetParticipantId, sessionId]
    );

    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    // Create payment (paidBy pays for targetParticipantId's share)
    const payment = await pool.query(
      `INSERT INTO payments (session_id, participant_id, amount, payment_type, status, completed_at) 
       VALUES ($1, $2, $3, 'full', 'completed', NOW()) RETURNING *`,
      [sessionId, paidBy, amount]
    );

    // Update session
    await pool.query(
      'UPDATE table_sessions SET paid_amount = (SELECT SUM(amount) FROM payments WHERE session_id = $1 AND status = $2) WHERE id = $3',
      [sessionId, 'completed', sessionId]
    );

    const balanceResult = await pool.query('SELECT get_remaining_balance($1)', [sessionId]);
    const remainingBalance = parseFloat(balanceResult.rows[0].get_remaining_balance);

    res.json({
      payment: payment.rows[0],
      remainingBalance,
      targetName: target.rows[0].name,
      message: `${target.rows[0].name}'ın hesabı ödendi`
    });
  } catch (err) {
    console.error('[ERR] Pay for:', err);
    res.status(500).json({ error: 'Payment failed' });
  }
});

// ─── PAY FOR SPECIFIC ITEMS (ısmarlıyorum) ──────────────
router.post('/payment/item', validate('paymentItem'), async (req, res) => {
  const { sessionToken, paidBy, orderIds } = req.body;

  try {
    const sessionResult = await pool.query(
      'SELECT id FROM table_sessions WHERE session_token = $1 AND status = $2',
      [sessionToken, 'active']
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    const sessionId = sessionResult.rows[0].id;

    // Get the orders to pay for (params start at $2 since $1 = sessionId)
    const placeholders = orderIds.map((_, i) => `$${i + 2}`).join(',');
    const orders = await pool.query(
      `SELECT * FROM orders WHERE session_id = $1 AND id IN (${placeholders}) AND status != 'cancelled'`,
      [sessionId, ...orderIds]
    );

    if (orders.rows.length === 0) {
      return res.status(400).json({ error: 'No valid orders found' });
    }

    const totalAmount = orders.rows.reduce((sum, o) => sum + parseFloat(o.total_price), 0);

    // Create payment
    const payment = await pool.query(
      `INSERT INTO payments (session_id, participant_id, amount, payment_type, status, completed_at) 
       VALUES ($1, $2, $3, 'item_based', 'completed', NOW()) RETURNING *`,
      [sessionId, paidBy, totalAmount]
    );

    // Mark orders as paid_by
    const orderPlaceholders = orderIds.map((_, i) => `$${i + 2}`).join(',');
    await pool.query(
      `UPDATE orders SET paid_by = $1 WHERE id IN (${orderPlaceholders})`,
      [paidBy, ...orderIds]
    );

    // Update session paid amount
    await pool.query(
      'UPDATE table_sessions SET paid_amount = (SELECT SUM(amount) FROM payments WHERE session_id = $1 AND status = $2) WHERE id = $3',
      [sessionId, 'completed', sessionId]
    );

    const balanceResult = await pool.query('SELECT get_remaining_balance($1)', [sessionId]);
    const remainingBalance = parseFloat(balanceResult.rows[0].get_remaining_balance);

    // Get ordered_by names for the message
    const orderedByNames = orders.rows.map(o => o.name).join(', ');

    res.json({
      payment: payment.rows[0],
      remainingBalance,
      orderNames: orderedByNames,
      message: `${orders.rows.length} sipariş ödendi (ısmarladım!)`
    });
  } catch (err) {
    console.error('[ERR] Item payment:', err);
    res.status(500).json({ error: 'Payment failed' });
  }
});

// ─── CLOSE SESSION ─────────────────────────────────────
router.post('/session/close', async (req, res) => {
  const { sessionToken } = req.body;

  try {
    await pool.query(
      "UPDATE table_sessions SET status = 'closed', closed_at = NOW() WHERE session_token = $1",
      [sessionToken]
    );
    res.json({ message: 'Session closed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to close session' });
  }
});

module.exports = router;
