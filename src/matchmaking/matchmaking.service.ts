import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../prisma/db.js';
import { RedisService } from '../redis/redis.js';
@Injectable()
export class MatchmakingService {
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
  ) {}

  async joinMatchmaking(playerId: string) {
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
      throw new NotFoundException('Player not found');
    }

    const playerScore = this.calculatePlayerScore(player);
    await this.joinMatchQueue(playerId, playerScore);

    const opponentId = await this.searchForMatch(playerId, playerScore, 100);
    if (!opponentId) {
      return {
        status: 'waiting',
      };
    }

    await this.removeFromMatchQueue(playerId);
    await this.removeFromMatchQueue(opponentId);

    return {
      status: 'matched',
      opponentId,
    };
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

    const candidates = await this.redis.zrangebyscore(
      'matchmaking_queue',
      minScore,
      maxScore,
    );

    return candidates.find((id) => id !== playerId) ?? null;
  }

  private async removeFromMatchQueue(playerId: string) {
    await this.redis
      .multi()
      .zrem('matchmaking_queue', playerId)
      .del(`matchmaking_meta:${playerId}`)
      .exec();
  }
}
