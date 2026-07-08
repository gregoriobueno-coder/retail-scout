const { chromium } = require('playwright');
const path = require('path');

async function run() {
  const authStatePath = path.join(__dirname, '..', 'auth', 'signature-state.json');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: authStatePath });
  const page = await context.newPage();

  const url = 'https://www.signaturetravelnetwork.com/SigNet/index.cfm/Cruise/Offer/Index?offerID=1539247&agency_id=3462&utp=AGENT&type=intranet&userid=71094';
  
  try {
    console.log(`Navigating to offer details URL: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000); // Wait for dynamic elements

    const pageText = await page.evaluate(() => {
      const main = document.querySelector('main, #content, #page-content, .page-content, div.container') || document.body;
      return main.innerText;
    });
    console.log('\n--- DETAILED OFFER PAGE TEXT ---');
    console.log(pageText.substring(0, 10000));
    
    // Find all occurrences of date pattern
    const dates = pageText.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g) || [];
    console.log('\nFound Date strings:', dates);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
