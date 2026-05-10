require("dotenv").config();
const Sentry = require("@sentry/node");

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
    tracesSampleRate: 0.1,
  });
}

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const logger = require("./config/logger");
const { loginLimiter, apiLimiter } = require("./middleware/rateLimiting");
const { requestLogger, errorHandler } = require("./middleware/logging");
const { WebSocketService } = require("./websocket/websocket.service");
const apiRoutes = require("./routes/api");
const { router: authRoutes } = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const paymentIyzicoRoutes = require("./routes/payment-iyzico");
const printerRoutes = require("./routes/printer");

const app = express();
const server = http.createServer(app);

// ─── Initialize WebSocket BEFORE middleware ─────────────
const wsService = new WebSocketService(server);
wsService.initialize();

// ─── Logging & Security Middleware ─────────────────────
// Request logging
app.use(requestLogger);

// Helmet for security headers
app.use(helmet());

// CORS configuration
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// General API rate limiting
app.use("/api", apiLimiter);

// ─── Response Interceptor (broadcast WS events) ─────────
app.use("/api", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    const pool = require("./config/database");
    const ts = new Date().toISOString();

    if (req.path === "/order" && req.method === "POST" && data.order) {
      pool
        .query("SELECT session_id FROM orders WHERE id = $1", [data.order.id])
        .then(async (result) => {
          if (result.rows.length === 0) return;
          const sessionId = result.rows[0].session_id;
          const [balanceResult, sessionResult] = await Promise.all([
            pool.query("SELECT get_remaining_balance($1)", [sessionId]),
            pool.query(
              "SELECT table_id, total_bill FROM table_sessions WHERE id = $1",
              [sessionId],
            ),
          ]);
          const remainingBalance = parseFloat(
            balanceResult.rows[0].get_remaining_balance,
          );
          const tableId = sessionResult.rows[0].table_id;
          const totalBill = parseFloat(sessionResult.rows[0].total_bill || 0);
          wsService.broadcast(sessionId, "order_added", {
            order: data.order,
            remainingBalance,
            timestamp: ts,
          });
          wsService.broadcastAdmin("admin_order_updated", {
            sessionId,
            tableId,
            totalBill,
            remainingBalance,
            order: data.order,
            timestamp: ts,
          });
        })
        .catch((err) => logger.error("[WS] order_added broadcast error:", err));
    }

    const paymentPaths = [
      "/payment",
      "/payment/full",
      "/payment/for",
      "/payment/item",
    ];
    if (
      paymentPaths.includes(req.path) &&
      req.method === "POST" &&
      data.payment
    ) {
      pool
        .query("SELECT session_id FROM payments WHERE id = $1", [
          data.payment.id,
        ])
        .then(async (result) => {
          if (result.rows.length === 0) return;
          const sessionId = result.rows[0].session_id;
          const sessionResult = await pool.query(
            "SELECT table_id, total_bill FROM table_sessions WHERE id = $1",
            [sessionId],
          );
          const tableId = sessionResult.rows[0].table_id;
          const totalBill = parseFloat(sessionResult.rows[0].total_bill || 0);
          const remainingBalance = data.remainingBalance;

          wsService.broadcast(sessionId, "payment_completed", {
            paymentId: data.payment.id,
            participantId: data.payment.participant_id,
            amount: data.payment.amount,
            remainingBalance,
            allSettled: data.allSettled,
            targetName: data.targetName,
            orderNames: data.orderNames,
            timestamp: ts,
          });
          wsService.broadcastAdmin("admin_payment_updated", {
            sessionId,
            tableId,
            totalBill,
            remainingBalance,
            payment: data.payment,
            allSettled: data.allSettled,
            timestamp: ts,
          });
        })
        .catch((err) => logger.error("[WS] payment broadcast error:", err));
    }

    return originalJson(data);
  };
  next();
});

// Routes
app.use("/api", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", apiRoutes);
app.use("/api/payment/iyzico", paymentIyzicoRoutes);
app.use("/api/admin/printer", printerRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Error Handling Middleware ─────────────────────────
// Global error handler (must be last middleware)
app.use(errorHandler);

// ─── Start server ──────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  logger.info(`Cafe Payment API running on port ${PORT}`);
  logger.info(`Health: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("[APP] SIGTERM received, shutting down...");
  server.close(() => process.exit(0));
});
