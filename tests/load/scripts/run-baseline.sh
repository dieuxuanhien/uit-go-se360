#!/bin/bash
# tests/load/scripts/run-baseline.sh
# Execute baseline performance test
# Usage: ./run-baseline.sh [BASE_URL]

set -e

BASE_URL=${1:-"http://localhost:3000"}
SCENARIO="baseline"
OUTPUT_DIR="./results/baseline-$(date +%Y%m%d-%H%M%S)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  UIT-GO-SE360 Baseline Performance Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  BASE_URL: $BASE_URL"
echo "  SCENARIO: $SCENARIO"
echo "  OUTPUT:   $OUTPUT_DIR"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo "❌ Error: k6 is not installed"
    echo ""
    echo "Install k6:"
    echo "  macOS:   brew install k6"
    echo "  Ubuntu:  sudo apt-get install k6"
    echo "  Windows: choco install k6"
    echo ""
    echo "Or download from: https://k6.io/docs/getting-started/installation/"
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
echo "🚀 Starting baseline load test..."
echo ""
echo "Test will run for ~30 minutes:"
echo "  - 2min: Ramp to 100 VUs"
echo "  - 5min: Sustain 100 VUs"
echo "  - 2min: Ramp to 500 VUs"
echo "  - 5min: Sustain 500 VUs"
echo "  - 2min: Ramp to 1000 VUs"
echo "  - 5min: Sustain 1000 VUs (expect degradation)"
echo "  - 2min: Ramp to 2000 VUs"
echo "  - 3min: Hold at 2000 VUs (breaking point)"
echo "  - 2min: Ramp down to 0"
echo ""
echo "Press Ctrl+C to abort..."
sleep 3

# Run k6 test
BASE_URL="$BASE_URL" \
SCENARIO="$SCENARIO" \
k6 run \
  --out json="$OUTPUT_DIR/results.json" \
  --summary-export="$OUTPUT_DIR/summary.json" \
  main.test.js

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Test Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Results saved to: $OUTPUT_DIR"
echo ""
echo "Next steps:"
echo "  1. Analyze results: cat $OUTPUT_DIR/summary.json | jq"
echo "  2. Generate report: node scripts/analyze-results.js $OUTPUT_DIR"
echo "  3. Document findings in: docs/testing/baseline-results.md"
echo ""
