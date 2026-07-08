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
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

  // Print all forms and inputs
  const elements = await page.evaluate(() => {
    const forms = Array.from(document.querySelectorAll('form'));
    return forms.map((f, idx) => {
      const inputs = Array.from(f.querySelectorAll('input, select'));
      return {
        formIndex: idx,
        action: f.action,
        inputs: inputs.map(i => ({
          tag: i.tagName.toLowerCase(),
          type: i.type || '',
          name: i.name || '',
          value: i.value || '',
          options: i.tagName.toLowerCase() === 'select' ? Array.from(i.options).map(o => o.text.trim()) : undefined
        }))
      };
    });
  });

  console.log('--- FORMS ON AGENCY OFFERS PAGE ---');
  console.log(JSON.stringify(elements, null, 2));

  await browser.close();
}

run().catch(console.error);
