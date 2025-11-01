-- AlterEnum
ALTER TYPE "TripStatus" ADD VALUE 'ARRIVED_AT_PICKUP';

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "arrived_at" TIMESTAMP(3);
