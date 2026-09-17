// src/matchmaking/matchmaking.service.ts
import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { DbService } from '../prisma/db.js';
import { RedisService } from '../redis/redis.service.js';

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 2000;

@Injectable()
export class MatchmakingService {
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
  ) {}

  async processMatchmaking(playerId: string, socketId: string, server: Server) {
    try {
      await this.processMatchmakingInternal(playerId, socketId, server);
    } catch (error) {
      console.error(`Matchmaking failed for player ${playerId}:`, error);

      try {
        await this.leaveQueue(playerId);
      } catch (cleanupError) {
        console.error(
          `Failed to clean up queue for player ${playerId}:`,
          cleanupError,
        );
      }

      server.to(socketId).emit('match_error', {
        message: 'Matchmaking failed, please try again',
      });
    }
  }

  private async processMatchmakingInternal(
    playerId: string,
    socketId: string,
    server: Server,
  ) {
    const player = await this.db.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        displayName: true,
        tag: true,
        level: true,
        rating: true,
        playerCards: {
          select: { level: true },
        },
      },
    });

    if (!player) {
      server.to(socketId).emit('match_error', { message: 'Player not found' });
      return;
    }

    const playerScore = this.calculatePlayerScore(player);
    await this.joinMatchQueue(playerId, playerScore, socketId);

    const startTime = Date.now();

    while (Date.now() - startTime < TIMEOUT_MS) {
      // Abort loop if player cancelled or disconnected (metadata removed)
      const isQueued = await this.redis.hexists(
        `matchmaking_meta:${playerId}`,
        'joinedAt',
      );
      if (!isQueued) return;

      const elapsedMs = Date.now() - startTime;
      const searchRange = this.getSearchRange(elapsedMs);
      const match = await this.searchForMatch(
        playerId,
        playerScore,
        searchRange,
      );

      if (match) {
        // TODO: replace with your actual Match/MatchPlayers Prisma schema once finalized
        const matchId = `match_${Date.now()}`; // placeholder until db.match.create() is wired up

        server.to(socketId).emit('match_found', {
          matchId,
          opponentId: match.opponentId,
        });
        if (match.opponentSocketId) {
          server.to(match.opponentSocketId).emit('match_found', {
            matchId,
            opponentId: playerId,
          });
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    await this.leaveQueue(playerId);
    server.to(socketId).emit('match_timeout', {
      message: 'No opponent found within 5 minutes.',
    });
  }

  private calculatePlayerScore(player: {
    rating: number;
    level: number;
    playerCards: { level: number }[];
  }): number {
    const avgCardLevel =
      player.playerCards.length > 0
        ? player.playerCards.reduce((sum, card) => sum + card.level, 0) /
          player.playerCards.length
        : 0;

    return player.rating + avgCardLevel * 20 + player.level * 5;
  }

  private async joinMatchQueue(
    playerId: string,
    playerScore: number,
    socketId: string,
  ) {
    const joinedAt = Date.now();

    await this.redis
      .multi()
      .zadd('matchmaking_queue', playerScore, playerId)
      .hset(`matchmaking_meta:${playerId}`, {
        joinedAt,
        socketId,
      })
      .exec();
  }

  private async searchForMatch(
    playerId: string,
    playerScore: number,
    searchRange: number,
  ) {
    const minScore = playerScore - searchRange;
    const maxScore = playerScore + searchRange;

    const result = await this.redis.findAndClaimMatch(
      'matchmaking_queue',
      playerId,
      minScore,
      maxScore,
    );

    if (!result || result.length < 2) return null;

    return {
      opponentId: result[0],
      opponentSocketId: result[1],
    };
  }

  async leaveQueue(playerId: string) {
    await this.redis
      .multi()
      .zrem('matchmaking_queue', playerId)
      .del(`matchmaking_meta:${playerId}`)
      .exec();
  }

  private getSearchRange(elapsedMs: number): number {
    if (elapsedMs < 30_000) return 20;
    if (elapsedMs < 60_000) return 60;
    if (elapsedMs < 120_000) return 140;
    return 300;
  }
}
