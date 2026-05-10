const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Joi = require("joi");
const pool = require("../config/database");
const { getIyzico } = require("../config/iyzico");
const websocketService = require("../websocket/websocket.service");
const logger = require("../config/logger");

const router = express.Router();

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── VALIDATION ────────────────────────────────────────────────────

function validateSchema(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const messages = error.details.map((d) => d.message).join(", ");
      return res.status(400).json({ error: `Validation failed: ${messages}` });
    }
    req.body = value;
    next();
  };
}

const iyzicoInitiateSchema = Joi.object({
  sessionToken: Joi.string().uuid().required(),
  participantId: Joi.string().uuid().required(),
  amount: Joi.number().positive().precision(2).required(),
  paymentMode: Joi.string().valid("self", "all", "other", "item").required(),
  targetId: Joi.string().uuid().optional().allow(null),
  orderIds: Joi.array().items(Joi.string().uuid()).optional().allow(null),
  card: Joi.object({
    cardHolderName: Joi.string().min(2).max(50).required(),
    cardNumber: Joi.string()
      .regex(/^\d{16}$/)
      .required(),
    expireMonth: Joi.string()
      .regex(/^\d{2}$/)
      .required(),
    expireYear: Joi.string()
      .regex(/^\d{4}$/)
      .required(),
    cvc: Joi.string()
      .regex(/^\d{3,4}$/)
      .required(),
  }).required(),
});

// ─── HELPERS ───────────────────────────────────────────────────────

async function getSessionData(sessionToken) {
  const result = await pool.query(
    `SELECT ts.id as session_id, ts.table_id
     FROM table_sessions ts
     WHERE ts.session_token = $1 AND ts.status = 'active'
     LIMIT 1`,
    [sessionToken],
  );
  return result.rows[0] || null;
}

async function createPendingPayment(
  sessionId,
  participantId,
  amount,
  paymentMode,
  targetId,
  orderIds,
) {
  const paymentId = uuidv4();
  const conversationId = uuidv4();

  await pool.query(
    `INSERT INTO payments
       (id, session_id, participant_id, amount, payment_type, status,
        provider, provider_reference, payment_mode, target_id, order_ids)
     VALUES ($1, $2, $3, $4, 'iyzico_3ds', 'pending', 'iyzico', $5, $6, $7, $8)`,
    [
      paymentId,
      sessionId,
      participantId,
      amount,
      conversationId,
      paymentMode,
      targetId || null,
      orderIds ? JSON.stringify(orderIds) : null,
    ],
  );

  return { paymentId, conversationId };
}

async function getBasketItems(sessionId) {
  const result = await pool.query(
    `SELECT id, name, total_price as price, quantity
     FROM orders
     WHERE session_id = $1 AND status != 'cancelled'
     LIMIT 100`,
    [sessionId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    price: parseFloat(row.price).toString(),
    quantity: row.quantity.toString(),
  }));
}

// After iyzico confirms payment: update DB and return session balance
async function finalizePayment(conversationId, iyzicoPaymentId, iyzicoResult) {
  // Mark payment as completed
  await pool.query(
    `UPDATE payments
     SET status = 'completed', completed_at = NOW(),
         provider_reference = $1, provider_payload = $2
     WHERE provider_reference = $3`,
    [iyzicoPaymentId, JSON.stringify(iyzicoResult), conversationId],
  );

  // Fetch full payment record to get mode info
  const paymentResult = await pool.query(
    `SELECT p.*, p.order_ids
     FROM payments p
     WHERE p.provider_reference = $1
     LIMIT 1`,
    [iyzicoPaymentId],
  );

  if (paymentResult.rows.length === 0) return null;

  const payment = paymentResult.rows[0];
  const { session_id, participant_id, payment_mode, target_id, order_ids } =
    payment;

  // "item" mode: mark specific orders as paid
  if (payment_mode === "item" && order_ids) {
    const ids = Array.isArray(order_ids) ? order_ids : JSON.parse(order_ids);
    if (ids.length > 0) {
      const placeholders = ids.map((_, i) => `$${i + 2}`).join(",");
      await pool.query(
        `UPDATE orders SET paid_by = $1 WHERE id IN (${placeholders})`,
        [participant_id, ...ids],
      );
    }
  }

  // Update session paid_amount (all modes)
  await pool.query(
    `UPDATE table_sessions
     SET paid_amount = (
       SELECT COALESCE(SUM(amount), 0)
       FROM payments
       WHERE session_id = $1 AND status = 'completed'
     )
     WHERE id = $1`,
    [session_id],
  );

  // Check remaining balance — close session if fully paid
  const balanceResult = await pool.query("SELECT get_remaining_balance($1)", [
    session_id,
  ]);
  const remainingBalance = parseFloat(
    balanceResult.rows[0].get_remaining_balance,
  );

  if (remainingBalance <= 0) {
    await pool.query(
      "UPDATE table_sessions SET status = 'closed', closed_at = NOW() WHERE id = $1",
      [session_id],
    );
  }

  // Fetch extra context for WebSocket event
  let targetName = null;
  if (payment_mode === "other" && target_id) {
    const targetResult = await pool.query(
      "SELECT name FROM participants WHERE id = $1",
      [target_id],
    );
    if (targetResult.rows.length > 0) targetName = targetResult.rows[0].name;
  }

  let orderNames = null;
  if (payment_mode === "item" && order_ids) {
    const ids = Array.isArray(order_ids) ? order_ids : JSON.parse(order_ids);
    if (ids.length > 0) {
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
      const ordersResult = await pool.query(
        `SELECT name FROM orders WHERE id IN (${placeholders})`,
        ids,
      );
      orderNames = ordersResult.rows.map((o) => o.name).join(", ");
    }
  }

  return { payment, session_id, remainingBalance, targetName, orderNames };
}

// ─── ROUTES ────────────────────────────────────────────────────────

router.post(
  "/initiate",
  validateSchema(iyzicoInitiateSchema),
  async (req, res) => {
    try {
      const {
        sessionToken,
        participantId,
        amount,
        paymentMode,
        targetId,
        orderIds,
        card,
      } = req.body;

      const session = await getSessionData(sessionToken);
      if (!session) {
        return res.status(404).json({ error: "Oturum bulunamadı" });
      }

      const { paymentId, conversationId } = await createPendingPayment(
        session.session_id,
        participantId,
        amount,
        paymentMode,
        targetId,
        orderIds,
      );

      const basketItems = await getBasketItems(session.session_id);

      const iyzicoRequest = {
        locale: "tr",
        conversationId,
        price: amount.toString(),
        paidPrice: amount.toString(),
        currency: "TRY",
        installment: "1",
        basketId: session.session_id,
        paymentChannel: "WEB",
        paymentGroup: "PRODUCT",
        paymentCard: {
          cardUserKey: "GUEST_USER",
          cardNumber: card.cardNumber,
          expireMonth: card.expireMonth,
          expireYear: card.expireYear,
          cvc: card.cvc,
          cardHolderName: card.cardHolderName,
          registerCard: "0",
        },
        buyer: {
          id: participantId,
          name: "Customer",
          surname: "User",
          gsmNumber: "+905000000000",
          email: "guest@cafe.local",
          identityNumber: "00000000000",
          lastLoginDate: new Date().toISOString(),
          registrationDate: new Date().toISOString(),
          registrationAddress: "N/A",
          ip: req.ip,
          city: "Istanbul",
          country: "Turkey",
          zipCode: "00000",
        },
        billingAddress: {
          contactName: "Customer",
          city: "Istanbul",
          country: "Turkey",
          address: "N/A",
          zipCode: "00000",
        },
        shippingAddress: {
          contactName: "Customer",
          city: "Istanbul",
          country: "Turkey",
          address: "N/A",
          zipCode: "00000",
        },
        basketItems,
        callbackUrl: process.env.IYZICO_CALLBACK_URL,
      };

      getIyzico().threedsPayment.create(iyzicoRequest, (err, result) => {
        if (err) {
          return res.status(400).json({
            error: "Ödeme başlatılamadı: " + (err.message || "Bilinmeyen hata"),
          });
        }
        if (result.status !== "success") {
          return res
            .status(400)
            .json({ error: result.errorMessage || "Ödeme başlatılamadı" });
        }
        res.json({
          htmlContent: result.htmlContent,
          threeDsServerTransId: result.threeDsServerTransId,
          paymentId,
        });
      });
    } catch (err) {
      logger.error("Iyzico initiate error:", err);
      res.status(500).json({ error: "Sunucu hatası" });
    }
  },
);

router.post("/callback", async (req, res) => {
  try {
    const { token, conversationId } = req.body;

    if (!token || !conversationId) {
      return res.status(400).json({ error: "Geçersiz callback" });
    }

    getIyzico().threedsPayment.retrieve(
      { token, conversationId },
      async (err, result) => {
        if (err) {
          logger.error("Iyzico retrieve error:", err);
          return res.send(
            "<html><body><h1>Hata</h1><p>Ödeme doğrulanamadı. Lütfen tekrar deneyin.</p></body></html>",
          );
        }

        if (
          result.status === "success" &&
          result.paymentStatus === "CAPTURED"
        ) {
          const data = await finalizePayment(
            conversationId,
            result.paymentId,
            result,
          );

          if (data) {
            const {
              payment,
              session_id,
              remainingBalance,
              targetName,
              orderNames,
            } = data;

            websocketService.emitToRoom(
              `table_${session_id}`,
              "payment_completed",
              {
                paymentId: result.paymentId,
                participantId: payment.participant_id,
                amount: payment.amount,
                paymentMode: payment.payment_mode,
                remainingBalance,
                allSettled: remainingBalance <= 0,
                targetName,
                orderNames,
              },
            );
          }

          return res.send(
            `<html><body style="text-align:center;padding:50px;font-family:sans-serif">
              <h1 style="color:green">✓ Ödeme Başarılı</h1>
              <p>Ödemeniz tamamlandı. Yönlendiriliyorsunuz...</p>
              <script>
                window.parent.postMessage({ type: 'payment_success' }, '${process.env.FRONTEND_URL}');
              </script>
            </body></html>`,
          );
        } else {
          // Mark payment as failed
          await pool.query(
            `UPDATE payments
             SET status = 'failed', provider_reference = $1, provider_payload = $2
             WHERE provider_reference = $3`,
            [result.paymentId || null, JSON.stringify(result), conversationId],
          );

          return res.send(
            `<html><body style="text-align:center;padding:50px;font-family:sans-serif;color:red">
              <h1>✗ Ödeme Başarısız</h1>
              <p>${escapeHtml(result.errorMessage || "Ödeme işlemi tamamlanamadı")}</p>
              <script>
                window.parent.postMessage({ type: 'payment_error', message: ${JSON.stringify(result.errorMessage || "Ödeme başarısız")} }, '${process.env.FRONTEND_URL}');
              </script>
            </body></html>`,
          );
        }
      },
    );
  } catch (err) {
    logger.error("Iyzico callback error:", err);
    res.send(
      "<html><body><h1>Hata</h1><p>Bir hata oluştu. Lütfen tekrar deneyin.</p></body></html>",
    );
  }
});

module.exports = router;
