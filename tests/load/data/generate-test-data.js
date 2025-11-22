#!/usr/bin/env node
// tests/load/data/generate-test-data.js
// Generate realistic test data for load testing
// Usage: node generate-test-data.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function randomName() {
  const firstNames = [
    'Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Huynh', 'Vo', 'Dang', 'Bui', 'Do',
    'Ngo', 'Duong', 'Ly', 'Mai', 'Phan', 'Truong', 'Trinh', 'Dinh', 'Dao', 'Tong'
  ];
  
  const lastNames = [
    'Van Anh', 'Minh', 'Hoa', 'Thanh', 'Duc', 'Linh', 'Hai', 'Tuan', 'Phuong', 'Huong',
    'Khoa', 'Dung', 'Lan', 'Mai', 'Thao', 'Ngoc', 'Quang', 'Binh', 'Hieu', 'Trung'
  ];
  
  return {
    firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
    lastName: lastNames[Math.floor(Math.random() * lastNames.length)]
  };
}

function generateUUID() {
  return crypto.randomUUID();
}

function generateToken(prefix, id) {
  // Simple JWT-like token for testing (not cryptographically secure)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ 
    id: id, 
    role: prefix,
    exp: Math.floor(Date.now() / 1000) + (86400 * 365) // 1 year
  })).toString('base64');
  const signature = crypto.createHash('sha256').update(`${header}.${payload}`).digest('base64').slice(0, 43);
  return `${header}.${payload}.${signature}`;
}

function generatePhoneNumber() {
  // Vietnamese phone number format: +84 followed by 9 digits
  const prefixes = ['90', '91', '92', '93', '94', '96', '97', '98', '99'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const number = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
  return `+84${prefix}${number}`;
}

function generateVehiclePlate() {
  // HCMC format: 51A-12345 or 51B-12345
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const letter = letters[Math.floor(Math.random() * letters.length)];
  const number = Math.floor(Math.random() * 90000) + 10000; // 5 digit number
  return `51${letter}-${number}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Generate Passengers (1000 accounts)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generatePassengers(count = 1000) {
  console.log(`🚗 Generating ${count} passenger accounts...`);
  
  const passengers = [];

  for (let i = 0; i < count; i++) {
    const id = generateUUID();
    const name = randomName();
    
    passengers.push({
      id: id,
      email: `passenger${i}@loadtest.com`,
      password: 'LoadTest123!',
      token: generateToken('passenger', id),
      firstName: name.firstName,
      lastName: name.lastName,
      phoneNumber: generatePhoneNumber(),
      role: 'passenger'
    });
  }

  const outputPath = path.join(__dirname, 'passengers.json');
  fs.writeFileSync(outputPath, JSON.stringify(passengers, null, 2));
  console.log(`   ✅ Generated ${count} passengers → ${outputPath}`);
  
  return passengers;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Generate Drivers (200 accounts)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateDrivers(count = 200) {
  console.log(`🚕 Generating ${count} driver accounts...`);
  
  const drivers = [];
  
  const vehicleMakes = ['Toyota', 'Honda', 'Mazda', 'Hyundai', 'Kia', 'Ford', 'Vinfast'];
  const toyotaModels = ['Vios', 'Corolla', 'Camry', 'Innova'];
  const hondaModels = ['City', 'Civic', 'Accord', 'CR-V'];
  const mazdaModels = ['Mazda2', 'Mazda3', 'Mazda6', 'CX-5'];

  for (let i = 0; i < count; i++) {
    const id = generateUUID();
    const name = randomName();
    const make = vehicleMakes[Math.floor(Math.random() * vehicleMakes.length)];
    
    let model;
    if (make === 'Toyota') {
      model = toyotaModels[Math.floor(Math.random() * toyotaModels.length)];
    } else if (make === 'Honda') {
      model = hondaModels[Math.floor(Math.random() * hondaModels.length)];
    } else if (make === 'Mazda') {
      model = mazdaModels[Math.floor(Math.random() * mazdaModels.length)];
    } else {
      model = 'Sedan';
    }

    drivers.push({
      id: id,
      email: `driver${i}@loadtest.com`,
      password: 'LoadTest123!',
      token: generateToken('driver', id),
      firstName: name.firstName,
      lastName: name.lastName,
      phoneNumber: generatePhoneNumber(),
      vehicleMake: make,
      vehicleModel: model,
      vehiclePlate: generateVehiclePlate(),
      role: 'driver'
    });
  }

  const outputPath = path.join(__dirname, 'drivers.json');
  fs.writeFileSync(outputPath, JSON.stringify(drivers, null, 2));
  console.log(`   ✅ Generated ${count} drivers → ${outputPath}`);
  
  return drivers;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Generate HCMC Locations (400 realistic locations)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateLocations() {
  console.log(`📍 Generating realistic HCMC locations...`);
  
  // Real HCMC district coordinates
  const hcmcDistricts = [
    { name: 'District 1', lat: 10.762622, lng: 106.660172, points: 50 },
    { name: 'District 3', lat: 10.786360, lng: 106.687140, points: 40 },
    { name: 'Binh Thanh', lat: 10.807800, lng: 106.698639, points: 40 },
    { name: 'Phu Nhuan', lat: 10.798500, lng: 106.681944, points: 30 },
    { name: 'Tan Binh', lat: 10.823099, lng: 106.629662, points: 40 },
    { name: 'Go Vap', lat: 10.838200, lng: 106.666800, points: 30 },
    { name: 'District 7', lat: 10.728820, lng: 106.721800, points: 40 },
    { name: 'Thu Duc', lat: 10.850000, lng: 106.770000, points: 40 },
    { name: 'Tan Phu', lat: 10.794000, lng: 106.625000, points: 30 },
    { name: 'District 10', lat: 10.772700, lng: 106.670000, points: 30 },
    { name: 'District 5', lat: 10.755600, lng: 106.666900, points: 30 },
  ];

  const streetTypes = ['Street', 'Road', 'Avenue', 'Boulevard', 'Lane'];
  const locations = [];

  hcmcDistricts.forEach(district => {
    for (let i = 0; i < district.points; i++) {
      // Random offset within ~5km radius
      const latOffset = (Math.random() - 0.5) * 0.05;
      const lngOffset = (Math.random() - 0.5) * 0.05;
      
      const streetNumber = Math.floor(Math.random() * 500) + 1;
      const streetName = `${Math.floor(Math.random() * 100) + 1}`;
      const streetType = streetTypes[Math.floor(Math.random() * streetTypes.length)];

      locations.push({
        lat: district.lat + latOffset,
        lng: district.lng + lngOffset,
        address: `${streetNumber} ${streetName} ${streetType}, ${district.name}, HCMC`
      });
    }
  });

  const outputPath = path.join(__dirname, 'hcmc_locations.json');
  fs.writeFileSync(outputPath, JSON.stringify(locations, null, 2));
  console.log(`   ✅ Generated ${locations.length} locations → ${outputPath}`);
  
  return locations;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Execution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  UIT-GO-SE360 Load Test Data Generator                ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');

  const passengers = generatePassengers(1000);
  console.log('');
  
  const drivers = generateDrivers(200);
  console.log('');
  
  const locations = generateLocations();
  console.log('');

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Summary                                               ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  Passengers: ${passengers.length.toString().padEnd(43)}║`);
  console.log(`║  Drivers:    ${drivers.length.toString().padEnd(43)}║`);
  console.log(`║  Locations:  ${locations.length.toString().padEnd(43)}║`);
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  ✅ Test data generation complete!                     ║');
  console.log('║                                                        ║');
  console.log('║  Next Steps:                                           ║');
  console.log('║  1. Review generated JSON files in ./data/            ║');
  console.log('║  2. Run: k6 run ../main.test.js                       ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  generatePassengers,
  generateDrivers,
  generateLocations
};
