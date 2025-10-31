-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('REQUESTED', 'DRIVER_ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable
CREATE SEQUENCE _prisma_health_check_id_seq;
ALTER TABLE "_prisma_health_check" ALTER COLUMN "id" SET DEFAULT nextval('_prisma_health_check_id_seq');
ALTER SEQUENCE _prisma_health_check_id_seq OWNED BY "_prisma_health_check"."id";

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'REQUESTED',
    "pickup_latitude" DECIMAL(10,8) NOT NULL,
    "pickup_longitude" DECIMAL(11,8) NOT NULL,
    "pickup_address" TEXT NOT NULL,
    "destination_latitude" DECIMAL(10,8) NOT NULL,
    "destination_longitude" DECIMAL(11,8) NOT NULL,
    "destination_address" TEXT NOT NULL,
    "estimated_fare" INTEGER NOT NULL,
    "actual_fare" INTEGER,
    "estimated_distance" DECIMAL(10,2) NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "driver_assigned_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trips_passenger_id_idx" ON "trips"("passenger_id");

-- CreateIndex
CREATE INDEX "trips_driver_id_idx" ON "trips"("driver_id");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX "trips_requested_at_idx" ON "trips"("requested_at");

-- CreateIndex
CREATE INDEX "trips_completed_at_idx" ON "trips"("completed_at");

-- CreateIndex
CREATE INDEX "trips_passenger_id_status_idx" ON "trips"("passenger_id", "status");

-- CreateIndex
CREATE INDEX "trips_driver_id_status_idx" ON "trips"("driver_id", "status");
