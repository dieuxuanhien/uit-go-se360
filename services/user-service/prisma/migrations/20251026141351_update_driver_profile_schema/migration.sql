/*
  Warnings:

  - You are about to drop the column `vehicle_info` on the `driver_profiles` table. All the data in the column will be lost.
  - The `approval_status` column on the `driver_profiles` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[vehicle_plate]` on the table `driver_profiles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[license_number]` on the table `driver_profiles` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `vehicle_color` to the `driver_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicle_make` to the `driver_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicle_model` to the `driver_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicle_plate` to the `driver_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicle_year` to the `driver_profiles` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DriverApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "driver_profiles" DROP COLUMN "vehicle_info",
ADD COLUMN     "vehicle_color" TEXT NOT NULL,
ADD COLUMN     "vehicle_make" TEXT NOT NULL,
ADD COLUMN     "vehicle_model" TEXT NOT NULL,
ADD COLUMN     "vehicle_plate" TEXT NOT NULL,
ADD COLUMN     "vehicle_year" INTEGER NOT NULL,
DROP COLUMN "approval_status",
ADD COLUMN     "approval_status" "DriverApprovalStatus" NOT NULL DEFAULT 'PENDING';

-- DropEnum
DROP TYPE "ApprovalStatus";

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
