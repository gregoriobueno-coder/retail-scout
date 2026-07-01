const { chromium } = require('playwright');
const path = require('path');

async function inspectOneRow() {
  const authStatePath = path.join(__dirname, '..', 'auth', 'signature-state.json');
  console.log('[Inspect] Launching browser...');
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
  
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('span.offerMatchCount', { timeout: 15000 });

  const firstResultsTable = await page.evaluate(() => {
    // Let's find the table that contains the search results. Usually, it has headers like "Cruise Line", "Date", "Nights", "From Price"
    const tables = Array.from(document.querySelectorAll('table'));
    
    // Look for a table that has a row containing "Cruise Line" or "Ponant" or "Ship"
    const resultsTable = tables.find(t => t.innerText.includes('PONANT') || t.innerText.includes('Cruise Line'));
    if (!resultsTable) return 'No results table found';

    const trs = Array.from(resultsTable.querySelectorAll('tr'));
    return trs.slice(0, 10).map((tr, rIdx) => {
      const cells = Array.from(tr.querySelectorAll('td, th'));
      return {
        rowIndex: rIdx,
        className: tr.className,
        cellsCount: cells.length,
        cellsTexts: cells.map(c => c.innerText.trim()),
        cellsHtml: cells.map(c => c.outerHTML)
      };
    });
  });

  console.log('[Inspect] Results Table Details:');
  console.log(JSON.stringify(firstResultsTable, null, 2));

  await browser.close();
}

inspectOneRow().catch(console.error);
