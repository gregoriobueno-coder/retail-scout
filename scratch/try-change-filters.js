const { chromium } = require('playwright');
const path = require('path');

async function testUrl(filterVal) {
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

  const url = `https://www.signaturetravelnetwork.com/utils/offerSearch/combinedSearchResults.cfm?agency_id=3462&utp=AGENT&type=intranet&userid=71094&scFlag=1&showall=0&sup_list=0&monthList=any&changeFilter=${filterVal}&dest=any`;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const matchText = await page.evaluate(() => {
      const el = document.body.innerText;
      const match = el.match(/\d+\s+offers?\s+match\s+your/i);
      return match ? match[0] : 'NO_MATCH_TEXT';
    });
    console.log(`changeFilter: "${filterVal}" -> ${matchText}`);
  } catch (err) {
    console.error(`Failed for "${filterVal}":`, err.message);
  } finally {
    await browser.close();
  }
}

async function run() {
  const filters = [
    'hosted',
    'nonhosted',
    'privateCar',
    'tpi',
    'tpiSpace',
    'agency',
    'agency_only',
    'agencyBlock',
    'block',
    'group',
    'member',
    'all'
  ];

  for (const f of filters) {
    await testUrl(f);
  }
}

run().catch(console.error);
