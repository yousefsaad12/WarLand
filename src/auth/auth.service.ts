import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { hash, compare } from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { DbService } from '../prisma/db.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await hash(dto.password, 12);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const player = await this.db.player.create({
          data: {
            username: dto.username,
            displayName: dto.displayName,
            tag: await this.generateUniqueTag(dto.displayName),
            passwordHash,
          },
          select: this.publicPlayerSelect,
        });

        return this.withToken(player);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('Could not generate a unique player tag');
  }

  async login(dto: LoginDto) {
    const player = await this.db.player.findUnique({
      where: { username: dto.username },
      select: {
        ...this.publicPlayerSelect,
        passwordHash: true,
      },
    });

    if (!player || !(await compare(dto.password, player.passwordHash))) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const { passwordHash: _passwordHash, ...publicPlayer } = player;
    return this.withToken(publicPlayer);
  }

  async findPublicPlayer(id: string) {
    const player = await this.db.player.findUnique({
      where: { id },
      select: this.publicPlayerSelect,
    });

    if (!player) {
      throw new UnauthorizedException('Player no longer exists');
    }

    return player;
  }

  private readonly publicPlayerSelect = {
    id: true,
    username: true,
    displayName: true,
    tag: true,
    rating: true,
    level: true,
    wins: true,
    losses: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private async withToken(player: { id: string; username: string }) {
    return {
      accessToken: await this.jwtService.signAsync({
        sub: player.id,
        username: player.username,
      }),
      player,
    };
  }

  private async generateUniqueTag(displayName: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const tag = randomInt(1000, 10000).toString();
      const existingPlayer = await this.db.player.findUnique({
        where: {
          displayName_tag: { displayName, tag },
        },
        select: { id: true },
      });

      if (!existingPlayer) {
        return tag;
      }
    }

    throw new ConflictException('Could not generate a unique player tag');
  }
}
