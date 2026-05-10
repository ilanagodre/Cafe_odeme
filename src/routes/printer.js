const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const logger = require("../config/logger");
const { requireAuth, requireRole } = require("./auth");
const {
  printReceipt,
  printOrderSlip,
  testPrinter,
} = require("../services/printer.service");

// POST /api/admin/printer/receipt
router.post(
  "/receipt",
  requireAuth,
  requireRole(["owner", "head_waiter"]),
  async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId gerekli" });

    try {
      const [sessionResult, ordersResult] = await Promise.all([
        pool.query(
          `SELECT ts.total_bill, ts.paid_amount, t.table_number
           FROM table_sessions ts
           JOIN tables t ON t.id = ts.table_id
           WHERE ts.id = $1`,
          [sessionId],
        ),
        pool.query(
          `SELECT name, quantity, total_price
           FROM orders
           WHERE session_id = $1 AND status != 'cancelled'
           ORDER BY created_at`,
          [sessionId],
        ),
      ]);

      if (sessionResult.rows.length === 0)
        return res.status(404).json({ error: "Oturum bulunamadı" });

      const session = sessionResult.rows[0];

      await printReceipt({
        tableNumber: session.table_number,
        orders: ordersResult.rows,
        totalBill: session.total_bill,
        paidAmount: session.paid_amount,
      });

      res.json({ message: "Fiş yazdırıldı" });
    } catch (err) {
      logger.error("[Printer] Receipt error:", err.message);
      res.status(500).json({ error: err.message });
    }
  },
);

// POST /api/admin/printer/order
router.post(
  "/order",
  requireAuth,
  requireRole(["owner", "head_waiter", "waiter"]),
  async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId gerekli" });

    try {
      const result = await pool.query(
        `SELECT o.name, o.quantity, t.table_number, p.name AS participant_name
         FROM orders o
         JOIN table_sessions ts ON ts.id = o.session_id
         JOIN tables t ON t.id = ts.table_id
         LEFT JOIN participants p ON p.id = o.ordered_by
         WHERE o.session_id = $1 AND o.status != 'cancelled'
         ORDER BY o.created_at`,
        [sessionId],
      );

      if (result.rows.length === 0)
        return res.status(404).json({ error: "Sipariş bulunamadı" });

      const tableNumber = result.rows[0].table_number;
      const participantName = result.rows[0].participant_name;

      await printOrderSlip({
        tableNumber,
        orders: result.rows,
        participantName,
      });

      res.json({ message: "Mutfak fişi yazdırıldı" });
    } catch (err) {
      logger.error("[Printer] Order slip error:", err.message);
      res.status(500).json({ error: err.message });
    }
  },
);

// POST /api/admin/printer/test
router.post("/test", requireAuth, requireRole(["owner"]), async (req, res) => {
  const { type = "receipt" } = req.body;
  try {
    await testPrinter(type);
    res.json({
      message: `${type === "kitchen" ? "Mutfak" : "Fiş"} yazıcısı test başarılı`,
    });
  } catch (err) {
    logger.error("[Printer] Test error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/printer/status
router.get("/status", requireAuth, requireRole(["owner"]), (req, res) => {
  res.json({
    receipt: {
      configured: !!process.env.RECEIPT_PRINTER_HOST,
      host: process.env.RECEIPT_PRINTER_HOST || null,
      port: process.env.RECEIPT_PRINTER_PORT || "9100",
    },
    kitchen: {
      configured: !!process.env.KITCHEN_PRINTER_HOST,
      host: process.env.KITCHEN_PRINTER_HOST || null,
      port: process.env.KITCHEN_PRINTER_PORT || "9100",
    },
    cafeName: process.env.CAFE_NAME || null,
  });
});

module.exports = router;
