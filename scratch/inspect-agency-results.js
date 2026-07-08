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

  const baseUrl = 'https://www.signaturetravelnetwork.com/supplier/cruise_quick_search_result.cfm?bAgencyOnly=1&utp=AGENT&agency_id=3462&type=intranet&userid=71094&user_id=71094';
  const queryParams = '&supplier=any&destination=any&month=any&ship_name=any&port=0&length=0&offer_type_id=0&exact=0&bCruiseTour=Any&special=0';
  const fullUrl = baseUrl + queryParams;

  console.log(`Navigating to Agency Search URL: ${fullUrl}`);
  await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 45000 });

  const matchText = await page.evaluate(() => {
    const el = document.body.innerText;
    const match = el.match(/\d+\s+offers?\s+match\s+your/i);
    return match ? match[0] : 'NO_MATCH_TEXT';
  });
  console.log(`Result: ${matchText}`);

  const rows = await page.evaluate(() => {
    const table = document.querySelector('div#cruise_search_results_div > table, table.page_content, table');
    if (!table) return ['NO_TABLE'];
    const trs = Array.from(table.querySelectorAll('tr'));
    return trs.map(tr => tr.innerText.trim().replace(/\s+/g, ' ').substring(0, 150));
  });

  console.log(`Rows count: ${rows.length}`);
  console.log('Sample rows:');
  console.log(JSON.stringify(rows.slice(0, 10), null, 2));

  await browser.close();
}

run().catch(console.error);
