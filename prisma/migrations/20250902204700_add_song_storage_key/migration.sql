-- AlterTable
ALTER TABLE "public"."SongJob" ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "mime" TEXT,
ADD COLUMN     "storageKey" TEXT;
