import { Module } from '@nestjs/common';
import { RedisService } from './redis.js';

@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
