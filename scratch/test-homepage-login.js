const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function run() {
  const authStatePath = path.join(__dirname, '..', 'auth', 'signature-state.json');
  
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

  // Click the member login button if it is visible to reveal the form
  console.log('Checking for member login button...');
  const memberLoginBtn = await page.$('button.member_login, .mobile-member-login');
  if (memberLoginBtn && await memberLoginBtn.isVisible()) {
    console.log('Clicking Member Login button to reveal form...');
    await memberLoginBtn.click();
    await page.waitForTimeout(1000); // Wait for transition
  }

  // Find all user_name and password fields
  const userInputs = await page.$$('input[name="user_name"]');
  const passInputs = await page.$$('input[name="password"]');

  console.log(`Found ${userInputs.length} username inputs and ${passInputs.length} password inputs.`);

  let filled = false;
  for (let i = 0; i < userInputs.length; i++) {
    if (await userInputs[i].isVisible()) {
      console.log(`Filling username input ${i}...`);
      await userInputs[i].fill('gbuenotpi');
      await passInputs[i].fill('ixp8E-DNmQRrM');
      filled = true;
      
      // Click the submit button inside the same form or container
      const form = await userInputs[i].evaluateHandle(el => el.closest('form'));
      if (form) {
        console.log('Submitting the form...');
        const submitBtn = await form.$('input[type="submit"], button[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
        } else {
          await userInputs[i].press('Enter');
        }
        
        // Wait for redirection and dashboard load
        console.log('Waiting for authentication to establish...');
        await page.waitForTimeout(5000); // Wait 5 seconds for initial redirects
        
        console.log('Explicitly navigating to SigNet Intranet Dashboard...');
        await page.goto('https://www.signaturetravelnetwork.com/SigNet/index.cfm', { waitUntil: 'networkidle', timeout: 45000 });
      }
      break;
    }
  }

  if (!filled) {
    console.log('No visible username/password inputs found.');
  }

  console.log(`Final URL: ${page.url()}`);
  console.log(`Page Title: ${await page.title()}`);

  const cookies = await context.cookies();
  console.log(`Cookies count: ${cookies.length}`);
  
  // Verify we are actually logged in (title should be "Signature Travel Network" or SigNet should load successfully)
  const pageTitle = await page.title();
  if (pageTitle.includes('Signature') || page.url().includes('SigNet/index.cfm')) {
    await context.storageState({ path: authStatePath });
    console.log(`Successfully saved session state to ${authStatePath}`);
  } else {
    console.error('Failed to log in: Dashboard not loaded.');
  }

  await browser.close();
}

run().catch(console.error);
