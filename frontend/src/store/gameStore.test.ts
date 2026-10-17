import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GameStartedPayload,
  MatchView,
} from '@/network/protocol';

const holder = vi.hoisted(() => ({
  socket: null as FakeSocket | null,
}));

vi.mock('@/network/socket', () => ({
  createGameplaySocket: () => holder.socket,
}));

type Handler = (payload: unknown) => void;

class FakeSocket {
  disconnected = false;
  readonly handlers = new Map<string, Handler>();
  readonly ioHandlers = new Map<string, Handler>();
  readonly emitted: Array<[string, unknown]> = [];

  on(event: string, handler: Handler): this {
    this.handlers.set(event, handler);
    return this;
  }

  emit(event: string, payload?: unknown): this {
    this.emitted.push([event, payload]);
    return this;
  }

  removeAllListeners(): this {
    this.handlers.clear();
    return this;
  }

  disconnect(): this {
    this.disconnected = true;
    return this;
  }

  readonly io = {
    on: (event: string, handler: Handler) => {
      this.ioHandlers.set(event, handler);
      return this.io;
    },
    removeAllListeners: () => {
      this.ioHandlers.clear();
      return this.io;
    },
  };

  fire(event: string, payload?: unknown): void {
    this.handlers.get(event)?.(payload);
  }
}

import { useGameStore } from './gameStore';

function makeView(): MatchView {
  return {
    matchId: 'm1',
    status: 'RUNNING',
    tick: 0,
    maxTicks: 1800,
    ticksPerSecond: 10,
    laneHalfWidth: 8,
    maxEnergyHundredths: 1000,
    players: {
      LEFT: {
        playerId: 'p-left-123456',
        baseHp: 1000,
        energyHundredths: 500,
        cards: [
          { cardId: 'knight', name: 'Knight', cost: 3 },
          { cardId: 'archer', name: 'Archer', cost: 4 },
        ],
      },
      RIGHT: {
        playerId: 'p-right-123456',
        baseHp: 1000,
        energyHundredths: 500,
        cards: [{ cardId: 'guard', name: 'Guard', cost: 4 }],
      },
    },
    units: [],
  };
}

function startMatch(side: 'LEFT' | 'RIGHT' = 'LEFT'): FakeSocket {
  const fake = new FakeSocket();
  holder.socket = fake;
  useGameStore
    .getState()
    .joinMatch(
      {
        matchId: 'm1',
        opponentId: 'opp',
        opponentName: 'Rival',
        opponentTag: '0001',
      },
      'token',
    );
  fake.fire('connect');
  const payload: GameStartedPayload = { matchId: 'm1', side, state: makeView() };
  fake.fire('game_started', payload);
  return fake;
}

beforeEach(() => {
  holder.socket = null;
  useGameStore.getState().leaveMatch();
});

afterEach(() => {
  useGameStore.getState().leaveMatch();
  holder.socket = null;
});

describe('gameStore deployment', () => {
  it('auto-selects the first card on match start', () => {
    startMatch('LEFT');
    expect(useGameStore.getState().selectedCardId).toBe('knight');
    expect(useGameStore.getState().side).toBe('LEFT');
  });

  it('sends a valid deploy command and tracks it as pending', () => {
    const fake = startMatch('LEFT');
    const feedback = useGameStore.getState().deployAt(30, 50);

    expect(feedback.ok).toBe(true);
    const deploy = fake.emitted.find(([event]) => event === 'deploy');
    expect(deploy).toBeTruthy();
    const command = deploy![1] as {
      requestId: string;
      cardId: string;
      x: number;
      y: number;
    };
    expect(command.cardId).toBe('knight');
    expect(command.x).toBe(30);
    expect(command.y).toBe(50);
    expect(command.requestId.length).toBeGreaterThan(0);

    const pending = useGameStore.getState().pending;
    expect(pending).toHaveLength(1);
    expect(pending[0]!.requestId).toBe(command.requestId);
  });

  it('rejects deployment outside the local half without emitting', () => {
    const fake = startMatch('LEFT');
    const feedback = useGameStore.getState().deployAt(70, 50);
    expect(feedback.ok).toBe(false);
    expect(feedback.message).toMatch(/deployment zone/i);
    expect(fake.emitted.some(([event]) => event === 'deploy')).toBe(false);
  });

  it('rejects deployment outside the lane', () => {
    startMatch('LEFT');
    const feedback = useGameStore.getState().deployAt(30, 10);
    expect(feedback.ok).toBe(false);
    expect(feedback.message).toMatch(/deployment zone/i);
  });

  it('mirrors correctly: a RIGHT player deploys on their own half', () => {
    const fake = startMatch('RIGHT');
    // RIGHT owns x > 50.
    expect(useGameStore.getState().deployAt(70, 50).ok).toBe(true);
    expect(useGameStore.getState().deployAt(30, 50).ok).toBe(false);
    const deploy = fake.emitted.find(([event]) => event === 'deploy');
    expect((deploy![1] as { x: number }).x).toBe(70);
  });

  it('clears pending and surfaces feedback on rejection', () => {
    const fake = startMatch('LEFT');
    const feedback = useGameStore.getState().deployAt(30, 50);
    expect(feedback.ok).toBe(true);
    const requestId = useGameStore.getState().pending[0]!.requestId;

    fake.fire('deploy_result', {
      requestId,
      status: 'REJECTED',
      reason: 'INSUFFICIENT_ENERGY',
      replayed: false,
    });

    expect(useGameStore.getState().pending).toHaveLength(0);
    const lastFeedback = useGameStore.getState().lastFeedback;
    expect(lastFeedback?.ok).toBe(false);
    expect(lastFeedback?.message).toMatch(/energy/i);
  });

  it('removes pending on an accepted deploy result', () => {
    const fake = startMatch('LEFT');
    useGameStore.getState().deployAt(30, 50);
    const requestId = useGameStore.getState().pending[0]!.requestId;
    fake.fire('deploy_result', {
      requestId,
      status: 'ACCEPTED',
      unitId: 'u1',
      replayed: false,
    });
    expect(useGameStore.getState().pending).toHaveLength(0);
    expect(useGameStore.getState().lastFeedback).toBeNull();
  });

  it('guards against duplicate rapid clicks on the same spot', () => {
    const fake = startMatch('LEFT');
    expect(useGameStore.getState().deployAt(30, 50).ok).toBe(true);
    const second = useGameStore.getState().deployAt(30, 50);
    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/already deploying/i);
    expect(fake.emitted.filter(([event]) => event === 'deploy')).toHaveLength(1);
  });

  it('clears all state on leaveMatch', () => {
    const fake = startMatch('LEFT');
    useGameStore.getState().leaveMatch();
    const state = useGameStore.getState();
    expect(fake.disconnected).toBe(true);
    expect(state.matchId).toBeNull();
    expect(state.view).toBeNull();
    expect(state.side).toBeNull();
    expect(state.pending).toHaveLength(0);
    expect(state.connection).toBe('idle');
  });
});

describe('gameStore socket wiring', () => {
  it('joins the match room on connect', () => {
    const fake = new FakeSocket();
    holder.socket = fake;
    useGameStore.getState().joinMatch(
      {
        matchId: 'm1',
        opponentId: 'opp',
        opponentName: 'Rival',
        opponentTag: '0001',
      },
      'token',
    );
    fake.fire('connect');
    const join = fake.emitted.find(([event]) => event === 'join_game');
    expect(join?.[1]).toEqual({ matchId: 'm1' });
  });

  it('records the match result from match_finished', () => {
    const fake = startMatch('LEFT');
    fake.fire('match_finished', {
      result: { winner: 'LEFT', reason: 'BASE_DESTROYED' },
    });
    expect(useGameStore.getState().result).toEqual({
      winner: 'LEFT',
      reason: 'BASE_DESTROYED',
    });
  });
});
