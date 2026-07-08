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

  const startUrl = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&cruiseType=&departMonth=null&departYear=null&fromDate=&toDate=&startLength=1&endLength=20&priceStart=0&priceEnd=4100&offerType=cse&offerType=privateCollection&offerType=exclusive&advancedOnly=1&advancedFlag=1&adFlag=1&type=intranet&agency_id=3462&utp=AGENT&userid=71094';
  
  const uniqueItineraries = new Set();
  const uniquePromotions = new Set();
  const spaceTypes = new Set();

  let currentPage = 1;
  while (currentPage <= 15) {
    console.log(`Scanning page ${currentPage}...`);
    await page.goto(`${startUrl}&page=${currentPage}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('div#cruise_search_results_div > table');

    const pageData = await page.evaluate(() => {
      const table = document.querySelector('div#cruise_search_results_div > table');
      const rows = Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > tr'));
      const headerRow = rows.find(r => r.innerText.includes('Date') && r.innerText.includes('Nights') && r.innerText.includes('Price'));
      if (!headerRow) return [];

      const headers = Array.from(headerRow.querySelectorAll(':scope > th, :scope > td')).map(h => h.innerText.trim());
      const dateIdx = headers.findIndex(h => h.includes('Date'));
      const promoIdx = headers.findIndex(h => h.includes('Promotions') || h.includes('Promo'));
      const itineraryIdx = headers.findIndex(h => h.includes('Title') || h.includes('Theme'));

      const results = [];
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll(':scope > td')).map(c => c.innerText.trim());
        if (cells.length < headers.length) continue;
        const dateText = cells[dateIdx] || '';
        if (!/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateText)) continue;

        results.push({
          itinerary: cells[itineraryIdx] || '',
          promotion: cells[promoIdx] || ''
        });
      }
      return results;
    });

    for (const d of pageData) {
      uniqueItineraries.add(d.itinerary);
      uniquePromotions.add(d.promotion);
      
      // Look for space indicator terms like Signature or TPI in the text
      const fullText = (d.itinerary + ' ' + d.promotion).toLowerCase();
      if (fullText.includes('signature')) spaceTypes.add('Signature');
      if (fullText.includes('tpi')) spaceTypes.add('TPI');
      if (fullText.includes('block')) spaceTypes.add('Block Space');
      if (fullText.includes('agency')) spaceTypes.add('Agency Offer');
      if (fullText.includes('hosted')) spaceTypes.add('Hosted');
    }
    currentPage++;
  }

  console.log('\n--- UNIQUE PROMOTIONS ---');
  console.log(Array.from(uniquePromotions));

  console.log('\n--- DETECTED SPACE TYPES ---');
  console.log(Array.from(spaceTypes));

  console.log('\n--- SAMPLE ITINERARY PROMOS ---');
  const samples = Array.from(uniqueItineraries).slice(0, 20);
  for (const s of samples) {
    console.log(`- ${s.replace(/\s+/g, ' ')}`);
  }

  await browser.close();
}

run().catch(console.error);
