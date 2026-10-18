import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CardModule } from './cards/card.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PlayerModule } from './players/player.module.js';
import { MatchmakingModule } from './matchmaking/matchmaking.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PlayerModule,
    CardModule,
    MatchmakingModule,
    RedisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
