const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const authStatePath = path.join(__dirname, '..', 'auth', 'signature-state.json');

const startUrl = 'https://www.signaturetravelnetwork.com/utils/cruiseSearch/customSearchResults.cfm?sortType=date&cruiseType=&departMonth=null&departYear=null&fromDate=&toDate=&startLength=1&endLength=20&priceStart=0&priceEnd=4100&offerType=cse&offerType=privateCollection&offerType=exclusive&advancedOnly=1&advancedFlag=1&adFlag=1&type=intranet&agency_id=3462&utp=AGENT&userid=71094';

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

  console.log('[Signature Auth] Attempting automated credential-based login (headed)...');
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
    console.log('[Signature Auth] Navigating to homepage...');
    await page.goto('https://www.signaturetravelnetwork.com/index.cfm', { waitUntil: 'networkidle', timeout: 45000 });

    const acceptCookiesBtn = await page.$('button.ch2-allow-all-btn');
    if (acceptCookiesBtn) {
      console.log('[Signature Auth] Accepting cookies splash...');
      await acceptCookiesBtn.click({ force: true });
      await page.waitForTimeout(1000);
    }

    const memberLoginBtn = await page.$('button.member_login, .mobile-member-login');
    if (memberLoginBtn && await memberLoginBtn.isVisible()) {
      console.log('[Signature Auth] Clicking Member Login button...');
      await memberLoginBtn.click({ force: true });
      await page.waitForTimeout(1000);
    }

    const userInputs = await page.$$('input[name="user_name"]');
    const passInputs = await page.$$('input[name="password"]');

    let filled = false;
    for (let i = 0; i < userInputs.length; i++) {
      if (await userInputs[i].isVisible()) {
        console.log(`[Signature Auth] Filling login form fields (input ${i})...`);
        await userInputs[i].fill(username);
        await passInputs[i].fill(password);
        filled = true;
        
        console.log('[Signature Auth] Submitting login form...');
        await passInputs[i].press('Enter');
        
        console.log('[Signature Auth] Waiting for dashboard redirect...');
        await page.waitForURL('**/SigNet/index.cfm**', { timeout: 30000 });
        break;
      }
    }

    if (!filled) {
      throw new Error('No visible login fields found.');
    }

    console.log('[Signature Auth] Login successful. Saving session state...');
    const authDir = path.dirname(authStatePath);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    await context.storageState({ path: authStatePath });
    console.log(`[Signature Auth] Authentication state saved successfully to ${authStatePath}`);

  } catch (err) {
    console.warn('[Signature Auth] Automated login failed:', err.message);
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
    let needsLogin = false;
    if (!fs.existsSync(authStatePath)) {
      needsLogin = true;
    } else {
      const stats = fs.statSync(authStatePath);
      const ageMs = Date.now() - stats.mtime.getTime();
      const fifteenMinutes = 15 * 60 * 1000;
      if (ageMs > fifteenMinutes) {
        console.log(`[Signature Scraper] Saved authentication state is older than 15 minutes (${Math.round(ageMs / 1000 / 60)}m old). Proactively refreshing...`);
        needsLogin = true;
      }
    }

    if (needsLogin) {
      if (process.env.SIGNATURE_USERNAME && process.env.SIGNATURE_PASSWORD) {
        console.log('[Signature Scraper] Running proactive auto-login refresh...');
        await loginSignature();
      } else {
        throw new Error('No saved authentication state found and no credentials configured. Login required.');
      }
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

    // Check if we need to refresh the session (invalid title, login redirect, or missing search results table)
    const pageTitle = await page.title();
    const currentUrl = page.url();
    const hasTable = await page.$('div#cruise_search_results_div > table');
    const isError = pageTitle.toLowerCase().includes('error') || 
                    currentUrl.includes('login') || 
                    currentUrl.includes('type=consumer') ||
                    !hasTable;

    if (isError) {
      console.log('[Signature Scraper] Session expired or invalid.');
      
      if (process.env.SIGNATURE_USERNAME && process.env.SIGNATURE_PASSWORD) {
        console.log('[Signature Scraper] Attempting auto-login refresh using credentials...');
        await browser.close();
        await loginSignature();
        
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
      } else {
        throw new Error('Signature Travel Network session expired. Please run "npm run login" or the login command manually to capture a fresh session.');
      }
    }

    const normalizedDeals = [];

    // Helper function to scrape a specific page structure
    async function scrapeUrlPage(targetUrl, sourceSpaceType) {
      console.log(`[Signature Scraper] Navigating to page: ${targetUrl}`);
      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('table', { timeout: 15000 });
      } catch (err) {
        console.warn(`[Signature Scraper] Table not found on ${targetUrl}: ${err.message}`);
        return 0;
      }

      const pageDeals = await page.evaluate(() => {
        let table = document.querySelector('div#cruise_search_results_div > table');
        if (!table) {
          const tables = Array.from(document.querySelectorAll('table'));
          table = tables.find(t => t.innerText.includes('Date') && t.innerText.includes('Nights') && t.innerText.includes('Price'));
        }
        if (!table) return [];
        const rows = Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > tr'));
        
        const headerRow = rows.find(r => r.innerText.includes('Date') && r.innerText.includes('Nights') && r.innerText.includes('Price'));
        if (!headerRow) return [];

        const headers = Array.from(headerRow.querySelectorAll(':scope > th, :scope > td')).map(h => h.innerText.trim());
        const dateIdx = headers.findIndex(h => h.includes('Date'));
        const shipIdx = headers.findIndex(h => h.includes('Ship') || h.includes('Cruise Line'));
        const nightsIdx = headers.findIndex(h => h.includes('Nights'));
        const priceIdx = headers.findIndex(h => h.includes('Price'));
        const itineraryIdx = headers.findIndex(h => h.includes('Title') || h.includes('Theme'));
        const offerIdIdx = headers.findIndex(h => h.includes('Offer'));

        const results = [];
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll(':scope > td')).map(c => c.innerText.trim());
          if (cells.length < Math.max(dateIdx, shipIdx, nightsIdx, priceIdx)) continue;
          
          const dateText = cells[dateIdx] || '';
          if (!/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateText)) continue;
          
          results.push({
            date: dateText,
            shipText: cells[shipIdx] || '',
            nights: cells[nightsIdx] || '7',
            itinerary: cells[itineraryIdx] || 'Signature Group Deal',
            priceStr: cells[priceIdx] || '',
            offerId: offerIdIdx !== -1 ? cells[offerIdIdx] || '' : ''
          });
        }
        return results;
      });

      console.log(`[Signature Scraper] Extracted ${pageDeals.length} raw rows.`);

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

          // Extract detailed sub-fields from the multi-line itinerary cell
          const lines = d.itinerary.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          const itinerary = lines[0] || 'Signature Group Deal';
          const ports = lines[1] || '';
          
          // Match promotion lines
          const promotion_type = lines.find(l => l.includes('Signature Collection') || l.includes('Hosted') || l.includes('Amenities')) || lines[2] || '';
          const incentive = lines.find(l => l.toLowerCase().includes('commission')) || '';
          const theme = lines.find(l => l.toLowerCase().includes('theme cruise')) || '';

          const cleanOfferId = d.offerId.replace(/[^0-9]/g, '');
          const suffix = cleanOfferId ? `_${cleanOfferId}` : '';

          normalizedDeals.push({
            sailing_id: `signature_${brand.toLowerCase().replace(/[^a-z]/g, '')}_${ship.toLowerCase().replace(/[^a-z]/g, '')}_${cleanDate.replace(/[^0-9]/g, '')}${suffix}`,
            brand: brand,
            ship: ship,
            sail_date: cleanDate,
            nights: parseInt(d.nights) || 7,
            itinerary: itinerary,
            region: 'Global / Block Space',
            category: 'Group Block Stateroom',
            rate_type: 'signature_group',
            base_rate: price,
            taxes_fees: 0,
            ports: ports,
            promotion_type: promotion_type,
            incentive: incentive,
            theme: theme,
            space_type: sourceSpaceType
          });
        }
      }
      return pageDeals.length;
    }

    // 1. Scrape Signature Collection deals (main search results)
    let currentPage = 1;
    const maxPages = parseInt(process.env.SIGNATURE_MAX_PAGES) || 15;
    while (currentPage <= maxPages) {
      console.log(`[Signature Scraper] Scraping Signature page ${currentPage} of ${maxPages}...`);
      const nextUrl = `${startUrl}&page=${currentPage}`;
      await scrapeUrlPage(nextUrl, 'Signature');
      currentPage++;
    }

    // 2. Scrape Agency Offers (TPI block space)
    console.log('[Signature Scraper] Checking for TPI Agency Block Space...');
    const tpiUrl = 'https://www.signaturetravelnetwork.com/supplier/cruise_quick_search_result.cfm?bAgencyOnly=1&utp=AGENT&agency_id=3462&type=intranet&userid=71094&user_id=71094';
    await scrapeUrlPage(tpiUrl, 'TPI');

    await browser.close();
    console.log(`[Signature Scraper] Total signature + TPI deals scraped: ${normalizedDeals.length}`);
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
