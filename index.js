const { initDatabase, db } = require('./database');
const { scrapeVirginVoyages } = require('./scrapers/virgin');
const { scrapeDisneyCruiseLine } = require('./scrapers/disney');
const { scrapeRoyalCaribbean } = require('./scrapers/royal');
const { scrapeCarnival } = require('./scrapers/carnival');
const { scrapeOneSourcePublic } = require('./scrapers/onesource');
const { scrapeSignature } = require('./scrapers/signature');
const { compileRetailDashboard } = require('./dashboard-compiler');
const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config();

async function saveDealsToDatabase(deals) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      let sailingsInserted = 0;
      let pricesLogged = 0;

      const insertSailing = db.prepare(`
        INSERT OR REPLACE INTO sailings (sailing_id, brand, ship, sail_date, nights, itinerary, region)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const logPrice = db.prepare(`
        INSERT INTO pricing_history (sailing_id, category, rate_type, base_rate, taxes_fees)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const d of deals) {
        insertSailing.run(
          d.sailing_id,
          d.brand,
          d.ship,
          d.sail_date,
          d.nights,
          d.itinerary,
          d.region,
          (err) => {
            if (err) console.error(`Failed to upsert sailing ${d.sailing_id}:`, err.message);
          }
        );
        sailingsInserted++;

        logPrice.run(
          d.sailing_id,
          d.category,
          d.rate_type,
          d.base_rate,
          d.taxes_fees,
          (err) => {
            if (err) console.error(`Failed to log price for ${d.sailing_id}:`, err.message);
          }
        );
        pricesLogged++;
      }

      insertSailing.finalize();
      logPrice.finalize((err) => {
        if (err) reject(err);
        else resolve({ sailingsInserted, pricesLogged });
      });
    });
  });
}

function pushToGit() {
  try {
    console.log('[Git Sync] Staging, committing, and pushing static updates to GitHub...');
    execSync('git add index.html', { cwd: __dirname });
    // Use ignore on commit to prevent errors when there are no changes
    execSync('git commit -m "Automated Sync: Update retail pricing dashboard"', { cwd: __dirname, stdio: 'ignore' });
    execSync('git push origin main', { cwd: __dirname });
    console.log('[Git Sync] Codebase pushed successfully.');
  } catch (err) {
    console.warn('[Git Sync] Pushing failed or no changes to commit:', err.message);
  }
}

async function runOrchestrator() {
  console.log('==================================================');
  console.log('🐻 Starting Wandering Bear Retail Cruise Sync...');
  console.log('==================================================');

  // Initialize DB tables
  await initDatabase();

  const allDeals = [];

  // 1. Run Virgin Voyages Scraper
  try {
    const virginDeals = await scrapeVirginVoyages();
    allDeals.push(...virginDeals);
  } catch (e) {
    console.error('Error running Virgin Voyages Scraper:', e.message);
  }

  // 2. Run Disney Cruise Line Scraper
  try {
    const disneyDeals = await scrapeDisneyCruiseLine();
    allDeals.push(...disneyDeals);
  } catch (e) {
    console.error('Error running Disney Cruise Line Scraper:', e.message);
  }

  // 3. Run Royal Caribbean & Celebrity Scraper
  try {
    const royalDeals = await scrapeRoyalCaribbean();
    allDeals.push(...royalDeals);
  } catch (e) {
    console.error('Error running Royal Caribbean Scraper:', e.message);
  }

  // 4. Run Carnival Scraper
  try {
    const carnivalDeals = await scrapeCarnival();
    allDeals.push(...carnivalDeals);
  } catch (e) {
    console.error('Error running Carnival Scraper:', e.message);
  }

  // 5. Run OneSource Public Scraper
  try {
    const onesourceDeals = await scrapeOneSourcePublic();
    allDeals.push(...onesourceDeals);
  } catch (e) {
    console.error('Error running OneSource Public Scraper:', e.message);
  }

  // 6. Run Signature Travel Network Scraper
  try {
    const signatureDeals = await scrapeSignature();
    allDeals.push(...signatureDeals);
  } catch (e) {
    console.error('Error running Signature Scraper:', e.message);
  }

  console.log(`\n[Orchestrator] Processing total of ${allDeals.length} pricing points...`);

  if (allDeals.length > 0) {
    try {
      const { sailingsInserted, pricesLogged } = await saveDealsToDatabase(allDeals);
      console.log('--------------------------------------------------');
      console.log(`✅ Success: Ingested ${sailingsInserted} sailings.`);
      console.log(`✅ Success: Logged ${pricesLogged} historical price updates.`);
      console.log('--------------------------------------------------');
      
      // Compile static dashboard index.html
      compileRetailDashboard();

      // Close DB before Git Sync
      db.close((err) => {
        if (err) console.error('Error closing database:', err.message);
        else console.log('Database connection closed.');

        // Push updates to GitHub
        pushToGit();
        console.log('==================================================');
      });
      return; // DB closure handler takes care of exit logging
    } catch (dbErr) {
      console.error('Failed to save scraped data to SQLite database:', dbErr.message);
    }
  } else {
    console.log('⚠️ No cruise deals extracted to save.');
  }

  db.close((err) => {
    if (err) console.error('Error closing database:', err.message);
    else console.log('Database connection closed.');
    console.log('==================================================');
  });
}

if (require.main === module) {
  runOrchestrator();
}

module.exports = { runOrchestrator };
