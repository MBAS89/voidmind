/**
 * VoidMind — SQLite Database (Admin Operational Data ONLY)
 * Stores: API keys (hashed), usage metrics (no content), admin audit logs.
 * ZERO user conversation data is stored here — sessions are RAM-only.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'admin.db');

// Ensure directory exists
const fs = require('fs');
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    logger.error('Failed to open SQLite database', { error: err.message });
    process.exit(1);
  }
  logger.info('SQLite database connected (admin data only)', { path: DB_PATH });
});

// Enable WAL mode for better concurrency
// WAL mode never stores user data — only admin operational data
db.exec('PRAGMA journal_mode = WAL;', (err) => {
  if (err) {
    logger.error('Failed to set WAL mode', { error: err.message });
  }
});

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

function initSchema() {
  db.serialize(() => {
    // API Keys table — operational metadata only, no user data
    db.run(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        monthly_limit INTEGER DEFAULT 0,
        daily_limit INTEGER DEFAULT 0,
        tokens_used INTEGER DEFAULT 0,
        tokens_used_today INTEGER DEFAULT 0,
        requests_today INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        last_reset_date TEXT DEFAULT (date('now')),
        expires_at TEXT,
        requests_per_minute INTEGER DEFAULT 60,
        burst_limit INTEGER DEFAULT 10,
        allowed_ips TEXT,
        tags TEXT
      )
    `);

    // Usage logs — token counts and latency only, NO content, NO user info
    db.run(`
      CREATE TABLE IF NOT EXISTS usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_id TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        status INTEGER DEFAULT 200,
        latency_ms INTEGER DEFAULT 0,
        model TEXT,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (key_id) REFERENCES api_keys(id) ON DELETE SET NULL
      )
    `);

    // Admin action audit log — who did what, when, from where
    db.run(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_email TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT,
        resource_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        timestamp TEXT DEFAULT (datetime('now'))
      )
    `);

    // Rate limits configuration per key
    db.run(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key_id TEXT PRIMARY KEY,
        requests_per_minute INTEGER DEFAULT 60,
        burst_limit INTEGER DEFAULT 10,
        window_ms INTEGER DEFAULT 60000,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (key_id) REFERENCES api_keys(id) ON DELETE CASCADE
      )
    `);

    // Admin accounts (allows password changes, multiple admins)
    db.run(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Admin refresh tokens (for revocation)
    db.run(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_jti TEXT NOT NULL UNIQUE,
        admin_email TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Index for fast lookups
    db.run('CREATE INDEX IF NOT EXISTS idx_usage_logs_key_id ON usage_logs(key_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp ON usage_logs(timestamp)');
    db.run('CREATE INDEX IF NOT EXISTS idx_admin_logs_email ON admin_logs(admin_email)');
    db.run('CREATE INDEX IF NOT EXISTS idx_admin_logs_timestamp ON admin_logs(timestamp)');
    db.run('CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email)');
  });

  logger.info('Database schema initialized (admin operational tables only)');
}

// Promisify common operations
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Bootstrap the first admin from environment variables.
 * If admins table is empty and ADMIN_EMAIL + ADMIN_PASSWORD_HASH are set,
 * creates the initial admin account.
 */
async function bootstrapAdmin() {
  try {
    const count = await getAsync('SELECT COUNT(*) as count FROM admins');
    if (count && count.count > 0) {
      return; // Admins already exist
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminEmail || !adminHash) {
      logger.warn('No admin credentials configured in environment. Admin login will not work.');
      return;
    }

    await runAsync(
      `INSERT INTO admins (email, password_hash, name)
       VALUES (?, ?, ?)`,
      [adminEmail, adminHash, 'Administrator']
    );

    logger.info('Bootstrap admin created from environment variables', { email: adminEmail });
  } catch (err) {
    logger.error('Failed to bootstrap admin', { error: err.message });
  }
}

module.exports = {
  db,
  initSchema,
  bootstrapAdmin,
  runAsync,
  getAsync,
  allAsync,
};
