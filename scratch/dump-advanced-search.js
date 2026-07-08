const playwright = require('playwright');
const path = require('path');

async function run() {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: path.join(__dirname, '..', 'auth', 'signature-state.json')
  });
  const page = await context.newPage();

  // Navigate to results page first
  const startUrl = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&priceStart=0&priceEnd=4100';
  console.log('Navigating to results page...');
  await page.goto(startUrl);
  await page.waitForSelector('a');

  // Find the "Back to Advanced Search" link
  const advancedSearchUrl = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    const advLink = links.find(l => l.innerText.toLowerCase().includes('advanced search') || l.innerText.toLowerCase().includes('cruise search'));
    return advLink ? advLink.href : null;
  });

  console.log('Advanced search link found:', advancedSearchUrl);

  if (advancedSearchUrl) {
    console.log('Navigating to Advanced Search page...');
    await page.goto(advancedSearchUrl);
    await page.waitForSelector('form, input, select');

    // Extract all checkbox names, values and labels
    const formInfo = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select'));
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
          type: i.type || i.tagName.toLowerCase(),
          name: i.name,
          id: i.id,
          value: i.value,
          label: label.replace(/\s+/g, ' ')
        };
      });
    });

    console.log('--- Form Inputs & Dropdowns ---');
    console.log(JSON.stringify(formInfo, null, 2));
  } else {
    console.log('No Advanced Search link found. Page content HTML length:', (await page.content()).length);
  }

  await browser.close();
}

run().catch(console.error);
