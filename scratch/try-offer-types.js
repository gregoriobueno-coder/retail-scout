const { chromium } = require('playwright');
const path = require('path');

async function testUrl(offerTypes) {
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

  // Construct URL with custom offerTypes
  let offerParams = '';
  offerTypes.forEach(ot => {
    offerParams += `&offerType=${ot}`;
  });

  const url = `https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&cruiseType=&departMonth=null&departYear=null&fromDate=&toDate=&startLength=1&endLength=20&priceStart=0&priceEnd=4100${offerParams}&advancedOnly=1&advancedFlag=1&adFlag=1&type=intranet&agency_id=3462&utp=AGENT&userid=71094`;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const matchCount = await page.evaluate(() => {
      const el = document.querySelector('span.offerMatchCount');
      return el ? el.innerText.trim() : 'NOT_FOUND';
    });
    console.log(`OfferTypes: [${offerTypes.join(', ')}] -> Matches: ${matchCount}`);
  } catch (err) {
    console.error(`Failed for [${offerTypes.join(', ')}]:`, err.message);
  } finally {
    await browser.close();
  }
}

async function run() {
  const tests = [
    ['cse', 'privateCollection', 'exclusive'], // Default
    ['tpi'],
    ['tpiSpace'],
    ['tpi_space'],
    ['agency'],
    ['agency_block'],
    ['group'],
    ['block'],
    ['member'],
    ['hosted'],
    ['all'],
    ['tpi', 'cse', 'privateCollection', 'exclusive']
  ];

  for (const t of tests) {
    await testUrl(t);
  }
}

run().catch(console.error);
