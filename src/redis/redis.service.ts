import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RedisService
  extends Redis
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super(process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.on('connect', () => console.log('✅ Redis connected'));
    this.on('error', (err) => console.error('❌ Redis connection error:', err));
  }

  onModuleInit() {
    const scriptPath = path.join(import.meta.dirname, 'lua/match.lua');
    const script = fs.readFileSync(scriptPath, 'utf-8');

    this.defineCommand('findAndClaimMatch', {
      numberOfKeys: 1,
      lua: script,
    });
  }

  onModuleDestroy() {
    this.quit();
  }

  declare findAndClaimMatch: (
    queueKey: string,
    playerId: string,
    minScore: number,
    maxScore: number,
  ) => Promise<string[] | null>;
}
