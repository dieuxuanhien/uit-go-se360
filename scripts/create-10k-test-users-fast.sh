#!/bin/bash

# Story 2.6: FAST 10,000 test user creation using parallel requests
# Expected time: ~5-10 minutes (vs 1+ hour for sequential)

BASE_URL="${BASE_URL:-http://localhost:3001}"
TOTAL_USERS="${TOTAL_USERS:-10000}"
PARALLEL_JOBS="${PARALLEL_JOBS:-50}"  # 50 concurrent requests
BATCH_SIZE=500  # Report progress every 500 users

echo "🚀 FAST Test User Creation (Parallel)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Target: $BASE_URL"
echo "   Total Users: $TOTAL_USERS"
echo "   Parallel Jobs: $PARALLEL_JOBS"
echo "   Pattern: loadtest1@test.com → loadtest${TOTAL_USERS}@test.com"
echo ""

# Check if services are running
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
  echo "❌ Service not available at $BASE_URL"
  echo "   Please start services first."
  exit 1
fi

echo "✅ Service is healthy"
echo ""

# Create temp directory for results
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Function to create a single user
create_user() {
  local i=$1
  local email="loadtest${i}@test.com"
  local password="password123"
  local role="PASSENGER"
  local first_name="Passenger"
  
  # Drivers are second half (5001-10000)
  if [ $i -gt 5000 ]; then
    role="DRIVER"
    first_name="Driver"
  fi
  
  local phone_number="+8490$(printf '%08d' $i)"
  
  # Register user (silent, only care about success/fail)
  local http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/users/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\",\"role\":\"$role\",\"firstName\":\"$first_name\",\"lastName\":\"Test${i}\",\"phoneNumber\":\"$phone_number\"}" \
    --connect-timeout 5 --max-time 10)
  
  if [ "$http_code" = "201" ] || [ "$http_code" = "409" ]; then
    echo "1" > "$TEMP_DIR/success_$i"
  else
    echo "$i:$http_code" >> "$TEMP_DIR/errors.log"
  fi
}

export -f create_user
export BASE_URL TEMP_DIR

START_TIME=$(date +%s)

echo "📦 Creating users in parallel (this may take 5-10 minutes)..."
echo ""

# Use GNU parallel if available, otherwise use xargs
if command -v parallel &> /dev/null; then
  echo "   Using GNU parallel with $PARALLEL_JOBS jobs"
  seq 1 $TOTAL_USERS | parallel -j $PARALLEL_JOBS --bar create_user {}
else
  echo "   Using xargs with $PARALLEL_JOBS parallel jobs"
  echo "   (Install GNU parallel for progress bar: apt-get install parallel)"
  echo ""
  
  # Progress monitoring in background
  (
    while true; do
      sleep 5
      count=$(ls -1 "$TEMP_DIR"/success_* 2>/dev/null | wc -l)
      if [ $count -gt 0 ]; then
        elapsed=$(($(date +%s) - START_TIME))
        rate=$((count * 60 / (elapsed + 1)))
        remaining=$(( (TOTAL_USERS - count) * (elapsed + 1) / (count + 1) ))
        printf "\r   Progress: %d/%d users (%.1f%%) | Rate: %d/min | ETA: %ds    " \
          $count $TOTAL_USERS $((count * 100 / TOTAL_USERS)) $rate $remaining
      fi
    done
  ) &
  MONITOR_PID=$!
  
  # Run parallel user creation
  seq 1 $TOTAL_USERS | xargs -P $PARALLEL_JOBS -I {} bash -c 'create_user "$@"' _ {}
  
  # Stop monitor
  kill $MONITOR_PID 2>/dev/null
  echo ""
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Count results
SUCCESS_COUNT=$(ls -1 "$TEMP_DIR"/success_* 2>/dev/null | wc -l)
ERROR_COUNT=0
if [ -f "$TEMP_DIR/errors.log" ]; then
  ERROR_COUNT=$(wc -l < "$TEMP_DIR/errors.log")
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 User creation complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Duration: ${DURATION}s ($(($DURATION / 60))m $(($DURATION % 60))s)"
echo "   Success: $SUCCESS_COUNT"
echo "   Errors: $ERROR_COUNT"
echo "   Rate: $(($SUCCESS_COUNT * 60 / ($DURATION + 1))) users/min"
echo ""

# Verify in database
echo "📊 Verifying in database..."
docker exec uitgo-postgres-user psql -U postgres -d uitgo_user -c \
  "SELECT COUNT(*) as total, 
          SUM(CASE WHEN role='PASSENGER' THEN 1 ELSE 0 END) as passengers,
          SUM(CASE WHEN role='DRIVER' THEN 1 ELSE 0 END) as drivers 
   FROM users WHERE email LIKE 'loadtest%@test.com';"

if [ $ERROR_COUNT -gt 0 ]; then
  echo ""
  echo "⚠️  Errors occurred. First 10 errors:"
  head -10 "$TEMP_DIR/errors.log"
fi

echo ""
echo "📋 Next Steps:"
echo "   1. Start auto-scaler: python3 scripts/auto-scaler.py"
echo "   2. Run load test: k6 run tests/load/module-a-capacity-test.js"
