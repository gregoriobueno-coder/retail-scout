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

  const url = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/searchByAdvanced.cfm?utp=AGENT&agency_id=3462&type=intranet&userid=71094';
  
  console.log('Navigating to Advanced Cruise Search page...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

  console.log(`Current URL: ${page.url()}`);
  console.log(`Page Title: ${await page.title()}`);

  const screenshotPath = path.join(__dirname, 'inspect_advanced_search.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot to ${screenshotPath}`);

  // Print all input fields, checkboxes, options, etc.
  const fields = await page.evaluate(() => {
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

  console.log('--- ADVANCED CRUISE SEARCH FIELDS ---');
  console.log(JSON.stringify(fields, null, 2));

  await browser.close();
}

run().catch(console.error);
