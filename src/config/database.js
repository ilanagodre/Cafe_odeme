const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('FATAL: DATABASE_URL environment variable is not set. Cannot start server.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

// Test connection
pool.on('connect', () => require('./logger').info('[DB] Connected to PostgreSQL'));
pool.on('error', (err) => require('./logger').error('[DB] Pool error:', err));

module.exports = pool;
