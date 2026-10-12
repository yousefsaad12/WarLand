import type { CardSnapshot, GameRules } from './engine/engine.js';

export const DEFAULT_GAME_RULES: GameRules = {
  ticksPerSecond: 10,
  maxTicks: 3 * 60 * 10,
  startingEnergyHundredths: 500,
  maxEnergyHundredths: 1000,
  energyRegenHundredthsPerTick: 5,
  baseHp: 1000,
  baseTurret: {
    damage: 8,
    attackSpeed: 1,
    range: 14,
  },
  laneHalfWidth: 8, // deploy band is y = 42..58
  unitSeparation: 1.5, // keep below the smallest card range (2)
  requestLedgerRetentionTicks: 100, // 10 seconds of replay protection
};

export const STARTER_CARDS: CardSnapshot[] = [
  {
    cardId: 'knight',
    name: 'Knight',
    level: 1,
    cost: 3,
    hp: 180,
    damage: 14,
    attackSpeed: 1,
    movementSpeed: 6,
    range: 2,
  },
  {
    cardId: 'archer',
    name: 'Archer',
    level: 1,
    cost: 4,
    hp: 85,
    damage: 8,
    attackSpeed: 1.25,
    movementSpeed: 5,
    range: 11,
  },
  {
    cardId: 'guard',
    name: 'Guard',
    level: 1,
    cost: 4,
    hp: 250,
    damage: 10,
    attackSpeed: 0.8,
    movementSpeed: 4,
    range: 2,
  },
  {
    cardId: 'scout',
    name: 'Scout',
    level: 1,
    cost: 2,
    hp: 70,
    damage: 4,
    attackSpeed: 1.5,
    movementSpeed: 10,
    range: 2,
  },
];