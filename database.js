const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const dbPath = path.resolve(__dirname, process.env.DATABASE_PATH || 'retail_scout.db');
console.log(`Connecting to database at: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
  }
});

function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Create sailings table
      db.run(`
        CREATE TABLE IF NOT EXISTS sailings (
          sailing_id TEXT PRIMARY KEY,
          brand TEXT NOT NULL,
          ship TEXT NOT NULL,
          sail_date DATE NOT NULL,
          nights INTEGER NOT NULL,
          itinerary TEXT NOT NULL,
          region TEXT NOT NULL
        )
      `, (err) => {
        if (err) return reject(err);
      });

      // 2. Create pricing_history table
      db.run(`
        CREATE TABLE IF NOT EXISTS pricing_history (
          log_id INTEGER PRIMARY KEY AUTOINCREMENT,
          sailing_id TEXT NOT NULL,
          category TEXT NOT NULL,
          rate_type TEXT NOT NULL,
          base_rate REAL NOT NULL,
          taxes_fees REAL,
          last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(sailing_id) REFERENCES sailings(sailing_id)
        )
      `, (err) => {
        if (err) return reject(err);
        console.log('SQLite database tables initialized successfully.');
        resolve();
      });
    });
  });
}

if (require.main === module) {
  initDatabase().catch(err => {
    console.error('Database initialization failed:', err);
  });
}

module.exports = { db, initDatabase };
