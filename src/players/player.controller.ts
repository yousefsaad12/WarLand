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
  async getMe(@CurrentUser() user: AuthUser) {
    return await this.playerService.findMe(user.sub);
  }

  @Get('players/:displayName/:tag')
  async getPlayer(
    @Param('displayName') displayName: string,
    @Param('tag') tag: string,
  ) {
    return await this.playerService.findByIdentity(displayName, tag);
  }

  @Get('players/:displayName/:tag/stats')
  async getStats(
    @Param('displayName') displayName: string,
    @Param('tag') tag: string,
  ) {
    return await this.playerService.getStatsByIdentity(displayName, tag);
  }

  @Get('leaderboard')
  async getLeaderboard(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return await this.playerService.getLeaderboard(Math.min(limit ?? 100, 100));
  }
}
