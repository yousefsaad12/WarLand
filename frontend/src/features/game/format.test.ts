import { describe, expect, it } from 'vitest';
import {
  energyValue,
  formatClock,
  formatEnergy,
  matchOutcome,
  reasonLabel,
  remainingSeconds,
} from './format';

describe('energy helpers', () => {
  it('converts hundredths to a display value', () => {
    expect(energyValue(350)).toBe(3.5);
    expect(energyValue(0)).toBe(0);
  });

  it('formats energy to one decimal place', () => {
    expect(formatEnergy(350)).toBe('3.5');
    expect(formatEnergy(1000)).toBe('10.0');
  });
});

describe('clock helpers', () => {
  it('computes remaining seconds from ticks', () => {
    expect(remainingSeconds(0, 1800, 10)).toBe(180);
    expect(remainingSeconds(600, 1800, 10)).toBe(120);
    expect(remainingSeconds(2000, 1800, 10)).toBe(0);
    expect(remainingSeconds(0, 1800, 0)).toBe(0);
  });

  it('formats a clock', () => {
    expect(formatClock(180)).toBe('3:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('match outcome', () => {
  it('detects a victory for the local side', () => {
    expect(
      matchOutcome({ winner: 'LEFT', reason: 'BASE_DESTROYED' }, 'LEFT'),
    ).toBe('victory');
  });

  it('detects a defeat', () => {
    expect(
      matchOutcome({ winner: 'RIGHT', reason: 'BASE_DESTROYED' }, 'LEFT'),
    ).toBe('defeat');
  });

  it('detects a draw', () => {
    expect(matchOutcome({ winner: 'DRAW', reason: 'TIME_LIMIT' }, 'LEFT')).toBe(
      'draw',
    );
  });

  it('treats cancelled matches as cancelled', () => {
    expect(
      matchOutcome({ winner: null, reason: 'CANCELLED' }, 'LEFT'),
    ).toBe('cancelled');
  });

  it('labels reasons', () => {
    expect(reasonLabel('BASE_DESTROYED')).toBe('Base destroyed');
    expect(reasonLabel('TIME_LIMIT')).toBe('Time limit reached');
    expect(reasonLabel('CANCELLED')).toBe('Match cancelled');
  });
});
