import { describe, expect, it, vi, afterEach } from 'vitest';
import { GameplayGateway } from './gameplay.gateway.js';
import type { GameplayService } from './gameplay.service.js';
import type { JwtService } from '@nestjs/jwt';
import {
  advanceMatch,
  createMatchState,
  type MatchState,
  type MatchView,
} from '../game/engine/engine.js';
import { DEFAULT_GAME_RULES, STARTER_CARDS } from '../game/balance.js';

const TICK_INTERVAL_MS = 1000 / DEFAULT_GAME_RULES.ticksPerSecond;

function finishedState(): MatchState {
  let state = createMatchState(
    'm1',
    { playerId: 'p1', cards: STARTER_CARDS },
    { playerId: 'p2', cards: STARTER_CARDS },
    { ...DEFAULT_GAME_RULES, maxTicks: 1 },
  );
  state = advanceMatch(state).state;
  return state;
}

function makeView(playerId = 'p1'): MatchView {
  return {
    matchId: 'm1',
    status: 'RUNNING',
    tick: 0,
    maxTicks: 100,
    ticksPerSecond: 10,
    players: {
      LEFT: { playerId, baseHp: 1000, energyHundredths: 500, cards: [] },
      RIGHT: { playerId: 'p2', baseHp: 1000, energyHundredths: 500, cards: [] },
    },
    units: [],
  };
}

type EmittedEvent = { room: string; event: string; payload: unknown };

function createHarness() {
  const emitted: EmittedEvent[] = [];
  const gameplayService = {
    getMatchViewForPlayer: vi.fn(() => makeView()),
    isMatchRunning: vi.fn(() => true),
    markMatchJoined: vi.fn(),
    advanceMatchTick: vi.fn(),
    persistMatchResult: vi.fn().mockResolvedValue(undefined),
    disposeMatch: vi.fn(),
  };
  const jwtService = {} as JwtService;

  const server = {
    use: vi.fn(),
    in: vi.fn(() => ({ fetchSockets: vi.fn(async () => []) })),
    to: vi.fn((room: string) => ({
      emit: (event: string, payload: unknown) =>
        emitted.push({ room, event, payload }),
    })),
  };

  const gateway = new GameplayGateway(
    gameplayService as unknown as GameplayService,
    jwtService,
  );
  gateway.server = server as never;

  const client = {
    data: {} as Record<string, unknown>,
    join: vi.fn(async () => undefined),
    emit: vi.fn(),
  };

  return { gateway, gameplayService, server, client, emitted };
}

function findEmit(
  client: { emit: ReturnType<typeof vi.fn> },
  event: string,
): unknown {
  const call = client.emit.mock.calls.find(([name]) => name === event);
  return call?.[1];
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GameplayGateway.handleDeploy', () => {
  it('requires the player to have joined a match first', async () => {
    const { gateway, client } = createHarness();
    await gateway.handleDeploy(client as never, {
      requestId: 'r1',
      cardId: 'knight',
      x: 10,
      y: 50,
    });
    expect(findEmit(client, 'game_error')).toMatchObject({
      message: expect.stringMatching(/join a match/i),
    });
  });

  it('rejects a deploy once the match is no longer running', async () => {
    const { gateway, gameplayService, client } = createHarness();
    client.data.matchId = 'm1';
    client.data.playerId = 'p1';
    gameplayService.isMatchRunning.mockReturnValue(false);

    await gateway.handleDeploy(client as never, {
      requestId: 'r1',
      cardId: 'knight',
      x: 10,
      y: 50,
    });

    expect(findEmit(client, 'game_error')).toMatchObject({
      message: 'This match is no longer running.',
    });
    expect(findEmit(client, 'deploy_queued')).toBeUndefined();
  });

  it('queues a valid deploy while the match is running', async () => {
    const { gateway, client } = createHarness();
    client.data.matchId = 'm1';
    client.data.playerId = 'p1';

    await gateway.handleDeploy(client as never, {
      requestId: 'r1',
      cardId: 'knight',
      x: 10,
      y: 50,
    });

    expect(findEmit(client, 'deploy_queued')).toEqual({ requestId: 'r1' });
  });

  it('enforces the per-tick deployment limit', async () => {
    const { gateway, client } = createHarness();
    client.data.matchId = 'm1';
    client.data.playerId = 'p1';

    for (let i = 0; i < 4; i += 1) {
      await gateway.handleDeploy(client as never, {
        requestId: `r${i}`,
        cardId: 'knight',
        x: 10,
        y: 50,
      });
    }

    const rejected = client.emit.mock.calls.filter(
      ([event, payload]) =>
        event === 'deploy_result' &&
        (payload as { reason?: string }).reason === 'TICK_DEPLOYMENT_LIMIT',
    );
    expect(rejected).toHaveLength(1);
  });

  it('validates request payloads', async () => {
    const { gateway, client } = createHarness();
    client.data.matchId = 'm1';
    client.data.playerId = 'p1';

    await gateway.handleDeploy(client as never, { requestId: 'r1' });

    expect(findEmit(client, 'game_error')).toMatchObject({
      message: expect.stringMatching(/finite x\/y/i),
    });
  });
});

describe('GameplayGateway.handleJoinGame', () => {
  it('rejects an invalid join payload', async () => {
    const { gateway, client } = createHarness();
    await gateway.handleJoinGame(client as never, null);
    expect(findEmit(client, 'game_error')).toMatchObject({
      message: expect.stringMatching(/valid match ID/i),
    });
  });

  it('emits game_started for a participant', async () => {
    const { gateway, client } = createHarness();
    client.data.playerId = 'p1';

    await gateway.handleJoinGame(client as never, { matchId: 'm1' });

    expect(findEmit(client, 'game_started')).toMatchObject({
      matchId: 'm1',
      side: 'LEFT',
    });
  });
});

describe('GameplayGateway tick timer', () => {
  it('starts, marks joined, and disposes the match on finish', async () => {
    vi.useFakeTimers();
    const { gateway, gameplayService, emitted } = createHarness();
    gameplayService.advanceMatchTick.mockReturnValue({
      state: finishedState(),
      deployResults: [],
    });

    (
      gateway as unknown as { startMatchTickTimer: (m: string) => void }
    ).startMatchTickTimer('m1');

    await vi.advanceTimersByTimeAsync(TICK_INTERVAL_MS);

    expect(gameplayService.markMatchJoined).toHaveBeenCalledWith('m1');
    expect(gameplayService.disposeMatch).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ status: 'FINISHED' }),
    );
    expect(
      emitted.some(({ event }) => event === 'match_finished'),
    ).toBe(true);

    gateway.onModuleDestroy();
  });

  it('still disposes the match when persisting the result fails', async () => {
    vi.useFakeTimers();
    const { gateway, gameplayService, emitted } = createHarness();
    gameplayService.advanceMatchTick.mockReturnValue({
      state: finishedState(),
      deployResults: [],
    });
    gameplayService.persistMatchResult.mockRejectedValue(new Error('db down'));

    (
      gateway as unknown as { startMatchTickTimer: (m: string) => void }
    ).startMatchTickTimer('m1');

    await vi.advanceTimersByTimeAsync(TICK_INTERVAL_MS + 3000);

    expect(gameplayService.disposeMatch).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ status: 'FINISHED' }),
    );
    expect(
      emitted.some(
        ({ event, payload }) =>
          event === 'game_error' &&
          (payload as { message?: string }).message ===
            'Could not save the match result.',
      ),
    ).toBe(true);

    gateway.onModuleDestroy();
  });

  it('disposes the match and reports an error when a tick throws', async () => {
    vi.useFakeTimers();
    const { gateway, gameplayService } = createHarness();
    gameplayService.advanceMatchTick.mockImplementation(() => {
      throw new Error('engine exploded');
    });

    (
      gateway as unknown as { startMatchTickTimer: (m: string) => void }
    ).startMatchTickTimer('m1');

    await vi.advanceTimersByTimeAsync(TICK_INTERVAL_MS);

    expect(gameplayService.disposeMatch).toHaveBeenCalledWith('m1');
    gateway.onModuleDestroy();
  });
});
