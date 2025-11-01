-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('REQUESTED', 'FINDING_DRIVER', 'NO_DRIVERS_AVAILABLE', 'DRIVER_ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "_prisma_health_check" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "_prisma_health_check_pkey" PRIMARY KEY ("id")
);

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
    "arrived_at" TIMESTAMP(3),
    "picked_up_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_notifications" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "notified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "driver_notifications_trip_id_idx" ON "driver_notifications"("trip_id");

-- CreateIndex
CREATE INDEX "driver_notifications_driver_id_idx" ON "driver_notifications"("driver_id");

-- CreateIndex
CREATE INDEX "driver_notifications_status_idx" ON "driver_notifications"("status");

-- CreateIndex
CREATE INDEX "driver_notifications_notified_at_idx" ON "driver_notifications"("notified_at");

-- CreateIndex
CREATE INDEX "driver_notifications_trip_id_status_idx" ON "driver_notifications"("trip_id", "status");

-- CreateIndex
CREATE INDEX "driver_notifications_driver_id_status_idx" ON "driver_notifications"("driver_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_trip_id_key" ON "ratings"("trip_id");

-- CreateIndex
CREATE INDEX "ratings_trip_id_idx" ON "ratings"("trip_id");

-- CreateIndex
CREATE INDEX "ratings_passenger_id_idx" ON "ratings"("passenger_id");

-- CreateIndex
CREATE INDEX "ratings_driver_id_idx" ON "ratings"("driver_id");

-- CreateIndex
CREATE INDEX "ratings_created_at_idx" ON "ratings"("created_at");

-- CreateIndex
CREATE INDEX "ratings_stars_idx" ON "ratings"("stars");

-- AddForeignKey
ALTER TABLE "driver_notifications" ADD CONSTRAINT "driver_notifications_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
