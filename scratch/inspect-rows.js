const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function inspectRows() {
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

  const rowsData = await page.evaluate(() => {
    // Find the second table on the page (or table with class page_content)
    const table = document.querySelector('table.page_content') || document.querySelectorAll('table')[1];
    if (!table) return 'No table found';

    const trs = Array.from(table.querySelectorAll('tr'));
    return trs.map((row, rIdx) => {
      const tds = Array.from(row.querySelectorAll('td, th'));
      return {
        rowIndex: rIdx,
        cellsCount: tds.length,
        cells: tds.map(td => ({
          tagName: td.tagName,
          text: td.innerText.trim(),
          html: td.innerHTML.trim().slice(0, 200)
        }))
      };
    });
  });

  console.log('[Inspect] Table Rows Data:');
  console.log(JSON.stringify(rowsData.slice(0, 10), null, 2)); // Print first 10 rows

  await browser.close();
}

inspectRows().catch(console.error);
