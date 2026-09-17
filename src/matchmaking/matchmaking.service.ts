// src/matchmaking/matchmaking.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Server } from 'socket.io';
import { DbService } from '../prisma/db.js';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class MatchmakingService {
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
  ) {}

  async processMatchmaking(playerId: string, socketId: string, server: Server) {
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
    await this.joinMatchQueue(playerId, playerScore);

    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const POLL_INTERVAL_MS = 2000;    // Check every 2s
    const startTime = Date.now();
    let searchRange = 100;

    while (Date.now() - startTime < TIMEOUT_MS) {
      // Abort loop if player cancelled or disconnected (metadata removed)
      const isQueued = await this.redis.hexists(`matchmaking_meta:${playerId}`, 'joinedAt');
      if (!isQueued) return;

      const opponentId = await this.searchForMatch(playerId, playerScore, searchRange);

      if (opponentId) {
        const matchId = `match_${Date.now()}`;

        // Notify searching player
        server.to(socketId).emit('match_found', { matchId, opponentId });
        
        // Clean up metadata
        await this.leaveQueue(playerId);
        await this.leaveQueue(opponentId);
        return;
      }

      // Expand search tolerance over time
      searchRange += 25;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    // 5-minute timeout reached
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

  private async joinMatchQueue(playerId: string, playerScore: number) {
    const joinedAt = Date.now();

    await this.redis
      .multi()
      .zadd('matchmaking_queue', playerScore, playerId)
      .hset(`matchmaking_meta:${playerId}`, {
        joinedAt,
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

    return await this.redis.findAndClaimMatch(
      'matchmaking_queue',
      playerId,
      minScore,
      maxScore,
    );
  }

  async leaveQueue(playerId: string) {
    await this.redis
      .multi()
      .zrem('matchmaking_queue', playerId)
      .del(`matchmaking_meta:${playerId}`)
      .exec();
  }
}