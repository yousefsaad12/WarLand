import { Module } from '@nestjs/common';
import { RedisService } from './redis.service.ts.js';

@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
