/**
 * Client-side mirrors of the authoritative rule constants.
 *
 * The match view does not carry every rule value (for example the starting
 * base HP), so the HUD needs the same numbers the engine uses. Keep these in
 * sync with `backend/src/game/balance.ts`.
 */

/** Maximum base HP (`DEFAULT_GAME_RULES.baseHp`). */
export const BASE_MAX_HP = 1000;

/** Maximum energy, in whole energy points (`maxEnergyHundredths / 100`). */
export const MAX_ENERGY = 10;

/** Fraction added to a card's HP per level above 1. */
export const CARD_LEVEL_HP_BONUS = 0.05;

/** Fraction added to a card's damage per level above 1. */
export const CARD_LEVEL_DAMAGE_BONUS = 0.05;

/** Highest card level the progression system allows. */
export const CARD_MAX_LEVEL = 10;

/**
 * Scales a base stat by a card's level, capped and rounded to an integer.
 * Mirrors `scaleStatByLevel` in `backend/src/game/balance.ts` so the card
 * hand shows exactly the numbers the engine deploys.
 */
export function scaleStatByLevel(
  base: number,
  level: number,
  bonusPerLevel: number,
): number {
  const safeLevel = Math.max(1, Math.min(CARD_MAX_LEVEL, Math.floor(level)));
  return Math.round(base * (1 + (safeLevel - 1) * bonusPerLevel));
}
