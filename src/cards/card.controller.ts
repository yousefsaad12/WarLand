import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthUser } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CardService } from './card.service.js';

@Controller()
export class CardController {
  constructor(private readonly cardService: CardService) {}

  @Get('cards')
  async getCards() {
    return await this.cardService.findAll();
  }

  @Get('players/me/cards')
  @UseGuards(AuthGuard)
  async getMyCards(@CurrentUser() user: AuthUser) {
    return await this.cardService.findOwnedByPlayer(user.sub);
  }
}
