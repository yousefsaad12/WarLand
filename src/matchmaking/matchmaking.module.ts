// src/matchmaking/matchmaking.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MatchmakingService } from './matchmaking.service.js';
import { MatchmakingGateway } from './matchmaking.gateway.js';
import { RedisModule } from '../redis/redis.module.js';

@Module({
  imports: [AuthModule, RedisModule],
  controllers: [], // Removed MatchmakingController
  providers: [MatchmakingService, MatchmakingGateway],
})
export class MatchmakingModule {}
