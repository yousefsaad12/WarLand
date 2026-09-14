import { Controller, Post, UseGuards } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service.js';
import { AuthGuard, type AuthUser } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

@Controller('matchmaking')
export class MatchmakingController {
  constructor(private readonly matchmakingService: MatchmakingService) {}

  @Post('/join')
  @UseGuards(AuthGuard)
  async joinMatchmaking(@CurrentUser() user: AuthUser) {
    return await this.matchmakingService.joinMatchmaking(user.sub);
  }
}
