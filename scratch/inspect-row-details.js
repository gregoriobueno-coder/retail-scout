const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

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
  
  await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForSelector('div#cruise_search_results_div > table');

  const rowsData = await page.evaluate(() => {
    const table = document.querySelector('div#cruise_search_results_div > table');
    const rows = Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > tr'));
    const headerRow = rows.find(r => r.innerText.includes('Date') && r.innerText.includes('Nights') && r.innerText.includes('Price'));
    if (!headerRow) return [];

    const headers = Array.from(headerRow.querySelectorAll(':scope > th, :scope > td')).map(h => h.innerText.trim());
    return rows.map((row, rIdx) => {
      const cells = Array.from(row.querySelectorAll(':scope > td'));
      return {
        rowIndex: rIdx,
        text: row.innerText.trim().substring(0, 100),
        cellsCount: cells.length,
        cells: cells.map((c, cIdx) => ({
          colIndex: cIdx,
          header: headers[cIdx] || '',
          text: c.innerText.trim(),
          html: c.innerHTML.trim()
        }))
      };
    });
  });

  console.log(`--- INSPECTING ROW DETAILS (Count: ${rowsData.length}) ---`);
  for (const r of rowsData.slice(0, 15)) {
    console.log(`Row ${r.rowIndex} | Cells: ${r.cellsCount} | Text: "${r.text.replace(/\s+/g, ' ')}"`);
    if (r.cellsCount > 0) {
      for (const c of r.cells) {
        if (c.text.length > 0) {
          console.log(`  - [Col ${c.colIndex} / Header: "${c.header}"] -> "${c.text.replace(/\s+/g, ' ')}"`);
          if (c.html.includes('<img') || c.html.includes('class=') || c.html.includes('style=')) {
            console.log(`    HTML: ${c.html.replace(/\s+/g, ' ').substring(0, 200)}`);
          }
        }
      }
    }
  }

  await browser.close();
}

run().catch(console.error);
