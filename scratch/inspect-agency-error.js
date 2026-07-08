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

  await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 45000 });
  console.log(`URL: ${page.url()}`);
  console.log(`Title: ${await page.title()}`);
  
  const content = await page.content();
  console.log(`Content length: ${content.length}`);
  
  const screenshotPath = path.join(__dirname, 'inspect_agency_error.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot to ${screenshotPath}`);

  await browser.close();
}

run().catch(console.error);
