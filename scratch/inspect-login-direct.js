const { chromium } = require('playwright');
const path = require('path');

async function checkUrl(url) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  console.log(`Checking URL: ${url}`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`  Final URL: ${page.url()}`);
    console.log(`  Page Title: ${await page.title()}`);
    
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
    console.log(`  Inputs count: ${inputs.length}`);
    if (inputs.length > 0) {
      console.log(JSON.stringify(inputs.slice(0, 10), null, 2));
    }
  } catch (err) {
    console.log(`  Failed: ${err.message}`);
  } finally {
    await browser.close();
  }
}

async function run() {
  const urls = [
    'https://www.signaturetravelnetwork.com/login/index.cfm',
    'https://www.signaturetravelnetwork.com/login/',
    'https://www.signaturetravelnetwork.com/SigNet/login/index.cfm',
    'https://www.signaturetravelnetwork.com/SigNet/login/',
    'https://www.signaturetravelnetwork.com/utils/login/'
  ];

  for (const u of urls) {
    await checkUrl(u);
    console.log();
  }
}

run().catch(console.error);
