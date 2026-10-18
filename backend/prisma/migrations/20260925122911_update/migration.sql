/*
  Warnings:

  - The values [WAITING,RUNNING,CANCELLED] on the enum `MatchStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `updatedAt` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `winnerId` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `side` on the `MatchPlayer` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MatchStatus_new" AS ENUM ('PLAYING', 'FINISHED');
ALTER TABLE "public"."Match" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Match" ALTER COLUMN "status" TYPE "MatchStatus_new" USING ("status"::text::"MatchStatus_new");
ALTER TYPE "MatchStatus" RENAME TO "MatchStatus_old";
ALTER TYPE "MatchStatus_new" RENAME TO "MatchStatus";
DROP TYPE "public"."MatchStatus_old";
ALTER TABLE "Match" ALTER COLUMN "status" SET DEFAULT 'PLAYING';
COMMIT;

-- DropIndex
DROP INDEX "Match_winnerId_idx";

-- DropIndex
DROP INDEX "MatchPlayer_matchId_side_key";

-- AlterTable
ALTER TABLE "Match" DROP COLUMN "updatedAt",
DROP COLUMN "winnerId",
ALTER COLUMN "status" SET DEFAULT 'PLAYING';

-- AlterTable
ALTER TABLE "MatchPlayer" DROP COLUMN "side",
ADD COLUMN     "isWinner" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "MatchSide";

-- CreateIndex
CREATE INDEX "Match_createdAt_idx" ON "Match"("createdAt");

-- CreateIndex
CREATE INDEX "MatchPlayer_matchId_isWinner_idx" ON "MatchPlayer"("matchId", "isWinner");
