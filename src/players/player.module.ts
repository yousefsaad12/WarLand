import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PlayerController } from './player.controller.js';
import { PlayerService } from './player.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PlayerController],
  providers: [PlayerService],
})
export class PlayerModule {}
