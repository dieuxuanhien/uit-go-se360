-- Story 2.2: Database Read Scaling - Performance Index
-- Migration: Add composite index for read-heavy trip history query

-- CRITICAL: Index for trip history queries (GET /trips?passengerId={id})
-- Query: WHERE passengerId ORDER BY createdAt DESC
-- This is the MOST FREQUENT read query (90%+ of all reads)
-- Existing single-column index on passenger_id is insufficient for ORDER BY optimization
CREATE INDEX IF NOT EXISTS "idx_trips_passenger_created" ON "trips"("passenger_id", "created_at" DESC);

-- Note: Other indexes already exist in Prisma schema:
-- - @@index([passengerId]) - existing
-- - @@index([driverId]) - existing  
-- - @@index([status]) - existing
-- - @@index([passengerId, status]) - existing
-- - @@index([driverId, status]) - existing
-- All driver_notifications indexes already exist in schema
