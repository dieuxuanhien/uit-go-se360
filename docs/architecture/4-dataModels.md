## **SECTION 4: DATA MODELS**

Based on the PRD requirements and user stories, I've identified the core business entities. These TypeScript interfaces will be shared across services via the `packages/shared-types` package.

---

### **4.1 User Model**

**Purpose:** Represents both passengers and drivers in the system. Uses a discriminator field (`role`) to differentiate user types while maintaining a unified authentication model.

**Key Attributes:**

-`id`: string (UUID) - Primary identifier

-`email`: string - Unique login credential

-`passwordHash`: string - bcrypt hashed password (never exposed in API responses)

-`role`: enum ('PASSENGER' | 'DRIVER') - User type discriminator

-`firstName`: string - User's first name

-`lastName`: string - User's last name

-`phoneNumber`: string - Contact number

-`createdAt`: DateTime - Account creation timestamp

-`updatedAt`: DateTime - Last profile update

**TypeScript Interface:**

```typescript

exportenumUserRole {

PASSENGER = 'PASSENGER',

DRIVER = 'DRIVER',

}


exportinterfaceUser {

id: string;

email: string;

passwordHash: string; // Never included in API responses

role: UserRole;

firstName: string;

lastName: string;

phoneNumber: string;

createdAt: Date;

updatedAt: Date;

}


// API response type (excludes sensitive fields)

exportinterfaceUserDTO {

id: string;

email: string;

role: UserRole;

firstName: string;

lastName: string;

phoneNumber: string;

createdAt: Date;

updatedAt: Date;

}

```

**Relationships:**

- One User (PASSENGER) → Many Trips (as passenger)
- One User (DRIVER) → Many Trips (as driver)
- One User (DRIVER) → One DriverProfile

---

### **4.2 DriverProfile Model**

**Purpose:** Extended information specific to drivers, separated from core User model for cleaner data modeling. Contains vehicle details and approval status.

**Key Attributes:**

-`id`: string (UUID) - Primary identifier

-`userId`: string (UUID) - Foreign key to User

-`vehicleMake`: string - Vehicle manufacturer (e.g., "Toyota")

-`vehicleModel`: string - Vehicle model (e.g., "Camry")

-`vehicleYear`: number - Manufacturing year

-`vehiclePlate`: string - License plate number (unique)

-`vehicleColor`: string - Vehicle color

-`licenseNumber`: string - Driver's license number (unique)

-`approvalStatus`: enum - Admin approval state

-`createdAt`: DateTime - Profile creation timestamp

-`updatedAt`: DateTime - Last update timestamp

**TypeScript Interface:**

```typescript

exportenumDriverApprovalStatus {

PENDING = 'PENDING',

APPROVED = 'APPROVED',

REJECTED = 'REJECTED',

SUSPENDED = 'SUSPENDED',

}


exportinterfaceDriverProfile {

id: string;

userId: string;

vehicleMake: string;

vehicleModel: string;

vehicleYear: number;

vehiclePlate: string;

vehicleColor: string;

licenseNumber: string;

approvalStatus: DriverApprovalStatus;

createdAt: Date;

updatedAt: Date;

}


exportinterfaceDriverProfileDTOextendsDriverProfile {

user?: UserDTO; // Optionally include user details in responses

}

```

**Relationships:**

- One DriverProfile → One User (DRIVER)
- One DriverProfile → Many DriverLocationUpdates (historical tracking)

---

### **4.3 DriverLocation Model**

**Purpose:** Real-time geospatial data for active drivers. Stored in Redis for high-throughput writes and sub-second geospatial queries. Ephemeral data (no long-term persistence needed).

**Key Attributes:**

-`driverId`: string (UUID) - Driver identifier

-`latitude`: number - GPS latitude (-90 to 90)

-`longitude`: number - GPS longitude (-180 to 180)

-`isOnline`: boolean - Driver availability status

-`heading`: number - Direction of travel (0-359 degrees, optional)

-`speed`: number - Speed in km/h (optional)

-`accuracy`: number - GPS accuracy in meters (optional)

-`timestamp`: DateTime - Location update time

**TypeScript Interface:**

```typescript

exportinterfaceDriverLocation {

driverId: string;

latitude: number;

longitude: number;

isOnline: boolean;

heading?: number; // 0-359 degrees

speed?: number; // km/h

accuracy?: number; // meters

timestamp: Date;

}


// Redis storage format (serialized as JSON string)

exportinterfaceDriverLocationRedisValue {

driverId: string;

isOnline: boolean;

heading?: number;

speed?: number;

accuracy?: number;

timestamp: string; // ISO 8601 string

}


// Nearby driver search result

exportinterfaceNearbyDriver {

driverId: string;

latitude: number;

longitude: number;

distance: number; // meters from search origin

isOnline: boolean;

}

```

**Relationships:**

- One DriverLocation → One User (DRIVER) - via driverId
- Redis key structure: `driver:location:{driverId}`
- Redis geospatial index: `driver:geo` (using GEOADD)

---

### **4.4 Trip Model**

**Purpose:** Central entity representing a ride request lifecycle. Implements state machine pattern for trip progression (REQUESTED → DRIVER_ASSIGNED → IN_PROGRESS → COMPLETED/CANCELLED).

**Key Attributes:**

-`id`: string (UUID) - Primary identifier

-`passengerId`: string (UUID) - Foreign key to User (PASSENGER)

-`driverId`: string | null (UUID) - Foreign key to User (DRIVER), null until assigned

-`status`: enum - Current trip state

-`pickupLatitude`: number - Pickup location latitude

-`pickupLongitude`: number - Pickup location longitude

-`pickupAddress`: string - Human-readable pickup address

-`destinationLatitude`: number - Destination latitude

-`destinationLongitude`: number - Destination longitude

-`destinationAddress`: string - Human-readable destination address

-`estimatedFare`: number - Pre-trip fare estimate (currency: USD cents)

-`actualFare`: number | null - Final fare after completion

-`estimatedDistance`: number - Distance in kilometers

-`requestedAt`: DateTime - Trip creation timestamp

-`driverAssignedAt`: DateTime | null - When driver accepted

-`startedAt`: DateTime | null - When trip began (driver arrived)

-`completedAt`: DateTime | null - When trip ended

-`cancelledAt`: DateTime | null - When trip was cancelled

-`cancellationReason`: string | null - Why trip was cancelled

**TypeScript Interface:**

```typescript

exportenumTripStatus {

REQUESTED = 'REQUESTED', // Passenger created request

DRIVER_ASSIGNED = 'DRIVER_ASSIGNED', // Driver accepted

IN_PROGRESS = 'IN_PROGRESS', // Driver picked up passenger

COMPLETED = 'COMPLETED', // Trip finished successfully

CANCELLED = 'CANCELLED', // Trip cancelled by passenger or driver

}


exportinterfaceTrip {

id: string;

passengerId: string;

driverId: string | null;

status: TripStatus;

pickupLatitude: number;

pickupLongitude: number;

pickupAddress: string;

destinationLatitude: number;

destinationLongitude: number;

destinationAddress: string;

estimatedFare: number; // USD cents

actualFare: number | null; // USD cents

estimatedDistance: number; // km

requestedAt: Date;

driverAssignedAt: Date | null;

startedAt: Date | null;

completedAt: Date | null;

cancelledAt: Date | null;

cancellationReason: string | null;

}


exportinterfaceTripDTOextendsTrip {

passenger?: UserDTO;

driver?: UserDTO;

rating?: RatingDTO;

}

```

**Relationships:**

- One Trip → One User (PASSENGER) - via passengerId
- One Trip → One User (DRIVER) - via driverId (nullable)
- One Trip → One Rating (optional, after completion)

**State Machine Transitions:**

```

REQUESTED → DRIVER_ASSIGNED → IN_PROGRESS → COMPLETED

    ↓              ↓              ↓

CANCELLED ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘

```

---

### **4.5 Rating Model**

**Purpose:** Post-trip feedback from passengers about driver service quality. Enables driver performance tracking and quality assurance.

**Key Attributes:**

-`id`: string (UUID) - Primary identifier

-`tripId`: string (UUID) - Foreign key to Trip (unique)

-`passengerId`: string (UUID) - Foreign key to User (PASSENGER)

-`driverId`: string (UUID) - Foreign key to User (DRIVER)

-`stars`: number - Rating value (1-5)

-`comment`: string | null - Optional text feedback

-`createdAt`: DateTime - Rating submission timestamp

**TypeScript Interface:**

```typescript

exportinterfaceRating {

id: string;

tripId: string;

passengerId: string;

driverId: string;

stars: number; // 1-5

comment: string | null;

createdAt: Date;

}


exportinterfaceRatingDTOextendsRating {

passenger?: UserDTO;

trip?: TripDTO;

}


// Driver aggregate rating stats

exportinterfaceDriverRatingStats {

driverId: string;

totalRatings: number;

averageRating: number; // 1.00 - 5.00

fiveStarCount: number;

fourStarCount: number;

threeStarCount: number;

twoStarCount: number;

oneStarCount: number;

}

```

**Relationships:**

- One Rating → One Trip (unique constraint)
- One Rating → One User (PASSENGER)
- One Rating → One User (DRIVER)

---

### **Detailed Rationale:**

**Design Decisions:**

1.**Single User table with role discriminator:**

-**Why:** Shared authentication logic, simpler user management

-**Alternative:** Separate Passenger and Driver tables

-**Trade-off:** Slight data redundancy (passengers don't need vehicle info) vs simplified auth

2.**DriverProfile separation:**

-**Why:** Not all User fields needed for passengers; cleaner separation of concerns

-**Benefit:** Can add driver-specific features without polluting User model

-**Database per Service:** UserService owns User + DriverProfile tables

3.**Redis for DriverLocation (not PostgreSQL):**

-**Why:** High write throughput (location updates every 5-10 seconds per active driver)

-**Why:** Geospatial queries (GEORADIUS) are native and fast

-**Trade-off:** Ephemeral data (acceptable - current location only matters while driver is active)

-**Persistence:** Can enable RDB snapshots in Phase 2 Reliability module

4.**Trip state machine:**

-**Why:** Clear business logic flow, prevents invalid state transitions

-**Implementation:** Enforce transitions in TripService business logic layer

-**Timestamps:** Separate fields (requestedAt, startedAt, completedAt) enable precise duration calculations

5.**Fare storage in cents:**

-**Why:** Avoid floating-point precision errors with currency

-**Pattern:** Store integers (cents), convert to dollars for display

-**Example:** $12.50 stored as 1250

6.**Rating as separate entity (not embedded in Trip):**

-**Why:** Ratings are optional and created after trip completion

-**Why:** Enables separate rating analytics queries without scanning all trips

-**Constraint:** One rating per trip (enforced by unique index on tripId)

7.**Nullable fields strategy:**

- Fields like `driverId`, `actualFare`, `completedAt` are nullable because they don't exist until specific state transitions
- Alternative: Separate tables per state (over-engineered for this scale)

8.**UUID vs Auto-increment IDs:**

- UUIDs chosen for distributed system safety (no ID collision between services)
- Trade-off: Larger storage (36 chars vs int) but better for microservices

**Data Ownership (Database per Service):**

-**UserService DB:** User, DriverProfile, Rating

-**TripService DB:** Trip

-**DriverService (Redis):** DriverLocation (ephemeral)

**Cross-Service Data Access:**

- Services expose APIs to fetch data (e.g., TripService calls UserService to get driver details)
- No direct database access between services (enforces microservices boundaries)

---

**Select 1-9 or just type your question/feedback:**

1.**Proceed to next section** (API Specification)

2.**Expand or Contract for Audience** - Adjust data modeling detail

3.**Explain Reasoning (CoT Step-by-Step)** - Deeper dive into modeling decisions

4.**Critique and Refine** - Challenge these data models

5.**Analyze Logical Flow and Dependencies** - Review model relationships

6.**Assess Alignment with Overall Goals** - Verify PRD user stories coverage

7.**Identify Potential Risks and Unforeseen Issues** - Data modeling risks?

8.**Challenge from Critical Perspective** - Devil's advocate on design choices

9.**Tree of Thoughts Deep Dive** - Explore alternative data modeling approaches

dieuxuanhien: 1

GitHub Copilot: Perfect! Moving to API Specification section.

---
