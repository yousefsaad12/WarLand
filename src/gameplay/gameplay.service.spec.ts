import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameplayService } from './gameplay.service.js';
import { ActivePlayers } from '../matchmaking/active-players.store.js';
import type { DbService } from '../prisma/db.js';
import { STARTER_CARDS, DEFAULT_GAME_RULES } from '../game/balance.js';
import {
  advanceMatch,
  createMatchState,
  type MatchState,
} from '../game/engine/engine.js';

type PlayerCardsRow = {
  cardId: string;
  level: number;
  card: {
    id: string;
    name: string;
    cost: number;
    baseHp: number;
    baseDamage: number;
    attackSpeed: number;
    movementSpeed: number;
    range: number;
  };
};

function starterRows(): PlayerCardsRow[] {
  return STARTER_CARDS.map((card) => ({
    cardId: card.cardId,
    level: card.level,
    card: {
      id: card.cardId,
      name: card.name,
      cost: card.cost,
      baseHp: card.hp,
      baseDamage: card.damage,
      attackSpeed: card.attackSpeed,
      movementSpeed: card.movementSpeed,
      range: card.range,
    },
  }));
}

function createDbMock() {
  const tx = {
    match: {
      findUnique: vi.fn().mockResolvedValue({ status: 'PLAYING' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    matchPlayer: {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      update: vi.fn().mockResolvedValue({}),
    },
    player: {
      findUnique: vi.fn().mockResolvedValue({ rating: 1200 }),
      update: vi.fn().mockResolvedValue({}),
    },
  };

  const db = {
    player: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        where.id === 'missing'
          ? Promise.resolve(null)
          : Promise.resolve({ playerCards: starterRows() }),
      ),
    },
    match: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    __tx: tx,
  };

  return db;
}

function createService() {
  const db = createDbMock();
  const activePlayers = new ActivePlayers();
  const service = new GameplayService(
    db as unknown as DbService,
    activePlayers,
  );
  return { service, db, activePlayers };
}

function flushFakeTimers() {
  return Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('GameplayService lifecycle', () => {
  it('registers a started match as running', async () => {
    const { service } = createService();
    await service.startMatch('m1', 'p1', 'p2');
    expect(service.isMatchRunning('m1')).toBe(true);
    expect(service.isMatchRunning('unknown')).toBe(false);
  });

  it('throws when a requested player does not exist', async () => {
    const { service } = createService();
    await expect(
      service.startMatch('m1', 'missing', 'p2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exposes the match view only to participants', async () => {
    const { service } = createService();
    await service.startMatch('m1', 'p1', 'p2');

    expect(service.getMatchViewForPlayer('m1', 'p1')).toMatchObject({
      matchId: 'm1',
    });
    expect(() => service.getMatchViewForPlayer('m1', 'p3')).toThrow(
      ForbiddenException,
    );
  });

  it('throws NotFound when reading an unknown match', () => {
    const { service } = createService();
    expect(() => service.getMatchViewForPlayer('nope', 'p1')).toThrow(
      NotFoundException,
    );
  });

  it('disposeMatch releases both players and is idempotent', async () => {
    const { service, activePlayers } = createService();
    await service.startMatch('m1', 'p1', 'p2');
    activePlayers.addPlayer('p1', 'm1');
    activePlayers.addPlayer('p2', 'm1');

    const disposed = service.disposeMatch('m1');

    expect(disposed?.matchId).toBe('m1');
    expect(service.isMatchRunning('m1')).toBe(false);
    expect(activePlayers.isActive('p1')).toBe(false);
    expect(activePlayers.isActive('p2')).toBe(false);
    expect(() => service.disposeMatch('m1')).not.toThrow();
  });

  it('clears in-memory state on module destroy', async () => {
    const { service } = createService();
    await service.startMatch('m1', 'p1', 'p2');
    service.onModuleDestroy();
    expect(service.isMatchRunning('m1')).toBe(false);
  });
});

describe('GameplayService join deadline', () => {
  it('abandons a match that nobody joins within the deadline', async () => {
    vi.useFakeTimers();
    const { service, db, activePlayers } = createService();

    await service.startMatch('m1', 'p1', 'p2');
    activePlayers.addPlayer('p1', 'm1');
    activePlayers.addPlayer('p2', 'm1');

    await vi.advanceTimersByTimeAsync(30_000);
    await flushFakeTimers();

    expect(db.match.updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', status: 'PLAYING' },
      data: { status: 'FINISHED', endedAt: expect.any(Date) },
    });
    expect(service.isMatchRunning('m1')).toBe(false);
    expect(activePlayers.isActive('p1')).toBe(false);
    expect(activePlayers.isActive('p2')).toBe(false);
  });

  it('keeps a match alive once both players have joined', async () => {
    vi.useFakeTimers();
    const { service, db } = createService();

    await service.startMatch('m1', 'p1', 'p2');
    service.markMatchJoined('m1');

    await vi.advanceTimersByTimeAsync(30_000);
    await flushFakeTimers();

    expect(db.match.updateMany).not.toHaveBeenCalled();
    expect(service.isMatchRunning('m1')).toBe(true);
  });
});

describe('GameplayService advanceMatchTick', () => {
  it('advances the stored match state', async () => {
    const { service } = createService();
    await service.startMatch('m1', 'p1', 'p2');

    const result = service.advanceMatchTick('m1', []);

    expect(result.state.tick).toBe(1);
    expect(service.getMatchViewForPlayer('m1', 'p1').tick).toBe(1);
  });
});

describe('GameplayService.persistMatchResult', () => {
  function finishedState(): MatchState {
    let state = createMatchState(
      'm1',
      { playerId: 'p1', cards: STARTER_CARDS },
      { playerId: 'p2', cards: STARTER_CARDS },
      { ...DEFAULT_GAME_RULES, maxTicks: 1 },
    );
    state = advanceMatch(state).state;
    state.result = { winner: 'LEFT', reason: 'TIME_LIMIT' };
    return state;
  }

  function inject(service: GameplayService, state: MatchState) {
    (
      service as unknown as { matchStates: Map<string, MatchState> }
    ).matchStates.set(state.matchId, state);
  }

  it('writes the Elo rating change for both players', async () => {
    const { service, db } = createService();
    const state = finishedState();
    inject(service, state);

    await service.persistMatchResult('m1', state.result!);

    const ratingUpdates = db.__tx.player.update.mock.calls.map(
      ([arg]) => arg as { where: { id: string }; data: { rating: number } },
    );
    const winnerUpdate = ratingUpdates.find((u) => u.where.id === 'p1');
    const loserUpdate = ratingUpdates.find((u) => u.where.id === 'p2');

    expect(winnerUpdate?.data.rating).toBe(1216);
    expect(loserUpdate?.data.rating).toBe(1184);
    expect(db.__tx.match.updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', status: 'PLAYING' },
      data: { status: 'FINISHED', endedAt: expect.any(Date) },
    });
  });

  it('leaves ratings untouched on a DRAW', async () => {
    const { service, db } = createService();
    const state = finishedState();
    state.result = { winner: 'DRAW', reason: 'TIME_LIMIT' };
    inject(service, state);

    await service.persistMatchResult('m1', state.result!);

    expect(db.__tx.player.update).not.toHaveBeenCalled();
  });

  it('rejects cancelled matches', async () => {
    const { service } = createService();
    await expect(
      service.persistMatchResult('m1', { winner: null, reason: 'CANCELLED' }),
    ).rejects.toThrow(/cancelled/i);
  });

  it('rejects matches that have not finished', async () => {
    const { service } = createService();
    await service.startMatch('m1', 'p1', 'p2');
    await expect(
      service.persistMatchResult('m1', { winner: 'LEFT', reason: 'TIME_LIMIT' }),
    ).rejects.toThrow(/has not finished/i);
  });

  it('does nothing when the match is already finished in the database', async () => {
    const { service, db } = createService();
    const state = finishedState();
    inject(service, state);
    db.__tx.match.findUnique.mockResolvedValueOnce({ status: 'FINISHED' });

    await service.persistMatchResult('m1', state.result!);

    expect(db.__tx.match.updateMany).not.toHaveBeenCalled();
    expect(db.__tx.player.update).not.toHaveBeenCalled();
  });
});
