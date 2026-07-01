const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function takeScreenshot() {
  console.log('[Screenshot] Launching browser...');
  const browser = await chromium.launch({
    headless: true, // We can run headlessly for a quick screenshot
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  console.log('[Screenshot] Navigating to SigNet with Agency ID...');
  try {
    await page.goto('https://www.signaturetravelnetwork.com/signet/index.cfm?agency_id=3462', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
  } catch (err) {
    console.log('[Screenshot] Navigation timed out or failed:', err.message);
  }

  const screenshotPath = path.join(__dirname, 'signet_landing.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`[Screenshot] Saved landing page screenshot to ${screenshotPath}`);

  const htmlPath = path.join(__dirname, 'signet_landing.html');
  fs.writeFileSync(htmlPath, await page.content(), 'utf8');
  console.log(`[Screenshot] Saved HTML source to ${htmlPath}`);

  await browser.close();
}

takeScreenshot().catch(console.error);
