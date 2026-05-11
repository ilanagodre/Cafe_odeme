const pool = require("../config/database");
const logger = require("../config/logger");

const CHECK_INTERVAL_MS = 60_000; // her dakika
const WARN_BEFORE_EXPIRE_MIN = 15; // expire'dan 15 dk önce uyar

async function checkTimeouts(wsService) {
  try {
    const result = await pool.query(`
      SELECT ts.id, ts.table_id, t.table_number, ts.status, ts.expires_at, ts.session_type
      FROM table_sessions ts
      JOIN tables t ON ts.table_id = t.id
      WHERE ts.status IN ('active','waiting_service')
        AND ts.session_type = 'self_service'
        AND ts.timeout_warned_at IS NULL
        AND ts.expires_at IS NOT NULL
        AND ts.expires_at <= NOW() + INTERVAL '${WARN_BEFORE_EXPIRE_MIN} minutes'
    `);

    for (const row of result.rows) {
      await pool.query(
        "UPDATE table_sessions SET timeout_warned_at = NOW() WHERE id = $1",
        [row.id],
      );
      wsService.broadcastAdmin("session_timeout_warning", {
        sessionId: row.id,
        tableId: row.table_id,
        tableNumber: row.table_number,
        status: row.status,
        expiresAt: row.expires_at,
      });
      logger.info(
        `[TIMEOUT] Admin uyarıldı: session ${row.id} (Masa ${row.table_number})`,
      );
    }
  } catch (err) {
    logger.error("[TIMEOUT] Kontrol hatası:", err);
  }
}

function startTimeoutChecker(wsService) {
  const intervalId = setInterval(
    () => checkTimeouts(wsService),
    CHECK_INTERVAL_MS,
  );
  logger.info("[TIMEOUT] Checker başlatıldı");
  return () => clearInterval(intervalId);
}

module.exports = { startTimeoutChecker, checkTimeouts };
