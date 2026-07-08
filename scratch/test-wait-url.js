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

  console.log('Navigating to homepage...');
  await page.goto('https://www.signaturetravelnetwork.com/index.cfm', { waitUntil: 'networkidle', timeout: 45000 });

  // Accept cookies first to ensure no overlay block
  const acceptCookiesBtn = await page.$('button.ch2-allow-all-btn');
  if (acceptCookiesBtn) {
    console.log('Accepting cookies...');
    await acceptCookiesBtn.click({ force: true });
    await page.waitForTimeout(1000);
  }

  console.log('Checking for member login button...');
  const memberLoginBtn = await page.$('button.member_login, .mobile-member-login');
  if (memberLoginBtn && await memberLoginBtn.isVisible()) {
    console.log('Clicking Member Login button to reveal form...');
    await memberLoginBtn.click({ force: true });
    await page.waitForTimeout(1000); // Wait for transition
  }

  const userInputs = await page.$$('input[name="user_name"]');
  const passInputs = await page.$$('input[name="password"]');

  console.log(`Found ${userInputs.length} user inputs.`);
  let filled = false;
  for (let i = 0; i < userInputs.length; i++) {
    if (await userInputs[i].isVisible()) {
      console.log(`Filling username input ${i}...`);
      await userInputs[i].fill('gbuenotpi');
      await passInputs[i].fill('ixp8E-DNmQRrM');
      filled = true;
      
      const form = await userInputs[i].evaluateHandle(el => el.closest('form'));
      const submitBtn = await form.$('input[type="submit"]');
      
      console.log('Submitting login form by pressing Enter on the password input...');
      await passInputs[i].press('Enter');
      
      try {
        await page.waitForURL('**/SigNet/index.cfm**', { timeout: 30000 });
        console.log('Successfully reached SigNet Dashboard URL!');
      } catch (err) {
        console.log('Failed to redirect to SigNet Index. Current URL is:', page.url());
      }
      
      console.log(`Final URL: ${page.url()}`);
      console.log(`Page Title: ${await page.title()}`);
      
      const content = await page.content();
      console.log(`Content length: ${content.length}`);
      
      const screenshotPath = path.join(__dirname, 'inspect_wait_url.png');
      await page.screenshot({ path: screenshotPath });
      console.log(`Saved screenshot to ${screenshotPath}`);
      break;
    }
  }

  if (!filled) {
    console.log('No visible inputs found.');
    console.log(`Current URL: ${page.url()}`);
    console.log(`Page Title: ${await page.title()}`);
  }

  await browser.close();
}

run().catch(console.error);
