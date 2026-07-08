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

  const url = 'https://www.signaturetravelnetwork.com/supplier/cruise_quick_search_result.cfm?bAgencyOnly=1&utp=AGENT&agency_id=3462&type=intranet&userid=71094&user_id=71094';
  
  console.log('Navigating to Agency Offers page...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

  const currentUrl = page.url();
  console.log(`Current URL: ${currentUrl}`);

  // Check if we got redirected or blocked
  const pageTitle = await page.title();
  console.log(`Page Title: ${pageTitle}`);

  // Take screenshot
  const screenshotPath = path.join(__dirname, 'inspect_agency_offers.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot to ${screenshotPath}`);

  // Try to find if there is a table and extract rows
  const rows = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return [];
    const trs = Array.from(table.querySelectorAll('tr'));
    return trs.map(tr => tr.innerText.trim().replace(/\s+/g, ' ').substring(0, 150));
  });

  console.log(`Found ${rows.length} rows in the first table.`);
  console.log('First 15 rows:');
  console.log(JSON.stringify(rows.slice(0, 15), null, 2));

  await browser.close();
}

run().catch(console.error);
