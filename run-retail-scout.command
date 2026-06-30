#!/bin/bash
cd "$(dirname "$0")"
echo "=================================================="
echo "🐻 Starting Wandering Bear Retail Cruise Sync..."
echo "=================================================="
node index.js
echo "=================================================="
echo "✅ Retail sync completed! Press any key to exit."
read -n 1
