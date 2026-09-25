/*
  Warnings:

  - Made the column `startedAt` on table `Match` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Match" ALTER COLUMN "startedAt" SET NOT NULL,
ALTER COLUMN "startedAt" SET DEFAULT CURRENT_TIMESTAMP;
