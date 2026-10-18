import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CardController } from './card.controller.js';
import { CardService } from './card.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CardController],
  providers: [CardService],
})
export class CardModule {}
