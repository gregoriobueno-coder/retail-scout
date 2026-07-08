const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to travelwithbears.com...');
    await page.goto('https://www.travelwithbears.com', { waitUntil: 'networkidle', timeout: 30000 });
    
    const pageColors = await page.evaluate(() => {
      // Find backgrounds, texts, and borders to see what the common colors are
      const elements = Array.from(document.querySelectorAll('*'));
      const bgColors = new Set();
      const textColors = new Set();
      
      elements.forEach(el => {
        const style = window.getComputedStyle(el);
        const bg = style.backgroundColor;
        const text = style.color;
        
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') bgColors.add(bg);
        if (text) textColors.add(text);
      });
      
      return {
        backgrounds: Array.from(bgColors).slice(0, 50),
        texts: Array.from(textColors).slice(0, 50)
      };
    });
    
    console.log('\n--- COMPUTED BACKGROUND COLORS ---');
    console.log(pageColors.backgrounds);
    console.log('\n--- COMPUTED TEXT COLORS ---');
    console.log(pageColors.texts);
    
  } catch (err) {
    console.error('Failed to inspect colors:', err.message);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
