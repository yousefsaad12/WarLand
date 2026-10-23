import { Injectable, OnModuleInit } from '@nestjs/common';
import { DbService } from '../prisma/db.js';
import {
  CARD_MAX_LEVEL,
  cardExpToNextLevel,
  STARTER_CARDS,
} from '../game/balance.js';

@Injectable()
export class CardService implements OnModuleInit {
  constructor(private readonly db: DbService) {}

  async onModuleInit() {
    await this.seedStarterCards();
  }

  async seedStarterCards() {
    for (const card of STARTER_CARDS) {
      await this.db.card.upsert({
        where: { id: card.cardId },
        update: {
          name: card.name,
          cost: card.cost,
          baseHp: card.hp,
          baseDamage: card.damage,
          attackSpeed: card.attackSpeed,
          movementSpeed: card.movementSpeed,
          range: card.range,
        },
        create: {
          id: card.cardId,
          name: card.name,
          cost: card.cost,
          baseHp: card.hp,
          baseDamage: card.damage,
          attackSpeed: card.attackSpeed,
          movementSpeed: card.movementSpeed,
          range: card.range,
        },
      });
    }
  }

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
