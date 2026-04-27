const logger = require('../config/logger');

// ─── Request Logging Middleware ────────────────────────

function requestLogger(req, res, next) {
  const start = Date.now();

  // Log request
  const requestId = req.id || Math.random().toString(36).substr(2, 9);
  req.id = requestId;

  // Capture original send function
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    // Log request completion
    logger.info(`${req.method} ${req.path}`, {
      requestId,
      statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    });

    // Log warnings for high latency
    if (duration > 1000) {
      logger.warn(`Slow API response detected`, {
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
        statusCode
      });
    }

    // Call original send
    return originalSend.call(this, data);
  };

  next();
}

// ─── Error Handling Middleware ────────────────────────

function errorHandler(err, req, res, next) {
  const requestId = req.id || 'unknown';

  // Log error with full context
  logger.error(`Unhandled error: ${err.message}`, {
    requestId,
    method: req.method,
    path: req.path,
    statusCode: err.statusCode || 500,
    stack: err.stack,
    userId: req.user?.id
  });

  // Determine status code
  const statusCode = err.statusCode || 500;

  // Send error response without leaking sensitive details
  const errorResponse = {
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    requestId // For debugging
  };

  res.status(statusCode).json(errorResponse);
}

// ─── Audit Logging Helper ────────────────────────────

function logAuditEvent(userId, action, entityType, entityId, details = {}) {
  logger.info(`Audit event: ${action}`, {
    userId,
    action,
    entityType,
    entityId,
    ...details,
    timestamp: new Date().toISOString()
  });
}

module.exports = { requestLogger, errorHandler, logAuditEvent };
