const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'retail_scout.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT * FROM sailings", (err, rows) => {
  if (err) {
    console.error(err);
    db.close();
    return;
  }

  console.log(`Total sailings in database: ${rows.length}`);
  
  const signatureCount = rows.filter(r => r.itinerary.toLowerCase().includes('signature')).length;
  const tpiCount = rows.filter(r => r.itinerary.toLowerCase().includes('tpi')).length;
  const hostedCount = rows.filter(r => r.itinerary.toLowerCase().includes('hosted')).length;
  
  console.log(`Signature mentions: ${signatureCount}`);
  console.log(`TPI mentions: ${tpiCount}`);
  console.log(`Hosted mentions: ${hostedCount}`);
  
  console.log('\nSample itineraries containing different terms:');
  const samples = rows.filter(r => !r.itinerary.toLowerCase().includes('signature')).slice(0, 10);
  for (const s of samples) {
    console.log(`- Ship: ${s.ship} | Itinerary: ${s.itinerary}`);
  }

  db.close();
});
