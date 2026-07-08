const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  const startUrl = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&cruiseType=&departMonth=null&departYear=null&fromDate=&toDate=&startLength=1&endLength=20&priceStart=0&priceEnd=4100&offerType=cse&offerType=privateCollection&offerType=exclusive&advancedOnly=1&advancedFlag=1&adFlag=1&type=intranet&agency_id=3462&utp=AGENT&userid=71094';
  
  console.log('Navigating to start URL...');
  await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 45000 });

  console.log(`Redirected URL: ${page.url()}`);
  console.log(`Page Title: ${await page.title()}`);

  // Dump all inputs on the page
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, textarea, button')).map(i => ({
      tag: i.tagName.toLowerCase(),
      type: i.type || '',
      name: i.name || '',
      id: i.id || '',
      className: i.className || '',
      placeholder: i.placeholder || '',
      value: i.value || '',
      innerText: i.innerText.trim()
    }));
  });

  console.log('--- ALL INPUT/BUTTON ELEMENTS ON THE PAGE ---');
  console.log(JSON.stringify(inputs, null, 2));

  await browser.close();
}

run().catch(console.error);
