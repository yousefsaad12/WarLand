import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Namespace, Socket } from 'socket.io';
import { createWsAuthMiddleware } from '../matchmaking/ws-auth.middleware.js';
import { getWebSocketCorsOrigin } from '../auth/ws-cors.options.js';
import { GameplayService } from './gameplay.service.js';

interface JoinGamePayload {
  matchId: string;
}

interface DeployPayload {
  requestId: string;
  cardId: string;
  x: number;
  y: number;
}

@WebSocketGateway({
  namespace: '/gameplay',
  cors: { origin: getWebSocketCorsOrigin() },
})
export class GameplayGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly jwtService: JwtService,
    private readonly gameplayService: GameplayService,
  ) {}

  afterInit(server: Namespace): void {
    server.use(createWsAuthMiddleware(this.jwtService));
    this.gameplayService.setNamespace(server);
  }

  @SubscribeMessage('join_game')
  async handleJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const playerId: string | undefined = client.data?.playerId;
    if (!playerId || !isJoinGamePayload(payload)) {
      client.emit('game_error', { message: 'Invalid game join request.' });
      return;
    }

    const joined = this.gameplayService.joinMatch(
      playerId,
      payload.matchId,
      client.id,
    );
    if (!joined) {
      client.emit('game_error', {
        message:
          'This player is not in that active match or has already joined it.',
      });
      return;
    }

    await client.join(`match:${payload.matchId}`);
    client.emit('game_started', joined);
  }

  @SubscribeMessage('deploy')
  handleDeploy(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): void {
    const playerId: string | undefined = client.data?.playerId;
    if (!playerId || !isDeployPayload(payload)) {
      client.emit('deploy_result', {
        status: 'REJECTED',
        reason: 'INVALID_PAYLOAD',
      });
      return;
    }

    const queueResult = this.gameplayService.queueDeployment(
      playerId,
      client.id,
      payload,
    );
    if (queueResult === 'NOT_IN_MATCH') {
      client.emit('deploy_result', {
        requestId: payload.requestId,
        status: 'REJECTED',
        reason: 'PLAYER_NOT_IN_MATCH',
      });
      return;
    }
    if (queueResult === 'RATE_LIMITED') {
      client.emit('deploy_result', {
        requestId: payload.requestId,
        status: 'REJECTED',
        reason: 'TOO_MANY_PENDING_DEPLOYMENTS',
      });
      return;
    }

    client.emit('deploy_queued', { requestId: payload.requestId });
  }
}

function isJoinGamePayload(value: unknown): value is JoinGamePayload {
  return (
    isRecord(value) &&
    typeof value.matchId === 'string' &&
    value.matchId.length > 0
  );
}

function isDeployPayload(value: unknown): value is DeployPayload {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    typeof value.cardId === 'string' &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
