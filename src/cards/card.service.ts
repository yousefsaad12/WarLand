import { Injectable } from '@nestjs/common';
import { DbService } from '../prisma/db.js';
import { CARD_MAX_LEVEL, cardExpToNextLevel } from '../game/balance.js';

@Injectable()
export class CardService {
  constructor(private readonly db: DbService) {}

  async findAll() {
    return await this.db.card.findMany({
      orderBy: { name: 'asc' },
      select: this.cardSelect,
    });
  }

  async findOwnedByPlayer(playerId: string) {
    const owned = await this.db.playerCard.findMany({
      where: { playerId },
      orderBy: { card: { name: 'asc' } },
      select: {
        level: true,
        exp: true,
        card: {
          select: this.cardSelect,
        },
      },
    });

    return owned.map((entry) => ({
      ...entry,
      expToNext: cardExpToNextLevel(entry.level),
      maxed: entry.level >= CARD_MAX_LEVEL,
    }));
  }

  private readonly cardSelect = {
    id: true,
    name: true,
    cost: true,
    baseHp: true,
    baseDamage: true,
    attackSpeed: true,
    movementSpeed: true,
    range: true,
  } as const;
}
