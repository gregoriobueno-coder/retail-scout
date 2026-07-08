const { chromium } = require('playwright');
const path = require('path');

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

  console.log('Navigating to SigNet index URL...');
  try {
    await page.goto('https://www.signaturetravelnetwork.com/SigNet/index.cfm', { waitUntil: 'networkidle', timeout: 45000 });
  } catch (err) {
    console.log('Navigation error:', err.message);
  }

  console.log(`Final URL: ${page.url()}`);
  console.log(`Page Title: ${await page.title()}`);

  const screenshotPath = path.join(__dirname, 'inspect_signet_redirect.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot to ${screenshotPath}`);

  // Dump all inputs on the login page
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

  console.log('--- ALL INPUT/BUTTON ELEMENTS ---');
  console.log(JSON.stringify(inputs, null, 2));

  await browser.close();
}

run().catch(console.error);
