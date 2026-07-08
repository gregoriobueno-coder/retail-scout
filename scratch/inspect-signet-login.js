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

  console.log('Navigating to Signature Homepage...');
  await page.goto('https://www.signaturetravelnetwork.com/index.cfm', { waitUntil: 'networkidle', timeout: 45000 });

  console.log(`Current URL: ${page.url()}`);
  console.log(`Page Title: ${await page.title()}`);

  // Find the login button
  console.log('Looking for login link...');
  const loginLink = await page.$('a:has-text("Login"), a:has-text("Sign In"), a[href*="login"]');
  if (loginLink) {
    console.log('Clicking login link...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 45000 }),
      loginLink.click()
    ]);
  } else {
    console.log('Login link not found directly. Checking all links...');
    const allLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText.trim(), href: a.href }));
    });
    console.log(allLinks.slice(0, 20));
    await browser.close();
    return;
  }

  console.log(`Login URL: ${page.url()}`);
  console.log(`Login Page Title: ${await page.title()}`);

  // Take screenshot
  const screenshotPath = path.join(__dirname, 'inspect_login_page.png');
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

  console.log('--- ALL INPUT/BUTTON ELEMENTS ON LOGIN PAGE ---');
  console.log(JSON.stringify(inputs, null, 2));

  await browser.close();
}

run().catch(console.error);
