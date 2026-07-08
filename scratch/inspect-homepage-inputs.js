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

  console.log('Navigating to homepage...');
  await page.goto('https://www.signaturetravelnetwork.com/index.cfm', { waitUntil: 'networkidle', timeout: 45000 });

  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, textarea, button, form')).map(i => ({
      tag: i.tagName.toLowerCase(),
      type: i.type || '',
      name: i.name || '',
      id: i.id || '',
      className: i.className || '',
      placeholder: i.placeholder || '',
      value: i.value || '',
      action: i.action || '',
      innerText: i.innerText.trim()
    }));
  });

  console.log('--- HOMEPAGE ELEMENTS ---');
  console.log(JSON.stringify(inputs, null, 2));

  await browser.close();
}

run().catch(console.error);
