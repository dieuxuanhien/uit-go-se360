-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PASSENGER', 'DRIVER');

-- CreateEnum
CREATE TYPE "DriverApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

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
CREATE TABLE "driver_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_make" TEXT NOT NULL,
    "vehicle_model" TEXT NOT NULL,
    "vehicle_year" INTEGER NOT NULL,
    "vehicle_plate" TEXT NOT NULL,
    "vehicle_color" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "approval_status" "DriverApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_user_id_key" ON "driver_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_vehicle_plate_key" ON "driver_profiles"("vehicle_plate");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_license_number_key" ON "driver_profiles"("license_number");

-- CreateIndex
CREATE INDEX "driver_profiles_user_id_idx" ON "driver_profiles"("user_id");

-- CreateIndex
CREATE INDEX "driver_profiles_approval_status_idx" ON "driver_profiles"("approval_status");

-- CreateIndex
CREATE INDEX "driver_profiles_vehicle_plate_idx" ON "driver_profiles"("vehicle_plate");

-- AddForeignKey
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
