#!/bin/bash
# tests/load/scripts/run-smoke.sh
# Execute quick smoke test (5 minutes)
# Usage: ./run-smoke.sh [BASE_URL]

set -e

BASE_URL=${1:-"http://localhost:3000"}
SCENARIO="smoke"
OUTPUT_DIR="./results/smoke-$(date +%Y%m%d-%H%M%S)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  UIT-GO-SE360 Smoke Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  BASE_URL: $BASE_URL"
echo "  SCENARIO: $SCENARIO (10 VUs for 5 minutes)"
echo "  OUTPUT:   $OUTPUT_DIR"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo "❌ Error: k6 is not installed"
    exit 1
fi

# Check if test data exists
if [ ! -f "./data/passengers.json" ]; then
    echo "⚠️  Test data not found. Generating now..."
    cd data
    node generate-test-data.js
    cd ..
fi

echo ""
echo "🚀 Starting smoke test (5 minutes)..."
echo ""

# Run k6 test
BASE_URL="$BASE_URL" \
SCENARIO="$SCENARIO" \
k6 run \
  --out json="$OUTPUT_DIR/results.json" \
  --summary-export="$OUTPUT_DIR/summary.json" \
  main.test.js

echo ""
echo "✅ Smoke test complete! Results: $OUTPUT_DIR"
echo ""
