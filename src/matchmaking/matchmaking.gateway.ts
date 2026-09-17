import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MatchmakingService } from './matchmaking.service.js';
import { createWsAuthMiddleware } from './ws-auth.middleware.js';

@WebSocketGateway({ cors: { origin: '*' } })
export class MatchmakingGateway implements OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private activeSockets = new Map<string, string>();
  constructor(
    private readonly matchmakingService: MatchmakingService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(server: Server) {
    server.use(createWsAuthMiddleware(this.jwtService));
  }

  @SubscribeMessage('join_queue')
  async handleJoinQueue(@ConnectedSocket() client: Socket): Promise<void> {
    const playerId: string | undefined = client.data?.playerId;

    if (!playerId) {
      client.emit('queue_error', {
        message: 'Unauthorized: Player ID missing from socket session.',
      });
      return;
    }

    if (this.activeSockets.has(client.id)) {
      client.emit('queue_error', {
        message: 'You are already in the matchmaking queue.',
      });
      return;
    }

    this.activeSockets.set(client.id, playerId);
    client.emit('queue_joined', { status: 'searching' });

    try {
      await this.matchmakingService.processMatchmaking(
        playerId,
        client.id,
        this.server,
      );
    } catch (error) {
      this.activeSockets.delete(client.id);

      console.error(
        `Matchmaking process failed for player ${playerId}:`,
        error,
      );

      client.emit('match_error', {
        message: 'Matchmaking failed, please try again.',
      });
    }
  }

  @SubscribeMessage('leave_queue')
  async handleLeaveQueue(@ConnectedSocket() client: Socket) {
    const playerId = client.data.playerId;

    try {
      await this.matchmakingService.leaveQueue(playerId);
      this.activeSockets.delete(client.id);
    } catch (error) {
      console.error(`Failed to leave queue for ${playerId}:`, error);
      client.emit('match_error', {
        message: 'Could not leave matchmaking, please try again',
      });
    }

    return { event: 'queue_left', status: 'cancelled' };
  }

  async handleDisconnect(client: Socket) {
    const playerId = this.activeSockets.get(client.id);
    if (playerId) {
      try {
        await this.matchmakingService.leaveQueue(playerId);
        console.log(
          `Player ${playerId} disconnected and removed from Redis queue.`,
        );
      } catch (error) {
        console.error(
          `Failed to remove disconnected player ${playerId} from queue:`,
          error,
        );
      } finally {
        this.activeSockets.delete(client.id);
      }
    }
  }
}
