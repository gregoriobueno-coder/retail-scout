const { initDatabase, db } = require('./database');
const { scrapeVirginVoyages } = require('./scrapers/virgin');
const { scrapeDisneyCruiseLine } = require('./scrapers/disney');

async function saveDealsToDatabase(deals) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      let sailingsInserted = 0;
      let pricesLogged = 0;

      // 1. Prepare SQL Statements
      const insertSailing = db.prepare(`
        INSERT OR REPLACE INTO sailings (sailing_id, brand, ship, sail_date, nights, itinerary, region)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const logPrice = db.prepare(`
        INSERT INTO pricing_history (sailing_id, category, rate_type, base_rate, taxes_fees)
        VALUES (?, ?, ?, ?, ?)
      `);

      // 2. Loop and run queries
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

      // 3. Finalize
      insertSailing.finalize();
      logPrice.finalize((err) => {
        if (err) reject(err);
        else resolve({ sailingsInserted, pricesLogged });
      });
    });
  });
}

async function runOrchestrator() {
  console.log('==================================================');
  console.log('🐻 Starting Wandering Bear Retail Cruise Sync...');
  console.log('==================================================');

  // Initialize DB tables
  await initDatabase();

  const allDeals = [];

  // Run Virgin voyages Scraper
  try {
    const virginDeals = await scrapeVirginVoyages();
    allDeals.push(...virginDeals);
  } catch (e) {
    console.error('Error running Virgin Voyages Scraper:', e.message);
  }

  // Run Disney Cruise Line Scraper
  try {
    const disneyDeals = await scrapeDisneyCruiseLine();
    allDeals.push(...disneyDeals);
  } catch (e) {
    console.error('Error running Disney Cruise Line Scraper:', e.message);
  }

  console.log(`\n[Orchestrator] Processing total of ${allDeals.length} pricing points...`);

  if (allDeals.length > 0) {
    try {
      const { sailingsInserted, pricesLogged } = await saveDealsToDatabase(allDeals);
      console.log('--------------------------------------------------');
      console.log(`✅ Success: Ingested ${sailingsInserted} sailings.`);
      console.log(`✅ Success: Logged ${pricesLogged} historical price updates.`);
      console.log('--------------------------------------------------');
    } catch (dbErr) {
      console.error('Failed to save scraped data to SQLite database:', dbErr.message);
    }
  } else {
    console.log('⚠️ No cruise deals extracted to save.');
  }

  // Close Database Connection safely
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
