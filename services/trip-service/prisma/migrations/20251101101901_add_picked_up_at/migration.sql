-- AlterTable
CREATE SEQUENCE _prisma_health_check_id_seq;
ALTER TABLE "_prisma_health_check" ALTER COLUMN "id" SET DEFAULT nextval('_prisma_health_check_id_seq');
ALTER SEQUENCE _prisma_health_check_id_seq OWNED BY "_prisma_health_check"."id";

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "picked_up_at" TIMESTAMP(3);
