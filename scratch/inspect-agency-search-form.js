const { chromium } = require('playwright');
const path = require('path');

async function testDateValue(dateVal) {
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
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    
    // Fill dates input
    const dateInput = await page.$('input[name="dates"]');
    if (dateInput) {
      console.log(`Filling date input with: "${dateVal}"`);
      await dateInput.fill(dateVal);
      
      const form = await dateInput.evaluateHandle(el => el.closest('form'));
      const submitBtn = await form.$('input[type="submit"], button[type="submit"]');
      
      if (submitBtn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
          submitBtn.click({ force: true })
        ]);
      } else {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
          dateInput.press('Enter')
        ]);
      }
      
      const matchText = await page.evaluate(() => {
        const el = document.body.innerText;
        const match = el.match(/\d+\s+offers?\s+match\s+your/i);
        return match ? match[0] : 'NO_MATCH_TEXT';
      });
      console.log(`Result: ${matchText} | URL: ${page.url()}`);
    } else {
      console.log('Date input not found.');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

async function run() {
  const dateVals = [
    '07/02/2026 - 07/02/2028',
    '01/01/2026 - 12/31/2027',
    'any',
    'All'
  ];

  for (const d of dateVals) {
    await testDateValue(d);
  }
}

run().catch(console.error);
