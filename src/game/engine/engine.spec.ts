import {
  advanceMatch,
  createMatchState,
  type CardSnapshot,
  type GameRules,
} from './engine.js';
import { DEFAULT_GAME_RULES, STARTER_CARDS } from '../balance.js';

const cards: CardSnapshot[] = [
  {
    cardId: 'runner',
    name: 'Runner',
    level: 1,
    cost: 1,
    hp: 100,
    damage: 1,
    attackSpeed: 0.1,
    movementSpeed: 10,
    range: 3,
  },
  {
    cardId: 'blocker',
    name: 'Blocker',
    level: 1,
    cost: 1,
    hp: 100,
    damage: 1,
    attackSpeed: 0.1,
    movementSpeed: 0,
    range: 3,
  },
  {
    cardId: 'filler-1',
    name: 'Filler 1',
    level: 1,
    cost: 1,
    hp: 100,
    damage: 1,
    attackSpeed: 0.1,
    movementSpeed: 0,
    range: 0,
  },
  {
    cardId: 'filler-2',
    name: 'Filler 2',
    level: 1,
    cost: 1,
    hp: 100,
    damage: 1,
    attackSpeed: 0.1,
    movementSpeed: 0,
    range: 0,
  },
];

const rules: GameRules = {
  ticksPerSecond: 1,
  maxTicks: 10,
  startingEnergyHundredths: 0,
  maxEnergyHundredths: 100,
  energyRegenHundredthsPerTick: 0,
  baseHp: 1000,
  baseTurret: {
    damage: 1,
    attackSpeed: 0.1,
    range: 0,
  },
};

describe('default game balance', () => {
  it('sets a three-minute match limit and health-based base defense', () => {
    expect(
      DEFAULT_GAME_RULES.maxTicks / DEFAULT_GAME_RULES.ticksPerSecond,
    ).toBe(180);
    expect(DEFAULT_GAME_RULES.baseHp).toBe(1000);
    expect(
      STARTER_CARDS.some(
        (card) =>
          card.cardId === 'archer' &&
          DEFAULT_GAME_RULES.baseTurret.range > card.range,
      ),
    ).toBe(true);
  });

  it('regenerates half an energy per second', () => {
    expect(
      (DEFAULT_GAME_RULES.energyRegenHundredthsPerTick *
        DEFAULT_GAME_RULES.ticksPerSecond) /
        100,
    ).toBe(0.5);
  });

  it('accepts the balanced starter deck and match rules', () => {
    expect(() =>
      createMatchState(
        'balance-test',
        { playerId: 'left-player', cards: STARTER_CARDS },
        { playerId: 'right-player', cards: STARTER_CARDS },
        DEFAULT_GAME_RULES,
      ),
    ).not.toThrow();
  });
});

function matchWithEnemyAt(enemyX: number) {
  const state = createMatchState(
    'range-test',
    { playerId: 'left-player', cards },
    { playerId: 'right-player', cards },
    rules,
  );
  state.units = [
    {
      id: 'runner-unit',
      spawnSequence: 1,
      owner: 'LEFT',
      cardId: 'runner',
      x: 20,
      y: 50,
      hp: 100,
      attackProgress: 0,
    },
    {
      id: 'blocker-unit',
      spawnSequence: 2,
      owner: 'RIGHT',
      cardId: 'blocker',
      x: enemyX,
      y: 50,
      hp: 100,
      attackProgress: 0,
    },
  ];
  return state;
}

describe('enemy range movement boundaries', () => {
  it('stops at the range boundary when the step ends inside an enemy range', () => {
    const { state } = advanceMatch(matchWithEnemyAt(32));
    const runner = state.units.find((unit) => unit.id === 'runner-unit');

    expect(runner?.x).toBeCloseTo(29);
  });

  it('does not stop when the enemy range circle is entirely behind the step', () => {
    const { state } = advanceMatch(matchWithEnemyAt(10));
    const runner = state.units.find((unit) => unit.id === 'runner-unit');

    expect(runner?.x).toBeCloseTo(30);
  });

  it('does not stop when the enemy range circle is entirely beyond the step', () => {
    const { state } = advanceMatch(matchWithEnemyAt(40));
    const runner = state.units.find((unit) => unit.id === 'runner-unit');

    expect(runner?.x).toBeCloseTo(30);
  });
});
