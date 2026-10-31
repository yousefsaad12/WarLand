import { describe, expect, it } from 'vitest';
import {
  advanceMatch,
  cancelMatch,
  createMatchState,
  toMatchView,
  type CardSnapshot,
  type GameRules,
} from './engine.js';

function makeCard(id: string, over: Partial<CardSnapshot> = {}): CardSnapshot {
  return {
    cardId: id,
    name: id,
    level: 1,
    cost: 1,
    hp: 100,
    damage: 3,
    attackSpeed: 1,
    movementSpeed: 0,
    range: 0,
    ...over,
  };
}

function makeRules(over: Partial<GameRules> = {}): GameRules {
  return {
    ticksPerSecond: 10,
    maxTicks: 100,
    startingEnergyHundredths: 1000,
    maxEnergyHundredths: 3000,
    energyRegenHundredthsPerTick: 5,
    baseHp: 1000,
    baseTurret: { damage: 8, attackSpeed: 1, range: 14 },
    laneHalfWidth: 8,
    unitSeparation: 1.5,
    requestLedgerRetentionTicks: 100,
    ...over,
  };
}

const deck: CardSnapshot[] = [
  makeCard('knight'),
  makeCard('archer'),
  makeCard('guard'),
  makeCard('scout'),
];

function newState(rules: GameRules = makeRules(), cards = deck) {
  return createMatchState(
    'match-1',
    { playerId: 'p1', cards },
    { playerId: 'p2', cards },
    rules,
  );
}

describe('createMatchState', () => {
  it('creates a RUNNING match with both players at starting energy', () => {
    const state = newState();
    expect(state.status).toBe('RUNNING');
    expect(state.tick).toBe(0);
    expect(state.players.LEFT.energyHundredths).toBe(1000);
    expect(state.players.RIGHT.energyHundredths).toBe(1000);
    expect(state.units).toHaveLength(0);
  });

  it('rejects an empty match ID', () => {
    expect(() =>
      createMatchState(
        '   ',
        { playerId: 'p1', cards: deck },
        { playerId: 'p2', cards: deck },
        makeRules(),
      ),
    ).toThrow(/match ID/i);
  });

  it('rejects the same player on both sides', () => {
    expect(() =>
      createMatchState(
        'match-1',
        { playerId: 'p1', cards: deck },
        { playerId: 'p1', cards: deck },
        makeRules(),
      ),
    ).toThrow(/both sides/i);
  });

  it('rejects a deck that is not exactly four cards', () => {
    expect(() => newState(makeRules(), deck.slice(0, 3))).toThrow(
      /exactly 4 cards/i,
    );
  });

  it('rejects duplicate cards in a deck', () => {
    const dup = [makeCard('knight'), makeCard('knight'), deck[2], deck[3]];
    expect(() => newState(makeRules(), dup)).toThrow(/duplicate/i);
  });

  it('rejects mismatched decks between the two players', () => {
    const other = [makeCard('a'), makeCard('b'), makeCard('c'), makeCard('d')];
    expect(() =>
      createMatchState(
        'match-1',
        { playerId: 'p1', cards: deck },
        { playerId: 'p2', cards: other },
        makeRules(),
      ),
    ).toThrow(/same starter deck/i);
  });

  it('rejects an attack speed faster than the tick rate', () => {
    const bad = [
      makeCard('knight', { attackSpeed: 20 }),
      deck[1],
      deck[2],
      deck[3],
    ];
    expect(() => newState(makeRules({ ticksPerSecond: 10 }), bad)).toThrow(
      /attackSpeed/i,
    );
  });
});

describe('advanceMatch - energy', () => {
  it('regenerates energy each tick', () => {
    const next = advanceMatch(newState()).state;
    expect(next.players.LEFT.energyHundredths).toBe(1005);
    expect(next.players.RIGHT.energyHundredths).toBe(1005);
  });

  it('caps energy at the maximum', () => {
    const next = advanceMatch(
      newState(makeRules({ energyRegenHundredthsPerTick: 5000 })),
    ).state;
    expect(next.players.LEFT.energyHundredths).toBe(3000);
  });
});

describe('advanceMatch - deployment validation', () => {
  it('accepts a deployment inside the owner half and lane', () => {
    const result = advanceMatch(newState(), [
      { requestId: 'r1', playerId: 'p1', cardId: 'knight', x: 10, y: 50 },
    ]);
    expect(result.deployResults[0]).toMatchObject({ status: 'ACCEPTED' });
    expect(result.state.units).toHaveLength(1);
    expect(result.state.units[0]!.owner).toBe('LEFT');
    expect(result.state.units[0]).toMatchObject({ x: 10, y: 50 });
  });

  it('keeps a new deployment at its requested position when units overlap', () => {
    const state = advanceMatch(newState(), [
      { requestId: 'r1', playerId: 'p1', cardId: 'knight', x: 10, y: 50 },
    ]).state;
    const result = advanceMatch(state, [
      { requestId: 'r2', playerId: 'p1', cardId: 'archer', x: 10, y: 50 },
    ]);

    expect(result.state.units).toHaveLength(2);
    expect(result.state.units[1]).toMatchObject({ x: 10, y: 50 });
    expect(result.state.units[0]!.y).toBeLessThan(50);
  });

  it('rejects a deployment on the midline river', () => {
    const result = advanceMatch(newState(), [
      { requestId: 'r1', playerId: 'p1', cardId: 'knight', x: 50, y: 50 },
    ]);
    expect(result.deployResults[0]).toMatchObject({
      status: 'REJECTED',
      reason: 'OUTSIDE_DEPLOYMENT_ZONE',
    });
  });

  it('rejects a deployment in the enemy half', () => {
    const result = advanceMatch(newState(), [
      { requestId: 'r1', playerId: 'p2', cardId: 'knight', x: 20, y: 50 },
    ]);
    expect(result.deployResults[0]).toMatchObject({
      status: 'REJECTED',
      reason: 'OUTSIDE_DEPLOYMENT_ZONE',
    });
  });

  it('rejects a deployment outside the lane band', () => {
    const result = advanceMatch(newState(), [
      { requestId: 'r1', playerId: 'p1', cardId: 'knight', x: 10, y: 90 },
    ]);
    expect(result.deployResults[0]).toMatchObject({
      status: 'REJECTED',
      reason: 'OUTSIDE_DEPLOYMENT_ZONE',
    });
  });

  it('rejects insufficient energy', () => {
    const rules = makeRules({
      startingEnergyHundredths: 0,
      energyRegenHundredthsPerTick: 0,
    });
    const result = advanceMatch(newState(rules), [
      { requestId: 'r1', playerId: 'p1', cardId: 'knight', x: 10, y: 50 },
    ]);
    expect(result.deployResults[0]).toMatchObject({
      status: 'REJECTED',
      reason: 'INSUFFICIENT_ENERGY',
    });
  });

  it('rejects a card that is not in the deck', () => {
    const result = advanceMatch(newState(), [
      { requestId: 'r1', playerId: 'p1', cardId: 'ghost', x: 10, y: 50 },
    ]);
    expect(result.deployResults[0]).toMatchObject({
      status: 'REJECTED',
      reason: 'CARD_NOT_IN_DECK',
    });
  });

  it('rejects a blank request ID', () => {
    const result = advanceMatch(newState(), [
      { requestId: '   ', playerId: 'p1', cardId: 'knight', x: 10, y: 50 },
    ]);
    expect(result.deployResults[0]).toMatchObject({
      status: 'REJECTED',
      reason: 'INVALID_REQUEST_ID',
    });
  });

  it('rejects non-finite coordinates', () => {
    const result = advanceMatch(newState(), [
      { requestId: 'r1', playerId: 'p1', cardId: 'knight', x: NaN, y: 50 },
    ]);
    expect(result.deployResults[0]).toMatchObject({
      status: 'REJECTED',
      reason: 'INVALID_POSITION',
    });
  });

  it('rejects a deployment from a player not in the match', () => {
    const result = advanceMatch(newState(), [
      { requestId: 'r1', playerId: 'stranger', cardId: 'knight', x: 10, y: 50 },
    ]);
    expect(result.deployResults[0]).toMatchObject({
      status: 'REJECTED',
      reason: 'PLAYER_NOT_IN_MATCH',
    });
  });
});

describe('advanceMatch - request ledger', () => {
  it('replays an identical duplicate request without spawning twice', () => {
    const command = {
      requestId: 'r1',
      playerId: 'p1',
      cardId: 'knight',
      x: 10,
      y: 50,
    };
    const result = advanceMatch(newState(), [command, { ...command }]);
    expect(result.deployResults).toHaveLength(2);
    expect(result.deployResults[0]).toMatchObject({
      status: 'ACCEPTED',
      replayed: false,
    });
    expect(result.deployResults[1]).toMatchObject({
      status: 'ACCEPTED',
      replayed: true,
    });
    expect(result.state.units).toHaveLength(1);
  });

  it('reports a conflict when a request ID is reused with a different payload', () => {
    const result = advanceMatch(newState(), [
      { requestId: 'r1', playerId: 'p1', cardId: 'knight', x: 10, y: 50 },
      { requestId: 'r1', playerId: 'p1', cardId: 'archer', x: 10, y: 50 },
    ]);
    expect(result.deployResults[1]).toMatchObject({
      status: 'CONFLICT',
      reason: 'REQUEST_ID_REUSED',
    });
    expect(result.state.units).toHaveLength(1);
  });

  it('forgets a request ID after the retention window', () => {
    const rules = makeRules({ requestLedgerRetentionTicks: 1 });
    let state = newState(rules);
    state = advanceMatch(state, [
      { requestId: 'r1', playerId: 'p1', cardId: 'knight', x: 10, y: 50 },
    ]).state;

    for (let i = 0; i < 3; i += 1) {
      state = advanceMatch(state).state;
    }

    const replayed = advanceMatch(state, [
      { requestId: 'r1', playerId: 'p1', cardId: 'knight', x: 10, y: 50 },
    ]);
    expect(replayed.deployResults[0]).toMatchObject({
      status: 'ACCEPTED',
      replayed: false,
    });
  });
});

describe('advanceMatch - combat and termination', () => {
  it('damages an enemy unit that is in range', () => {
    const cards = [
      makeCard('knight', { hp: 100, damage: 3, range: 30, movementSpeed: 0 }),
      deck[1],
      deck[2],
      deck[3],
    ];
    let state = createMatchState(
      'match-1',
      { playerId: 'p1', cards },
      { playerId: 'p2', cards },
      makeRules({ maxTicks: 50 }),
    );
    state = advanceMatch(state, [
      { requestId: 'a', playerId: 'p1', cardId: 'knight', x: 45, y: 50 },
      { requestId: 'b', playerId: 'p2', cardId: 'knight', x: 55, y: 50 },
    ]).state;

    for (let i = 0; i < 20; i += 1) {
      state = advanceMatch(state).state;
    }

    const left = state.units.find((unit) => unit.owner === 'LEFT');
    const right = state.units.find((unit) => unit.owner === 'RIGHT');
    expect(left?.hp ?? 0).toBeLessThan(100);
    expect(right?.hp ?? 0).toBeLessThan(100);
  });

  it('finishes with a winner when a base is destroyed', () => {
    const cards = [
      makeCard('knight', { hp: 100, damage: 50, range: 60, movementSpeed: 0 }),
      deck[1],
      deck[2],
      deck[3],
    ];
    let state = createMatchState(
      'match-1',
      { playerId: 'p1', cards },
      { playerId: 'p2', cards },
      makeRules({ baseHp: 40, maxTicks: 100 }),
    );
    state = advanceMatch(state, [
      { requestId: 'a', playerId: 'p2', cardId: 'knight', x: 51, y: 50 },
    ]).state;

    for (let i = 0; i < 60 && state.status === 'RUNNING'; i += 1) {
      state = advanceMatch(state).state;
    }

    expect(state.status).toBe('FINISHED');
    expect(state.result).toEqual({
      winner: 'RIGHT',
      reason: 'BASE_DESTROYED',
    });
  });

  it('finishes as a DRAW on the time limit with equal base health', () => {
    let state = newState(makeRules({ maxTicks: 3 }));
    for (let i = 0; i < 3; i += 1) {
      state = advanceMatch(state).state;
    }
    expect(state.status).toBe('FINISHED');
    expect(state.result).toEqual({ winner: 'DRAW', reason: 'TIME_LIMIT' });
  });

  it('refuses to advance a finished match', () => {
    let state = newState(makeRules({ maxTicks: 1 }));
    state = advanceMatch(state).state;
    expect(state.status).toBe('FINISHED');
    expect(() => advanceMatch(state)).toThrow(/finished/i);
  });
});

describe('attack events', () => {
  function combatState(over: Partial<CardSnapshot> = {}) {
    const cards = [
      makeCard('knight', {
        hp: 100,
        damage: 10,
        range: 30,
        movementSpeed: 0,
        ...over,
      }),
      deck[1],
      deck[2],
      deck[3],
    ];
    return createMatchState(
      'match-1',
      { playerId: 'p1', cards },
      { playerId: 'p2', cards },
      makeRules({ maxTicks: 50 }),
    );
  }

  it('records an event for every attack that landed', () => {
    let state = combatState();
    state = advanceMatch(state, [
      { requestId: 'a', playerId: 'p1', cardId: 'knight', x: 45, y: 50 },
      { requestId: 'b', playerId: 'p2', cardId: 'knight', x: 55, y: 50 },
    ]).state;

    // Deploy on tick 1; the first attack lands once attack progress fills.
    for (let i = 0; i < 15 && state.events.length === 0; i += 1) {
      state = advanceMatch(state).state;
    }

    expect(state.events.length).toBeGreaterThan(0);
    const event = state.events[0]!;
    expect(event.attackerId).toMatch(/^match-1:\d+$/);
    expect(event.targetId).toMatch(/^match-1:\d+$/);
    expect(event.damage).toBe(10);
    expect(event.range).toBe(30);
    expect(event.tick).toBe(state.tick);
  });

  it('matches the reported damage to the HP change exactly', () => {
    let state = combatState();
    state = advanceMatch(state, [
      { requestId: 'a', playerId: 'p1', cardId: 'knight', x: 45, y: 50 },
      { requestId: 'b', playerId: 'p2', cardId: 'knight', x: 55, y: 50 },
    ]).state;

    for (let i = 0; i < 12; i += 1) {
      const before = state.units.map((unit) => ({
        id: unit.id,
        hp: unit.hp,
      }));
      const next = advanceMatch(state).state;

      // `next.events` lists the attacks that landed during this tick, so they
      // must account for every point of HP that was removed this tick.
      for (const previous of before) {
        const after = next.units.find((unit) => unit.id === previous.id);
        const hpAfter = after?.hp ?? 0;
        const hpLost = previous.hp - hpAfter;
        const eventDamage = next.events
          .filter((event) => event.targetId === previous.id)
          .reduce((sum, event) => sum + event.damage, 0);
        // HP never drops below zero, so overkill is clipped.
        expect(eventDamage).toBeGreaterThanOrEqual(hpLost);
        expect(hpLost).toBe(Math.min(previous.hp, eventDamage));
      }

      state = next;
    }
  });

  it('reports base hits with the BASE target and the owning side', () => {
    const cards = [
      makeCard('knight', { hp: 100, damage: 25, range: 60, movementSpeed: 0 }),
      deck[1],
      deck[2],
      deck[3],
    ];
    let state = createMatchState(
      'match-1',
      { playerId: 'p1', cards },
      { playerId: 'p2', cards },
      makeRules({ maxTicks: 50 }),
    );
    state = advanceMatch(state, [
      { requestId: 'a', playerId: 'p2', cardId: 'knight', x: 51, y: 50 },
    ]).state;

    for (let i = 0; i < 30 && state.events.length === 0; i += 1) {
      state = advanceMatch(state).state;
    }

    const baseEvent = state.events.find((event) => event.targetId === 'BASE');
    expect(baseEvent).toBeDefined();
    expect(baseEvent!.targetSide).toBe('LEFT');
    expect(baseEvent!.damage).toBe(25);
    expect(state.players.LEFT.baseHp).toBeLessThan(1000);
  });

  it('reports base turret attacks with the BASE attacker', () => {
    const cards = [
      makeCard('knight', { hp: 100, damage: 1, range: 2, movementSpeed: 0 }),
      deck[1],
      deck[2],
      deck[3],
    ];
    // A wide turret range lets the RIGHT base reach the LEFT unit that
    // deployed in its own half.
    let state = createMatchState(
      'match-1',
      { playerId: 'p1', cards },
      { playerId: 'p2', cards },
      makeRules({
        maxTicks: 50,
        baseTurret: { damage: 8, attackSpeed: 1, range: 60 },
      }),
    );
    state = advanceMatch(state, [
      { requestId: 'a', playerId: 'p1', cardId: 'knight', x: 45, y: 50 },
    ]).state;

    for (let i = 0; i < 40; i += 1) {
      state = advanceMatch(state).state;
      if (state.events.some((event) => event.attackerId === 'BASE')) {
        break;
      }
    }

    const turretEvent = state.events.find(
      (event) => event.attackerId === 'BASE',
    );
    expect(turretEvent).toBeDefined();
    expect(turretEvent!.attackerSide).toBe('RIGHT');
    expect(turretEvent!.damage).toBe(8);
    expect(turretEvent!.targetId).toMatch(/^match-1:\d+$/);
  });

  it('does not change the simulation result', () => {
    const run = () => {
      let state = newState(makeRules({ maxTicks: 40, ticksPerSecond: 10 }));
      state = advanceMatch(state, [
        { requestId: 'a', playerId: 'p1', cardId: 'knight', x: 40, y: 50 },
        { requestId: 'b', playerId: 'p2', cardId: 'knight', x: 60, y: 50 },
      ]).state;
      for (let i = 0; i < 40 && state.status === 'RUNNING'; i += 1) {
        state = advanceMatch(state).state;
      }
      return {
        status: state.status,
        tick: state.tick,
        leftHp: state.players.LEFT.baseHp,
        rightHp: state.players.RIGHT.baseHp,
        units: state.units.map((unit) => `${unit.id}:${unit.hp}`),
      };
    };
    expect(run()).toEqual(run());
  });

  it('exposes the events in the match view', () => {
    let state = combatState();
    state = advanceMatch(state, [
      { requestId: 'a', playerId: 'p1', cardId: 'knight', x: 45, y: 50 },
      { requestId: 'b', playerId: 'p2', cardId: 'knight', x: 55, y: 50 },
    ]).state;
    for (let i = 0; i < 15 && state.events.length === 0; i += 1) {
      state = advanceMatch(state).state;
    }

    const view = toMatchView(state);
    expect(view.events).toBeDefined();
    expect(view.events!.length).toBe(state.events.length);
    expect(view.events![0]!.attackerId).toBe(state.events[0]!.attackerId);
  });
});

describe('determinism and views', () => {
  it('produces identical output for identical inputs', () => {
    const run = () => {
      let state = newState(makeRules({ maxTicks: 40, ticksPerSecond: 10 }));
      state = advanceMatch(state, [
        { requestId: 'a', playerId: 'p1', cardId: 'knight', x: 40, y: 50 },
        { requestId: 'b', playerId: 'p2', cardId: 'knight', x: 60, y: 50 },
      ]).state;
      for (let i = 0; i < 40 && state.status === 'RUNNING'; i += 1) {
        state = advanceMatch(state).state;
      }
      return JSON.stringify(toMatchView(state));
    };
    expect(run()).toBe(run());
  });

  it('does not expose the internal request ledger in the client view', () => {
    const view = toMatchView(newState());
    expect(view).not.toHaveProperty('requestLedger');
    expect(view).toHaveProperty('players.LEFT.cards');
  });

  it('reports both display identities in the match view', () => {
    const state = createMatchState(
      'match-1',
      { playerId: 'p1', cards: deck, displayName: 'Ada', tag: '0007' },
      { playerId: 'p2', cards: deck, displayName: 'Linus', tag: '0042' },
      makeRules(),
    );

    const view = toMatchView(state);

    expect(view.players.LEFT.displayName).toBe('Ada');
    expect(view.players.LEFT.tag).toBe('0007');
    expect(view.players.RIGHT.displayName).toBe('Linus');
    expect(view.players.RIGHT.tag).toBe('0042');
  });

  it('reports empty identities when the setup omits them', () => {
    const view = toMatchView(newState());
    expect(view.players.LEFT.displayName).toBe('');
    expect(view.players.LEFT.tag).toBe('');
  });

  it('cancels a running match with no winner', () => {
    const cancelled = cancelMatch(newState());
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.result).toEqual({ winner: null, reason: 'CANCELLED' });
  });

  it('refuses to cancel an already finished match', () => {
    let state = newState(makeRules({ maxTicks: 1 }));
    state = advanceMatch(state).state;
    expect(() => cancelMatch(state)).toThrow(/finished/i);
  });
});
