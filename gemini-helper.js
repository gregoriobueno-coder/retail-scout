const { GoogleGenerativeAI } = require('@google/generative-ai');

async function generateSalesPitch(brand, ship, sailDate, nights, itinerary, price, drop, promotion, incentive) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('[Gemini] GEMINI_API_KEY is not set. Skipping AI pitch generation.');
    return '';
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
You are an expert copywriter for Wandering Bear Travel.
Generate a single, short, client-friendly sales pitch (maximum 15 words) for the following cruise deal.
Focus on highlighting the unique selling points (such as the price drop, amenities, destination, or ship). Do not include any markdown formatting, headers, or quotes. Just output plain text.

Cruise details:
- Cruise Line: ${brand}
- Ship: ${ship}
- Sail Date: ${sailDate}
- Duration: ${nights} Nights
- Itinerary: ${itinerary}
- Price (PP): $${price} (Original price had a drop of $${drop})
- Promotion: ${promotion}
- Agency Incentive: ${incentive || 'N/A'}

Your pitch (max 15 words):
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    // Strip quotes and return clean text
    return text.replace(/["']/g, '').replace(/\n/g, ' ').trim();
  } catch (error) {
    console.error('[Gemini] Failed to generate sales pitch:', error.message);
    return '';
  }
}

module.exports = { generateSalesPitch };
