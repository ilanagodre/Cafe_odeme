const winston = require('winston');
const path = require('path');
const fs = require('fs');

// ─── Logger Configuration ────────────────────────────

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir) && process.env.NODE_ENV === 'production') {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for logs
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaString = '';
    if (Object.keys(meta).length > 0) {
      metaString = ` | ${JSON.stringify(meta)}`;
    }
    return `${timestamp} [${level.toUpperCase()}] ${message}${metaString}`;
  })
);

// Console transport (all levels)
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    customFormat
  )
});

// File transports for production
const fileTransports = process.env.NODE_ENV === 'production'
  ? [
      // Error logs
      new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'error.log'),
        level: 'error',
        format: customFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      // Combined logs
      new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'combined.log'),
        format: customFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    ]
  : [];

// Create logger
const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports: [consoleTransport, ...fileTransports]
});

// Handle errors in logger itself
logger.on('error', (error) => {
  console.error('Winston logger error:', error);
});

module.exports = logger;
