const { chromium } = require('playwright');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

async function runAccuracyTest() {
  console.log('==================================================');
  console.log('🧪 Starting Price Accuracy Verification Test...');
  console.log('==================================================');

  const authStatePath = path.join(__dirname, '..', 'auth', 'signature-state.json');
  const dbPath = path.join(__dirname, '..', 'retail_scout.db');
  
  const db = new sqlite3.Database(dbPath);

  console.log('[Test] Launching headless browser to parse live SigNet DOM...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: authStatePath });
  const page = await context.newPage();

  const startUrl = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&cruiseType=&departMonth=null&departYear=null&fromDate=&toDate=&startLength=1&endLength=20&priceStart=0&priceEnd=4100&offerType=cse&offerType=privateCollection&offerType=exclusive&advancedOnly=1&advancedFlag=1&adFlag=1&type=intranet&agency_id=3462&utp=AGENT&userid=71094';
  
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('span.offerMatchCount');

  // Extract first few priced deals from the live DOM
  const domDeals = await page.evaluate(() => {
    const table = document.querySelector('div#cruise_search_results_div > table');
    if (!table) return [];
    const rows = Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > tr'));
    const headerRow = rows.find(r => r.innerText.includes('Date') && r.innerText.includes('Nights') && r.innerText.includes('Price'));
    if (!headerRow) return [];

    const headers = Array.from(headerRow.querySelectorAll(':scope > th, :scope > td')).map(h => h.innerText.trim());
    const dateIdx = headers.findIndex(h => h.includes('Date'));
    const shipIdx = headers.findIndex(h => h.includes('Ship') || h.includes('Cruise Line'));
    const nightsIdx = headers.findIndex(h => h.includes('Nights'));
    const priceIdx = headers.findIndex(h => h.includes('Price'));
    const itineraryIdx = headers.findIndex(h => h.includes('Title') || h.includes('Theme'));
    const offerIdIdx = headers.findIndex(h => h.includes('Offer'));

    const results = [];
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll(':scope > td')).map(c => c.innerText.trim());
      if (cells.length < Math.max(dateIdx, shipIdx, nightsIdx, priceIdx)) continue;
      
      const dateText = cells[dateIdx] || '';
      if (!/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateText)) continue;
      
      const priceText = cells[priceIdx] || '';
      const price = parseInt(priceText.replace(/[^0-9]/g, '')) || 0;
      if (price > 0) {
        results.push({
          date: dateText,
          shipText: cells[shipIdx] || '',
          nights: parseInt(cells[nightsIdx]) || 7,
          itinerary: cells[itineraryIdx] || '',
          price: price,
          offerId: offerIdIdx !== -1 ? cells[offerIdIdx] || '' : ''
        });
      }
    }
    return results;
  });

  console.log(`[Test] Found ${domDeals.length} priced deals in live DOM. Checking database matches...`);

  let passed = 0;
  let failed = 0;

  const queryDbPrice = (sailingId, category, rateType) => {
    return new Promise((resolve) => {
      db.get(`
        SELECT base_rate FROM pricing_history
        WHERE sailing_id = ? AND category = ? AND rate_type = ?
        ORDER BY last_checked DESC LIMIT 1
      `, [sailingId, category, rateType], (err, row) => {
        if (err || !row) resolve(null);
        else resolve(row.base_rate);
      });
    });
  };

  const knownBrands = [
    'AmaWaterways', 'Avalon Waterways', 'Celebrity Cruises', 'Celebrity', 
    'Royal Caribbean', 'Disney Cruise Line', 'Disney', 'Carnival Cruise Line', 
    'Carnival', 'Princess Cruises', 'Princess', 'Holland America Line', 'Holland America', 
    'Cunard Line', 'Cunard', 'Seabourn', 'Silversea', 'Ponant Explorations', 'Ponant',
    'Viking Cruises', 'Viking'
  ];

  for (const dom of domDeals) {
    let cleanDate = dom.date;
    try {
      cleanDate = new Date(dom.date).toISOString().split('T')[0];
    } catch (e) {}

    let brand = 'Signature Promo';
    let ship = dom.shipText;

    for (const kb of knownBrands) {
      if (dom.shipText.toLowerCase().includes(kb.toLowerCase())) {
        brand = kb;
        ship = dom.shipText.replace(new RegExp(kb, 'i'), '').trim().replace(/^\s+|\s+$/g, '');
        break;
      }
    }

    if (brand === 'Celebrity') brand = 'Celebrity Cruises';
    if (brand === 'Carnival') brand = 'Carnival Cruise Line';
    if (brand === 'Princess') brand = 'Princess Cruises';
    if (brand === 'Cunard') brand = 'Cunard Line';
    if (brand === 'Ponant Explorations') brand = 'Ponant';

    const cleanOfferId = dom.offerId.replace(/[^0-9]/g, '');
    const suffix = cleanOfferId ? `_${cleanOfferId}` : '';
    const sailingId = `signature_${brand.toLowerCase().replace(/[^a-z]/g, '')}_${ship.toLowerCase().replace(/[^a-z]/g, '')}_${cleanDate.replace(/[^0-9]/g, '')}${suffix}`;
    
    const dbPrice = await queryDbPrice(sailingId, 'Group Block Stateroom', 'signature_group');

    if (dbPrice === null) {
      console.log(`❌ FAIL: Sailing not found in DB: ${brand} ${ship} on ${cleanDate}`);
      failed++;
    } else if (dbPrice === dom.price) {
      console.log(`✅ PASS: ${brand} ${ship} (${cleanDate}) -> DOM Price: $${dom.price} | DB Price: $${dbPrice} (Match!)`);
      passed++;
    } else {
      console.log(`❌ FAIL: Price discrepancy for ${brand} ${ship} (${cleanDate}) -> DOM Price: $${dom.price} | DB Price: $${dbPrice}`);
      failed++;
    }
  }

  console.log('==================================================');
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================');

  await browser.close();
  db.close();

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAccuracyTest().catch(console.error);
