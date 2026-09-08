import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthUser } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PlayerService } from './player.service.js';

@Controller()
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Get('players/me')
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() user: AuthUser) {
    return this.playerService.findMe(user.sub);
  }

  @Get('players/:displayName/:tag')
  getPlayer(
    @Param('displayName') displayName: string,
    @Param('tag') tag: string,
  ) {
    return this.playerService.findByIdentity(displayName, tag);
  }

  @Get('players/:displayName/:tag/stats')
  getStats(
    @Param('displayName') displayName: string,
    @Param('tag') tag: string,
  ) {
    return this.playerService.getStatsByIdentity(displayName, tag);
  }

  @Get('leaderboard')
  getLeaderboard(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.playerService.getLeaderboard(Math.min(limit ?? 100, 100));
  }
}
