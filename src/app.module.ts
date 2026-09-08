import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PlayerModule } from './players/player.module.js';

@Module({
  imports: [PrismaModule, AuthModule, PlayerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
