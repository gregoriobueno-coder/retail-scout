const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

function compileRetailDashboard() {
  const dbPath = path.resolve(__dirname, process.env.DATABASE_PATH || 'retail_scout.db');
  console.log(`[Dashboard Compiler] Loading database from: ${dbPath}`);

  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Failed to open database for compilation:', err.message);
      return;
    }
  });

  const logoPath = path.join(__dirname, 'logo.png');
  const hasLogo = fs.existsSync(logoPath);

  db.serialize(() => {
    // 1. Fetch sailings
    db.all(`SELECT * FROM sailings`, [], (err, sailings) => {
      if (err) {
        console.error('Failed to query sailings:', err.message);
        db.close();
        return;
      }

      // 2. Fetch pricing history
      db.all(`SELECT * FROM pricing_history ORDER BY last_checked ASC`, [], (err, history) => {
        if (err) {
          console.error('Failed to query pricing history:', err.message);
          db.close();
          return;
        }

        db.close();
        generateHtml(sailings, history, hasLogo);
      });
    });
  });
}

function generateHtml(sailings, history, hasLogo) {
  // Group pricing history by sailing_id + category + rate_type
  const pricingGroups = {};
  for (const h of history) {
    const key = `${h.sailing_id}_${h.category}_${h.rate_type}`;
    if (!pricingGroups[key]) {
      pricingGroups[key] = [];
    }
    pricingGroups[key].push(h);
  }

  // Build current deals list with price drops
  const activeDeals = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const s of sailings) {
    const sailDate = new Date(s.sail_date);
    if (!isNaN(sailDate.getTime()) && sailDate < today) {
      continue; // Skip past sailings
    }

    // Find all categories for this sailing
    for (const hKey in pricingGroups) {
      if (hKey.startsWith(`${s.sailing_id}_`)) {
        const logs = pricingGroups[hKey];
        if (logs.length === 0) continue;

        const latest = logs[logs.length - 1];
        const rates = logs.map(l => l.base_rate);
        const maxRate = Math.max(...rates);
        const currentRate = latest.base_rate;
        const priceDrop = maxRate - currentRate;
        const percentDrop = maxRate > 0 ? Math.round((priceDrop / maxRate) * 100) : 0;

        activeDeals.push({
          sailing_id: s.sailing_id,
          brand: s.brand,
          ship: s.ship,
          sail_date: s.sail_date,
          nights: s.nights,
          itinerary: s.itinerary,
          region: s.region,
          category: latest.category,
          rate_type: latest.rate_type,
          price: currentRate,
          taxes_fees: latest.taxes_fees || 0,
          max_price: maxRate,
          price_drop: priceDrop,
          percent_drop: percentDrop,
          ports: s.ports || '',
          promotion_type: s.promotion_type || '',
          incentive: s.incentive || '',
          theme: s.theme || '',
          space_type: s.space_type || 'Signature',
          released_date: s.released_date || '',
          history: logs.map(l => ({ price: l.base_rate, date: l.last_checked }))
        });
      }
    }
  }

  const payloadJson = JSON.stringify(activeDeals);
  let payloadType = 'plaintext';
  let payloadData = Buffer.from(payloadJson).toString('base64');
  let saltBase64 = '';
  let ivBase64 = '';

  const password = process.env.DASHBOARD_PASSWORD;
  if (password) {
    console.log('Encrypting static dashboard payload...');
    payloadType = 'encrypted';
    
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([cipher.update(payloadJson, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const ciphertext = Buffer.concat([encrypted, tag]);
    payloadData = ciphertext.toString('base64');
    saltBase64 = salt.toString('base64');
    ivBase64 = iv.toString('base64');
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wandering Bear Retail Scout - Premium Cruise Fares & Group Space</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  
  <style>
    :root {
      --bg-warm: #f5f0e3;
      --card-bg: #ffffff;
      --card-border: #e6dfcf;
      --espresso: #3d1f0c;
      --espresso-light: #5a3f2d;
      --cocoa-gray: #7a6b63;
      --accent-mint: #1bbc9b;
      --accent-mint-hover: #16a085;
      --accent-mint-light: rgba(27, 188, 155, 0.1);
      --terracotta: #c94020;
      --terracotta-light: rgba(201, 64, 32, 0.08);
      --amber: #f3a46b;
      --transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Montserrat', sans-serif;
      background-color: var(--bg-warm);
      color: var(--espresso);
      min-height: 100vh;
      padding: 2.5rem 1.5rem;
      line-height: 1.5;
    }

    .container {
      max-width: 1440px;
      margin: 0 auto;
      display: none;
    }

    .lock-screen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      background: var(--bg-warm);
    }

    .lock-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 3rem 2rem;
      max-width: 420px;
      width: 90%;
      text-align: center;
      box-shadow: 0 10px 30px rgba(61, 31, 12, 0.06);
    }

    .lock-logo-wrapper {
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: center;
    }

    .lock-logo {
      height: 110px;
      object-fit: contain;
    }

    .lock-card h2 {
      font-family: 'Playfair Display', serif;
      font-weight: 700;
      font-size: 1.8rem;
      margin-bottom: 0.5rem;
      color: var(--espresso);
    }

    .lock-card p {
      color: var(--cocoa-gray);
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }

    .pw-input {
      width: 100%;
      background: #faf8f5;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 0.9rem 1.2rem;
      color: var(--espresso);
      font-size: 1rem;
      outline: none;
      text-align: center;
      letter-spacing: 0.2em;
      margin-bottom: 1rem;
      transition: var(--transition);
    }

    .pw-input:focus {
      border-color: var(--accent-mint);
      box-shadow: 0 0 10px rgba(27, 188, 155, 0.2);
    }

    .pw-btn {
      width: 100%;
      background: var(--accent-mint);
      color: #ffffff;
      border: none;
      border-radius: 10px;
      padding: 0.9rem;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: var(--transition);
    }

    .pw-btn:hover {
      background: var(--accent-mint-hover);
      box-shadow: 0 4px 15px rgba(27, 188, 155, 0.25);
    }

    .error-msg {
      color: var(--terracotta);
      font-size: 0.85rem;
      margin-top: 1rem;
      display: none;
    }

    .shake {
      animation: shakeEffect 0.4s ease-in-out;
    }

    @keyframes shakeEffect {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-10px); }
      40%, 80% { transform: translateX(10px); }
    }

    header {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 1.5rem 2.5rem;
      margin-bottom: 2.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 20px rgba(61, 31, 12, 0.02);
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .header-logo {
      height: 75px;
      width: auto;
      object-fit: contain;
    }

    .brand-section h1 {
      font-family: 'Playfair Display', serif;
      font-weight: 700;
      font-size: 2.2rem;
      color: var(--espresso);
    }

    .brand-section p {
      color: var(--cocoa-gray);
      font-size: 0.95rem;
      font-weight: 600;
    }

    .stats-badge {
      background: var(--accent-mint-light);
      border: 1px solid var(--accent-mint);
      border-radius: 10px;
      padding: 0.6rem 1.2rem;
      font-size: 0.9rem;
      color: var(--accent-mint-hover);
      font-weight: 700;
    }

    .filter-panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 2rem;
      margin-bottom: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      box-shadow: 0 4px 15px rgba(61, 31, 12, 0.01);
    }

    .filter-row-top {
      display: flex;
      flex-direction: column;
      gap: 1.2rem;
    }

    .search-wrapper {
      width: 100%;
    }

    .search-input {
      width: 100%;
      background: #faf8f5;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 0.9rem 1.2rem;
      color: var(--espresso);
      font-size: 0.95rem;
      outline: none;
      transition: var(--transition);
    }

    .search-input:focus {
      border-color: var(--accent-mint);
      background: #ffffff;
      box-shadow: 0 0 8px rgba(27, 188, 155, 0.1);
    }

    .filter-tabs-wrapper {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .filter-tabs-label {
      font-size: 0.8rem;
      color: var(--cocoa-gray);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .filter-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .filter-tab {
      background: #faf8f5;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 0.6rem 1.1rem;
      color: var(--espresso);
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 600;
      transition: var(--transition);
    }

    .filter-tab:hover {
      border-color: var(--accent-mint);
    }

    .filter-tab.active {
      background: var(--accent-mint);
      border-color: transparent;
      color: #ffffff;
      box-shadow: 0 4px 10px rgba(27, 188, 155, 0.15);
    }

    .filter-row-bottom {
      display: flex;
      flex-wrap: wrap;
      gap: 2rem;
      align-items: center;
      border-top: 1px solid var(--card-border);
      padding-top: 1.5rem;
    }

    .dropdown-container {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 200px;
      flex: 1;
    }

    .dropdown-label {
      font-size: 0.8rem;
      color: var(--cocoa-gray);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .select-control {
      background: #faf8f5;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 0.8rem 1rem;
      color: var(--espresso);
      outline: none;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition);
    }

    .select-control:focus {
      border-color: var(--accent-mint);
    }

    .slider-container {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 280px;
      flex: 1.5;
    }

    .slider-label-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: var(--cocoa-gray);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .slider-control {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: var(--card-border);
      outline: none;
    }

    .slider-control::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--accent-mint);
      cursor: pointer;
      box-shadow: 0 0 8px rgba(27, 188, 155, 0.3);
      transition: var(--transition);
    }

    .slider-control::-webkit-slider-thumb:hover {
      background: var(--accent-mint-hover);
    }

    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(61, 31, 12, 0.02);
      margin-bottom: 3rem;
    }

    .table-wrapper {
      width: 100%;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th, td {
      padding: 1.2rem 1.3rem;
      border-bottom: 1px solid var(--card-border);
    }

    th {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--cocoa-gray);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      cursor: pointer;
      user-select: none;
      background: #faf8f5;
      transition: var(--transition);
    }

    th:hover {
      background: #f3edd8;
      color: var(--espresso);
    }

    th.active-sort {
      color: var(--accent-mint-hover);
    }

    td {
      font-size: 0.9rem;
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(245, 240, 227, 0.25);
    }

    .itinerary-details {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .itinerary-name {
      font-weight: 600;
      color: var(--espresso);
    }

    .itinerary-ports {
      font-size: 0.78rem;
      color: var(--cocoa-gray);
      font-style: italic;
    }

    .itinerary-theme-badge {
      align-self: flex-start;
      background: var(--accent-mint-light);
      color: var(--accent-mint-hover);
      border: 1px solid var(--accent-mint);
      border-radius: 4px;
      font-size: 0.7rem;
      padding: 0.1rem 0.4rem;
      font-weight: 700;
      text-transform: uppercase;
      margin-top: 0.2rem;
    }

    .portal-badge {
      border-radius: 6px;
      padding: 0.35rem 0.7rem;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: inline-block;
      text-align: center;
    }

    .badge-signature {
      background: rgba(243, 164, 107, 0.12);
      color: #df7a2e;
      border: 1px solid rgba(243, 164, 107, 0.25);
    }
    
    .badge-tpi {
      background: var(--accent-mint-light);
      color: var(--accent-mint-hover);
      border: 1px solid var(--accent-mint);
    }

    .badge-retail {
      background: rgba(122, 107, 99, 0.08);
      color: var(--cocoa-gray);
      border: 1px solid rgba(122, 107, 99, 0.15);
    }

    .price-value {
      font-weight: 700;
      color: var(--espresso);
      font-size: 1.1rem;
    }

    .original-price {
      font-size: 0.8rem;
      color: var(--cocoa-gray);
      text-decoration: line-through;
      margin-right: 0.4rem;
    }

    .discount-badge {
      background: var(--terracotta-light);
      color: var(--terracotta);
      border: 1px solid rgba(201, 64, 32, 0.2);
      font-size: 0.75rem;
      font-weight: 700;
      border-radius: 6px;
      padding: 0.25rem 0.5rem;
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
    }

    .promo-cell {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }

    .promo-text {
      font-size: 0.82rem;
      color: var(--espresso-light);
    }

    .commission-badge {
      background: rgba(0, 200, 83, 0.08);
      color: #00c853;
      border: 1px solid rgba(0, 200, 83, 0.2);
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.15rem 0.4rem;
      align-self: flex-start;
      display: inline-block;
    }

    .table-footnote {
      padding: 1.2rem 1.5rem;
      font-size: 0.82rem;
      color: var(--cocoa-gray);
      border-top: 1px solid var(--card-border);
      background: #faf8f5;
      font-style: italic;
    }

    .no-results {
      padding: 3rem;
      text-align: center;
      color: var(--cocoa-gray);
      font-size: 1rem;
    }

    .sailing-row {
      cursor: pointer;
      transition: var(--transition);
    }
    .sailing-row:hover td {
      background: rgba(27, 188, 155, 0.05) !important;
    }
    .detail-drawer-row td {
      padding: 0;
      background: #faf8f5;
      border-bottom: 1px solid var(--card-border);
    }
    .drawer-content {
      display: flex;
      flex-wrap: wrap;
      gap: 2rem;
      padding: 1.5rem 2.5rem;
      align-items: center;
      justify-content: space-between;
    }
    .drawer-chart-container {
      flex: 2;
      min-width: 320px;
      max-width: 650px;
      height: 220px;
    }
    .drawer-info-container {
      flex: 1;
      min-width: 250px;
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
      background: #ffffff;
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 4px 10px rgba(61, 31, 12, 0.01);
    }
    .quote-btn {
      background: var(--accent-mint);
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 0.75rem 1.2rem;
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
      transition: var(--transition);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    .quote-btn:hover {
      background: var(--accent-mint-hover);
      box-shadow: 0 4px 12px rgba(27, 188, 155, 0.2);
    }
    .quote-btn.success {
      background: #00c853;
      box-shadow: 0 4px 12px rgba(0, 200, 83, 0.2);
    }
  </style>
</head>
<body>
  <div class="lock-screen" id="lock-screen" style="display: ${payloadType === 'encrypted' ? 'flex' : 'none'};">
    <div class="lock-card" id="lock-card">
      <div class="lock-logo-wrapper">
        ${hasLogo ? `<img src="logo.png" alt="Wandering Bear Logo" class="lock-logo">` : `<span style="font-size:4rem;">🐻</span>`}
      </div>
      <h2>Retail Cruise Scout</h2>
      <p>Secure Pricing Log & co-op Group Rates Analyzer</p>
      <input type="password" id="password-field" class="pw-input" placeholder="••••••••" onkeydown="if(event.key==='Enter') verifyAndUnlock()">
      <button class="pw-btn" onclick="verifyAndUnlock()">Unlock Dashboard</button>
      <div class="error-msg" id="error-msg">Incorrect Password. Please try again.</div>
    </div>
  </div>

  <div class="container" id="main-container" style="display: ${payloadType === 'plaintext' ? 'block' : 'none'};">
    <header>
      <div class="brand-section">
        ${hasLogo ? `<img src="logo.png" alt="Wandering Bear Logo" class="header-logo">` : `<span style="font-size:3rem;">🐻</span>`}
        <div>
          <h1>Wandering Bear Retail Scout</h1>
          <p>Retail Fares & pre-booked Group Space pricing Analyzer</p>
        </div>
      </div>
      <div class="stats-badge" id="last-updated">Real-time Rates</div>
    </header>

    <div class="filter-panel">
      <div class="filter-row-top">
        <div class="search-wrapper">
          <input type="text" id="search-bar" class="search-input" placeholder="Search by Ship, Itinerary, Route, or Cabin Category..." oninput="filterAndRender()">
        </div>
        
        <div class="filter-tabs-wrapper">
          <span class="filter-tabs-label">Filter by Brand</span>
          <div class="filter-tabs" id="dynamic-brand-tabs">
            <!-- Dynamically populated -->
          </div>
        </div>
      </div>

      <div class="filter-row-bottom">
        <div class="dropdown-container">
          <span class="dropdown-label">Destination Region</span>
          <select id="region-filter" class="select-control" onchange="filterAndRender()">
            <option value="all">All Regions</option>
            <option value="Alaska">Alaska</option>
            <option value="Bahamas">Bahamas</option>
            <option value="Caribbean">Caribbean</option>
            <option value="Europe & Med">Europe & Mediterranean</option>
            <option value="Transatlantic">Transatlantic</option>
            <option value="Other / Global">Other / Global</option>
          </select>
        </div>

        <div class="dropdown-container">
          <span class="dropdown-label">Rate Class</span>
          <select id="rate-type-filter" class="select-control" onchange="filterAndRender()">
            <option value="all">All Rates</option>
            <option value="retail">Standard Retail Fares</option>
            <option value="signature_group">Signature Group Space</option>
            <option value="tpi_group">TPI Block Space</option>
          </select>
        </div>

        <div class="slider-container">
          <div class="slider-label-row">
            <span>Max Price limit</span>
            <span id="price-slider-val">$10000</span>
          </div>
          <input type="range" id="price-slider" class="slider-control" min="0" max="10000" step="100" value="10000" oninput="updateSliders()">
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-wrapper">
        <table id="sailings-table">
          <thead>
            <tr>
              <th onclick="toggleSort('brand')" id="th-brand">Brand</th>
              <th onclick="toggleSort('released_date')" id="th-released_date">Released</th>
              <th onclick="toggleSort('sail_date')" id="th-sail_date" class="active-sort">Sail Date</th>
              <th onclick="toggleSort('nights')" id="th-nights">Nights</th>
              <th onclick="toggleSort('ship')" id="th-ship">Ship</th>
              <th onclick="toggleSort('itinerary')" id="th-itinerary">Itinerary & Route</th>
              <th onclick="toggleSort('category')" id="th-category">Cabin Category</th>
              <th onclick="toggleSort('space_type')" id="th-space_type">Rate Class</th>
              <th>Promotions & Incentives</th>
              <th onclick="toggleSort('price')" id="th-price">Base Rate (PP)*</th>
              <th>Price Drop</th>
            </tr>
          </thead>
          <tbody id="table-body">
            <!-- Dynamic rows -->
          </tbody>
        </table>
        <div class="table-footnote">
          * Note: Rates are listed Per Person (PP) base cruise fares double occupancy in USD, excluding taxes and port fees.
        </div>
        <div class="no-results" id="no-results-view" style="display: none;">
          No matching active sailings logged in the database.
        </div>
      </div>
    </div>
  </div>

  <script>
    window.PAYLOAD_TYPE = "${payloadType}";
    window.PAYLOAD_DATA = "${payloadData}";
    window.PAYLOAD_SALT = "${saltBase64}";
    window.PAYLOAD_IV = "${ivBase64}";

    let allSailings = [];
    let currentBrand = 'all';
    let currentSort = { column: 'sail_date', direction: 'asc' };

    function base64ToArrayBuffer(base64) {
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    async function decryptPayload(password) {
      const salt = base64ToArrayBuffer(window.PAYLOAD_SALT);
      const iv = base64ToArrayBuffer(window.PAYLOAD_IV);
      const ciphertext = base64ToArrayBuffer(window.PAYLOAD_DATA);

      const enc = new TextEncoder();
      const baseKey = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
      );

      const key = await window.crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: 100000,
          hash: "SHA-256"
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["decrypt"]
      );

      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv,
          tagLength: 128
        },
        key,
        ciphertext
      );

      const dec = new TextDecoder();
      return JSON.parse(dec.decode(decrypted));
    }

    async function verifyAndUnlock() {
      const field = document.getElementById('password-field');
      const card = document.getElementById('lock-card');
      const errMsg = document.getElementById('error-msg');
      const password = field.value;

      try {
        allSailings = await decryptPayload(password);
        document.getElementById('lock-screen').style.display = 'none';
        document.getElementById('main-container').style.display = 'block';
        initializeData();
      } catch (err) {
        console.error(err);
        card.classList.add('shake');
        errMsg.style.display = 'block';
        setTimeout(() => card.classList.remove('shake'), 500);
      }
    }

    function formatDate(dateStr) {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function initializeData() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Filter out past voyages
      allSailings = allSailings.filter(s => new Date(s.sail_date) >= today);

      // Build dynamic brand tabs
      const uniqueBrands = ['all'];
      allSailings.forEach(s => {
        if (s.brand && !uniqueBrands.includes(s.brand)) {
          uniqueBrands.push(s.brand);
        }
      });

      const tabsWrapper = document.getElementById('dynamic-brand-tabs');
      tabsWrapper.innerHTML = '';
      
      uniqueBrands.forEach(b => {
        const btn = document.createElement('button');
        btn.className = b === 'all' ? 'filter-tab active' : 'filter-tab';
        btn.innerText = b === 'all' ? 'All Brands' : b;
        btn.onclick = () => setBrandFilter(b);
        tabsWrapper.appendChild(btn);
      });

      const prices = allSailings.map(s => s.price);
      const maxPrice = prices.length ? Math.max(...prices) : 10000;
      
      const slider = document.getElementById('price-slider');
      slider.max = maxPrice;
      slider.value = maxPrice;
      document.getElementById('price-slider-val').innerText = '$' + maxPrice;

      filterAndRender();
    }

    function updateSliders() {
      const priceVal = document.getElementById('price-slider').value;
      document.getElementById('price-slider-val').innerText = '$' + priceVal;
      filterAndRender();
    }

    function setBrandFilter(brand) {
      currentBrand = brand;
      const tabs = document.querySelectorAll('.filter-tab');
      tabs.forEach(tab => {
        if (tab.innerText === 'All Brands' && brand === 'all') {
          tab.classList.add('active');
        } else if (tab.innerText === brand) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });
      filterAndRender();
    }

    function toggleSort(column) {
      if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
      }

      document.querySelectorAll('th').forEach(th => th.classList.remove('active-sort'));
      const activeTh = document.getElementById('th-' + column);
      if (activeTh) activeTh.classList.add('active-sort');
      filterAndRender();
    }

    function filterAndRender() {
      const query = document.getElementById('search-bar').value.toLowerCase();
      const maxPrice = parseInt(document.getElementById('price-slider').value) || 99999;
      const regionVal = document.getElementById('region-filter').value;
      const rateTypeVal = document.getElementById('rate-type-filter').value;

      let filtered = allSailings.filter(s => {
        let brandMatch = false;
        if (currentBrand === 'all') brandMatch = true;
        else brandMatch = s.brand === currentBrand;

        const regionMatch = regionVal === 'all' || s.region === regionVal;
        
        let rateTypeMatch = false;
        if (rateTypeVal === 'all') rateTypeMatch = true;
        else if (rateTypeVal === 'retail') rateTypeMatch = s.rate_type !== 'signature_group';
        else if (rateTypeVal === 'signature_group') rateTypeMatch = s.rate_type === 'signature_group' && s.space_type !== 'TPI';
        else if (rateTypeVal === 'tpi_group') rateTypeMatch = s.space_type === 'TPI';

        const priceMatch = s.price <= maxPrice;

        const textMatch = (s.ship || '').toLowerCase().includes(query) || 
                          (s.itinerary || '').toLowerCase().includes(query) || 
                          (s.category || '').toLowerCase().includes(query) ||
                          (s.ports || '').toLowerCase().includes(query) ||
                          (s.brand || '').toLowerCase().includes(query);

        return brandMatch && regionMatch && rateTypeMatch && priceMatch && textMatch;
      });

      filtered.sort((a, b) => {
        let valA = a[currentSort.column];
        let valB = b[currentSort.column];

        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (typeof valA === 'string') {
          return currentSort.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
          return currentSort.direction === 'asc' ? valA - valB : valB - valA;
        }
      });

      const tbody = document.getElementById('table-body');
      tbody.innerHTML = '';

      if (filtered.length === 0) {
        document.getElementById('no-results-view').style.display = 'block';
        return;
      }
      document.getElementById('no-results-view').style.display = 'none';

      filtered.forEach((s, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'sailing-row';
        const drawerId = \`drawer-\${idx}\`;
        
        tr.onclick = () => toggleDetailsRow(drawerId, s.history);
        
        let rateClassBadge = 'badge-retail';
        let rateClassLabel = 'Retail Fares';
        if (s.space_type === 'TPI') {
          rateClassBadge = 'badge-tpi';
          rateClassLabel = 'TPI Block';
        } else if (s.rate_type === 'signature_group') {
          rateClassBadge = 'badge-signature';
          rateClassLabel = 'Signature Group';
        }
        
        let dropMarkup = '<em>No change</em>';
        if (s.price_drop > 0) {
          dropMarkup = \`<span class="discount-badge">↓ \$\${s.price_drop} (\$\${s.percent_drop}%)</span>\`;
        }

        // Build theme markup
        const themeMarkup = s.theme ? \`<span class="itinerary-theme-badge">\${s.theme}</span>\` : '';
        const portsMarkup = s.ports ? \`<span class="itinerary-ports">\${s.ports}</span>\` : '';

        // Build promos cell
        let promosMarkup = '';
        if (s.promotion_type) {
          promosMarkup += \`<span class="promo-text">\${s.promotion_type}</span>\`;
        }
        if (s.incentive) {
          promosMarkup += \`<span class="commission-badge">💰 \${s.incentive}</span>\`;
        }
        if (!promosMarkup) {
          promosMarkup = '<span style="color:var(--cocoa-gray);font-style:italic;">Standard inclusions</span>';
        }

        const releasedMarkup = s.released_date ? formatDate(s.released_date) : '<span style="color:var(--cocoa-gray);font-style:italic;">New</span>';

        tr.innerHTML = \`
          <td><strong>\${s.brand}</strong></td>
          <td>\${releasedMarkup}</td>
          <td>\${formatDate(s.sail_date)}</td>
          <td>\${s.nights} Nights</td>
          <td>\${s.ship}</td>
          <td>
            <div class="itinerary-details">
              <span class="itinerary-name">\${s.itinerary}</span>
              \${portsMarkup}
              \${themeMarkup}
            </div>
          </td>
          <td>\${s.category}</td>
          <td><span class="portal-badge \${rateClassBadge}">\${rateClassLabel}</span></td>
          <td>
            <div class="promo-cell">
              \${promosMarkup}
            </div>
          </td>
          <td>
            \${s.price_drop > 0 ? \`<span class="original-price">\$\${s.max_price}</span>\` : ''}
            <span class="price-value">\$\${s.price}</span>
          </td>
          <td>\${dropMarkup}</td>
        \`;
        tbody.appendChild(tr);

        // Append hidden expandable drawer row
        const drawerTr = document.createElement('tr');
        drawerTr.id = drawerId;
        drawerTr.className = 'detail-drawer-row';
        drawerTr.style.display = 'none';

        const safeBrand = s.brand.replace(/'/g, "\\'");
        const safeShip = s.ship.replace(/'/g, "\\'");
        const safeItinerary = s.itinerary.replace(/'/g, "\\'");
        const safePromo = s.promotion_type.replace(/'/g, "\\'");
        const safeIncentive = s.incentive.replace(/'/g, "\\'");

        drawerTr.innerHTML = \`
          <td colspan="11">
            <div class="drawer-content">
              <div class="drawer-chart-container">
                <canvas id="canvas-\${drawerId}"></canvas>
              </div>
              <div class="drawer-info-container">
                <h4 style="font-family:'Playfair Display', serif;font-weight:700;font-size:1.1rem;color:var(--espresso);">Client Quoting Action</h4>
                <p style="font-size:0.75rem;color:var(--cocoa-gray);">Generate a pre-formatted pricing quote to copy directly to your clipboard.</p>
                <button class="quote-btn" onclick="copyQuoteToClipboard(event, '\${safeBrand}', '\${safeShip}', '\${s.sail_date}', '\${safeItinerary}', '\${s.category}', \${s.price}, \${s.price_drop}, '\${safePromo}', '\${safeIncentive}')">
                  📋 Copy Quote
                </button>
              </div>
            </div>
          </td>
        \`;
        tbody.appendChild(drawerTr);
      });
    }

    const activeCharts = {};

    function toggleDetailsRow(drawerId, historyLogs) {
      const row = document.getElementById(drawerId);
      if (!row) return;

      const isHidden = row.style.display === 'none';

      // Collapse other drawers first for clean single-view
      document.querySelectorAll('.detail-drawer-row').forEach(r => {
        r.style.display = 'none';
      });

      if (isHidden) {
        row.style.display = 'table-row';
        const canvasId = 'canvas-' + drawerId;
        if (!activeCharts[canvasId]) {
          setTimeout(() => {
            initChart(canvasId, historyLogs);
            activeCharts[canvasId] = true;
          }, 50);
        }
      } else {
        row.style.display = 'none';
      }
    }

    function initChart(canvasId, historyLogs) {
      const canvasEl = document.getElementById(canvasId);
      if (!canvasEl) return;
      const ctx = canvasEl.getContext('2d');
      
      const sortedLogs = [...historyLogs].sort((a, b) => new Date(a.date) - new Date(b.date));
      const labels = sortedLogs.map(l => formatDate(l.date));
      const prices = sortedLogs.map(l => l.price);

      new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Rate (USD)',
            data: prices,
            borderColor: '#1bbc9b',
            backgroundColor: 'rgba(27, 188, 155, 0.04)',
            borderWidth: 2.5,
            tension: 0.25,
            fill: true,
            pointBackgroundColor: '#1bbc9b',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 9, family: 'Montserrat' } }
            },
            y: {
              ticks: { 
                font: { size: 9, family: 'Montserrat' },
                callback: value => '$' + value 
              }
            }
          }
        }
      });
    }

    function escapeHtmlText(text) {
      return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }

    function copyQuoteToClipboard(event, brand, ship, sailDate, itinerary, category, price, priceDrop, promo, commission) {
      event.stopPropagation();
      
      const cleanBrand = escapeHtmlText(brand);
      const cleanShip = escapeHtmlText(ship);
      const cleanItinerary = escapeHtmlText(itinerary);
      const cleanPromo = escapeHtmlText(promo);
      
      let quoteText = \`🚢 PREMIUM CRUISE QUOTE - WANDERING BEAR TRAVEL AGENCY\\n\`;
      quoteText += \`==================================================\\n\`;
      quoteText += \`Cruise Line: \${cleanBrand}\\n\`;
      quoteText += \`Ship Name  : \${cleanShip}\\n\`;
      quoteText += \`Sail Date  : \${formatDate(sailDate)}\\n\`;
      quoteText += \`Itinerary  : \${cleanItinerary}\\n\`;
      quoteText += \`Cabin Cat  : \${category}\\n\`;
      quoteText += \`--------------------------------------------------\\n\`;
      quoteText += \`Exclusive Rate: \$\${price} per person (base cruise fare)\\n\`;
      if (priceDrop > 0) {
        quoteText += \`Rate Savings  : \$\${priceDrop} price drop detected from initial listing!\\n\`;
      }
      if (cleanPromo) {
        quoteText += \`Inclusions    : \${cleanPromo}\\n\`;
      }
      quoteText += \`==================================================\\n\`;
      quoteText += \`Let me know if you would like to hold space for this voyage!\\n\`;
      quoteText += \`🌐 View the latest live rates: https://gregoriobueno-coder.github.io/retail-scout/\\n\`;

      navigator.clipboard.writeText(quoteText).then(() => {
        const btn = event.currentTarget;
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Quote Copied!';
        btn.classList.add('success');
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.classList.remove('success');
        }, 2000);
      });
    }

    if (window.PAYLOAD_TYPE === 'plaintext') {
      allSailings = JSON.parse(window.atob(window.PAYLOAD_DATA));
      initializeData();
    }
  </script>
</body>
  `;

  // Save html file to the root of the retail-scout directory
  fs.writeFileSync(path.join(__dirname, 'index.html'), htmlContent, 'utf8');
  console.log(`[Dashboard Compiler] Static dashboard successfully compiled to index.html at root! (Type: ${payloadType})`);
}

if (require.main === module) {
  compileRetailDashboard();
}

module.exports = { compileRetailDashboard };
