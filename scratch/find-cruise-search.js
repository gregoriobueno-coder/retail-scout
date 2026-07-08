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

  console.log('Navigating to Signature Intranet Home / SigNet Dashboard...');
  await page.goto('https://www.signaturetravelnetwork.com/SigNet/index.cfm', { waitUntil: 'networkidle', timeout: 45000 });

  const currentUrl = page.url();
  const title = await page.title();
  console.log(`SigNet URL: ${currentUrl}`);
  console.log(`SigNet Title: ${title}`);

  // Take screenshot to inspect the dashboard
  const screenshotPath = path.join(__dirname, 'inspect_signet_dashboard.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot to ${screenshotPath}`);

  // Extract all links containing "cruise" or "search"
  const cruiseLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => ({ text: a.innerText.trim(), href: a.href }))
      .filter(l => l.href.toLowerCase().includes('cruise') || l.text.toLowerCase().includes('cruise'));
  });

  console.log('--- SigNet Cruise Links ---');
  console.log(JSON.stringify(cruiseLinks, null, 2));

  await browser.close();
}

run().catch(console.error);
