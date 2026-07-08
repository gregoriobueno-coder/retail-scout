const { chromium } = require('playwright');
const path = require('path');

async function testUrl(extraParams) {
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

  const url = `https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&cruiseType=&departMonth=null&departYear=null&fromDate=&toDate=&startLength=1&endLength=20&priceStart=0&priceEnd=4100&offerType=cse&offerType=privateCollection&offerType=exclusive&advancedOnly=1&advancedFlag=1&adFlag=1&type=intranet&agency_id=3462&utp=AGENT&userid=71094${extraParams}`;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const matchCount = await page.evaluate(() => {
      const el = document.querySelector('span.offerMatchCount');
      return el ? el.innerText.trim() : 'NOT_FOUND';
    });
    console.log(`Params: "${extraParams}" -> Matches: ${matchCount}`);
  } catch (err) {
    console.error(`Failed for "${extraParams}":`, err.message);
  } finally {
    await browser.close();
  }
}

async function run() {
  const tests = [
    '&bAgencyOnly=1',
    '&bAgencyOnly=true',
    '&agencyOnly=1',
    '&agencyOnly=true',
    '&bAgencyOnly=0',
    '&bAgencyOnly=1&offerType=agency',
    '&bAgencyOnly=1&offerType=cse&offerType=privateCollection&offerType=exclusive&offerType=agency'
  ];

  for (const t of tests) {
    await testUrl(t);
  }
}

run().catch(console.error);
