import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'badge-scanner.db');
const db = new Database(dbPath);

// Enable WAL mode for concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

logger.info(`SQLite database opened at ${dbPath}`);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_number TEXT NOT NULL UNIQUE,
    upn TEXT NOT NULL,
    display_name TEXT NOT NULL,
    department TEXT,
    job_title TEXT,
    pdk_person_id TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_employees_card_number ON employees(card_number);
  CREATE INDEX IF NOT EXISTS idx_employees_upn ON employees(upn);

  CREATE TABLE IF NOT EXISTS scan_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER REFERENCES employees(id),
    card_number TEXT NOT NULL,
    scanned_at TEXT DEFAULT (datetime('now')),
    pdk_event_id TEXT,
    status TEXT DEFAULT 'success'
  );

  CREATE INDEX IF NOT EXISTS idx_scan_log_scanned_at ON scan_log(scanned_at);
`);

logger.info('Database tables initialized');

// Prepared statements
const stmts = {
  findByCard: db.prepare('SELECT * FROM employees WHERE card_number = ? AND active = 1'),
  findByUpn: db.prepare('SELECT * FROM employees WHERE upn = ? AND active = 1'),
  listAll: db.prepare('SELECT * FROM employees WHERE active = 1 ORDER BY display_name'),

  upsertEmployee: db.prepare(`
    INSERT INTO employees (card_number, upn, display_name, department, job_title, pdk_person_id)
    VALUES (@card_number, @upn, @display_name, @department, @job_title, @pdk_person_id)
    ON CONFLICT(card_number) DO UPDATE SET
      upn = @upn,
      display_name = @display_name,
      department = COALESCE(@department, department),
      job_title = COALESCE(@job_title, job_title),
      pdk_person_id = COALESCE(@pdk_person_id, pdk_person_id),
      updated_at = datetime('now')
  `),

  insertScan: db.prepare(`
    INSERT INTO scan_log (employee_id, card_number, pdk_event_id, status)
    VALUES (@employee_id, @card_number, @pdk_event_id, @status)
  `),

  todayScans: db.prepare(`
    SELECT sl.*, e.display_name, e.department, e.job_title
    FROM scan_log sl
    LEFT JOIN employees e ON sl.employee_id = e.id
    WHERE date(sl.scanned_at) = date('now')
    ORDER BY sl.scanned_at DESC
  `),

  recentScans: db.prepare(`
    SELECT sl.*, e.display_name, e.department, e.job_title
    FROM scan_log sl
    LEFT JOIN employees e ON sl.employee_id = e.id
    ORDER BY sl.scanned_at DESC
    LIMIT ?
  `),

  todayScanCount: db.prepare(`
    SELECT COUNT(*) as count FROM scan_log
    WHERE date(scanned_at) = date('now')
  `),
};

// Bulk insert transaction
const bulkUpsert = db.transaction((employees) => {
  for (const emp of employees) {
    stmts.upsertEmployee.run(emp);
  }
  return employees.length;
});

export { db, stmts, bulkUpsert };
export default db;
