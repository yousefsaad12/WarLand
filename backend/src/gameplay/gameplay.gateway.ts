import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
} from '@nestjs/websockets';
import { getWebSocketCorsOrigin } from '../common/ws/ws-cors.options.js';
import { Server, Socket } from 'socket.io';
import { GameplayService, type MatchRewards } from './gameplay.service.js';
import { JwtService } from '@nestjs/jwt';
import { createWsAuthMiddleware } from '../common/ws/ws-auth.middleware.js';
import {
  toMatchView,
  type DeployCommand,
  type MatchResult,
  type MatchState,
} from '../game/engine/engine.js';
import { DEFAULT_GAME_RULES } from '../game/balance.js';
import { OnModuleDestroy } from '@nestjs/common';

const TICK_INTERVAL_MS: number = 1000 / DEFAULT_GAME_RULES.ticksPerSecond;
const MAX_RESULT_SAVE_ATTEMPTS = 3;
@WebSocketGateway({
  namespace: '/gameplay',
  cors: { origin: getWebSocketCorsOrigin() },
})
export class GameplayGateway implements OnModuleDestroy, OnGatewayInit {
  @WebSocketServer()
  server: Server;
  private readonly commandsByMatch: Map<string, DeployCommand[]> = new Map();
  private readonly tickTimersByMatch: Map<
    string,
    ReturnType<typeof setInterval>
  > = new Map();

  constructor(
    private readonly gameplayService: GameplayService,
    private readonly jwtService: JwtService,
  ) {}

  onModuleDestroy() {
    this.gameplayService.setAbandonListener(null);
    for (const timer of this.tickTimersByMatch.values()) {
      clearInterval(timer);
    }

    this.tickTimersByMatch.clear();
    this.commandsByMatch.clear();
  }

  afterInit(server: Server) {
    server.use(createWsAuthMiddleware(this.jwtService));
    this.gameplayService.setAbandonListener((matchId) => {
      server.to(matchId).emit('game_error', {
        message:
          'Opponent failed to join in time. Return to lobby and queue again.',
      });
      const timer = this.tickTimersByMatch.get(matchId);
      if (timer) {
        clearInterval(timer);
        this.tickTimersByMatch.delete(matchId);
      }
      this.commandsByMatch.delete(matchId);
    });
  }

  @SubscribeMessage('join_game')
  async handleJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ) {
    try {
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('matchId' in payload) ||
        typeof payload.matchId !== 'string' ||
        !payload.matchId.trim()
      ) {
        client.emit('game_error', {
          message: 'A valid match ID is required.',
        });
        return;
      }

      const matchId = payload.matchId.trim();
      const playerId = client.data.playerId;
      console.info(
        `Player ${playerId} requested gameplay join for match ${matchId}.`,
      );

      const state = this.gameplayService.getMatchViewForPlayer(
        matchId,
        playerId,
      );

      const side = state.players.LEFT.playerId === playerId ? 'LEFT' : 'RIGHT';
      await client.join(matchId);
      client.data.matchId = matchId;
      client.emit('game_started', {
        matchId,
        side,
        state,
      });
      console.info(`Player ${playerId} joined match ${matchId} as ${side}.`);

      const roomSockets = await this.server.in(matchId).fetchSockets();
      const joinedPlayersIds = new Set(
        roomSockets.map((roomSocket) => roomSocket.data.playerId),
      );

      if (
        joinedPlayersIds.has(state.players.LEFT.playerId) &&
        joinedPlayersIds.has(state.players.RIGHT.playerId)
      ) {
        this.startMatchTickTimer(matchId);
      }
    } catch (error) {
      console.error('Failed to join gameplay match:', error);
      const message =
        error instanceof Error ? error.message : 'Could not join the game.';
      client.emit('game_error', { message });
    }
  }

  @SubscribeMessage('deploy')
  async handleDeploy(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ) {
    try {
      if (
        typeof client.data.matchId !== 'string' ||
        !client.data.matchId.trim() ||
        typeof client.data.playerId !== 'string' ||
        !client.data.playerId.trim()
      ) {
        client.emit('game_error', {
          message: 'Join a match before deploying a card.',
        });
        return;
      }

      if (
        !payload ||
        typeof payload !== 'object' ||
        !('cardId' in payload) ||
        typeof payload.cardId !== 'string' ||
        !payload.cardId.trim() ||
        !('requestId' in payload) ||
        typeof payload.requestId !== 'string' ||
        !payload.requestId.trim() ||
        !('x' in payload) ||
        typeof payload.x !== 'number' ||
        !Number.isFinite(payload.x) ||
        !('y' in payload) ||
        typeof payload.y !== 'number' ||
        !Number.isFinite(payload.y)
      ) {
        client.emit('game_error', {
          message:
            'A valid request ID, card ID, and finite x/y coordinates are required.',
        });
        return;
      }

      const matchId = client.data.matchId;
      const playerId = client.data.playerId;

      if (!this.gameplayService.isMatchRunning(matchId)) {
        client.emit('game_error', {
          message: 'This match is no longer running.',
        });
        return;
      }

      const commands = this.commandsByMatch.get(matchId) ?? [];
      const command: DeployCommand = {
        requestId: payload.requestId,
        playerId,
        cardId: payload.cardId,
        x: payload.x,
        y: payload.y,
      };

      if (commands.filter((cmd) => cmd.playerId === playerId).length >= 3) {
        client.emit('deploy_result', {
          requestId: payload.requestId,
          status: 'REJECTED',
          reason: 'TICK_DEPLOYMENT_LIMIT',
        });
        return;
      }
      commands.push(command);
      this.commandsByMatch.set(matchId, commands);

      client.emit('deploy_queued', {
        requestId: payload.requestId,
      });
    } catch (error) {
      console.error('Failed to handle card deployment:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Could not process the deployment request.';
      client.emit('game_error', { message });
    }
  }

  private startMatchTickTimer(matchId: string) {
    if (this.tickTimersByMatch.has(matchId)) {
      return;
    }

    this.gameplayService.markMatchJoined(matchId);

    const timer = setInterval(async () => {
      try {
        const commands = this.commandsByMatch.get(matchId) ?? [];
        const result = this.gameplayService.advanceMatchTick(matchId, commands);
        this.server.to(matchId).emit('game_state', toMatchView(result.state));

        for (const deployResult of result.deployResults) {
          this.server.to(matchId).emit('deploy_result', deployResult);
        }
        this.commandsByMatch.set(matchId, []);

        if (result.state.status !== 'RUNNING') {
          this.stopMatchTickTimer(matchId, timer);
          try {
            let rewards: MatchRewards | null = null;
            if (result.state.result) {
              rewards = await this.persistMatchResultWithRetry(
                matchId,
                result.state.result,
              );
            }
            await this.emitMatchFinished(matchId, result.state, rewards);
          } catch (error) {
            console.error(
              `Failed to persist result for match ${matchId}:`,
              error,
            );
            this.server.to(matchId).emit('game_error', {
              message: 'Could not save the match result.',
            });
          } finally {
            this.gameplayService.disposeMatch(matchId, result.state);
          }
        }
      } catch (error) {
        console.error(`Failed to advance gameplay match ${matchId}:`, error);
        this.stopMatchTickTimer(matchId, timer);
        this.gameplayService.disposeMatch(matchId);
        this.server.to(matchId).emit('game_error', {
          message:
            error instanceof Error
              ? error.message
              : 'Could not advance the game.',
        });
      }
    }, TICK_INTERVAL_MS);
    this.tickTimersByMatch.set(matchId, timer);
  }

  private stopMatchTickTimer(
    matchId: string,
    timer: ReturnType<typeof setInterval>,
  ) {
    clearInterval(timer);
    this.tickTimersByMatch.delete(matchId);
    this.commandsByMatch.delete(matchId);
  }

  private async persistMatchResultWithRetry(
    matchId: string,
    result: MatchResult,
  ): Promise<MatchRewards | null> {
    let attempts = 0;

    while (attempts < MAX_RESULT_SAVE_ATTEMPTS) {
      try {
        return await this.gameplayService.persistMatchResult(matchId, result);
      } catch (error) {
        attempts++;
        if (attempts >= MAX_RESULT_SAVE_ATTEMPTS) {
          console.error(
            `Failed to persist match result for match ${matchId}:`,
            error,
          );
          throw error;
        }
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    return null;
  }

  
  private async emitMatchFinished(
    matchId: string,
    matchState: MatchState,
    rewards: MatchRewards | null,
  ): Promise<void> {
    const result = rewards?.result ?? matchState.result;
    if (!result) return;

    const leftId = matchState.players.LEFT.playerId;
    const rightId = matchState.players.RIGHT.playerId;
    const sockets = await this.server.in(matchId).fetchSockets();

    for (const socket of sockets) {
      const playerId = socket.data.playerId as string | undefined;
      const side: 'LEFT' | 'RIGHT' | null =
        playerId === leftId
          ? 'LEFT'
          : playerId === rightId
            ? 'RIGHT'
            : null;

      socket.emit('match_finished', {
        result,
        rewards: rewards && side ? rewards.players[side] : null,
      });
    }
  }
}
