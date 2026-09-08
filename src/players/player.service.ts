import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../prisma/db.js';

@Injectable()
export class PlayerService {
  constructor(private readonly db: DbService) {}

  async findMe(id: string) {
    return this.findById(id);
  }

  async findById(id: string) {
    const player = await this.db.player.findUnique({
      where: { id },
      select: this.profileSelect,
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return this.toProfile(player);
  }

  async findByIdentity(displayName: string, tag: string) {
    const player = await this.db.player.findUnique({
      where: {
        displayName_tag: { displayName, tag },
      },
      select: this.profileSelect,
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return this.toProfile(player);
  }

  async getStats(id: string) {
    const player = await this.db.player.findUnique({
      where: { id },
      select: this.statsSelect,
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return this.toStats(player);
  }

  async getStatsByIdentity(displayName: string, tag: string) {
    const player = await this.db.player.findUnique({
      where: {
        displayName_tag: { displayName, tag },
      },
      select: this.statsSelect,
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return this.toStats(player);
  }

  async getLeaderboard(limit = 100) {
    const players = await this.db.player.findMany({
      orderBy: [{ rating: 'desc' }, { wins: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      select: this.statsSelect,
    });

    return players.map((player, index) => ({
      rank: index + 1,
      ...this.toStats(player),
    }));
  }

  private readonly profileSelect = {
    id: true,
    displayName: true,
    tag: true,
    rating: true,
    level: true,
    wins: true,
    losses: true,
    createdAt: true,
    playerCards: {
      orderBy: { card: { name: 'asc' as const } },
      select: {
        level: true,
        card: {
          select: {
            id: true,
            name: true,
            cost: true,
            baseHp: true,
            baseDamage: true,
            attackSpeed: true,
            movementSpeed: true,
            range: true,
          },
        },
      },
    },
  } as const;

  private readonly statsSelect = {
    id: true,
    displayName: true,
    tag: true,
    rating: true,
    level: true,
    wins: true,
    losses: true,
  } as const;

  private toProfile(player: {
    id: string;
    displayName: string;
    tag: string;
    rating: number;
    level: number;
    wins: number;
    losses: number;
    createdAt: Date;
    playerCards: Array<{
      level: number;
      card: {
        id: string;
        name: string;
        cost: number;
        baseHp: number;
        baseDamage: number;
        attackSpeed: number;
        movementSpeed: number;
        range: number;
      };
    }>;
  }) {
    return {
      id: player.id,
      displayName: player.displayName,
      tag: player.tag,
      rating: player.rating,
      level: player.level,
      wins: player.wins,
      losses: player.losses,
      winRate: this.winRate(player.wins, player.losses),
      createdAt: player.createdAt,
      deck: player.playerCards,
    };
  }

  private toStats(player: {
    id: string;
    displayName: string;
    tag: string;
    rating: number;
    level: number;
    wins: number;
    losses: number;
  }) {
    return {
      id: player.id,
      displayName: player.displayName,
      tag: player.tag,
      rating: player.rating,
      level: player.level,
      wins: player.wins,
      losses: player.losses,
      winRate: this.winRate(player.wins, player.losses),
    };
  }

  private winRate(wins: number, losses: number) {
    const games = wins + losses;
    return games === 0 ? 0 : Math.round((wins / games) * 100);
  }
}
