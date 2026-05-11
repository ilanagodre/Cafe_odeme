const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const logger = require("../config/logger");
const { validate } = require("../middleware/validation");
const { requireAuth, requireRole } = require("./auth");
const {
  calculateEqualSplit,
  calculateItemBased,
  calculateIndividualOwed,
} = require("../algorithms/splitAlgorithms");

async function validateParticipant(sessionId, participantId) {
  const result = await pool.query(
    "SELECT id FROM participants WHERE id = $1 AND session_id = $2",
    [participantId, sessionId],
  );
  return result.rows.length > 0;
}

// ─── QR STATUS (public — no auth) ─────────────────────
// Masa doluluk ve aktif session bilgisi döndürür
router.get("/table/:qrCode/status", async (req, res) => {
  const { qrCode } = req.params;
  try {
    const tableResult = await pool.query(
      "SELECT id, table_number, max_concurrent FROM tables WHERE qr_code = $1",
      [qrCode],
    );
    if (tableResult.rows.length === 0) {
      return res.status(404).json({ error: "Geçersiz QR kod" });
    }
    const table = tableResult.rows[0];

    const sessionResult = await pool.query(
      `SELECT id, session_token, session_type, status,
              (SELECT COUNT(*) FROM participants WHERE session_id = ts.id) AS participant_count
       FROM table_sessions ts
       WHERE table_id = $1 AND status IN ('active','waiting_service') AND session_type = 'self_service'
       ORDER BY opened_at DESC LIMIT 1`,
      [table.id],
    );

    const activeCount = parseInt(
      (await pool.query("SELECT get_active_participant_count($1)", [table.id]))
        .rows[0].get_active_participant_count,
    );

    const session = sessionResult.rows[0] || null;
    res.json({
      table: {
        id: table.id,
        table_number: table.table_number,
        max_concurrent: table.max_concurrent,
      },
      session: session
        ? {
            id: session.id,
            sessionToken: session.session_token,
            sessionType: session.session_type,
            status: session.status,
            participantCount: parseInt(session.participant_count),
          }
        : null,
      capacityFull: activeCount >= table.max_concurrent,
      currentCount: activeCount,
    });
  } catch (err) {
    logger.error("[ERR] Table status:", err);
    res.status(500).json({ error: "Masa durumu alınamadı" });
  }
});

// ─── SELF-SERVICE JOIN ────────────────────────────────
// Müşteri QR tarayınca self-service session açar veya katılır
router.post(
  "/self-service/join",
  validate("selfServiceJoin"),
  async (req, res) => {
    const { qrCode, participantName } = req.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Masa kilitle (yarış koruması)
      const tableResult = await client.query(
        "SELECT id, table_number, max_concurrent FROM tables WHERE qr_code = $1 FOR UPDATE",
        [qrCode],
      );
      if (tableResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Geçersiz QR kod" });
      }
      const table = tableResult.rows[0];

      // Kapasite kontrolü
      const countResult = await client.query(
        "SELECT get_active_participant_count($1) AS cnt",
        [table.id],
      );
      const activeCount = parseInt(countResult.rows[0].cnt);
      if (activeCount >= table.max_concurrent) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Masa dolu",
          capacityFull: true,
          currentCount: activeCount,
          maxConcurrent: table.max_concurrent,
        });
      }

      // Aktif self-service session var mı?
      let sessionResult = await client.query(
        "SELECT id, session_token FROM table_sessions WHERE table_id = $1 AND status = 'active' AND session_type = 'self_service'",
        [table.id],
      );

      let sessionId, sessionToken;
      if (sessionResult.rows.length > 0) {
        sessionId = sessionResult.rows[0].id;
        sessionToken = sessionResult.rows[0].session_token;
      } else {
        const maxNum = await client.query(
          "SELECT COALESCE(MAX(session_number), 0) AS max_num FROM table_sessions WHERE table_id = $1",
          [table.id],
        );
        const nextNum = maxNum.rows[0].max_num + 1;
        const newSession = await client.query(
          `INSERT INTO table_sessions (table_id, session_number, session_type, expires_at)
         VALUES ($1, $2, 'self_service', NOW() + INTERVAL '3 hours')
         RETURNING id, session_token`,
          [table.id, nextNum],
        );
        sessionId = newSession.rows[0].id;
        sessionToken = newSession.rows[0].session_token;
      }

      // İlk katılımcı mı?
      const participantCount = await client.query(
        "SELECT COUNT(*) FROM participants WHERE session_id = $1",
        [sessionId],
      );
      const isHost = participantCount.rows[0].count === "0";

      const participant = await client.query(
        "INSERT INTO participants (session_id, name, is_host) VALUES ($1, $2, $3) RETURNING *",
        [sessionId, participantName, isHost],
      );

      await client.query("COMMIT");

      // WebSocket bildirimi (hata olsa da devam et)
      try {
        const ws = require("../websocket/websocket.service");
        ws.broadcastAdmin("admin_session_updated", {
          sessionId,
          tableId: table.id,
          event: "participant_joined",
        });
      } catch (_) {}

      res.json({
        sessionId,
        sessionToken,
        participant: participant.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[ERR] Self-service join:", err);
      res.status(500).json({ error: "Masaya katılamadı" });
    } finally {
      client.release();
    }
  },
);

// ─── JOIN TABLE (QR Scan) ─────────────────────────────
// When customer scans QR code, create/join session
router.post("/session/join", validate("sessionJoin"), async (req, res) => {
  const { qrCode, participantName } = req.body;

  try {
    // Find table by QR code
    const tableResult = await pool.query(
      "SELECT id FROM tables WHERE qr_code = $1",
      [qrCode],
    );

    if (tableResult.rows.length === 0) {
      return res.status(404).json({ error: "Geçersiz QR kod" });
    }

    const tableId = tableResult.rows[0].id;

    // Find active session or create one
    let sessionResult = await pool.query(
      "SELECT id, session_token FROM table_sessions WHERE table_id = $1 AND status = $2",
      [tableId, "active"],
    );

    let sessionId;
    let sessionToken;

    if (sessionResult.rows.length > 0) {
      sessionId = sessionResult.rows[0].id;
      sessionToken = sessionResult.rows[0].session_token;
    } else {
      // Get next session number for this table
      const maxSessionResult = await pool.query(
        "SELECT COALESCE(MAX(session_number), 0) as max_num FROM table_sessions WHERE table_id = $1",
        [tableId],
      );
      const nextSessionNumber = maxSessionResult.rows[0].max_num + 1;

      const newSession = await pool.query(
        "INSERT INTO table_sessions (table_id, session_number) VALUES ($1, $2) RETURNING id, session_token, session_number",
        [tableId, nextSessionNumber],
      );
      sessionId = newSession.rows[0].id;
      sessionToken = newSession.rows[0].session_token;
    }

    // Add participant
    const countResult = await pool.query(
      "SELECT COUNT(*) FROM participants WHERE session_id = $1",
      [sessionId],
    );
    const isFirst = countResult.rows[0].count === "0";

    const participant = await pool.query(
      `INSERT INTO participants (session_id, name, is_host)
       VALUES ($1, $2, $3) RETURNING *`,
      [sessionId, participantName, isFirst],
    );

    res.json({
      sessionId,
      sessionToken,
      participant: participant.rows[0],
    });
  } catch (err) {
    logger.error("[ERR] Join session:", err.message, err.stack);
    res.status(500).json({
      error:
        process.env.NODE_ENV === "production"
          ? "Masaya katılamadı"
          : "Masaya katılamadı: " + err.message,
    });
  }
});

// ─── GET SESSION STATE ─────────────────────────────────
router.get("/session/:sessionToken", async (req, res) => {
  const { sessionToken } = req.params;

  try {
    const session = await pool.query(
      "SELECT * FROM table_sessions WHERE session_token = $1",
      [sessionToken],
    );

    if (session.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const [participants, orders, payments, balanceResult] = await Promise.all([
      pool.query(
        "SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at",
        [session.rows[0].id],
      ),
      pool.query(
        "SELECT * FROM orders WHERE session_id = $1 ORDER BY created_at",
        [session.rows[0].id],
      ),
      pool.query(
        "SELECT * FROM payments WHERE session_id = $1 ORDER BY created_at",
        [session.rows[0].id],
      ),
      pool.query("SELECT get_remaining_balance($1)", [session.rows[0].id]),
    ]);

    res.json({
      session: session.rows[0],
      participants: participants.rows,
      orders: orders.rows,
      payments: payments.rows,
      remainingBalance: parseFloat(balanceResult.rows[0].get_remaining_balance),
    });
  } catch (err) {
    logger.error("[ERR] Get session:", err);
    res.status(500).json({ error: "Failed to get session state" });
  }
});

// ─── PLACE ORDER ───────────────────────────────────────
router.post("/order", validate("placeOrder"), async (req, res) => {
  const { sessionToken, itemName, quantity, price, orderedBy } = req.body;

  try {
    const sessionResult = await pool.query(
      "SELECT id, session_type FROM table_sessions WHERE session_token = $1 AND status = 'active'",
      [sessionToken],
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Active session not found" });
    }

    const { id: sessionId, session_type } = sessionResult.rows[0];
    const initialStatus =
      session_type === "self_service" ? "pending_payment" : "pending";
    const totalPrice = (quantity * price).toFixed(2);

    const order = await pool.query(
      `INSERT INTO orders (session_id, name, quantity, price, total_price, ordered_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        sessionId,
        itemName,
        quantity,
        price,
        totalPrice,
        orderedBy,
        initialStatus,
      ],
    );

    await pool.query(
      "UPDATE table_sessions SET total_bill = (SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE session_id = $1 AND status != 'cancelled') WHERE id = $2",
      [sessionId, sessionId],
    );

    res.json({ order: order.rows[0] });
  } catch (err) {
    logger.error("[ERR] Place order:", err);
    res.status(500).json({ error: "Failed to place order" });
  }
});

// ─── SPLIT CALCULATION ─────────────────────────────────
router.post("/split/calculate", async (req, res) => {
  const { sessionToken, strategy } = req.body;

  try {
    const sessionResult = await pool.query(
      "SELECT id FROM table_sessions WHERE session_token = $1 AND status = $2",
      [sessionToken, "active"],
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Active session not found" });
    }

    const sessionId = sessionResult.rows[0].id;

    const [participants, orders] = await Promise.all([
      pool.query("SELECT * FROM participants WHERE session_id = $1", [
        sessionId,
      ]),
      pool.query(
        "SELECT * FROM orders WHERE session_id = $1 AND status != 'cancelled'",
        [sessionId],
      ),
    ]);

    let result;
    if (strategy === "equal_split") {
      result = calculateEqualSplit(orders.rows, participants.rows);
    } else if (strategy === "item_based") {
      result = calculateItemBased(
        orders.rows,
        participants.rows,
        req.body.itemClaims || {},
      );
    } else if (strategy === "individual") {
      result = calculateIndividualOwed(orders.rows, participants.rows);
    } else {
      return res.status(400).json({ error: "Invalid strategy" });
    }

    res.json(result);
  } catch (err) {
    logger.error("[ERR] Split calculation:", err);
    res.status(500).json({ error: "Failed to calculate split" });
  }
});

// ─── PROCESS PAYMENT (Mock for MVP) ────────────────────
router.post("/payment", validate("payment"), async (req, res) => {
  const { sessionToken, participantId, amount, paymentType } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sessionResult = await client.query(
      "SELECT id FROM table_sessions WHERE session_token = $1 AND status = $2 FOR UPDATE",
      [sessionToken, "active"],
    );
    if (sessionResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Active session not found" });
    }
    const sessionId = sessionResult.rows[0].id;
    const pCheck = await client.query(
      "SELECT id FROM participants WHERE id = $1 AND session_id = $2",
      [participantId, sessionId],
    );
    if (pCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Katılımcı bu oturuma ait değil" });
    }
    const payment = await client.query(
      `INSERT INTO payments (session_id, participant_id, amount, payment_type, status, completed_at)
       VALUES ($1, $2, $3, $4, 'completed', NOW()) RETURNING *`,
      [sessionId, participantId, amount, paymentType || "full"],
    );
    await client.query(
      "UPDATE orders SET status = 'pending' WHERE session_id = $1 AND ordered_by = $2 AND status = 'pending_payment'",
      [sessionId, participantId],
    );
    await client.query(
      "UPDATE table_sessions SET paid_amount = (SELECT SUM(amount) FROM payments WHERE session_id = $1 AND status = $2) WHERE id = $3",
      [sessionId, "completed", sessionId],
    );
    const remainingBalance = parseFloat(
      (await client.query("SELECT get_remaining_balance($1)", [sessionId]))
        .rows[0].get_remaining_balance,
    );
    await client.query("COMMIT");
    res.json({
      payment: payment.rows[0],
      remainingBalance,
      message: "Payment successful (mock)",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[ERR] Payment:", err);
    res.status(500).json({ error: "Payment failed" });
  } finally {
    client.release();
  }
});

// ─── PAY FULL SESSION (one person pays everything) ────
router.post("/payment/full", validate("paymentFull"), async (req, res) => {
  const { sessionToken, paidBy } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sessionResult = await client.query(
      "SELECT id, session_type FROM table_sessions WHERE session_token = $1 AND status = $2 FOR UPDATE",
      [sessionToken, "active"],
    );
    if (sessionResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Active session not found" });
    }
    const { id: sessionId, session_type } = sessionResult.rows[0];
    const pCheck = await client.query(
      "SELECT id FROM participants WHERE id = $1 AND session_id = $2",
      [paidBy, sessionId],
    );
    if (pCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Katılımcı bu oturuma ait değil" });
    }
    const remainingBalance = parseFloat(
      (await client.query("SELECT get_remaining_balance($1)", [sessionId]))
        .rows[0].get_remaining_balance,
    );
    if (remainingBalance <= 0) {
      await client.query("ROLLBACK");
      return res.json({
        payment: null,
        remainingBalance: 0,
        message: "Already paid",
      });
    }
    const payment = await client.query(
      `INSERT INTO payments (session_id, participant_id, amount, payment_type, status, completed_at)
       VALUES ($1, $2, $3, 'full', 'completed', NOW()) RETURNING *`,
      [sessionId, paidBy, remainingBalance],
    );
    // pending_payment → pending (ödeme onaylandı)
    await client.query(
      "UPDATE orders SET status = 'pending' WHERE session_id = $1 AND status = 'pending_payment'",
      [sessionId],
    );
    const newBalance = parseFloat(
      (await client.query("SELECT get_remaining_balance($1)", [sessionId]))
        .rows[0].get_remaining_balance,
    );
    if (newBalance <= 0) {
      // self_service: waiting_service (servis bekleniyor), waiter: direkt kapalı
      const newStatus =
        session_type === "self_service" ? "waiting_service" : "closed";
      await client.query(
        `UPDATE table_sessions SET status = $1, closed_at = CASE WHEN $1 = 'closed' THEN NOW() ELSE NULL END WHERE id = $2`,
        [newStatus, sessionId],
      );
    }
    await client.query("COMMIT");
    res.json({
      payment: payment.rows[0],
      remainingBalance: newBalance,
      allSettled: newBalance <= 0,
      message: newBalance <= 0 ? "Tüm hesap ödendi! 🎉" : "Ödeme alındı",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[ERR] Full payment:", err);
    res.status(500).json({ error: "Payment failed" });
  } finally {
    client.release();
  }
});

// ─── PAY FOR ANOTHER PERSON ───────────────────────────
router.post("/payment/for", validate("paymentFor"), async (req, res) => {
  const { sessionToken, paidBy, targetParticipantId, amount } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sessionResult = await client.query(
      "SELECT id FROM table_sessions WHERE session_token = $1 AND status = $2 FOR UPDATE",
      [sessionToken, "active"],
    );
    if (sessionResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Active session not found" });
    }
    const sessionId = sessionResult.rows[0].id;
    const pCheck = await client.query(
      "SELECT id FROM participants WHERE id = $1 AND session_id = $2",
      [paidBy, sessionId],
    );
    if (pCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Katılımcı bu oturuma ait değil" });
    }
    const target = await client.query(
      "SELECT name FROM participants WHERE id = $1 AND session_id = $2",
      [targetParticipantId, sessionId],
    );
    if (target.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Participant not found" });
    }
    const payment = await client.query(
      `INSERT INTO payments (session_id, participant_id, amount, payment_type, status, completed_at)
       VALUES ($1, $2, $3, 'full', 'completed', NOW()) RETURNING *`,
      [sessionId, paidBy, amount],
    );
    // Ödeyenin pending_payment siparişlerini onayla
    await client.query(
      "UPDATE orders SET status = 'pending' WHERE session_id = $1 AND ordered_by = $2 AND status = 'pending_payment'",
      [sessionId, paidBy],
    );
    await client.query(
      "UPDATE table_sessions SET paid_amount = (SELECT SUM(amount) FROM payments WHERE session_id = $1 AND status = $2) WHERE id = $3",
      [sessionId, "completed", sessionId],
    );
    const remainingBalance = parseFloat(
      (await client.query("SELECT get_remaining_balance($1)", [sessionId]))
        .rows[0].get_remaining_balance,
    );
    await client.query("COMMIT");
    res.json({
      payment: payment.rows[0],
      remainingBalance,
      targetName: target.rows[0].name,
      message: `${target.rows[0].name}'ın hesabı ödendi`,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[ERR] Pay for:", err);
    res.status(500).json({ error: "Payment failed" });
  } finally {
    client.release();
  }
});

// ─── PAY FOR SPECIFIC ITEMS (ısmarlıyorum) ──────────────
router.post("/payment/item", validate("paymentItem"), async (req, res) => {
  const { sessionToken, paidBy, orderIds } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sessionResult = await client.query(
      "SELECT id FROM table_sessions WHERE session_token = $1 AND status = $2 FOR UPDATE",
      [sessionToken, "active"],
    );
    if (sessionResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Active session not found" });
    }
    const sessionId = sessionResult.rows[0].id;
    const pCheck = await client.query(
      "SELECT id FROM participants WHERE id = $1 AND session_id = $2",
      [paidBy, sessionId],
    );
    if (pCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Katılımcı bu oturuma ait değil" });
    }
    const placeholders = orderIds.map((_, i) => `$${i + 2}`).join(",");
    const orders = await client.query(
      `SELECT * FROM orders WHERE session_id = $1 AND id IN (${placeholders}) AND status != 'cancelled'`,
      [sessionId, ...orderIds],
    );
    if (orders.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No valid orders found" });
    }
    const totalAmount = orders.rows.reduce(
      (sum, o) => sum + parseFloat(o.total_price),
      0,
    );
    const payment = await client.query(
      `INSERT INTO payments (session_id, participant_id, amount, payment_type, status, completed_at)
       VALUES ($1, $2, $3, 'item_based', 'completed', NOW()) RETURNING *`,
      [sessionId, paidBy, totalAmount],
    );
    const orderPlaceholders = orderIds.map((_, i) => `$${i + 2}`).join(",");
    await client.query(
      `UPDATE orders SET paid_by = $1, status = CASE WHEN status = 'pending_payment' THEN 'pending'::order_status_enum ELSE status END WHERE id IN (${orderPlaceholders})`,
      [paidBy, ...orderIds],
    );
    await client.query(
      "UPDATE table_sessions SET paid_amount = (SELECT SUM(amount) FROM payments WHERE session_id = $1 AND status = $2) WHERE id = $3",
      [sessionId, "completed", sessionId],
    );
    const remainingBalance = parseFloat(
      (await client.query("SELECT get_remaining_balance($1)", [sessionId]))
        .rows[0].get_remaining_balance,
    );
    const orderedByNames = orders.rows.map((o) => o.name).join(", ");
    await client.query("COMMIT");
    res.json({
      payment: payment.rows[0],
      remainingBalance,
      orderNames: orderedByNames,
      message: `${orders.rows.length} sipariş ödendi (ısmarladım!)`,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[ERR] Item payment:", err);
    res.status(500).json({ error: "Payment failed" });
  } finally {
    client.release();
  }
});

// ─── CLOSE SESSION ─────────────────────────────────────
router.post(
  "/session/close",
  requireAuth,
  requireRole("owner", "head_waiter", "waiter"),
  async (req, res) => {
    const { sessionToken } = req.body;
    try {
      await pool.query(
        "UPDATE table_sessions SET status = 'closed', closed_at = NOW() WHERE session_token = $1",
        [sessionToken],
      );
      res.json({ message: "Session closed" });
    } catch (err) {
      res.status(500).json({ error: "Failed to close session" });
    }
  },
);

module.exports = router;
