#!/bin/bash

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Create 30 Test Users for Load Testing
# Purpose: Generate diverse test users to avoid DB cache pollution
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

USER_SERVICE_URL="http://localhost:3001"
OUTPUT_FILE="tests/load/test-users.json"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Creating 30 Test Users for Load Testing"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create output directory if it doesn't exist
mkdir -p tests/load

# Start JSON array
echo "[" > "$OUTPUT_FILE"

CREATED_COUNT=0
SKIPPED_COUNT=0

# Generate 30 users
for i in $(seq 1 30); do
  EMAIL="loadtest${i}@test.com"
  PASSWORD="Test123!"
  FIRST_NAME="Passenger"
  LAST_NAME="User${i}"
  PHONE="+8490000$(printf '%04d' $i)"
  
  echo -n "Creating user ${i}/30: ${EMAIL}... "
  
  # Register user
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${USER_SERVICE_URL}/users/register" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"${EMAIL}\",
      \"password\": \"${PASSWORD}\",
      \"role\": \"PASSENGER\",
      \"firstName\": \"${FIRST_NAME}\",
      \"lastName\": \"${LAST_NAME}\",
      \"phoneNumber\": \"${PHONE}\"
    }")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  if [ "$HTTP_CODE" = "201" ]; then
    USER_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "✅ Created (ID: ${USER_ID:0:8}...)"
    
    # Add to JSON (with comma separator except for first entry)
    if [ $CREATED_COUNT -gt 0 ]; then
      echo "," >> "$OUTPUT_FILE"
    fi
    
    echo "  {" >> "$OUTPUT_FILE"
    echo "    \"email\": \"${EMAIL}\"," >> "$OUTPUT_FILE"
    echo "    \"password\": \"${PASSWORD}\"," >> "$OUTPUT_FILE"
    echo "    \"userId\": \"${USER_ID}\"" >> "$OUTPUT_FILE"
    echo -n "  }" >> "$OUTPUT_FILE"
    
    CREATED_COUNT=$((CREATED_COUNT + 1))
  elif [ "$HTTP_CODE" = "409" ] || [ "$HTTP_CODE" = "400" ]; then
    echo "⚠️  Already exists (skipping)"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    
    # For existing users, try to login to get user ID
    LOGIN_RESPONSE=$(curl -s -X POST "${USER_SERVICE_URL}/users/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\": \"${EMAIL}\", \"password\": \"${PASSWORD}\"}")
    
    USER_ID=$(echo "$LOGIN_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -n "$USER_ID" ]; then
      # Add to JSON
      if [ $((CREATED_COUNT + SKIPPED_COUNT)) -gt 1 ]; then
        echo "," >> "$OUTPUT_FILE"
      fi
      
      echo "  {" >> "$OUTPUT_FILE"
      echo "    \"email\": \"${EMAIL}\"," >> "$OUTPUT_FILE"
      echo "    \"password\": \"${PASSWORD}\"," >> "$OUTPUT_FILE"
      echo "    \"userId\": \"${USER_ID}\"" >> "$OUTPUT_FILE"
      echo -n "  }" >> "$OUTPUT_FILE"
    fi
  else
    echo "❌ Failed (HTTP ${HTTP_CODE})"
    echo "   Response: ${BODY}"
  fi
  
  # Rate limit: 100ms between requests
  sleep 0.1
done

# Close JSON array
echo "" >> "$OUTPUT_FILE"
echo "]" >> "$OUTPUT_FILE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Test User Creation Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Summary:"
echo "   Created: ${CREATED_COUNT} users"
echo "   Skipped: ${SKIPPED_COUNT} users (already existed)"
echo "   Total:   $((CREATED_COUNT + SKIPPED_COUNT)) users"
echo ""
echo "📁 Output: ${OUTPUT_FILE}"
echo ""
echo "🔍 Next Step:"
echo "   Run k6 test: cat tests/load/story-2.1-async-smoke-test.js | \\"
echo "                docker run --rm -i --network uit-go-se360_uitgo-network grafana/k6 run -"
echo ""
