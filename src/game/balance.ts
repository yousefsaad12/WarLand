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
  laneHalfWidth: 20, // deploy band is y = 30..70
  unitSeparation: 1.5, // keep below the smallest card range (2)
  requestLedgerRetentionTicks: 100, // 10 seconds of replay protection
};

// ---------------------------------------------------------------------------
// Card progression
// ---------------------------------------------------------------------------

export const CARD_MAX_LEVEL = 10;

/** EXP required to advance a card from `level` to `level + 1`. */
export function cardExpToNextLevel(level: number): number {
  const safeLevel = Math.max(1, Math.min(CARD_MAX_LEVEL, Math.floor(level)));
  return 60 + (safeLevel - 1) * 40;
}

/** EXP awarded to every card in a player's deck based on the match outcome. */
export const MATCH_CARD_EXP: Record<MatchOutcome, number> = {
  WIN: 60,
  DRAW: 25,
  LOSS: 15,
};

export type MatchOutcome = 'WIN' | 'LOSS' | 'DRAW';

/** Fraction added to a card's HP and damage per level above 1. */
export const CARD_LEVEL_HP_BONUS = 0.05;
export const CARD_LEVEL_DAMAGE_BONUS = 0.05;

/** Scales a base stat by a card's level (capped, rounded to an integer). */
export function scaleStatByLevel(
  base: number,
  level: number,
  bonusPerLevel: number,
): number {
  const safeLevel = Math.max(1, Math.min(CARD_MAX_LEVEL, Math.floor(level)));
  return Math.round(base * (1 + (safeLevel - 1) * bonusPerLevel));
}

export interface CardExpState {
  level: number;
  exp: number;
}

export interface CardExpProgress extends CardExpState {
  expGained: number;
  expToNext: number;
  leveledUp: boolean;
}

/**
 * Applies gained EXP to a card, rolling over any number of level-ups (capped at
 * `CARD_MAX_LEVEL`). Pure: returns the next level/exp state plus level-up info.
 */
export function applyCardExp(card: CardExpState, gained: number): CardExpProgress {
  let level = Math.max(1, Math.floor(card.level));
  let exp = Math.max(0, Math.floor(card.exp)) + Math.max(0, Math.floor(gained));
  let leveledUp = false;

  while (level < CARD_MAX_LEVEL) {
    const needed = cardExpToNextLevel(level);
    if (exp < needed) break;
    exp -= needed;
    level += 1;
    leveledUp = true;
  }

  if (level >= CARD_MAX_LEVEL) exp = 0;

  return {
    level,
    exp,
    expGained: gained,
    expToNext: cardExpToNextLevel(level),
    leveledUp,
  };
}

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