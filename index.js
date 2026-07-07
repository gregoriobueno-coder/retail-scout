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
  let sailingsInserted = 0;
  let pricesLogged = 0;
  const detectedDrops = [];

  const getPrevPrice = (sailingId, category, rateType) => {
    return new Promise((res) => {
      db.get(`
        SELECT base_rate FROM pricing_history
        WHERE sailing_id = ? AND category = ? AND rate_type = ?
        ORDER BY last_checked DESC LIMIT 1
      `, [sailingId, category, rateType], (err, row) => {
        if (err || !row) res(null);
        else res(row.base_rate);
      });
    });
  };

  const getAiPitch = (sailingId) => {
    return new Promise((res) => {
      db.get('SELECT ai_pitch FROM sailings WHERE sailing_id = ?', [sailingId], (err, row) => {
        if (err || !row) res(null);
        else res(row.ai_pitch);
      });
    });
  };

  for (const d of deals) {
    const prevPrice = await getPrevPrice(d.sailing_id, d.category, d.rate_type);
    
    if (prevPrice !== null && d.base_rate < prevPrice) {
      const diff = prevPrice - d.base_rate;
      const pct = Math.round((diff / prevPrice) * 100);
      detectedDrops.push({
        deal: d,
        oldPrice: prevPrice,
        newPrice: d.base_rate,
        saving: diff,
        pct: pct
      });
    }

    let aiPitch = await getAiPitch(d.sailing_id);
    if (!aiPitch && process.env.GEMINI_API_KEY) {
      try {
        const { generateSalesPitch } = require('./gemini-helper');
        console.log(`[Gemini] Generating client sales pitch for new sailing: ${d.sailing_id}...`);
        aiPitch = await generateSalesPitch(
          d.brand, d.ship, d.sail_date, d.nights, d.itinerary,
          d.base_rate, (d.max_price - d.base_rate), d.promotion_type, d.incentive
        );
      } catch (gemErr) {
        console.warn(`[Gemini] Failed to compile pitch:`, gemErr.message);
      }
    }

    await new Promise((res) => {
      db.run(`
        INSERT INTO sailings (sailing_id, brand, ship, sail_date, nights, itinerary, region, ports, promotion_type, incentive, theme, space_type, released_date, ai_pitch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sailing_id) DO UPDATE SET
          brand=excluded.brand,
          ship=excluded.ship,
          sail_date=excluded.sail_date,
          nights=excluded.nights,
          itinerary=excluded.itinerary,
          region=excluded.region,
          ports=excluded.ports,
          promotion_type=excluded.promotion_type,
          incentive=excluded.incentive,
          theme=excluded.theme,
          space_type=excluded.space_type,
          ai_pitch=COALESCE(excluded.ai_pitch, ai_pitch)
      `, [
        d.sailing_id, d.brand, d.ship, d.sail_date, d.nights, d.itinerary, d.region,
        d.ports || null, d.promotion_type || null, d.incentive || null, d.theme || null, d.space_type || null,
        new Date().toISOString().split('T')[0],
        aiPitch || null
      ], (err) => {
        if (err) {
          console.error(`[DB Error] Failed to insert sailing ${d.sailing_id}:`, err.message);
        } else {
          sailingsInserted++;
        }
        res();
      });
    });

    await new Promise((res) => {
      db.run(`
        INSERT INTO pricing_history (sailing_id, category, rate_type, base_rate, taxes_fees)
        VALUES (?, ?, ?, ?, ?)
      `, [d.sailing_id, d.category, d.rate_type, d.base_rate, d.taxes_fees], (err) => {
        if (err) {
          console.error(`[DB Error] Failed to log price for ${d.sailing_id}:`, err.message);
        } else {
          pricesLogged++;
        }
        res();
      });
    });
  }

  return { sailingsInserted, pricesLogged, detectedDrops };
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
      const { sailingsInserted, pricesLogged, detectedDrops } = await saveDealsToDatabase(allDeals);
      console.log('--------------------------------------------------');
      console.log(`✅ Success: Ingested ${sailingsInserted} sailings.`);
      console.log(`✅ Success: Logged ${pricesLogged} historical price updates.`);
      console.log('--------------------------------------------------');
      
      // Dispatch alerts for any price drops
      if (detectedDrops.length > 0) {
        console.log(`[Orchestrator] Detected ${detectedDrops.length} price drops. Dispatching notifications...`);
        const { sendNotification } = require('./notifier');
        for (const drop of detectedDrops) {
          const d = drop.deal;
          const msg = `🚢 *${d.brand} - ${d.ship}*\n` +
            `📅 *Sail Date*: ${d.sail_date} (${d.nights} Nights)\n` +
            `📍 *Itinerary*: ${d.itinerary}\n` +
            `🛏️ *Stateroom*: ${d.category} (${d.rate_type})\n` +
            `📉 *Price Drop*: from *$${drop.oldPrice}* down to *$${drop.newPrice}*!\n` +
            `💰 *You Save*: *$${drop.saving} (${drop.pct}%)*\n` +
            `🌐 [View Live Dashboard](https://gregoriobueno-coder.github.io/retail-scout/)`;
            
          await sendNotification(msg, 'Retail TA Rate Price Drop Detected!');
        }
      }

      // Compile static dashboard index.html
      compileRetailDashboard();

      // Close DB before Git Sync
      db.close((err) => {
        if (err) console.error('Error closing database:', err.message);
        else console.log('Database connection closed.');

        // Push updates to GitHub (skip when running on GitHub Actions to let workflow handle it)
        if (process.env.GITHUB_ACTIONS !== 'true') {
          pushToGit();
        } else {
          console.log('[Git Sync] Running on GitHub Actions. Skipping internal git push.');
        }
        console.log('==================================================');
      });
      return;
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
