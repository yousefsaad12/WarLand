import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ActivePlayers } from '../matchmaking/active-players.store.js';
import { GameplayGateway } from './gameplay.gateway.js';
import { GameplayService } from './gameplay.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  providers: [ActivePlayers, GameplayGateway, GameplayService],
  exports: [ActivePlayers, GameplayService],
})
export class GameplayModule {}
