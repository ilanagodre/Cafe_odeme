const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const pool = require('../config/database');
const { getIyzico } = require('../config/iyzico');
const websocketService = require('../websocket/websocket.service');

const router = express.Router();

// ─── VALIDATION MIDDLEWARE ──────────────────────────────────────────

function validateSchema(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const messages = error.details.map(d => d.message).join(', ');
      return res.status(400).json({ error: `Validation failed: ${messages}` });
    }

    req.body = value;
    next();
  };
}

// ─── VALIDATION SCHEMAS ────────────────────────────────────────────

const iyzicoInitiateSchema = Joi.object({
  sessionToken: Joi.string().length(32).required(),
  participantId: Joi.string().uuid().required(),
  amount: Joi.number().positive().precision(2).required(),
  paymentMode: Joi.string().valid('self', 'all', 'other', 'item').required(),
  targetId: Joi.string().uuid().optional().allow(null),
  orderIds: Joi.array().items(Joi.string().uuid()).optional().allow(null),
  card: Joi.object({
    cardHolderName: Joi.string().min(2).max(50).required(),
    cardNumber: Joi.string().regex(/^\d{16}$/).required(),
    expireMonth: Joi.string().regex(/^\d{2}$/).required(),
    expireYear: Joi.string().regex(/^\d{4}$/).required(),
    cvc: Joi.string().regex(/^\d{3,4}$/).required()
  }).required()
});

// ─── HELPER FUNCTIONS ──────────────────────────────────────────────

async function getSessionData(sessionToken) {
  const result = await pool.query(
    `SELECT ts.id as session_id, ts.table_id
     FROM table_sessions ts
     WHERE ts.session_token = $1 AND ts.status = 'active'
     LIMIT 1`,
    [sessionToken]
  );
  return result.rows[0] || null;
}

async function createPendingPayment(sessionId, participantId, amount, paymentMode) {
  const paymentId = uuidv4();
  const conversationId = uuidv4();

  await pool.query(
    `INSERT INTO payments (id, session_id, participant_id, amount, payment_type, status, provider, provider_reference)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [paymentId, sessionId, participantId, amount, 'iyzico_3ds', 'pending', 'iyzico', conversationId]
  );

  return { paymentId, conversationId };
}

async function getBasketItems(sessionId) {
  const result = await pool.query(
    `SELECT id, name, total_price as price, quantity
     FROM orders
     WHERE session_id = $1 AND status != 'cancelled'
     LIMIT 100`,
    [sessionId]
  );
  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    price: parseFloat(row.price).toString(),
    quantity: row.quantity.toString()
  }));
}

// ─── ROUTES ────────────────────────────────────────────────────────────

router.post('/initiate', validateSchema(iyzicoInitiateSchema), async (req, res) => {
  try {
    const { sessionToken, participantId, amount, paymentMode, card } = req.body;
    console.log('[IYZICO] Initiate request:', { sessionToken, participantId, amount, paymentMode });

    // Validate session and participant
    const session = await getSessionData(sessionToken);
    console.log('[IYZICO] Session data:', session);
    if (!session) {
      return res.status(404).json({ error: 'Oturum bulunamadı' });
    }

    // Create pending payment record
    const { paymentId, conversationId } = await createPendingPayment(
      session.session_id,
      participantId,
      amount,
      paymentMode
    );
    console.log('[IYZICO] Payment created:', { paymentId, conversationId });

    // Get basket items for Iyzico
    const basketItems = await getBasketItems(session.session_id);
    console.log('[IYZICO] Basket items:', basketItems);

    // Prepare Iyzico request
    const iyzcoRequest = {
      locale: 'tr',
      conversationId: conversationId,
      price: amount.toString(),
      paidPrice: amount.toString(),
      currency: 'TRY',
      installment: '1',
      basketId: session.session_id,
      paymentChannel: 'WEB',
      paymentGroup: 'PRODUCT',
      paymentCard: {
        cardUserKey: 'GUEST_USER',
        cardNumber: card.cardNumber,
        expireMonth: card.expireMonth,
        expireYear: card.expireYear,
        cvc: card.cvc,
        cardHolderName: card.cardHolderName,
        registerCard: '0'
      },
      buyer: {
        id: participantId,
        name: 'Customer',
        surname: 'User',
        gsmNumber: '+905000000000',
        email: 'guest@cafe.local',
        identityNumber: '00000000000',
        lastLoginDate: new Date().toISOString(),
        registrationDate: new Date().toISOString(),
        registrationAddress: 'N/A',
        ip: req.ip,
        city: 'Istanbul',
        country: 'Turkey',
        zipCode: '00000'
      },
      billingAddress: {
        contactName: 'Customer',
        city: 'Istanbul',
        country: 'Turkey',
        address: 'N/A',
        zipCode: '00000'
      },
      shippingAddress: {
        contactName: 'Customer',
        city: 'Istanbul',
        country: 'Turkey',
        address: 'N/A',
        zipCode: '00000'
      },
      basketItems: basketItems,
      callbackUrl: process.env.IYZICO_CALLBACK_URL
    };

    // Call Iyzico API
    console.log('[IYZICO] Calling API with request:', JSON.stringify(iyzcoRequest, null, 2));

    try {
      getIyzico().threedsPayment.create(iyzcoRequest, (err, result) => {
        console.log('[IYZICO] Callback invoked');
        if (err) {
          console.error('[IYZICO] API Error:', err);
          return res.status(400).json({
            error: 'Ödeme başlatılamadı: ' + (err.message || 'Bilinmeyen hata')
          });
        }

        console.log('[IYZICO] API Result:', result);
        if (result.status !== 'success') {
          return res.status(400).json({
            error: result.errorMessage || 'Ödeme başlatılamadı'
          });
        }

        // Return HTML content for 3DS form
        res.json({
          htmlContent: result.htmlContent,
          threeDsServerTransId: result.threeDsServerTransId,
          paymentId: paymentId
        });
      });
    } catch (iyzicoErr) {
      console.error('[IYZICO] getIyzico error:', iyzicoErr);
      return res.status(500).json({ error: 'Ödeme sistemi hatası' });
    }
  } catch (err) {
    console.error('Iyzico initiate error:', err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.post('/callback', async (req, res) => {
  try {
    const { token, status, paymentId, conversationId } = req.body;

    if (!token || !conversationId) {
      return res.status(400).json({ error: 'Geçersiz callback' });
    }

    // Retrieve payment from Iyzico
    getIyzico().threedsPayment.retrieve(
      { token: token, conversationId: conversationId },
      async (err, result) => {
        if (err) {
          console.error('Iyzico retrieve error:', err);
          // Send error page to iframe
          return res.send(
            '<html><body><h1>Hata</h1><p>Ödeme doğrulanamadı. Lütfen tekrar deneyin.</p></body></html>'
          );
        }

        if (result.status === 'success' && result.paymentStatus === 'CAPTURED') {
          // Update payment record
          await pool.query(
            `UPDATE payments
             SET status = $1, completed_at = NOW(), provider_reference = $2, provider_payload = $3
             WHERE provider_reference = $4`,
            ['completed', result.paymentId, JSON.stringify(result), conversationId]
          );

          // Get session for WebSocket broadcast
          const paymentResult = await pool.query(
            `SELECT session_id FROM payments WHERE provider_reference = $1 LIMIT 1`,
            [result.paymentId]
          );

          if (paymentResult.rows.length > 0) {
            const sessionId = paymentResult.rows[0].session_id;

            // Emit WebSocket event to all participants
            websocketService.emitToRoom(`table_${sessionId}`, 'payment_completed', {
              paymentId: result.paymentId,
              amount: result.paidPrice,
              message: 'Ödeme başarılı'
            });
          }

          // Send success page to iframe
          return res.send(
            `<html><body style="text-align:center;padding:50px;font-family:sans-serif">
              <h1 style="color:green">✓ Ödeme Başarılı</h1>
              <p>Ödemeniz tamamlandı. Yönlendiriliyorsunuz...</p>
              <script>
                window.parent.postMessage({ type: 'payment_success' }, '*');
              </script>
            </body></html>`
          );
        } else {
          // Mark payment as failed
          await pool.query(
            `UPDATE payments
             SET status = $1, provider_reference = $2, provider_payload = $3
             WHERE provider_reference = $4`,
            ['failed', result.paymentId || null, JSON.stringify(result), conversationId]
          );

          // Send error page to iframe
          return res.send(
            `<html><body style="text-align:center;padding:50px;font-family:sans-serif;color:red">
              <h1>✗ Ödeme Başarısız</h1>
              <p>${result.errorMessage || 'Ödeme işlemi tamamlanamadı'}</p>
              <script>
                window.parent.postMessage({ type: 'payment_error', message: '${result.errorMessage || 'Ödeme başarısız'}' }, '*');
              </script>
            </body></html>`
          );
        }
      }
    );
  } catch (err) {
    console.error('Iyzico callback error:', err);
    res.send(
      '<html><body><h1>Hata</h1><p>Bir hata oluştu. Lütfen tekrar deneyin.</p></body></html>'
    );
  }
});

module.exports = router;
