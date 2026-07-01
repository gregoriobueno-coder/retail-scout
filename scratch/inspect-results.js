const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function inspectResults() {
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

  const tablesSummary = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table'));
    return tables.map((t, idx) => {
      const rows = Array.from(t.querySelectorAll('tr'));
      return {
        index: idx,
        className: t.className,
        id: t.id,
        rowsCount: rows.length,
        textPreview: t.innerText.slice(0, 150).replace(/\n/g, ' ')
      };
    });
  });

  console.log('[Inspect] Tables Summary:');
  console.log(JSON.stringify(tablesSummary, null, 2));

  // Find where the cruise offers are. They might be in a div with a class like .offerContainer or similar.
  const divsSummary = await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'));
    return divs
      .filter(d => d.className && (d.className.includes('offer') || d.className.includes('deal') || d.className.includes('result')))
      .map(d => ({
        className: d.className,
        id: d.id,
        textPreview: d.innerText.slice(0, 100).replace(/\n/g, ' ')
      }))
      .slice(0, 10);
  });

  console.log('[Inspect] Matching Divs Summary (Top 10):');
  console.log(JSON.stringify(divsSummary, null, 2));

  await browser.close();
}

inspectResults().catch(console.error);
