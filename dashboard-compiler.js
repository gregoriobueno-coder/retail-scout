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
  <title>Retail Cruise Scout - Wandering Bear Travel Agency</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Plus+Jakarta+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg-warm: #f6f3eb;
      --card-bg: #ffffff;
      --card-border: #e1dacb;
      --espresso: #2b1810;
      --cocoa-gray: #7a6b63;
      --terracotta: #cf5230;
      --terracotta-light: rgba(207, 82, 48, 0.1);
      --seafoam-teal: #46958a;
      --seafoam-light: rgba(70, 149, 138, 0.15);
      --amber: #d68d45;
      --transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: var(--bg-warm);
      color: var(--espresso);
      min-height: 100vh;
      padding: 2rem 1.5rem;
    }

    .container {
      max-width: 1400px;
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
      border-radius: 28px;
      padding: 3rem 2rem;
      max-width: 420px;
      width: 90%;
      text-align: center;
      box-shadow: 0 12px 40px rgba(43, 24, 16, 0.08);
    }

    .lock-logo-wrapper {
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: center;
    }

    .lock-logo {
      height: 100px;
      object-fit: contain;
    }

    .lock-card h2 {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      margin-bottom: 0.5rem;
    }

    .lock-card p {
      color: var(--cocoa-gray);
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }

    .pw-input {
      width: 100%;
      background: var(--bg-warm);
      border: 1px solid var(--card-border);
      border-radius: 12px;
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
      border-color: var(--terracotta);
      box-shadow: 0 0 12px rgba(207, 82, 48, 0.2);
    }

    .pw-btn {
      width: 100%;
      background: var(--terracotta);
      color: #ffffff;
      border: none;
      border-radius: 12px;
      padding: 0.9rem;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: var(--transition);
    }

    .pw-btn:hover {
      background: #b43c22;
      box-shadow: 0 6px 20px rgba(207, 82, 48, 0.3);
    }

    .error-msg {
      color: #d23f30;
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
      border-radius: 24px;
      padding: 1.5rem 2rem;
      margin-bottom: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 20px rgba(43, 24, 16, 0.03);
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .header-logo {
      height: 90px;
      width: auto;
      object-fit: contain;
      filter: drop-shadow(0 4px 10px rgba(43, 24, 16, 0.08));
    }

    .brand-section h1 {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      font-size: 2.3rem;
      color: var(--espresso);
    }

    .brand-section p {
      color: var(--cocoa-gray);
      font-size: 0.95rem;
      font-weight: 600;
    }

    .stats-badge {
      background: var(--seafoam-light);
      border: 1px solid var(--seafoam-teal);
      border-radius: 12px;
      padding: 0.6rem 1.2rem;
      font-size: 0.9rem;
      color: var(--seafoam-teal);
      font-weight: 700;
    }

    .metrics-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 15px rgba(43, 24, 16, 0.02);
    }

    .metric-label {
      color: var(--cocoa-gray);
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
      font-weight: 700;
    }

    .metric-value {
      font-family: 'Outfit', sans-serif;
      font-size: 2.1rem;
      font-weight: 800;
      color: var(--espresso);
    }

    .filter-panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      padding: 2rem;
      margin-bottom: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      box-shadow: 0 4px 15px rgba(43, 24, 16, 0.02);
    }

    .filter-row-top {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      align-items: center;
    }

    .search-wrapper {
      flex: 1;
      min-width: 300px;
    }

    .search-input {
      width: 100%;
      background: var(--bg-warm);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 0.9rem 1.2rem;
      color: var(--espresso);
      font-size: 0.95rem;
      outline: none;
      transition: var(--transition);
    }

    .search-input:focus {
      border-color: var(--terracotta);
      background: #ffffff;
      box-shadow: 0 0 10px rgba(207, 82, 48, 0.1);
    }

    .filter-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .filter-tab {
      background: var(--bg-warm);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 0.65rem 1.2rem;
      color: var(--espresso);
      cursor: pointer;
      font-size: 0.88rem;
      font-weight: 600;
      transition: var(--transition);
    }

    .filter-tab.active {
      background: var(--terracotta);
      border-color: transparent;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(207, 82, 48, 0.2);
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
      font-size: 0.85rem;
      color: var(--cocoa-gray);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .select-control {
      background: var(--bg-warm);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 0.8rem 1rem;
      color: var(--espresso);
      outline: none;
      font-weight: 600;
      cursor: pointer;
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
      font-size: 0.85rem;
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
      background: var(--terracotta);
      cursor: pointer;
      box-shadow: 0 0 8px rgba(207, 82, 48, 0.4);
      transition: var(--transition);
    }

    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(43, 24, 16, 0.03);
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
      padding: 1.2rem 1.5rem;
      border-bottom: 1px solid var(--card-border);
    }

    th {
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      color: var(--cocoa-gray);
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      cursor: pointer;
      user-select: none;
      background: rgba(43, 24, 16, 0.01);
      transition: var(--transition);
    }

    th:hover {
      background: rgba(43, 24, 16, 0.03);
      color: var(--espresso);
    }

    th.active-sort {
      color: var(--terracotta);
    }

    td {
      font-size: 0.95rem;
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(43, 24, 16, 0.008);
    }

    .portal-badge {
      border-radius: 8px;
      padding: 0.4rem 0.8rem;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: inline-block;
      text-align: center;
    }

    .badge-signature { background: rgba(214, 141, 69, 0.1); color: var(--amber); border: 1px solid rgba(214, 141, 69, 0.2); }
    .badge-retail { background: var(--seafoam-light); color: var(--seafoam-teal); border: 1px solid rgba(70, 149, 138, 0.2); }

    .price-value {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      color: var(--terracotta);
      font-size: 1.15rem;
    }

    .original-price {
      font-size: 0.85rem;
      color: var(--cocoa-gray);
      text-decoration: line-through;
      margin-right: 0.4rem;
    }

    .discount-badge {
      background: rgba(0, 200, 83, 0.1);
      color: #00c853;
      font-size: 0.75rem;
      font-weight: 700;
      border-radius: 6px;
      padding: 0.2rem 0.5rem;
      margin-left: 0.5rem;
      display: inline-block;
    }

    .table-footnote {
      padding: 1.2rem 1.5rem;
      font-size: 0.82rem;
      color: var(--cocoa-gray);
      border-top: 1px solid var(--card-border);
      background: rgba(43, 24, 16, 0.005);
      font-style: italic;
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

    <div class="metrics-row">
      <div class="metric-card">
        <span class="metric-label">Active monitored Sailings</span>
        <span class="metric-value" id="metric-deals">0</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Greatest Price Drop</span>
        <span class="metric-value" id="metric-max-drop">$0</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Average Cruise Fare</span>
        <span class="metric-value" id="metric-avg-price">$0</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Suppliers Monitored</span>
        <span class="metric-value" id="metric-brands">6</span>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row-top">
        <div class="search-wrapper">
          <input type="text" id="search-bar" class="search-input" placeholder="Search by Ship, Itinerary, or Category..." oninput="filterAndRender()">
        </div>
        
        <div class="filter-tabs">
          <button class="filter-tab active" onclick="setBrandFilter('all')">All Brands</button>
          <button class="filter-tab" onclick="setBrandFilter('disney')">Disney</button>
          <button class="filter-tab" onclick="setBrandFilter('virgin')">Virgin Voyages</button>
          <button class="filter-tab" onclick="setBrandFilter('royal')">Royal Caribbean</button>
          <button class="filter-tab" onclick="setBrandFilter('celebrity')">Celebrity</button>
          <button class="filter-tab" onclick="setBrandFilter('carnival')">Carnival</button>
          <button class="filter-tab" onclick="setBrandFilter('princess')">Princess</button>
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
              <th onclick="toggleSort('sail_date')" id="th-sail_date" class="active-sort">Sail Date</th>
              <th onclick="toggleSort('nights')" id="th-nights">Nights</th>
              <th onclick="toggleSort('ship')" id="th-ship">Ship</th>
              <th onclick="toggleSort('itinerary')" id="th-itinerary">Itinerary</th>
              <th onclick="toggleSort('category')" id="th-category">Cabin Category</th>
              <th onclick="toggleSort('rate_type')" id="th-rate_type">Rate Class</th>
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

      const prices = allSailings.map(s => s.price);
      const maxPrice = prices.length ? Math.max(...prices) : 5000;
      
      const slider = document.getElementById('price-slider');
      slider.max = maxPrice;
      slider.value = maxPrice;
      document.getElementById('price-slider-val').innerText = '$' + maxPrice;

      // Ingest metric cards summary
      document.getElementById('metric-deals').innerText = allSailings.length;
      if (prices.length) {
        const drops = allSailings.map(s => s.price_drop);
        const maxDrop = Math.max(...drops);
        const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        document.getElementById('metric-max-drop').innerText = '$' + maxDrop;
        document.getElementById('metric-avg-price').innerText = '$' + avgPrice;
      }

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
        if (tab.innerText.toLowerCase().includes(brand === 'all' ? 'all' : brand)) {
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
      document.getElementById('th-' + column).classList.add('active-sort');
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
        else brandMatch = s.brand.toLowerCase().includes(currentBrand);

        const regionMatch = regionVal === 'all' || s.region === regionVal;
        const rateTypeMatch = rateTypeVal === 'all' || s.rate_type === rateTypeVal;
        const priceMatch = s.price <= maxPrice;

        const textMatch = (s.ship || '').toLowerCase().includes(query) || 
                          (s.itinerary || '').toLowerCase().includes(query) || 
                          (s.category || '').toLowerCase().includes(query) ||
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

      filtered.forEach(s => {
        const tr = document.createElement('tr');
        const rateClassBadge = s.rate_type === 'signature_group' ? 'badge-signature' : 'badge-retail';
        const rateClassLabel = s.rate_type === 'signature_group' ? 'Signature Group' : 'Retail';
        
        let dropMarkup = '<em>No change</em>';
        if (s.price_drop > 0) {
          dropMarkup = \`<span class="discount-badge">↓ \$\${s.price_drop} (\$\${s.percent_drop}%)</span>\`;
        }

        tr.innerHTML = \`
          <td><strong>\${s.brand}</strong></td>
          <td>\${formatDate(s.sail_date)}</td>
          <td>\${s.nights} Nights</td>
          <td>\${s.ship}</td>
          <td>\${s.itinerary}</td>
          <td>\${s.category}</td>
          <td><span class="portal-badge \${rateClassBadge}">\${rateClassLabel}</span></td>
          <td>
            \${s.price_drop > 0 ? \`<span class="original-price">\$\${s.max_price}</span>\` : ''}
            <span class="price-value">\$\${s.price}</span>
          </td>
          <td>\${dropMarkup}</td>
        \`;
        tbody.appendChild(tr);
      });
    }

    if (window.PAYLOAD_TYPE === 'plaintext') {
      allSailings = JSON.parse(window.atob(window.PAYLOAD_DATA));
      initializeData();
    }
  </script>
</body>
</html>
  `;

  // Save html file to the root of the retail-scout directory
  fs.writeFileSync(path.join(__dirname, 'index.html'), htmlContent, 'utf8');
  console.log(`[Dashboard Compiler] Static dashboard successfully compiled to index.html at root! (Type: ${payloadType})`);
}

if (require.main === module) {
  compileRetailDashboard();
}

module.exports = { compileRetailDashboard };
