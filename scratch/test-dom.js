const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testDom() {
  const authStatePath = path.join(__dirname, '..', 'auth', 'signature-state.json');
  console.log('[Test DOM] Launching browser...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    storageState: authStatePath,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  const startUrl = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&cruiseType=&departMonth=null&departYear=null&fromDate=&toDate=&startLength=1&endLength=20&priceStart=0&priceEnd=4100&offerType=cse&offerType=privateCollection&offerType=exclusive&advancedOnly=1&advancedFlag=1&adFlag=1&type=intranet&agency_id=3462&utp=AGENT&userid=71094';
  
  console.log('[Test DOM] Navigating to Signature URL...');
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('[Test DOM] Waiting for page table...');
  try {
    await page.waitForSelector('table', { timeout: 15000 });
  } catch (err) {
    console.error('Table not found! Current URL is:', page.url());
    // Take diagnostic dump
    fs.writeFileSync(path.join(__dirname, 'test_dom_error.html'), await page.content(), 'utf8');
    await browser.close();
    return;
  }

  const htmlStructure = await page.evaluate(() => {
    // Find all tables
    const tables = Array.from(document.querySelectorAll('table'));
    return tables.map((table, tIdx) => {
      const rows = Array.from(table.querySelectorAll('tr'));
      const rowDetails = [];
      for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const row = rows[i];
        const cells = Array.from(row.querySelectorAll('th, td')).map(c => ({
          tag: c.tagName,
          text: c.innerText.trim(),
          html: c.innerHTML.trim().slice(0, 150)
        }));
        rowDetails.push({ rowIndex: i, cells });
      }
      return { tableIndex: tIdx, rowDetails };
    });
  });

  console.log('[Test DOM] Result tables structure:');
  console.log(JSON.stringify(htmlStructure, null, 2));

  await browser.close();
}

testDom().catch(err => {
  console.error('[Test DOM] Error:', err);
});
