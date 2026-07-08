const { chromium } = require('playwright');
const path = require('path');

async function run() {
  const authStatePath = path.join(__dirname, '..', 'auth', 'signature-state.json');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    storageState: authStatePath,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  const startUrl = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&cruiseType=&departMonth=null&departYear=null&fromDate=&toDate=&startLength=1&endLength=20&priceStart=0&priceEnd=4100&offerType=cse&offerType=privateCollection&offerType=exclusive&advancedOnly=1&advancedFlag=1&adFlag=1&type=intranet&agency_id=3462&utp=AGENT&userid=71094';
  
  const uniquePromoLines = new Set();
  
  for (let p = 1; p <= 30; p++) {
    console.log(`Scanning page ${p}...`);
    try {
      await page.goto(`${startUrl}&page=${p}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('div#cruise_search_results_div > table', { timeout: 60000 });

      const pagePromos = await page.evaluate(() => {
        const table = document.querySelector('div#cruise_search_results_div > table');
        const rows = Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > tr'));
        const headerRow = rows.find(r => r.innerText.includes('Date') && r.innerText.includes('Nights') && r.innerText.includes('Price'));
        if (!headerRow) return [];

        const headers = Array.from(headerRow.querySelectorAll(':scope > th, :scope > td')).map(h => h.innerText.trim());
        const dateIdx = headers.findIndex(h => h.includes('Date'));
        const itineraryIdx = headers.findIndex(h => h.includes('Title') || h.includes('Theme'));

        const results = [];
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll(':scope > td')).map(c => c.innerText.trim());
          if (cells.length < headers.length) continue;
          const dateText = cells[dateIdx] || '';
          if (!/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateText)) continue;

          results.push(cells[itineraryIdx] || '');
        }
        return results;
      });

      for (const text of pagePromos) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        lines.forEach((line, idx) => {
          if (idx > 0) { // Skip itinerary title
            uniquePromoLines.add(line);
          }
        });
      }
    } catch (err) {
      console.warn(`Warning: Page ${p} failed:`, err.message);
    }
  }

  console.log('\n--- ALL UNIQUE PROMOTION LINES FOUND ---');
  console.log(JSON.stringify(Array.from(uniquePromoLines), null, 2));

  await browser.close();
}

run().catch(console.error);
