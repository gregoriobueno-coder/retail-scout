const { chromium } = require('playwright');
const path = require('path');

async function inspectTrs() {
  const authStatePath = path.join(__dirname, '..', 'auth', 'signature-state.json');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: authStatePath });
  const page = await context.newPage();

  const startUrl = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&cruiseType=&departMonth=null&departYear=null&fromDate=&toDate=&startLength=1&endLength=20&priceStart=0&priceEnd=4100&offerType=cse&offerType=privateCollection&offerType=exclusive&advancedOnly=1&advancedFlag=1&adFlag=1&type=intranet&agency_id=3462&utp=AGENT&userid=71094';
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('span.offerMatchCount');

  const rows = await page.evaluate(() => {
    const table = document.querySelector('table.page_content') || document.querySelectorAll('table')[1];
    if (!table) return ['No table'];
    const trs = Array.from(table.querySelectorAll('tr'));
    return trs.map((tr, idx) => ({
      index: idx,
      cellsCount: tr.querySelectorAll('td').length,
      text: tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)
    }));
  });

  console.log('TRs:', JSON.stringify(rows.slice(0, 15), null, 2));
  await browser.close();
}

inspectTrs().catch(console.error);
