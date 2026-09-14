import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor() {
    super(process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.on('connect', () => console.log('✅ Redis connected'));
    this.on('error', (err) => console.error('❌ Redis connection error:', err));
  }

  onModuleDestroy() {
    this.disconnect();
  }
}
