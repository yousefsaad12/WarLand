-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('WAITING', 'RUNNING', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchSide" AS ENUM ('PLAYER_1', 'PLAYER_2');

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "level" INTEGER NOT NULL DEFAULT 1,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "baseHp" INTEGER NOT NULL,
    "baseDamage" INTEGER NOT NULL,
    "attackSpeed" DOUBLE PRECISION NOT NULL,
    "movementSpeed" DOUBLE PRECISION NOT NULL,
    "range" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerCard" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PlayerCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'WAITING',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "side" "MatchSide" NOT NULL,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("matchId","playerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_username_key" ON "Player"("username");

-- CreateIndex
CREATE INDEX "Player_rating_idx" ON "Player"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "Player_displayName_tag_key" ON "Player"("displayName", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "Card_name_key" ON "Card"("name");

-- CreateIndex
CREATE INDEX "PlayerCard_playerId_idx" ON "PlayerCard"("playerId");

-- CreateIndex
CREATE INDEX "PlayerCard_cardId_idx" ON "PlayerCard"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerCard_playerId_cardId_key" ON "PlayerCard"("playerId", "cardId");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE INDEX "Match_winnerId_idx" ON "Match"("winnerId");

-- CreateIndex
CREATE INDEX "MatchPlayer_playerId_idx" ON "MatchPlayer"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_side_key" ON "MatchPlayer"("matchId", "side");

-- AddForeignKey
ALTER TABLE "PlayerCard" ADD CONSTRAINT "PlayerCard_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerCard" ADD CONSTRAINT "PlayerCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
