import { Injectable } from '@nestjs/common';
import { DbService } from '../prisma/db.js';

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
    return await this.db.playerCard.findMany({
      where: { playerId },
      orderBy: { card: { name: 'asc' } },
      select: {
        level: true,
        card: {
          select: this.cardSelect,
        },
      },
    });
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
