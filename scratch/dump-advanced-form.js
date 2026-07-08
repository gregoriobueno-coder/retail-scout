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

  // Navigate to results page first to establish session variables
  const startUrl = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&cruiseType=&departMonth=null&departYear=null&fromDate=&toDate=&startLength=1&endLength=20&priceStart=0&priceEnd=4100&offerType=cse&offerType=privateCollection&offerType=exclusive&advancedOnly=1&advancedFlag=1&adFlag=1&type=intranet&agency_id=3462&utp=AGENT&userid=71094';
  
  await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForSelector('div#cruise_search_results_div > table');

  // Navigate to the Advanced Search form page
  console.log('Navigating to Advanced Search Form page...');
  const advancedUrl = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/index.cfm?type=intranet&agency_id=3462&utp=AGENT&userid=71094';
  await page.goto(advancedUrl, { waitUntil: 'networkidle', timeout: 45000 });

  const pageTitle = await page.title();
  console.log('Advanced Search Page Title:', pageTitle);

  // Take screenshot
  const screenshotPath = path.join(__dirname, 'inspect_advanced_form.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot to ${screenshotPath}`);

  // Extract form details
  const formFields = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
    return inputs.map(i => {
      let label = '';
      if (i.id) {
        const lblEl = document.querySelector(`label[for="${i.id}"]`);
        if (lblEl) label = lblEl.innerText.trim();
      }
      if (!label && i.parentNode) {
        label = i.parentNode.innerText.trim().substring(0, 100);
      }
      return {
        tag: i.tagName.toLowerCase(),
        type: i.type || '',
        name: i.name || '',
        id: i.id || '',
        value: i.value || '',
        label: label.replace(/\s+/g, ' '),
        options: i.tagName.toLowerCase() === 'select' ? Array.from(i.options).map(o => ({ text: o.text.trim(), value: o.value })) : undefined
      };
    });
  });

  console.log('--- ADVANCED SEARCH FORM FIELDS ---');
  console.log(JSON.stringify(formFields, null, 2));

  await browser.close();
}

run().catch(console.error);
