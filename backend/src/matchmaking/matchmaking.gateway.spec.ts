import { describe, expect, it, vi } from 'vitest';
import { MatchmakingGateway } from './matchmaking.gateway.js';
import type { MatchmakingService } from './matchmaking.service.js';
import type { JwtService } from '@nestjs/jwt';

function createHarness() {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const matchmakingService = {
    leaveQueue: vi.fn(async () => undefined),
    processMatchmaking: vi.fn(async () => undefined),
  };
  const gateway = new MatchmakingGateway(
    matchmakingService as unknown as MatchmakingService,
    {} as JwtService,
  );

  const client = {
    id: 'socket-1',
    data: { playerId: 'p1' } as Record<string, unknown>,
    emit: vi.fn((event: string, payload: unknown) =>
      emitted.push({ event, payload }),
    ),
  };

  return { gateway, matchmakingService, client, emitted };
}

function findEmit(
  emitted: Array<{ event: string; payload: unknown }>,
  event: string,
): unknown {
  return emitted.find((entry) => entry.event === event)?.payload;
}

describe('MatchmakingGateway.handleLeaveQueue', () => {
  it('emits queue_left with the documented payload', async () => {
    const { gateway, client, emitted } = createHarness();

    await gateway.handleLeaveQueue(client as never);

    expect(findEmit(emitted, 'queue_left')).toEqual({ status: 'cancelled' });
  });

  it('removes the player from the matchmaking queue', async () => {
    const { gateway, matchmakingService, client } = createHarness();

    await gateway.handleLeaveQueue(client as never);

    expect(matchmakingService.leaveQueue).toHaveBeenCalledWith('p1');
  });

  it('reports an error and does not emit queue_left when leaving fails', async () => {
    const { gateway, matchmakingService, client, emitted } = createHarness();
    matchmakingService.leaveQueue.mockRejectedValue(new Error('redis down'));

    await gateway.handleLeaveQueue(client as never);

    expect(findEmit(emitted, 'queue_left')).toBeUndefined();
    expect(findEmit(emitted, 'match_error')).toMatchObject({
      message: expect.stringMatching(/could not leave matchmaking/i),
    });
  });

  it('rejects a socket without an authenticated player', async () => {
    const { gateway, matchmakingService, client, emitted } = createHarness();
    client.data = {};

    await gateway.handleLeaveQueue(client as never);

    expect(matchmakingService.leaveQueue).not.toHaveBeenCalled();
    expect(findEmit(emitted, 'queue_left')).toBeUndefined();
    expect(findEmit(emitted, 'queue_error')).toMatchObject({
      message: expect.stringMatching(/player id missing/i),
    });
  });
});
