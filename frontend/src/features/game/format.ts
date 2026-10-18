import type { GameSide, MatchResult } from '@/network/protocol';

/** Energy is transmitted in hundredths; display value is /100. */
export function energyValue(energyHundredths: number): number {
  return energyHundredths / 100;
}

export function formatEnergy(energyHundredths: number): string {
  return energyValue(energyHundredths).toFixed(1);
}

export function remainingSeconds(
  tick: number,
  maxTicks: number,
  ticksPerSecond: number,
): number {
  if (ticksPerSecond <= 0) return 0;
  return Math.max(0, (maxTicks - tick) / ticksPerSecond);
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

export type Outcome = 'victory' | 'defeat' | 'draw' | 'cancelled';

export function matchOutcome(
  result: MatchResult | null | undefined,
  side: GameSide | null,
): Outcome {
  if (!result) return 'draw';
  if (result.reason === 'CANCELLED' || result.winner === null) {
    return 'cancelled';
  }
  if (result.winner === 'DRAW') return 'draw';
  return side && result.winner === side ? 'victory' : 'defeat';
}

export function reasonLabel(reason: MatchResult['reason']): string {
  switch (reason) {
    case 'BASE_DESTROYED':
      return 'Base destroyed';
    case 'TIME_LIMIT':
      return 'Time limit reached';
    case 'CANCELLED':
      return 'Match cancelled';
    default:
      return reason;
  }
}
