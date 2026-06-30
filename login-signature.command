#!/bin/bash
cd "$(dirname "$0")"
echo "=================================================="
echo "🔑 Starting Signature Travel Network Authentication..."
echo "=================================================="
node -e "require('./scrapers/signature').loginSignature()"
echo "=================================================="
echo "✅ Authentication closed. Press any key to exit."
read -n 1
