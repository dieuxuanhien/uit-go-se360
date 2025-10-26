# **SECTION 9: DATABASE SCHEMA**

Transforming the conceptual data models into concrete PostgreSQL schemas with indexes, constraints, and relationships.

## **9.1 UserService Database Schema (PostgreSQL)**

```sql
-- ============================================
-- UserService Database Schema
-- PostgreSQL 15.x
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Users Table
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('PASSENGER', 'DRIVER')),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Driver Profiles Table
-- ============================================
CREATE TABLE driver_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_make VARCHAR(50) NOT NULL,
    vehicle_model VARCHAR(50) NOT NULL,
    vehicle_year INTEGER NOT NULL CHECK (vehicle_year >= 2000 AND vehicle_year <= 2026),
    vehicle_plate VARCHAR(20) UNIQUE NOT NULL,
    vehicle_color VARCHAR(30) NOT NULL,
    license_number VARCHAR(50) UNIQUE NOT NULL,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_driver_profiles_user_id ON driver_profiles(user_id);
CREATE INDEX idx_driver_profiles_approval_status ON driver_profiles(approval_status);
CREATE INDEX idx_driver_profiles_vehicle_plate ON driver_profiles(vehicle_plate);

-- Updated_at trigger
CREATE TRIGGER update_driver_profiles_updated_at
    BEFORE UPDATE ON driver_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Ratings Table
-- ============================================
CREATE TABLE ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID UNIQUE NOT NULL, -- Foreign key to TripService (logical only)
    passenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_ratings_trip_id ON ratings(trip_id);
CREATE INDEX idx_ratings_passenger_id ON ratings(passenger_id);
CREATE INDEX idx_ratings_driver_id ON ratings(driver_id);
CREATE INDEX idx_ratings_created_at ON ratings(created_at DESC);
CREATE INDEX idx_ratings_stars ON ratings(stars);

-- Materialized view for driver rating statistics (optional optimization)
CREATE MATERIALIZED VIEW driver_rating_stats AS
SELECT
    driver_id,
    COUNT(*) as total_ratings,
    ROUND(AVG(stars)::numeric, 2) as average_rating,
    COUNT(*) FILTER (WHERE stars = 5) as five_star_count,
    COUNT(*) FILTER (WHERE stars = 4) as four_star_count,
    COUNT(*) FILTER (WHERE stars = 3) as three_star_count,
    COUNT(*) FILTER (WHERE stars = 2) as two_star_count,
    COUNT(*) FILTER (WHERE stars = 1) as one_star_count,
    MAX(created_at) as last_rated_at
FROM ratings
GROUP BY driver_id;

-- Index on materialized view
CREATE UNIQUE INDEX idx_driver_rating_stats_driver_id ON driver_rating_stats(driver_id);

-- Refresh materialized view function (call after each rating insert)
CREATE OR REPLACE FUNCTION refresh_driver_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY driver_rating_stats;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to refresh stats after rating insert
CREATE TRIGGER refresh_driver_stats_on_rating_insert
    AFTER INSERT ON ratings
    FOR EACH STATEMENT
    EXECUTE FUNCTION refresh_driver_rating_stats();
```

---

## **9.2 TripService Database Schema (PostgreSQL)**

```sql
-- ============================================
-- TripService Database Schema
-- PostgreSQL 15.x with PostGIS (optional for future geospatial features)
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable PostGIS for geospatial features (optional)
-- CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- Trips Table
-- ============================================
CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- User references (logical FKs to UserService)
    passenger_id UUID NOT NULL,
    driver_id UUID,

    -- Trip status
    status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED'
        CHECK (status IN ('REQUESTED', 'DRIVER_ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),

    -- Pickup location
    pickup_latitude DECIMAL(10, 8) NOT NULL CHECK (pickup_latitude >= -90 AND pickup_latitude <= 90),
    pickup_longitude DECIMAL(11, 8) NOT NULL CHECK (pickup_longitude >= -180 AND pickup_longitude <= 180),
    pickup_address TEXT NOT NULL,

    -- Destination location
    destination_latitude DECIMAL(10, 8) NOT NULL CHECK (destination_latitude >= -90 AND destination_latitude <= 90),
    destination_longitude DECIMAL(11, 8) NOT NULL CHECK (destination_longitude >= -180 AND destination_longitude <= 180),
    destination_address TEXT NOT NULL,

    -- Fare information (stored in USD cents)
    estimated_fare INTEGER NOT NULL CHECK (estimated_fare >= 0),
    actual_fare INTEGER CHECK (actual_fare >= 0),

    -- Distance in kilometers
    estimated_distance DECIMAL(10, 2) NOT NULL CHECK (estimated_distance >= 0),

    -- Timestamps for state transitions
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    driver_assigned_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,

    -- Cancellation details
    cancellation_reason TEXT,

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT valid_state_timestamps CHECK (
        (status = 'REQUESTED' AND driver_assigned_at IS NULL AND started_at IS NULL AND completed_at IS NULL AND cancelled_at IS NULL) OR
        (status = 'DRIVER_ASSIGNED' AND driver_assigned_at IS NOT NULL AND started_at IS NULL AND completed_at IS NULL AND cancelled_at IS NULL) OR
        (status = 'IN_PROGRESS' AND driver_assigned_at IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NULL AND cancelled_at IS NULL) OR
        (status = 'COMPLETED' AND driver_assigned_at IS NOT NULL AND started_at IS NOT NULL AND completed_at IS NOT NULL AND cancelled_at IS NULL) OR
        (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
    ),
    CONSTRAINT driver_required_for_assigned CHECK (
        (status IN ('DRIVER_ASSIGNED', 'IN_PROGRESS', 'COMPLETED') AND driver_id IS NOT NULL) OR
        (status IN ('REQUESTED', 'CANCELLED'))
    )
);

-- Indexes for performance
CREATE INDEX idx_trips_passenger_id ON trips(passenger_id);
CREATE INDEX idx_trips_driver_id ON trips(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_requested_at ON trips(requested_at DESC);
CREATE INDEX idx_trips_completed_at ON trips(completed_at DESC) WHERE completed_at IS NOT NULL;

-- Composite index for common query patterns
CREATE INDEX idx_trips_passenger_status ON trips(passenger_id, status);
CREATE INDEX idx_trips_driver_status ON trips(driver_id, status) WHERE driver_id IS NOT NULL;

-- Geospatial index for pickup location (if using PostGIS)
-- CREATE INDEX idx_trips_pickup_location ON trips USING GIST (
--     ST_SetSRID(ST_MakePoint(pickup_longitude, pickup_latitude), 4326)
-- );

-- Updated_at trigger
CREATE TRIGGER update_trips_updated_at
    BEFORE UPDATE ON trips
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update updated_at (if not already created)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Trip State Transition Audit Log (optional)
-- ============================================
CREATE TABLE trip_state_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,
    changed_by UUID, -- userId who triggered the change
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB -- Additional context (e.g., cancellation reason)
);

-- Index for audit queries
CREATE INDEX idx_trip_state_changes_trip_id ON trip_state_changes(trip_id);
CREATE INDEX idx_trip_state_changes_changed_at ON trip_state_changes(changed_at DESC);

-- Trigger to log state changes
CREATE OR REPLACE FUNCTION log_trip_state_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO trip_state_changes (trip_id, from_status, to_status)
        VALUES (NEW.id, OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_trip_status_changes
    AFTER UPDATE OF status ON trips
    FOR EACH ROW
    EXECUTE FUNCTION log_trip_state_change();
```

---

## **9.3 DriverService Redis Schema**

```redis
# ============================================
# DriverService Redis Data Structures
# Redis 7.2.x with Geospatial Support
# ============================================

# ---------------------------------------------
# 1. Geospatial Index (All Driver Locations)
# ---------------------------------------------
# Key: driver:geo
# Type: Sorted Set (Geospatial)
# Commands:
#   - Add/Update: GEOADD driver:geo <longitude> <latitude> <driverId>
#   - Search: GEORADIUS driver:geo <lng> <lat> <radius> km WITHDIST ASC COUNT <limit>
#   - Remove: ZREM driver:geo <driverId>

# Example:
GEOADD driver:geo 106.660172 10.762622 "driver-uuid-1"
GEOADD driver:geo 106.665432 10.768901 "driver-uuid-2"

# Search nearby drivers within 5km
GEORADIUS driver:geo 106.660172 10.762622 5 km WITHDIST ASC COUNT 10

# ---------------------------------------------
# 2. Driver Location Metadata
# ---------------------------------------------
# Key Pattern: driver:location:{driverId}
# Type: String (JSON serialized)
# TTL: 300 seconds (5 minutes)
# Structure:
# {
#   "driverId": "uuid",
#   "latitude": 10.762622,
#   "longitude": 106.660172,
#   "isOnline": true,
#   "heading": 45.5,      // degrees (0-359)
#   "speed": 30.5,        // km/h
#   "accuracy": 10.0,     // meters
#   "timestamp": "2025-10-20T10:30:00Z"
# }

# Example:
SET driver:location:driver-uuid-1 '{"driverId":"driver-uuid-1","latitude":10.762622,"longitude":106.660172,"isOnline":true,"timestamp":"2025-10-20T10:30:00Z"}'
EXPIRE driver:location:driver-uuid-1 300

# Get driver location
GET driver:location:driver-uuid-1

# Batch get multiple drivers
MGET driver:location:driver-uuid-1 driver:location:driver-uuid-2

# ---------------------------------------------
# 3. Online Drivers Set
# ---------------------------------------------
# Key: driver:online
# Type: Set
# Purpose: Fast membership check for online status

# Example:
SADD driver:online driver-uuid-1 driver-uuid-2
SISMEMBER driver:online driver-uuid-1  # Returns 1 if online
SCARD driver:online                     # Count online drivers
SREM driver:online driver-uuid-1       # Remove when going offline

# ---------------------------------------------
# 4. Driver Session Tracking (optional)
# ---------------------------------------------
# Key Pattern: driver:session:{driverId}
# Type: Hash
# TTL: 3600 seconds (1 hour)
# Fields: lastSeen, tripId, totalUpdates

# Example:
HSET driver:session:driver-uuid-1 lastSeen "2025-10-20T10:30:00Z" tripId "trip-uuid-1" totalUpdates 150
EXPIRE driver:session:driver-uuid-1 3600

# ---------------------------------------------
# 5. Performance Monitoring (optional)
# ---------------------------------------------
# Key: driver:stats:daily:{YYYY-MM-DD}
# Type: Hash
# Fields: totalUpdates, uniqueDrivers, avgUpdatesPerDriver

HINCRBY driver:stats:daily:2025-10-20 totalUpdates 1
PFADD driver:stats:daily:2025-10-20:unique driver-uuid-1
```

---

## **9.4 Prisma Schema Definitions**

```prisma
// ============================================
// UserService Prisma Schema
// File: services/user-service/prisma/schema.prisma
// ============================================

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  PASSENGER
  DRIVER
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  role         UserRole
  firstName    String   @map("first_name")
  lastName     String   @map("last_name")
  phoneNumber  String   @map("phone_number")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  // Relations
  driverProfile    DriverProfile?
  ratingsGiven     Rating[]       @relation("PassengerRatings")
  ratingsReceived  Rating[]       @relation("DriverRatings")

  @@index([email])
  @@index([role])
  @@index([createdAt])
  @@map("users")
}

enum DriverApprovalStatus {
  PENDING
  APPROVED
  REJECTED
  SUSPENDED
}

model DriverProfile {
  id             String                @id @default(uuid())
  userId         String                @unique @map("user_id")
  vehicleMake    String                @map("vehicle_make")
  vehicleModel   String                @map("vehicle_model")
  vehicleYear    Int                   @map("vehicle_year")
  vehiclePlate   String                @unique @map("vehicle_plate")
  vehicleColor   String                @map("vehicle_color")
  licenseNumber  String                @unique @map("license_number")
  approvalStatus DriverApprovalStatus  @default(PENDING) @map("approval_status")
  createdAt      DateTime              @default(now()) @map("created_at")
  updatedAt      DateTime              @updatedAt @map("updated_at")

  // Relations
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([approvalStatus])
  @@index([vehiclePlate])
  @@map("driver_profiles")
}

model Rating {
  id          String   @id @default(uuid())
  tripId      String   @unique @map("trip_id")
  passengerId String   @map("passenger_id")
  driverId    String   @map("driver_id")
  stars       Int
  comment     String?
  createdAt   DateTime @default(now()) @map("created_at")

  // Relations
  passenger User @relation("PassengerRatings", fields: [passengerId], references: [id], onDelete: Cascade)
  driver    User @relation("DriverRatings", fields: [driverId], references: [id], onDelete: Cascade)

  @@index([tripId])
  @@index([passengerId])
  @@index([driverId])
  @@index([stars])
  @@index([createdAt])
  @@map("ratings")
}

// ============================================
// TripService Prisma Schema
// File: services/trip-service/prisma/schema.prisma
// ============================================

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum TripStatus {
  REQUESTED
  DRIVER_ASSIGNED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

model Trip {
  id                   String     @id @default(uuid())
  passengerId          String     @map("passenger_id")
  driverId             String?    @map("driver_id")
  status               TripStatus @default(REQUESTED)

  pickupLatitude       Decimal    @map("pickup_latitude") @db.Decimal(10, 8)
  pickupLongitude      Decimal    @map("pickup_longitude") @db.Decimal(11, 8)
  pickupAddress        String     @map("pickup_address")

  destinationLatitude  Decimal    @map("destination_latitude") @db.Decimal(10, 8)
  destinationLongitude Decimal    @map("destination_longitude") @db.Decimal(11, 8)
  destinationAddress   String     @map("destination_address")

  estimatedFare        Int        @map("estimated_fare")
  actualFare           Int?       @map("actual_fare")
  estimatedDistance    Decimal    @map("estimated_distance") @db.Decimal(10, 2)

  requestedAt          DateTime   @default(now()) @map("requested_at")
  driverAssignedAt     DateTime?  @map("driver_assigned_at")
  startedAt            DateTime?  @map("started_at")
  completedAt          DateTime?  @map("completed_at")
  cancelledAt          DateTime?  @map("cancelled_at")

  cancellationReason   String?    @map("cancellation_reason")

  createdAt            DateTime   @default(now()) @map("created_at")
  updatedAt            DateTime   @updatedAt @map("updated_at")

  @@index([passengerId])
  @@index([driverId])
  @@index([status])
  @@index([requestedAt])
  @@index([completedAt])
  @@index([passengerId, status])
  @@index([driverId, status])
  @@map("trips")
}
```

---

## **Detailed Rationale:**

**Database Design Decisions:**

1. **UUID Primary Keys:**
   - Prevents ID collision in distributed systems
   - Allows client-side ID generation if needed
   - Trade-off: Larger storage (16 bytes vs 4 bytes for INT)
   - Benefit: Better for microservices architecture

2. **Timestamp with Time Zone:**
   - All timestamps stored in UTC
   - Client converts to local timezone
   - Prevents timezone-related bugs

3. **DECIMAL for Currency (not FLOAT):**
   - Exact precision for money calculations
   - `DECIMAL(10,2)` for distances, `INTEGER` cents for fares
   - Avoids floating-point rounding errors

4. **DECIMAL for Coordinates:**
   - `DECIMAL(10,8)` for latitude (8 decimal places ≈ 1mm precision)
   - `DECIMAL(11,8)` for longitude
   - PostgreSQL NUMERIC type for exact storage

5. **CHECK Constraints:**
   - Enforce business rules at database level
   - Latitude: -90 to 90, Longitude: -180 to 180
   - Stars: 1 to 5, Vehicle year: 2000 to 2026
   - Defense in depth (validation in app + database)

6. **Indexes Strategy:**
   - Single-column indexes on foreign keys and frequently queried fields
   - Composite indexes for common query patterns (`passenger_id + status`)
   - Partial indexes with WHERE clauses to reduce index size

7. **Materialized View for Driver Stats:**
   - Pre-aggregated rating statistics
   - Refreshed after each rating insert
   - Trade-off: Slight insert overhead for much faster reads
   - Can be disabled if performance not needed

8. **State Machine Validation:**
   - CHECK constraints enforce valid state transitions
   - Prevents invalid data (e.g., completed trip without driver)
   - Complements application-level validation

9. **Audit Log Table:**
   - `trip_state_changes` tracks all status transitions
   - Useful for debugging and analytics
   - Can be queried for trip timeline reconstruction

10. **Redis TTL Strategy:**
    - 5-minute TTL on driver locations
    - Auto-cleanup of stale data
    - Drivers that crash or disconnect are automatically removed

11. **Cascade Deletes:**
    - `ON DELETE CASCADE` for dependent records
    - Deleting user also deletes driver profile and ratings
    - Maintains referential integrity

12. **Geospatial Optimization:**
    - Redis GEORADIUS for sub-second searches
    - Commented PostGIS option for PostgreSQL if needed
    - Redis chosen for MVP simplicity

---

**Select 1-9 or just type your question/feedback:**

1. **Proceed to next section** (Frontend Architecture - skipped for backend-only project)
2. **Expand or Contract for Audience** - Adjust schema detail
3. **Explain Reasoning (CoT Step-by-Step)** - Deeper dive into schema design
4. **Critique and Refine** - Challenge these database decisions
5. **Analyze Logical Flow and Dependencies** - Review schema coherence
6. **Assess Alignment with Overall Goals** - Verify data requirements
7. **Identify Potential Risks and Unforeseen Issues** - Database risks?
8. **Challenge from Critical Perspective** - Devil's advocate on schema choices
9. **Tree of Thoughts Deep Dive** - Explore alternative schema designs

dieuxuanhien: 1

GitHub Copilot: Perfect! Since this is a backend-only project (no frontend required per PRD), I'll skip the Frontend Architecture and Backend Architecture sections (which are more relevant for fullstack web apps) and move directly to the **Unified Project Structure** section.

---
