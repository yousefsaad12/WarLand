// src/matchmaking/ws-auth.middleware.ts
import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

export function createWsAuthMiddleware(jwtService: JwtService) {
  return async (socket: Socket, next: (err?: Error) => void) => {
    try {
      // 1. Check socket.handshake.auth.token
      // 2. Check custom header (e.g. key: 'token' or key: 'authorization' in Postman)
      // 3. Check query param (e.g. ?token=...)
      const headers = socket.handshake.headers;

      const headerToken =
        (headers['token'] as string) || (headers['authorization'] as string);

      // Clean 'Bearer ' prefix if present
      const cleanHeaderToken = headerToken?.startsWith('Bearer ')
        ? headerToken.replace('Bearer ', '')
        : headerToken;

      const token =
        socket.handshake.auth?.token ||
        cleanHeaderToken ||
        (socket.handshake.query?.token as string);

      if (!token) throw new Error('No token provided');

      const payload = await jwtService.verifyAsync(token);
      socket.data.playerId = payload.sub;
      next();
    } catch (err) {
      next(new Error('Unauthorized'));
    }
  };
}
