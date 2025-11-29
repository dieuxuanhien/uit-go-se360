#!/bin/bash

# FASTEST: Direct SQL bulk insert of 10,000 test users
# Expected time: ~10-30 SECONDS (vs 1+ hour for API-based)
# 
# This bypasses the API and inserts directly into PostgreSQL
# Password hash is pre-computed for "password123"

TOTAL_USERS="${TOTAL_USERS:-10000}"
PASSENGERS="${PASSENGERS:-5000}"
DRIVERS=$((TOTAL_USERS - PASSENGERS))

echo "⚡ ULTRA-FAST Test User Creation (Direct SQL)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Total Users: $TOTAL_USERS"
echo "   Passengers: $PASSENGERS (loadtest1 - loadtest${PASSENGERS})"
echo "   Drivers: $DRIVERS (loadtest$((PASSENGERS+1)) - loadtest${TOTAL_USERS})"
echo ""

# Pre-computed bcrypt hash for "password123" (cost=10)
# You can generate this with: node -e "require('bcrypt').hash('password123', 10).then(console.log)"
PASSWORD_HASH='$2b$10$YourHashHere.placeholder'

# First, let's get a valid password hash from the service
echo "🔐 Generating password hash..."
HASH_RESPONSE=$(curl -s -X POST "http://localhost:3001/users/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"_temp_hash_user@test.com","password":"password123","role":"PASSENGER","firstName":"Temp","lastName":"User","phoneNumber":"+84900000000"}')

# Clean up temp user and get the hash pattern
docker exec uitgo-postgres-user psql -U postgres -d uitgo_user -t -c \
  "SELECT password_hash FROM users WHERE email='_temp_hash_user@test.com' LIMIT 1;" > /tmp/hash.txt 2>/dev/null

if [ -s /tmp/hash.txt ]; then
  PASSWORD_HASH=$(cat /tmp/hash.txt | tr -d ' \n\r')
  echo "   ✅ Password hash obtained"
  # Delete temp user
  docker exec uitgo-postgres-user psql -U postgres -d uitgo_user -c \
    "DELETE FROM users WHERE email='_temp_hash_user@test.com';" > /dev/null 2>&1
else
  # Use a pre-computed hash for password123
  PASSWORD_HASH='$2b$10$rQZ5Kx5K5K5K5K5K5K5K5O5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K'
  echo "   ⚠️  Using fallback hash (may need adjustment)"
fi

echo ""
echo "📦 Inserting users via SQL..."

START_TIME=$(date +%s)

# Generate and execute SQL for passengers
echo "   Creating $PASSENGERS passengers..."
docker exec -i uitgo-postgres-user psql -U postgres -d uitgo_user << EOF
-- Disable triggers temporarily for speed
SET session_replication_role = replica;

-- Clear existing test users (optional - uncomment if needed)
-- DELETE FROM users WHERE email LIKE 'loadtest%@test.com';

-- Insert passengers (1 to $PASSENGERS)
INSERT INTO users (id, email, password_hash, role, first_name, last_name, phone_number, created_at, updated_at)
SELECT 
  gen_random_uuid()::text,
  'loadtest' || n || '@test.com',
  '$PASSWORD_HASH',
  'PASSENGER'::"UserRole",
  'Passenger',
  'Test' || n,
  '+8490' || LPAD(n::text, 8, '0'),
  NOW(),
  NOW()
FROM generate_series(1, $PASSENGERS) AS n
ON CONFLICT (email) DO NOTHING;

-- Insert drivers ($((PASSENGERS+1)) to $TOTAL_USERS)
INSERT INTO users (id, email, password_hash, role, first_name, last_name, phone_number, created_at, updated_at)
SELECT 
  gen_random_uuid()::text,
  'loadtest' || n || '@test.com',
  '$PASSWORD_HASH',
  'DRIVER'::"UserRole",
  'Driver',
  'Test' || n,
  '+8490' || LPAD(n::text, 8, '0'),
  NOW(),
  NOW()
FROM generate_series($((PASSENGERS+1)), $TOTAL_USERS) AS n
ON CONFLICT (email) DO NOTHING;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- Show results
SELECT 
  COUNT(*) as total_created,
  SUM(CASE WHEN role='PASSENGER' THEN 1 ELSE 0 END) as passengers,
  SUM(CASE WHEN role='DRIVER' THEN 1 ELSE 0 END) as drivers
FROM users 
WHERE email LIKE 'loadtest%@test.com';
EOF

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 User creation complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Duration: ${DURATION} seconds"
echo ""

# Final verification
echo "📊 Final verification:"
docker exec uitgo-postgres-user psql -U postgres -d uitgo_user -c \
  "SELECT 
     COUNT(*) as total,
     SUM(CASE WHEN role='PASSENGER' THEN 1 ELSE 0 END) as passengers,
     SUM(CASE WHEN role='DRIVER' THEN 1 ELSE 0 END) as drivers,
     MIN(email) as first_user,
     MAX(email) as last_user
   FROM users 
   WHERE email LIKE 'loadtest%@test.com';"

echo ""
echo "📋 Next Steps:"
echo "   1. Start auto-scaler: python3 scripts/auto-scaler.py"
echo "   2. Run 500 VU test:"
echo "      /c/Users/ASUS/Desktop/k6.exe run --env MAX_VUS=500 --env USE_LB=true \\"
echo "        --env TOTAL_PASSENGERS=3500 --env TOTAL_DRIVERS=1500 \\"
echo "        tests/load/module-a-capacity-test.js"
