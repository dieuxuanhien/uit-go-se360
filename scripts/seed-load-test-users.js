#!/usr/bin/env node
/**
 * Story 2.2: Seed Script for Load Test Users
 * Creates 100 driver users for read scaling performance tests
 * 
 * Usage: node scripts/seed-load-test-users.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function createPassenger(index) {
  const userData = {
    email: `loadtest${index}@test.com`,
    password: 'password123',
    role: 'PASSENGER',
    firstName: 'Passenger',
    lastName: `Test${index}`,
    phoneNumber: `+8491234${String(5000 + index).padStart(4, '0')}`,
  };

  try {
    const registerRes = await fetch(`${BASE_URL}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    if (registerRes.status === 409) {
      console.log(`⊘ Passenger ${index}/50 already exists: ${userData.email}`);
      return;
    }

    if (registerRes.status !== 201) {
      const body = await registerRes.text();
      console.error(`✗ Failed passenger ${index} registration: ${registerRes.status} - ${body}`);
      return;
    }

    console.log(`✓ Created passenger ${index}/50: ${userData.email}`);
  } catch (error) {
    console.error(`✗ Failed to create passenger ${index}: ${error.message}`);
  }
}

async function createDriver(index) {
  const userData = {
    email: `loadtest${index}@test.com`,
    password: 'password123',
    role: 'DRIVER',
    firstName: 'Driver',
    lastName: `Test${index}`,
    phoneNumber: `+8491234${String(5000 + index).padStart(4, '0')}`,
  };

  try {
    let token, userId;
    
    // Step 1: Register or login driver user
    const registerRes = await fetch(`${BASE_URL}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    if (registerRes.status === 409) {
      // User exists, login to get token
      const loginRes = await fetch(`${BASE_URL}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userData.email, password: userData.password }),
      });
      
      if (loginRes.status !== 200) {
        console.error(`✗ Failed driver ${index} login: ${loginRes.status}`);
        return;
      }
      
      const loginData = await loginRes.json();
      token = loginData.accessToken;
      userId = loginData.user?.id;
      
      if (!token || !userId) {
        console.error(`✗ Driver ${index}: Missing token/userId from login`);
        return;
      }
    } else if (registerRes.status === 201) {
      const registerData = await registerRes.json();
      userId = registerData.user?.id;
      token = registerData.accessToken;

      if (!userId || !token) {
        console.error(`✗ Driver ${index}: Missing userId or token in response`);
        return;
      }
    } else {
      const body = await registerRes.text();
      console.error(`✗ Failed driver ${index} registration: ${registerRes.status} - ${body}`);
      return;
    }

    // Step 2: Create driver profile
    const vehicleTypes = ['Toyota', 'Honda', 'Ford'];
    const vehicleModels = ['Camry', 'Civic', 'Focus'];
    const vehicleColors = ['Silver', 'Black', 'White', 'Blue', 'Red'];
    
    const profileData = {
      vehicleMake: vehicleTypes[index % 3],
      vehicleModel: vehicleModels[index % 3],
      vehicleYear: 2020 + (index % 5), // 2020-2024
      vehicleColor: vehicleColors[index % 5],
      vehiclePlate: `TEST-${String(index).padStart(3, '0')}`,
      licenseNumber: `DL${String(100000 + index)}`,
    };

    const profileRes = await fetch(`${BASE_URL}/users/driver-profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(profileData),
    });

    if (profileRes.status === 201) {
      console.log(`✓ Created driver ${index}/50: ${userData.email} (${profileData.vehicleMake} ${profileData.vehicleModel}, ${profileData.vehiclePlate})`);
    } else if (profileRes.status === 409) {
      console.log(`⊘ Driver ${index}/50 profile already exists: ${userData.email}`);
    } else {
      const body = await profileRes.text();
      console.error(`✗ Failed driver ${index} profile: ${profileRes.status} - ${body}`);
    }
  } catch (error) {
    console.error(`✗ Failed to create driver ${index}: ${error.message}`);
  }
}

async function seedUsers() {
  console.log('🌱 Story 2.2: Seeding 100 load test users...\n');
  console.log(`Target API: ${BASE_URL}`);
  console.log(`User pattern: loadtest1@test.com → loadtest100@test.com`);
  console.log(`Password: password123 (all users)`);
  console.log(`Roles: 100 DRIVERS (all users with profiles)\n`);

  const startTime = Date.now();

  // Create 100 drivers (loadtest1-100) in batches of 10
  console.log('Creating 100 drivers with profiles...');
  for (let batch = 0; batch < 10; batch++) {
    const batchPromises = [];
    
    for (let i = 0; i < 10; i++) {
      const userIndex = batch * 10 + i + 1;
      batchPromises.push(createDriver(userIndex));
    }

    await Promise.all(batchPromises);
    
    if (batch < 9) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Seed complete in ${duration}s`);
  console.log(`\n📊 Ready for load testing with:`);
  console.log(`   k6 run tests/load/story-2.2-driver-profile-read-scaling.js`);
}

// Run the seed script
seedUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
