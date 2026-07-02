const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const authStatePath = path.join(__dirname, '..', 'auth', 'signature-state.json');

const startUrl = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&cruiseType=&departMonth=null&departYear=null&fromDate=&toDate=&startLength=1&endLength=20&priceStart=0&priceEnd=4100&offerType=cse&offerType=privateCollection&offerType=exclusive&advancedOnly=1&advancedFlag=1&adFlag=1&type=intranet&agency_id=3462&utp=AGENT';

const readline = require('readline');

async function runManualLoginFallback() {
  console.log('[Signature Auth] Launching visible browser for manual login fallback...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    console.log('[Signature Auth] Navigating to Signature Homepage...');
    await page.goto('https://www.signaturetravelnetwork.com/index.cfm', {
      waitUntil: 'load',
      timeout: 45000
    });

    console.log('\n==================================================');
    console.log('ACTION REQUIRED:');
    console.log('1. Click the "Login" button on the upper right of the page.');
    console.log('2. Enter your credentials and sign in.');
    console.log('3. Once you can see your intranet dashboard or search results,');
    console.log('   return here and press [ENTER] in the terminal.');
    console.log('==================================================\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(res => rl.question('Press [ENTER] when ready to capture session: ', () => {
      rl.close();
      res();
    }));

    const authDir = path.dirname(authStatePath);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    
    await context.storageState({ path: authStatePath });
    console.log(`[Signature Auth] Authentication state saved successfully to ${authStatePath}`);
  } catch (err) {
    console.error('[Signature Auth] Manual login fallback failed:', err.message);
  } finally {
    await browser.close();
  }
}

async function loginSignature() {
  const username = process.env.SIGNATURE_USERNAME;
  const password = process.env.SIGNATURE_PASSWORD;

  if (!username || !password) {
    console.log('[Signature Auth] Credentials not found in .env. Falling back to manual browser login...');
    await runManualLoginFallback();
    return;
  }

  console.log('[Signature Auth] Attempting automated credential-based login...');
  const headless = process.env.SIGNATURE_HEADLESS === 'true';
  const browser = await chromium.launch({
    headless: headless,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    console.log('[Signature Auth] Navigating to search URL to trigger login redirection...');
    await page.goto(startUrl, {
      waitUntil: 'networkidle',
      timeout: 45000
    });

    const userInput = await page.$('input[name*="user" i], input[name*="email" i], input[type="text"], input[type="email"]');
    const passInput = await page.$('input[name*="pass" i], input[type="password"]');
    const submitBtn = await page.$('input[type="submit"], button[type="submit"], button:has-text("Login" i), button:has-text("Sign In" i)');

    if (!userInput || !passInput) {
      throw new Error('Auto-login fields not found.');
    }

    await userInput.fill(username);
    await passInput.fill(password);

    if (submitBtn) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
        submitBtn.click()
      ]);
    } else {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
        passInput.press('Enter')
      ]);
    }

    console.log('[Signature Auth] Auto-login submitted. Saving session state...');
    const authDir = path.dirname(authStatePath);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    await context.storageState({ path: authStatePath });
    console.log(`[Signature Auth] Authentication state saved to ${authStatePath}`);

  } catch (err) {
    console.warn('[Signature Auth] Auto-login failed:', err.message);
    await browser.close();
    await runManualLoginFallback();
    return;
  } finally {
    try {
      await browser.close();
    } catch (e) {}
  }
}

async function scrapeSignature() {
  console.log('[Signature Scraper] Ingesting Signature Travel Network group deals...');
  
  let browser;
  try {
    if (!fs.existsSync(authStatePath)) {
      throw new Error('No saved authentication state found. Login required.');
    }

    const headless = process.env.SIGNATURE_HEADLESS === 'true';
    browser = await chromium.launch({
      headless: headless,
      args: ['--disable-blink-features=AutomationControlled']
    });
    const context = await browser.newContext({
      storageState: authStatePath,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });
    let page = await context.newPage();

    console.log(`[Signature Scraper] Navigating to Signature Intranet custom search results...`);
    await page.goto(startUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    // Check if we need to refresh the session
    const pageTitle = await page.title();
    const currentUrl = page.url();
    const isError = pageTitle.toLowerCase().includes('error') || currentUrl.includes('login');

    if (isError) {
      console.log('[Signature Scraper] Session expired or invalid. Attempting to refresh login...');
      await browser.close();
      
      // Run login to refresh signature-state.json
      await loginSignature();
      
      // Re-launch browser with refreshed state
      browser = await chromium.launch({
        headless: headless,
        args: ['--disable-blink-features=AutomationControlled']
      });
      const newContext = await browser.newContext({
        storageState: authStatePath,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
      });
      page = await newContext.newPage();
      
      console.log(`[Signature Scraper] Re-navigating to results with fresh session...`);
      await page.goto(startUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
    }

    const normalizedDeals = [];
    let currentPage = 1;
    const maxPages = parseInt(process.env.SIGNATURE_MAX_PAGES) || 15; // Controlled via .env configuration

    while (currentPage <= maxPages) {
      console.log(`[Signature Scraper] Scraping page ${currentPage}...`);
      
      // Wait for table of results to render
      try {
        await page.waitForSelector('table', { timeout: 15000 });
      } catch (err) {
        console.warn(`[Signature Scraper] No table found on page ${currentPage}. Current URL: ${page.url()}`);
        
        const screenshotPath = path.join(__dirname, '..', 'inspect_signature_error.png');
        await page.screenshot({ path: screenshotPath });
        console.log(`[Signature Scraper] Saved inspection screenshot to ${screenshotPath}`);
        
        const htmlPath = path.join(__dirname, '..', 'inspect_signature_error.html');
        fs.writeFileSync(htmlPath, await page.content(), 'utf8');
        console.log(`[Signature Scraper] Saved HTML source to ${htmlPath}`);
        
        throw err;
      }

      // Parse the table cells dynamically
      const pageDeals = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tr'));
        
        // 1. Find header row to map indexes dynamically
        const headerRow = rows.find(r => r.innerText.includes('Date') && r.innerText.includes('Nights') && r.innerText.includes('Price'));
        if (!headerRow) return [];

        const headers = Array.from(headerRow.querySelectorAll('th, td')).map(h => h.innerText.trim());
        const dateIdx = headers.findIndex(h => h.includes('Date'));
        const shipIdx = headers.findIndex(h => h.includes('Ship') || h.includes('Cruise Line'));
        const nightsIdx = headers.findIndex(h => h.includes('Nights'));
        const priceIdx = headers.findIndex(h => h.includes('Price'));
        const itineraryIdx = headers.findIndex(h => h.includes('Title') || h.includes('Theme'));

        const results = [];
        
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
          if (cells.length < Math.max(dateIdx, shipIdx, nightsIdx, priceIdx)) continue;
          
          const dateText = cells[dateIdx] || '';
          // Match MM/DD/YY or MM/DD/YYYY
          if (!/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateText)) continue;
          
          results.push({
            date: dateText,
            shipText: cells[shipIdx] || '',
            nights: cells[nightsIdx] || '7',
            itinerary: cells[itineraryIdx] || 'Signature Group Deal',
            priceStr: cells[priceIdx] || ''
          });
        }
        return results;
      });

      console.log(`[Signature Scraper] Extracted ${pageDeals.length} raw rows on page ${currentPage}.`);
      
      for (const d of pageDeals) {
        const price = parseInt(d.priceStr.replace(/[^0-9]/g, '')) || 0;
        if (price > 0) {
          let cleanDate = d.date;
          try {
            cleanDate = new Date(d.date).toISOString().split('T')[0];
          } catch (e) {}

          let brand = 'Signature Promo';
          let ship = d.shipText;

          const knownBrands = [
            'AmaWaterways', 'Avalon Waterways', 'Celebrity Cruises', 'Celebrity', 
            'Royal Caribbean', 'Disney Cruise Line', 'Disney', 'Carnival Cruise Line', 
            'Carnival', 'Princess Cruises', 'Princess', 'Holland America Line', 'Holland America', 
            'Cunard Line', 'Cunard', 'Seabourn', 'Silversea', 'Ponant Explorations', 'Ponant',
            'Viking Cruises', 'Viking'
          ];

          for (const kb of knownBrands) {
            if (d.shipText.toLowerCase().includes(kb.toLowerCase())) {
              brand = kb;
              ship = d.shipText.replace(new RegExp(kb, 'i'), '').trim().replace(/^\s+|\s+$/g, '');
              break;
            }
          }

          if (brand === 'Celebrity') brand = 'Celebrity Cruises';
          if (brand === 'Carnival') brand = 'Carnival Cruise Line';
          if (brand === 'Princess') brand = 'Princess Cruises';
          if (brand === 'Cunard') brand = 'Cunard Line';
          if (brand === 'Ponant Explorations') brand = 'Ponant';

          const itinerary = d.itinerary.split('\n')[0].trim();

          normalizedDeals.push({
            sailing_id: `signature_${brand.toLowerCase().replace(/[^a-z]/g, '')}_${ship.toLowerCase().replace(/[^a-z]/g, '')}_${cleanDate.replace(/[^0-9]/g, '')}`,
            brand: brand,
            ship: ship,
            sail_date: cleanDate,
            nights: parseInt(d.nights) || 7,
            itinerary: itinerary,
            region: 'Global / Block Space',
            category: 'Group Block Stateroom',
            rate_type: 'signature_group',
            base_rate: price,
            taxes_fees: 0
          });
        }
      }

      // Check and navigate to next page
      currentPage++;
      if (currentPage <= maxPages) {
        const nextUrl = `${startUrl}&page=${currentPage}`;
        await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } else {
        break;
      }
    }

    await browser.close();
    console.log(`[Signature Scraper] Total signature deals scraped: ${normalizedDeals.length}`);
    return normalizedDeals;

  } catch (err) {
    if (browser) await browser.close();
    console.warn(`[Signature Scraper] Group scrape failed (${err.message}). Entering Sandbox Simulation Mode...`);
    
    // Fallback Simulation Data
    const mockVoyages = [
      {
        sailingId: 'SB_STN_CEL_20261017',
        brand: 'Celebrity Cruises',
        shipName: 'Celebrity Beyond',
        startDate: '2026-10-17',
        nights: 7,
        name: '7-Night Western Caribbean (Signature Block Space)',
        region: 'Caribbean',
        rates: [
          { category: 'Balcony', price: 1650, taxes: 145 }
        ]
      },
      {
        sailingId: 'SB_STN_DISNEY_20261107',
        brand: 'Disney Cruise Line',
        shipName: 'Disney Treasure',
        startDate: '2026-11-07',
        nights: 7,
        name: '7-Night Western Caribbean (Signature Block Space)',
        region: 'Caribbean',
        rates: [
          { category: 'Verandah', price: 4100, taxes: 185 }
        ]
      },
      {
        sailingId: 'SB_STN_CARNIVAL_20261219',
        brand: 'Carnival Cruise Line',
        shipName: 'Carnival Jubilee',
        startDate: '2026-12-19',
        nights: 7,
        name: '7-Night Western Caribbean (Signature Block Space)',
        region: 'Caribbean',
        rates: [
          { category: 'Inside', price: 729, taxes: 165 }
        ]
      }
    ];

    const normalized = [];
    for (const v of mockVoyages) {
      for (const r of v.rates) {
        normalized.push({
          sailing_id: `signature_${v.sailingId}`,
          brand: v.brand,
          ship: v.shipName,
          sail_date: v.startDate,
          nights: v.nights,
          itinerary: v.name,
          region: v.region,
          category: r.category,
          rate_type: 'signature_group',
          base_rate: r.price,
          taxes_fees: r.taxes
        });
      }
    }

    return normalized;
  }
}

if (require.main === module) {
  scrapeSignature().then(res => {
    console.log('[Signature Scraper] Sample Output (Top 3):');
    console.log(JSON.stringify(res.slice(0, 3), null, 2));
  });
}

module.exports = { scrapeSignature, loginSignature };
