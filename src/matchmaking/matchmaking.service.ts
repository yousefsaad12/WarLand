import { Injectable } from '@nestjs/common';
import { DbService } from '../prisma/db.js';
@Injectable()
export class MatchmakingService {
  constructor(private readonly db: DbService) {}
  async joinMatchmaking(playerId: string) {
    const player = await this.db.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        displayName: true,
        tag: true,
        level: true,
        rating: true,
        PlayerCards: {
          select: { level: true },
        },
      },
    });

    const playerScore = this.calculatePlayerScore(player);
  }

  private calculatePlayerScore(player: any): number {
    const avgCardLevel =
      player.playerCards.reduce(
        (sum: number, card: { level: number }) => sum + card.level,
        0,
      ) / player.playerCards.length;
    return player.rating + avgCardLevel * 20 + player.level * 5;
  }
}
