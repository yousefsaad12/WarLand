import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import { DbService } from '../prisma/db.js';
import { ActivePlayers } from '../matchmaking/active-players.store.js';
import { DEFAULT_GAME_RULES } from '../game/balance.js';
import {
  GAME_SIDE,
  advanceMatch,
  createMatchState,
  toMatchView,
  type CardSnapshot,
  type DeployCommand,
  type GameSide,
  type MatchState,
} from '../game/engine/engine.js';

const MAX_PENDING_DEPLOYS_PER_PLAYER = 3;

interface ActiveMatch {
  state: MatchState;
  playerSockets: Map<string, string>;
  pendingCommands: DeployCommand[];
  timer: ReturnType<typeof setInterval>;
  finishing: boolean;
  persistingResult: boolean;
  finishAttempts: number;
  finishRetryTimer?: ReturnType<typeof setTimeout>;
}

@Injectable()
export class GameplayService implements OnModuleDestroy {
  private readonly logger = new Logger(GameplayService.name);
  private readonly matches = new Map<string, ActiveMatch>();
  private readonly matchByPlayer = new Map<string, string>();
  private server?: Namespace;

  constructor(
    private readonly db: DbService,
    private readonly activePlayers: ActivePlayers,
  ) {}

  setNamespace(server: Namespace): void {
    this.server = server;
  }

  async startMatch(
    matchId: string,
    leftPlayerId: string,
    rightPlayerId: string,
  ): Promise<void> {
    const [left, right] = await Promise.all([
      this.loadPlayerSetup(leftPlayerId),
      this.loadPlayerSetup(rightPlayerId),
    ]);
    const state = createMatchState(matchId, left, right, DEFAULT_GAME_RULES);
    const timer = setInterval(
      () => this.advance(matchId),
      1000 / DEFAULT_GAME_RULES.ticksPerSecond,
    );

    this.matches.set(matchId, {
      state,
      playerSockets: new Map(),
      pendingCommands: [],
      timer,
      finishing: false,
      persistingResult: false,
      finishAttempts: 0,
    });
    this.matchByPlayer.set(leftPlayerId, matchId);
    this.matchByPlayer.set(rightPlayerId, matchId);
  }

  joinMatch(
    playerId: string,
    matchId: string,
    socketId: string,
  ):
    | { matchId: string; side: GameSide; state: ReturnType<typeof toMatchView> }
    | undefined {
    const match = this.matches.get(matchId);
    if (!match || match.state.status !== 'RUNNING') {
      return undefined;
    }
    const side = this.findPlayerSide(match.state, playerId);
    if (!side || match.playerSockets.has(playerId)) {
      return undefined;
    }

    match.playerSockets.set(playerId, socketId);
    return { matchId, side, state: toMatchView(match.state) };
  }

  queueDeployment(
    playerId: string,
    socketId: string,
    deployment: Omit<DeployCommand, 'playerId'>,
  ): 'QUEUED' | 'NOT_IN_MATCH' | 'RATE_LIMITED' {
    const matchId = this.matchByPlayer.get(playerId);
    const match = matchId ? this.matches.get(matchId) : undefined;
    if (
      !match ||
      match.state.status !== 'RUNNING' ||
      match.playerSockets.get(playerId) !== socketId
    ) {
      return 'NOT_IN_MATCH';
    }

    const pendingForPlayer = match.pendingCommands.filter(
      (command) => command.playerId === playerId,
    ).length;
    if (pendingForPlayer >= MAX_PENDING_DEPLOYS_PER_PLAYER) {
      return 'RATE_LIMITED';
    }

    match.pendingCommands.push({ ...deployment, playerId });
    return 'QUEUED';
  }

  onModuleDestroy(): void {
    for (const match of this.matches.values()) {
      clearInterval(match.timer);
      if (match.finishRetryTimer) {
        clearTimeout(match.finishRetryTimer);
      }
    }
  }

  private async loadPlayerSetup(playerId: string) {
    const player = await this.db.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        playerCards: {
          orderBy: { card: { name: 'asc' } },
          select: {
            level: true,
            card: {
              select: {
                id: true,
                name: true,
                cost: true,
                baseHp: true,
                baseDamage: true,
                attackSpeed: true,
                movementSpeed: true,
                range: true,
              },
            },
          },
        },
      },
    });
    if (!player) {
      throw new Error(
        `Player ${playerId} was not found when starting the match.`,
      );
    }

    const cards: CardSnapshot[] = player.playerCards.map(({ level, card }) => ({
      cardId: card.id,
      name: card.name,
      level,
      cost: card.cost,
      hp: card.baseHp,
      damage: card.baseDamage,
      attackSpeed: card.attackSpeed,
      movementSpeed: card.movementSpeed,
      range: card.range,
    }));
    return { playerId: player.id, cards };
  }

  private advance(matchId: string): void {
    const match = this.matches.get(matchId);
    if (!match || match.state.status !== 'RUNNING') {
      return;
    }

    try {
      const commands = match.pendingCommands.splice(0);
      const result = advanceMatch(match.state, commands);
      match.state = result.state;
      this.server
        ?.to(this.room(matchId))
        .emit('game_state', toMatchView(match.state));
      result.deployResults.forEach((deployResult) => {
        this.server?.to(this.room(matchId)).emit('deploy_result', deployResult);
      });

      if (match.state.status === 'FINISHED' && !match.finishing) {
        match.finishing = true;
        clearInterval(match.timer);
        void this.finishMatch(matchId, match);
      }
    } catch (error) {
      clearInterval(match.timer);
      this.logger.error(
        `Stopped match ${matchId} after a game tick failed.`,
        error instanceof Error ? error.stack : String(error),
      );
      this.server?.to(this.room(matchId)).emit('game_error', {
        message: 'The server could not advance this match.',
      });
    }
  }

  private async finishMatch(
    matchId: string,
    match: ActiveMatch,
  ): Promise<void> {
    if (match.persistingResult) {
      return;
    }
    match.persistingResult = true;

    try {
      const result = match.state.result;
      if (!result) {
        throw new Error(`Finished match ${matchId} has no result.`);
      }

      const winnerId =
        result.winner === GAME_SIDE.LEFT
          ? match.state.players.LEFT.playerId
          : result.winner === GAME_SIDE.RIGHT
            ? match.state.players.RIGHT.playerId
            : undefined;

      await this.db.$transaction(async (transaction) => {
        const existingMatch = await transaction.match.findUnique({
          where: { id: matchId },
          select: { status: true },
        });
        if (!existingMatch) {
          throw new Error(`Match ${matchId} no longer exists.`);
        }
        if (existingMatch.status === 'FINISHED') {
          return;
        }

        await transaction.match.update({
          where: { id: matchId },
          data: {
            status: 'FINISHED',
            endedAt: new Date(),
          },
        });

        if (winnerId) {
          await transaction.matchPlayer.update({
            where: { matchId_playerId: { matchId, playerId: winnerId } },
            data: { isWinner: true },
          });
          await transaction.player.update({
            where: { id: winnerId },
            data: { wins: { increment: 1 } },
          });

          const loserId =
            winnerId === match.state.players.LEFT.playerId
              ? match.state.players.RIGHT.playerId
              : match.state.players.LEFT.playerId;
          await transaction.player.update({
            where: { id: loserId },
            data: { losses: { increment: 1 } },
          });
        }
      });

      this.server
        ?.to(this.room(matchId))
        .emit('match_finished', { matchId, result });
      if (match.finishRetryTimer) {
        clearTimeout(match.finishRetryTimer);
      }
      this.activePlayers.removePlayer(match.state.players.LEFT.playerId);
      this.activePlayers.removePlayer(match.state.players.RIGHT.playerId);
      this.matchByPlayer.delete(match.state.players.LEFT.playerId);
      this.matchByPlayer.delete(match.state.players.RIGHT.playerId);
      this.matches.delete(matchId);
    } catch (error) {
      this.logger.error(
        `Could not persist finished match ${matchId}.`,
        error instanceof Error ? error.stack : String(error),
      );
      this.server?.to(this.room(matchId)).emit('game_error', {
        message: 'The match ended, but its result could not be saved.',
      });
      match.finishAttempts += 1;
      const retryDelay = Math.min(1000 * 2 ** match.finishAttempts, 30_000);
      match.finishRetryTimer = setTimeout(() => {
        match.finishRetryTimer = undefined;
        void this.finishMatch(matchId, match);
      }, retryDelay);
    } finally {
      match.persistingResult = false;
    }
  }

  private findPlayerSide(
    state: MatchState,
    playerId: string,
  ): GameSide | undefined {
    if (state.players.LEFT.playerId === playerId) {
      return GAME_SIDE.LEFT;
    }
    if (state.players.RIGHT.playerId === playerId) {
      return GAME_SIDE.RIGHT;
    }
    return undefined;
  }

  private room(matchId: string): string {
    return `match:${matchId}`;
  }
}
