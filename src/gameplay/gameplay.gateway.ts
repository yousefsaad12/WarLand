import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { getWebSocketCorsOrigin } from '../auth/ws-cors.options.js';
import { Server, Socket } from 'socket.io';
import { GameplayService } from './gameplay.service.js';
import { JwtService } from '@nestjs/jwt';
import { createWsAuthMiddleware } from '../matchmaking/ws-auth.middleware.js';
import { ActivePlayers } from '../matchmaking/active-players.store.js';
import {
  toMatchView,
  type DeployCommand,
  type MatchResult,
} from '../game/engine/engine.js';
import { DEFAULT_GAME_RULES } from '../game/balance.js';
import { OnModuleDestroy } from '@nestjs/common';

const TICK_INTERVAL_MS: number = 1000 / DEFAULT_GAME_RULES.ticksPerSecond;
const MAX_RESULT_SAVE_ATTEMPTS = 3;
@WebSocketGateway({
  namespace: '/gameplay',
  cors: { origin: getWebSocketCorsOrigin() },
})
export class GameplayGateway implements OnModuleDestroy {
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
    private readonly activePlayers: ActivePlayers,
  ) {}

  onModuleDestroy() {
    for (const timer of this.tickTimersByMatch.values()) {
      clearInterval(timer);
    }

    this.tickTimersByMatch.clear();
    this.commandsByMatch.clear();
  }

  afterInit(server: Server) {
    server.use(createWsAuthMiddleware(this.jwtService));
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
          clearInterval(timer);
          this.tickTimersByMatch.delete(matchId);
          this.commandsByMatch.delete(matchId);
          if (result.state.result) {
            await this.persistMatchResultWithRetry(
              matchId,
              result.state.result,
            );
            this.activePlayers.removePlayer(result.state.players.LEFT.playerId);
            this.activePlayers.removePlayer(
              result.state.players.RIGHT.playerId,
            );
            this.server.to(matchId).emit('match_finished', {
              result: result.state.result,
            });
          }
        }
      } catch (error) {
        console.error(`Failed to advance gameplay match ${matchId}:`, error);
        clearInterval(timer);
        this.tickTimersByMatch.delete(matchId);
        this.commandsByMatch.delete(matchId);
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

  private async persistMatchResultWithRetry(
    matchId: string,
    result: MatchResult,
  ): Promise<void> {
    let attempts = 0;

    while (attempts < MAX_RESULT_SAVE_ATTEMPTS) {
      try {
        await this.gameplayService.persistMatchResult(matchId, result);
        return;
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
  }
}
