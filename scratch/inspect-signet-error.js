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

  const memberLoginBtn = await page.$('button.member_login, .mobile-member-login');
  if (memberLoginBtn && await memberLoginBtn.isVisible()) {
    await memberLoginBtn.click();
    await page.waitForTimeout(1000);
  }

  const userInputs = await page.$$('input[name="user_name"]');
  const passInputs = await page.$$('input[name="password"]');

  if (userInputs.length > 0 && await userInputs[0].isVisible()) {
    console.log('Filling credentials...');
    await userInputs[0].fill('gbuenotpi');
    await passInputs[0].fill('ixp8E-DNmQRrM');
    
    const form = await userInputs[0].evaluateHandle(el => el.closest('form'));
    const submitBtn = await form.$('input[type="submit"]');
    
    console.log('Clicking submit...');
    await submitBtn.click();
    await page.waitForTimeout(5000);
    
    console.log('Navigating to SigNet Index...');
    await page.goto('https://www.signaturetravelnetwork.com/SigNet/index.cfm', { waitUntil: 'networkidle', timeout: 45000 });
    
    console.log(`URL: ${page.url()}`);
    console.log(`Title: ${await page.title()}`);
    
    const text = await page.innerText('body');
    console.log('--- BODY TEXT ---');
    console.log(text.substring(0, 800));
  } else {
    console.log('Inputs not found or not visible.');
  }

  await browser.close();
}

run().catch(console.error);
