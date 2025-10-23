## **SECTION 9: DATABASE SCHEMA**

Transforming the conceptual data models into concrete PostgreSQL schemas with indexes, constraints, and relationships.

### **9.1 UserService Database Schema (PostgreSQL)**

```sql

-- ============================================

-- UserService Database Schema

-- PostgreSQL 15.x

-- ============================================


-- Enable UUID extension

CREATE EXTENSION IFNOTEXISTS"uuid-ossp";


-- ============================================

-- Users Table

-- ============================================

CREATETABLE users (

    id UUID PRIMARYKEY DEFAULT uuid_generate_v4(),

    email VARCHAR(255) UNIQUE NOTNULL,

    password_hash VARCHAR(255) NOTNULL,

roleVARCHAR(20) NOTNULLCHECK (roleIN ('PASSENGER', 'DRIVER')),

    first_name VARCHAR(100) NOTNULL,

    last_name VARCHAR(100) NOTNULL,

    phone_number VARCHAR(20) NOTNULL,

    created_at TIMESTAMPWITHTIMEZONE DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPWITHTIMEZONE DEFAULT CURRENT_TIMESTAMP

);


-- Indexes for performance

CREATE INDEX idx_users_email ON users(email);

CREATE INDEX idx_users_role ON users(role);

CREATE INDEX idx_users_created_at ON users(created_at DESC);


-- Trigger to update updated_at timestamp

CREATEORREPLACEFUNCTION update_updated_at_column()

RETURNS TRIGGER AS $$

BEGIN

    NEW.updated_at = CURRENT_TIMESTAMP;

RETURN NEW;

END;

$$ LANGUAGE plpgsql;


CREATE TRIGGER update_users_updated_at

BEFOREUPDATEON users

    FOR EACH ROW

EXECUTEFUNCTION update_updated_at_column();


-- ============================================

-- Driver Profiles Table

-- ============================================

CREATETABLE driver_profiles (

    id UUID PRIMARYKEY DEFAULT uuid_generate_v4(),

user_id UUID UNIQUE NOTNULLREFERENCES users(id) ON DELETE CASCADE,

    vehicle_make VARCHAR(50) NOTNULL,

    vehicle_model VARCHAR(50) NOTNULL,

    vehicle_year INTEGERNOTNULLCHECK (vehicle_year >= 2000AND vehicle_year <= 2026),

    vehicle_plate VARCHAR(20) UNIQUE NOTNULL,

    vehicle_color VARCHAR(30) NOTNULL,

    license_number VARCHAR(50) UNIQUE NOTNULL,

    approval_status VARCHAR(20) NOTNULL DEFAULT 'PENDING'

CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),

    created_at TIMESTAMPWITHTIMEZONE DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPWITHTIMEZONE DEFAULT CURRENT_TIMESTAMP

);


-- Indexes

CREATE INDEX idx_driver_profiles_user_id ON driver_profiles(user_id);

CREATE INDEX idx_driver_profiles_approval_status ON driver_profiles(approval_status);

CREATE INDEX idx_driver_profiles_vehicle_plate ON driver_profiles(vehicle_plate);


-- Updated_at trigger

CREATE TRIGGER update_driver_profiles_updated_at

BEFOREUPDATEON driver_profiles

    FOR EACH ROW

EXECUTEFUNCTION update_updated_at_column();


-- ============================================

-- Ratings Table

-- ============================================

CREATETABLE ratings (

    id UUID PRIMARYKEY DEFAULT uuid_generate_v4(),

    trip_id UUID UNIQUE NOTNULL, -- Foreign key to TripService (logical only)

    passenger_id UUID NOTNULLREFERENCES users(id) ON DELETE CASCADE,

    driver_id UUID NOTNULLREFERENCES users(id) ON DELETE CASCADE,

    stars INTEGERNOTNULLCHECK (stars >= 1AND stars <= 5),

    comment TEXT,

    created_at TIMESTAMPWITHTIMEZONE DEFAULT CURRENT_TIMESTAMP

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

CREATEORREPLACEFUNCTION refresh_driver_rating_stats()

RETURNS TRIGGER AS $$

BEGIN

    REFRESH MATERIALIZED VIEW CONCURRENTLY driver_rating_stats;

RETURN NEW;

END;

$$ LANGUAGE plpgsql;


-- Trigger to refresh stats after rating insert

CREATE TRIGGER refresh_driver_stats_on_rating_insert

AFTERINSERTON ratings

    FOR EACH STATEMENT

EXECUTEFUNCTION refresh_driver_rating_stats();

```

---

### **9.2 TripService Database Schema (PostgreSQL)**

```sql

-- ============================================

-- TripService Database Schema

-- PostgreSQL 15.x with PostGIS (optional for future geospatial features)

-- ============================================


-- Enable UUID extension

CREATE EXTENSION IFNOTEXISTS"uuid-ossp";


-- Enable PostGIS for geospatial features (optional)

-- CREATE EXTENSION IF NOT EXISTS postgis;


-- ============================================

-- Trips Table

-- ============================================

CREATETABLE trips (

    id UUID PRIMARYKEY DEFAULT uuid_generate_v4(),


-- User references (logical FKs to UserService)

    passenger_id UUID NOTNULL,

    driver_id UUID,


-- Trip status

statusVARCHAR(20) NOTNULL DEFAULT 'REQUESTED'

CHECK (statusIN ('REQUESTED', 'DRIVER_ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),


-- Pickup location

    pickup_latitude DECIMAL(10, 8) NOTNULLCHECK (pickup_latitude >= -90AND pickup_latitude <= 90),

    pickup_longitude DECIMAL(11, 8) NOTNULLCHECK (pickup_longitude >= -180AND pickup_longitude <= 180),

    pickup_address TEXTNOTNULL,


-- Destination location

    destination_latitude DECIMAL(10, 8) NOTNULLCHECK (destination_latitude >= -90AND destination_latitude <= 90),

    destination_longitude DECIMAL(11, 8) NOTNULLCHECK (destination_longitude >= -180AND destination_longitude <= 180),

    destination_address TEXTNOTNULL,


-- Fare information (stored in USD cents)

    estimated_fare INTEGERNOTNULLCHECK (estimated_fare >= 0),

    actual_fare INTEGERCHECK (actual_fare >= 0),


-- Distance in kilometers

    estimated_distance DECIMAL(10, 2) NOTNULLCHECK (estimated_distance >= 0),


-- Timestamps for state transitions

    requested_at TIMESTAMPWITHTIMEZONE DEFAULT CURRENT_TIMESTAMP,

    driver_assigned_at TIMESTAMPWITHTIMEZONE,

    started_at TIMESTAMPWITHTIMEZONE,

    completed_at TIMESTAMPWITHTIMEZONE,

    cancelled_at TIMESTAMPWITHTIMEZONE,


-- Cancellation details

    cancellation_reason TEXT,


-- Audit fields

    created_at TIMESTAMPWITHTIMEZONE DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPWITHTIMEZONE DEFAULT CURRENT_TIMESTAMP,


-- Constraints

CONSTRAINT valid_state_timestamps CHECK (

        (status = 'REQUESTED'AND driver_assigned_at ISNULLAND started_at ISNULLAND completed_at ISNULLAND cancelled_at ISNULL) OR

        (status = 'DRIVER_ASSIGNED'AND driver_assigned_at ISNOTNULLAND started_at ISNULLAND completed_at ISNULLAND cancelled_at ISNULL) OR

        (status = 'IN_PROGRESS'AND driver_assigned_at ISNOTNULLAND started_at ISNOTNULLAND completed_at ISNULLAND cancelled_at ISNULL) OR

        (status = 'COMPLETED'AND driver_assigned_at ISNOTNULLAND started_at ISNOTNULLAND completed_at ISNOTNULLAND cancelled_at ISNULL) OR

        (status = 'CANCELLED'AND cancelled_at ISNOTNULL)

    ),

CONSTRAINT driver_required_for_assigned CHECK (

        (statusIN ('DRIVER_ASSIGNED', 'IN_PROGRESS', 'COMPLETED') AND driver_id ISNOTNULL) OR

        (statusIN ('REQUESTED', 'CANCELLED'))

    )

);


-- Indexes for performance

CREATE INDEX idx_trips_passenger_id ON trips(passenger_id);

CREATE INDEX idx_trips_driver_id ON trips(driver_id) WHERE driver_id ISNOTNULL;

CREATE INDEX idx_trips_status ON trips(status);

CREATE INDEX idx_trips_requested_at ON trips(requested_at DESC);

CREATE INDEX idx_trips_completed_at ON trips(completed_at DESC) WHERE completed_at ISNOTNULL;


-- Composite index for common query patterns

CREATE INDEX idx_trips_passenger_status ON trips(passenger_id, status);

CREATE INDEX idx_trips_driver_status ON trips(driver_id, status) WHERE driver_id ISNOTNULL;


-- Geospatial index for pickup location (if using PostGIS)

-- CREATE INDEX idx_trips_pickup_location ON trips USING GIST (

--     ST_SetSRID(ST_MakePoint(pickup_longitude, pickup_latitude), 4326)

-- );


-- Updated_at trigger

CREATE TRIGGER update_trips_updated_at

BEFOREUPDATEON trips

    FOR EACH ROW

EXECUTEFUNCTION update_updated_at_column();


-- Function to update updated_at (if not already created)

CREATEORREPLACEFUNCTION update_updated_at_column()

RETURNS TRIGGER AS $$

BEGIN

    NEW.updated_at = CURRENT_TIMESTAMP;

RETURN NEW;

END;

$$ LANGUAGE plpgsql;


-- ============================================

-- Trip State Transition Audit Log (optional)

-- ============================================

CREATETABLE trip_state_changes (

    id UUID PRIMARYKEY DEFAULT uuid_generate_v4(),

    trip_id UUID NOTNULLREFERENCES trips(id) ON DELETE CASCADE,

    from_status VARCHAR(20),

    to_status VARCHAR(20) NOTNULL,

    changed_by UUID, -- userId who triggered the change

    changed_at TIMESTAMPWITHTIMEZONE DEFAULT CURRENT_TIMESTAMP,

    metadata JSONB -- Additional context (e.g., cancellation reason)

);


-- Index for audit queries

CREATE INDEX idx_trip_state_changes_trip_id ON trip_state_changes(trip_id);

CREATE INDEX idx_trip_state_changes_changed_at ON trip_state_changes(changed_at DESC);


-- Trigger to log state changes

CREATEORREPLACEFUNCTION log_trip_state_change()

RETURNS TRIGGER AS $$

BEGIN

IF OLD.status ISDISTINCTFROM NEW.status THEN

INSERTINTO trip_state_changes (trip_id, from_status, to_status)

VALUES (NEW.id, OLD.status, NEW.status);

ENDIF;

RETURN NEW;

END;

$$ LANGUAGE plpgsql;


CREATE TRIGGER log_trip_status_changes

AFTERUPDATE OF statusON trips

    FOR EACH ROW

EXECUTEFUNCTION log_trip_state_change();

```

---

### **9.3 DriverService Redis Schema**

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

### **9.4 Prisma Schema Definitions**

```prisma

// ============================================

// UserService Prisma Schema

// File: services/user-service/prisma/schema.prisma

// ============================================


generatorclient{

provider = "prisma-client-js"

}


datasourcedb{

provider = "postgresql"

url      = env("DATABASE_URL")

}


enumUserRole{

PASSENGER

DRIVER

}


modelUser{

idString@id@default(uuid())

emailString@unique

passwordHashString@map("password_hash")

roleUserRole

firstNameString@map("first_name")

lastNameString@map("last_name")

phoneNumberString@map("phone_number")

createdAtDateTime@default(now())@map("created_at")

updatedAtDateTime@updatedAt@map("updated_at")


// Relations

driverProfileDriverProfile?

ratingsGivenRating[]       @relation("PassengerRatings")

ratingsReceivedRating[]       @relation("DriverRatings")


@@index([email])

@@index([role])

@@index([createdAt])

@@map("users")

}


enumDriverApprovalStatus{

PENDING

APPROVED

REJECTED

SUSPENDED

}


modelDriverProfile{

idString@id@default(uuid())

userIdString@unique@map("user_id")

vehicleMakeString@map("vehicle_make")

vehicleModelString@map("vehicle_model")

vehicleYearInt@map("vehicle_year")

vehiclePlateString@unique@map("vehicle_plate")

vehicleColorString@map("vehicle_color")

licenseNumberString@unique@map("license_number")

approvalStatusDriverApprovalStatus@default(PENDING)@map("approval_status")

createdAtDateTime@default(now())@map("created_at")

updatedAtDateTime@updatedAt@map("updated_at")


// Relations

userUser@relation(fields: [userId], references: [id], onDelete: Cascade)


@@index([userId])

@@index([approvalStatus])

@@index([vehiclePlate])

@@map("driver_profiles")

}


modelRating{

idString@id@default(uuid())

tripIdString@unique@map("trip_id")

passengerIdString@map("passenger_id")

driverIdString@map("driver_id")

starsInt

commentString?

createdAtDateTime@default(now())@map("created_at")


// Relations

passengerUser@relation("PassengerRatings", fields: [passengerId], references: [id], onDelete: Cascade)

driverUser@relation("DriverRatings", fields: [driverId], references: [id], onDelete: Cascade)


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


generatorclient{

provider = "prisma-client-js"

}


datasourcedb{

provider = "postgresql"

url      = env("DATABASE_URL")

}


enumTripStatus{

REQUESTED

DRIVER_ASSIGNED

IN_PROGRESS

COMPLETED

CANCELLED

}


modelTrip{

idString@id@default(uuid())

passengerIdString@map("passenger_id")

driverIdString?    @map("driver_id")

statusTripStatus@default(REQUESTED)


pickupLatitudeDecimal@map("pickup_latitude")@db.Decimal(10, 8)

pickupLongitudeDecimal@map("pickup_longitude")@db.Decimal(11, 8)

pickupAddressString@map("pickup_address")


destinationLatitudeDecimal@map("destination_latitude")@db.Decimal(10, 8)

destinationLongitudeDecimal@map("destination_longitude")@db.Decimal(11, 8)

destinationAddressString@map("destination_address")


estimatedFareInt@map("estimated_fare")

actualFareInt?       @map("actual_fare")

estimatedDistanceDecimal@map("estimated_distance")@db.Decimal(10, 2)


requestedAtDateTime@default(now())@map("requested_at")

driverAssignedAtDateTime?  @map("driver_assigned_at")

startedAtDateTime?  @map("started_at")

completedAtDateTime?  @map("completed_at")

cancelledAtDateTime?  @map("cancelled_at")


cancellationReasonString?    @map("cancellation_reason")


createdAtDateTime@default(now())@map("created_at")

updatedAtDateTime@updatedAt@map("updated_at")


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

### **Detailed Rationale:**

**Database Design Decisions:**

1.**UUID Primary Keys:**

- Prevents ID collision in distributed systems
- Allows client-side ID generation if needed
- Trade-off: Larger storage (16 bytes vs 4 bytes for INT)
- Benefit: Better for microservices architecture

2.**Timestamp with Time Zone:**

- All timestamps stored in UTC
- Client converts to local timezone
- Prevents timezone-related bugs

3.**DECIMAL for Currency (not FLOAT):**

- Exact precision for money calculations

-`DECIMAL(10,2)` for distances, `INTEGER` cents for fares

- Avoids floating-point rounding errors

4.**DECIMAL for Coordinates:**

-`DECIMAL(10,8)` for latitude (8 decimal places ≈ 1mm precision)

-`DECIMAL(11,8)` for longitude

- PostgreSQL NUMERIC type for exact storage

5.**CHECK Constraints:**

- Enforce business rules at database level
- Latitude: -90 to 90, Longitude: -180 to 180
- Stars: 1 to 5, Vehicle year: 2000 to 2026
- Defense in depth (validation in app + database)

6.**Indexes Strategy:**

- Single-column indexes on foreign keys and frequently queried fields
- Composite indexes for common query patterns (`passenger_id + status`)
- Partial indexes with WHERE clauses to reduce index size

7.**Materialized View for Driver Stats:**

- Pre-aggregated rating statistics
- Refreshed after each rating insert
- Trade-off: Slight insert overhead for much faster reads
- Can be disabled if performance not needed

8.**State Machine Validation:**

- CHECK constraints enforce valid state transitions
- Prevents invalid data (e.g., completed trip without driver)
- Complements application-level validation

9.**Audit Log Table:**

-`trip_state_changes` tracks all status transitions

- Useful for debugging and analytics
- Can be queried for trip timeline reconstruction

10.**Redis TTL Strategy:**

- 5-minute TTL on driver locations
- Auto-cleanup of stale data
- Drivers that crash or disconnect are automatically removed

11.**Cascade Deletes:**

-`ON DELETE CASCADE` for dependent records

- Deleting user also deletes driver profile and ratings
- Maintains referential integrity

12.**Geospatial Optimization:**

- Redis GEORADIUS for sub-second searches
- Commented PostGIS option for PostgreSQL if needed
- Redis chosen for MVP simplicity

---

**Select 1-9 or just type your question/feedback:**

1.**Proceed to next section** (Frontend Architecture - skipped for backend-only project)

2.**Expand or Contract for Audience** - Adjust schema detail

3.**Explain Reasoning (CoT Step-by-Step)** - Deeper dive into schema design

4.**Critique and Refine** - Challenge these database decisions

5.**Analyze Logical Flow and Dependencies** - Review schema coherence

6.**Assess Alignment with Overall Goals** - Verify data requirements

7.**Identify Potential Risks and Unforeseen Issues** - Database risks?

8.**Challenge from Critical Perspective** - Devil's advocate on schema choices

9.**Tree of Thoughts Deep Dive** - Explore alternative schema designs

dieuxuanhien: 1

GitHub Copilot: Perfect! Since this is a backend-only project (no frontend required per PRD), I'll skip the Frontend Architecture and Backend Architecture sections (which are more relevant for fullstack web apps) and move directly to the **Unified Project Structure** section.

---
