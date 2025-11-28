#!/bin/bash

# Story 2.6: Create 10,000 test users for auto-scaling validation
# Distribution: 5,000 passengers + 5,000 drivers

BASE_URL="${BASE_URL:-http://localhost:3001}"
TOTAL_USERS=10000
BATCH_SIZE=100
DELAY_BETWEEN_BATCHES=2

echo "🚀 Creating 10,000 test users (5,000 passengers + 5,000 drivers)..."
echo "   Target: $BASE_URL"
echo "   Pattern: loadtest1@test.com → loadtest10000@test.com"
echo ""

success_count=0
error_count=0

for ((i=1; i<=TOTAL_USERS; i++)); do
  email="loadtest${i}@test.com"
  password="password123"
  
  # Determine if user is a driver (second half)
  is_driver=false
  if [ $i -gt 5000 ]; then
    is_driver=true
  fi
  
  # Determine role and name based on user type
  if [ "$is_driver" = true ]; then
    role="DRIVER"
    first_name="Driver"
    last_name="Test${i}"
  else
    role="PASSENGER"
    first_name="Passenger"
    last_name="Test${i}"
  fi
  
  phone_number="+8490$(printf '%08d' $i)"
  
  # Register user
  register_response=$(curl -s -X POST "$BASE_URL/users/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\",\"role\":\"$role\",\"firstName\":\"$first_name\",\"lastName\":\"$last_name\",\"phoneNumber\":\"$phone_number\"}" \
    -w "\n%{http_code}")
  
  http_code=$(echo "$register_response" | tail -n 1)
  response_body=$(echo "$register_response" | head -n -1)
  
  if [ "$http_code" = "201" ] || [ "$http_code" = "409" ]; then
    # Login to get auth token
    login_response=$(curl -s -X POST "$BASE_URL/users/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$email\",\"password\":\"$password\"}" \
      -w "\n%{http_code}")
    
    login_code=$(echo "$login_response" | tail -n 1)
    login_body=$(echo "$login_response" | head -n -1)
    
    if [ "$login_code" = "200" ]; then
      token=$(echo "$login_body" | grep -o '"accessToken":"[^"]*' | sed 's/"accessToken":"//')
      
      # User registered successfully
      ((success_count++))
      if [ "$is_driver" = true ]; then
        echo "✅ [$i/$TOTAL_USERS] Driver: $email"
      else
        echo "✅ [$i/$TOTAL_USERS] Passenger: $email"
      fi
    else
      ((error_count++))
      echo "❌ [$i/$TOTAL_USERS] Login failed: $email (HTTP $login_code)"
    fi
  else
    ((error_count++))
    echo "❌ [$i/$TOTAL_USERS] Register failed: $email (HTTP $http_code)"
  fi
  
  # Progress indicators
  if [ $((i % BATCH_SIZE)) -eq 0 ]; then
    echo ""
    echo "📊 Progress: $i/$TOTAL_USERS users (Success: $success_count, Errors: $error_count)"
    echo "   $(date '+%H:%M:%S') - Pausing ${DELAY_BETWEEN_BATCHES}s between batches..."
    echo ""
    sleep $DELAY_BETWEEN_BATCHES
  fi
done

echo ""
echo "🎉 Test user creation complete!"
echo "   Total: $TOTAL_USERS users"
echo "   Success: $success_count"
echo "   Errors: $error_count"
echo "   Passengers: 5,000 (loadtest1 - loadtest5000)"
echo "   Drivers: 5,000 (loadtest5001 - loadtest10000)"
echo ""
echo "📋 Next Steps:"
echo "   1. Start auto-scaler: python3 scripts/auto-scaler.py"
echo "   2. Run load test: k6 run tests/load/story-2.6-auto-scaling-test.js"
echo "   3. Monitor scaling: docker stats"
