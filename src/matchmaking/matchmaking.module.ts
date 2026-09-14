import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MatchmakingService } from './matchmaking.service.js';
import { MatchmakingController } from './matchmaking.controller.js';
import { RedisModule } from '../redis/redis.module.js';

@Module({
  imports: [AuthModule, RedisModule],
  controllers: [MatchmakingController],
  providers: [MatchmakingService],
})
export class MatchmakingModule {}
