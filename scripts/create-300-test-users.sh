#!/bin/bash
# Create 300 test users for Story 2.6 Auto-Scaling test
# 150 passengers + 150 drivers for realistic traffic distribution

set -e

BASE_URL="${BASE_URL:-http://localhost:3001}"
TOTAL_USERS=300
BATCH_SIZE=50

echo "=============================================="
echo "Story 2.6: Creating 300 Test Users"
echo "=============================================="
echo "Target: $BASE_URL"
echo "Users: 150 passengers + 150 drivers"
echo ""

created=0
failed=0

# Function to create a single user
create_user() {
  local email=$1
  local role=$2
  local index=$3
  
  response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/users/register" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"$email\",
      \"password\": \"password123\",
      \"firstName\": \"LoadTest\",
      \"lastName\": \"User$index\",
      \"phoneNumber\": \"+8490${index}0000\",
      \"role\": \"$role\"
    }" \
    --max-time 10)
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" = "201" ]; then
    ((created++))
    return 0
  elif echo "$body" | grep -q "already exists"; then
    ((created++))
    return 0
  else
    ((failed++))
    echo "  ❌ Failed $email: HTTP $http_code"
    return 1
  fi
}

# Create passengers (loadtest1-150)
echo "📝 Creating 150 passengers..."
for i in $(seq 1 150); do
  email="loadtest${i}@test.com"
  create_user "$email" "PASSENGER" "$i"
  
  if [ $((i % BATCH_SIZE)) -eq 0 ]; then
    echo "  ✅ Created $i/150 passengers"
  fi
done

# Create drivers (loadtest151-300)
echo ""
echo "🚗 Creating 150 drivers..."
for i in $(seq 151 300); do
  email="loadtest${i}@test.com"
  create_user "$email" "DRIVER" "$i"
  
  if [ $(((i - 150) % BATCH_SIZE)) -eq 0 ]; then
    echo "  ✅ Created $((i - 150))/150 drivers"
  fi
done

echo ""
echo "=============================================="
echo "✅ User Creation Complete"
echo "=============================================="
echo "Total Created: $created/$TOTAL_USERS"
echo "Failed: $failed"
echo ""

# Create driver profiles for driver users
if [ $created -gt 150 ]; then
  echo "🚗 Creating driver profiles..."
  profile_created=0
  
  for i in $(seq 151 300); do
    email="loadtest${i}@test.com"
    
    # Login to get token
    login_response=$(curl -s -X POST "$BASE_URL/users/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\": \"$email\", \"password\": \"password123\"}" \
      --max-time 10)
    
    token=$(echo "$login_response" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    
    if [ -z "$token" ]; then
      continue
    fi
    
    # Create driver profile
    profile_response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/users/driver-profile" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      -d "{
        \"vehiclePlate\": \"TEST-${i}\",
        \"vehicleMake\": \"Toyota\",
        \"vehicleModel\": \"Camry\",
        \"vehicleYear\": 2020,
        \"vehicleColor\": \"Silver\",
        \"vehicleType\": \"CAR\",
        \"licenseNumber\": \"DL${i}000\"
      }" \
      --max-time 10)
    
    http_code=$(echo "$profile_response" | tail -n1)
    
    if [ "$http_code" = "201" ] || [ "$http_code" = "409" ]; then
      ((profile_created++))
      
      if [ $((profile_created % BATCH_SIZE)) -eq 0 ]; then
        echo "  ✅ Created $profile_created/150 driver profiles"
      fi
    fi
  done
  
  echo ""
  echo "✅ Driver profiles created: $profile_created/150"
fi

echo ""
echo "=============================================="
echo "🎯 Story 2.6 Test Users Ready"
echo "=============================================="
echo "You can now run:"
echo "  python3 scripts/auto-scaler.py &"
echo "  k6 run tests/load/story-2.6-auto-scaling-test.js"
echo ""
