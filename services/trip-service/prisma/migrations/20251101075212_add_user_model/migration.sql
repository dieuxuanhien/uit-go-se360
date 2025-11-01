-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PASSENGER', 'DRIVER');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('REQUESTED', 'FINDING_DRIVER', 'NO_DRIVERS_AVAILABLE', 'DRIVER_ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "_prisma_health_check" (
    "id" SERIAL NOT NULL,

    CONSTRAINT "_prisma_health_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

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

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_notifications" ADD CONSTRAINT "driver_notifications_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
