const logger = require("../config/logger");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../routes/auth");

class WebSocketService {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        methods: ["GET", "POST"],
      },
    });
    this.rooms = new Map(); // sessionId → Set of socketIds
  }

  async initialize() {
    // Redis adapter (optional - if Redis is available)
    try {
      const pubClient = createClient({
        url: process.env.REDIS_URL || "redis://redis:6379",
      });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.io.adapter(createAdapter(pubClient, subClient));
      logger.info("[WS] Redis adapter connected");
    } catch (err) {
      logger.info("[WS] Redis not available, using in-memory adapter");
    }

    this.io.on("connection", (socket) => {
      logger.info(`[WS] Connected: ${socket.id}`);

      // ─── Join table session ──────────────────────────
      socket.on("join_table", async ({ sessionToken, participantId }) => {
        try {
          const pool = require("../config/database");
          const result = await pool.query(
            "SELECT id FROM table_sessions WHERE session_token = $1",
            [sessionToken],
          );

          if (result.rows.length === 0) {
            socket.emit("error", { message: "Invalid session" });
            return;
          }

          const sessionId = result.rows[0].id;
          const roomName = `table:${sessionId}`;

          socket.join(roomName);
          // Reconnect sonrası pending iptal timer'ını durdur
          if (socket.data?.disconnectTimer) {
            clearTimeout(socket.data.disconnectTimer);
          }
          socket.data = { sessionId, participantId };

          if (!this.rooms.has(sessionId)) {
            this.rooms.set(sessionId, new Set());
          }
          this.rooms.get(sessionId).add(socket.id);

          // Notify others
          socket.to(roomName).emit("participant_joined", {
            participantId,
            timestamp: new Date().toISOString(),
          });

          // Send full state
          const fullState = await this.getSessionState(sessionId);
          socket.emit("table_state", fullState);

          logger.info(`[WS] ${participantId} joined ${roomName}`);
        } catch (err) {
          socket.emit("error", { message: "Failed to join table" });
        }
      });

      // ─── Join admin updates room ─────────────────────
      socket.on("join_admin", () => {
        const token = socket.request.cookies?.token;
        if (!token) {
          socket.emit("error", { message: "Unauthorized" });
          return;
        }
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          if (!["owner", "head_waiter"].includes(decoded.role)) {
            socket.emit("error", { message: "Forbidden" });
            return;
          }
          socket.join("admin-updates");
        } catch {
          socket.emit("error", { message: "Invalid token" });
        }
      });

      // ─── Leave ───────────────────────────────────────
      socket.on("leave_table", () => {
        if (socket.data.sessionId) {
          const room = `table:${socket.data.sessionId}`;
          this.rooms.get(socket.data.sessionId)?.delete(socket.id);
          socket.leave(room);
          socket.to(room).emit("participant_left", {
            participantId: socket.data.participantId,
          });
        }
      });

      // ─── Disconnect ──────────────────────────────────
      socket.on("disconnect", () => {
        const { sessionId, participantId } = socket.data;
        if (sessionId) {
          this.rooms.get(sessionId)?.delete(socket.id);
          socket
            .to(`table:${sessionId}`)
            .emit("participant_left", { participantId });

          // 30 sn grace period — geçici kopuklukta siparişleri iptal etme
          socket.data.disconnectTimer = setTimeout(async () => {
            try {
              const pool = require("../config/database");
              const sessRes = await pool.query(
                "SELECT session_type FROM table_sessions WHERE id = $1",
                [sessionId],
              );
              if (sessRes.rows[0]?.session_type !== "self_service") return;

              const cancelled = await pool.query(
                `UPDATE orders SET status = 'cancelled', cancel_reason = 'Bağlantı kesildi', cancelled_at = NOW()
                 WHERE session_id = $1 AND ordered_by = $2 AND status = 'pending_payment'
                 RETURNING id`,
                [sessionId, participantId],
              );
              if (cancelled.rows.length > 0) {
                await pool.query(
                  "UPDATE table_sessions SET total_bill = (SELECT COALESCE(SUM(total_price),0) FROM orders WHERE session_id = $1 AND status != 'cancelled') WHERE id = $1",
                  [sessionId],
                );
                this.broadcast(sessionId, "orders_cancelled", {
                  orderIds: cancelled.rows.map((r) => r.id),
                  reason: "Bir katılımcının bağlantısı kesildi",
                });
              }
            } catch (err) {
              logger.error("[WS] Disconnect cleanup error:", err);
            }
          }, 30_000);
        }
      });
    });

    logger.info("[WS] Server initialized");
  }

  // ─── Broadcast helpers (called from routes) ──────────

  broadcast(sessionId, event, data) {
    if (!sessionId) return;
    this.io.to(`table:${sessionId}`).emit(event, data);
  }

  broadcastAdmin(event, data) {
    this.io.to("admin-updates").emit(event, data);
  }

  async getSessionState(sessionId) {
    const pool = require("../config/database");

    const [session, participants, orders, payments, balance] =
      await Promise.all([
        pool.query("SELECT * FROM table_sessions WHERE id = $1", [sessionId]),
        pool.query(
          "SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at",
          [sessionId],
        ),
        pool.query(
          "SELECT * FROM orders WHERE session_id = $1 ORDER BY created_at",
          [sessionId],
        ),
        pool.query(
          "SELECT * FROM payments WHERE session_id = $1 ORDER BY created_at",
          [sessionId],
        ),
        pool.query("SELECT get_remaining_balance($1)", [sessionId]),
      ]);

    return {
      session: session.rows[0],
      participants: participants.rows,
      orders: orders.rows,
      payments: payments.rows,
      remainingBalance: parseFloat(balance.rows[0].get_remaining_balance),
      timestamp: new Date().toISOString(),
    };
  }
}

let instance = null;

module.exports = {
  WebSocketService,
  setInstance: (ws) => {
    instance = ws;
  },
  get instance() {
    return instance;
  },
  broadcast: (sessionId, event, data) =>
    instance?.broadcast(sessionId, event, data),
  broadcastAdmin: (event, data) => instance?.broadcastAdmin(event, data),
};
