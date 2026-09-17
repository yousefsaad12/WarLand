// src/matchmaking/matchmaking.gateway.ts
import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  OnGatewayDisconnect,
  WebSocketServer,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchmakingService } from './matchmaking.service.js';

@WebSocketGateway({ cors: { origin: '*' } })
export class MatchmakingGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private activeSockets = new Map<string, string>();

  constructor(private readonly matchmakingService: MatchmakingService) {}

  @SubscribeMessage('join_queue')
  async handleJoinQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { playerId: string },
  ) {
    const playerId = data.playerId;
    this.activeSockets.set(client.id, playerId);

    this.matchmakingService.processMatchmaking(playerId, client.id, this.server);

    return { event: 'queue_joined', status: 'searching' };
  }

  @SubscribeMessage('leave_queue')
  async handleLeaveQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { playerId: string },
  ) {
    await this.matchmakingService.leaveQueue(data.playerId);
    this.activeSockets.delete(client.id);

    return { event: 'queue_left', status: 'cancelled' };
  }

  async handleDisconnect(client: Socket) {
    const playerId = this.activeSockets.get(client.id);
    if (playerId) {
      await this.matchmakingService.leaveQueue(playerId);
      this.activeSockets.delete(client.id);
      console.log(`Player ${playerId} disconnected and removed from Redis queue.`);
    }
  }
}