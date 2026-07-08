const { chromium } = require('playwright');
const path = require('path');

async function run() {
  const authStatePath = path.join(__dirname, '..', 'auth', 'signature-state.json');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: authStatePath });
  const page = await context.newPage();

  const startUrl = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&cruiseType=&departMonth=null&departYear=null&fromDate=&toDate=&startLength=1&endLength=20&priceStart=0&priceEnd=4100&offerType=cse&offerType=privateCollection&offerType=exclusive&advancedOnly=1&advancedFlag=1&adFlag=1&type=intranet&agency_id=3462&utp=AGENT&userid=71094';
  
  try {
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('table', { timeout: 15000 });

    const rowsData = await page.evaluate(() => {
      const table = document.querySelector('div#cruise_search_results_div > table');
      if (!table) return [];
      const rows = Array.from(table.querySelectorAll('tr'));
      
      const details = [];
      for (const row of rows.slice(0, 8)) {
        details.push({
          text: row.innerText,
          html: row.innerHTML
        });
      }
      return details;
    });

    console.log(JSON.stringify(rowsData, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
