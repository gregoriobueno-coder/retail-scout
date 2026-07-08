const playwright = require('playwright');
const path = require('path');
const fs = require('fs');

async function run() {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: path.join(__dirname, '..', 'auth', 'signature-state.json')
  });
  const page = await context.newPage();

  const startUrl = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&cruiseType=&departMonth=null&departYear=null&fromDate=&toDate=&startLength=1&endLength=20&priceStart=0&priceEnd=4100&offerType=cse&offerType=privateCollection&offerType=exclusive&advancedOnly=1&advancedFlag=1&adFlag=1&type=intranet&agency_id=3462&utp=AGENT&userid=71094';
  
  console.log('Navigating to full results page...');
  await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 60000 });

  const currentUrl = page.url();
  const title = await page.title();
  console.log(`Current URL: ${currentUrl}`);
  console.log(`Page Title: ${title}`);

  // Take screenshot to inspect
  const screenshotPath = path.join(__dirname, 'inspect_search_page.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot to ${screenshotPath}`);

  // Find links
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({
      text: a.innerText.trim(),
      href: a.href
    }));
  });

  console.log('Found links:', links.slice(0, 15));

  await browser.close();
}

run().catch(console.error);
