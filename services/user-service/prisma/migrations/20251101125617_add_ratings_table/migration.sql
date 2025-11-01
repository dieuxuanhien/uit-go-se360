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
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
