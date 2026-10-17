import { describe, expect, it } from 'vitest';
import {
  createArenaTransform,
  isInDeploymentZone,
  MAP_SIZE,
} from './coordinates';

describe('createArenaTransform', () => {
  const rect = { x: 0, y: 0, size: 100 };

  it('maps map coordinates to screen without mirroring', () => {
    const t = createArenaTransform(rect);
    expect(t.toScreenXY(0, 50)).toEqual({ x: 0, y: 50 });
    expect(t.toScreenXY(MAP_SIZE, 50)).toEqual({ x: 100, y: 50 });
  });

  it('round-trips screen <-> map without mirroring', () => {
    const t = createArenaTransform(rect);
    const screen = t.toScreenXY(37, 62);
    const map = t.toMap(screen);
    expect(map.x).toBeCloseTo(37);
    expect(map.y).toBeCloseTo(62);
  });

  it('flips the x axis when mirrored', () => {
    const t = createArenaTransform(rect, true);
    expect(t.toScreenXY(0, 50)).toEqual({ x: 100, y: 50 });
    expect(t.toScreenXY(MAP_SIZE, 50)).toEqual({ x: 0, y: 50 });
    expect(t.mirror).toBe(true);
  });

  it('round-trips screen <-> map when mirrored', () => {
    const t = createArenaTransform(rect, true);
    const screen = t.toScreenXY(20, 40);
    const map = t.toMap(screen);
    expect(map.x).toBeCloseTo(20);
    expect(map.y).toBeCloseTo(40);
  });

  it('keeps the local half on the left of the screen when mirrored', () => {
    // A RIGHT-side player owns map x in (50, 100]; mirrored that must appear
    // on the left (screen x < 50).
    const t = createArenaTransform(rect, true);
    expect(t.toScreenXY(75, 50).x).toBeLessThan(50);
  });
});

describe('isInDeploymentZone', () => {
  it('allows the LEFT player only in the left own half + lane', () => {
    expect(isInDeploymentZone(30, 50, 'LEFT', 8)).toBe(true);
    expect(isInDeploymentZone(30, 58, 'LEFT', 8)).toBe(true);
    expect(isInDeploymentZone(30, 59, 'LEFT', 8)).toBe(false);
    expect(isInDeploymentZone(70, 50, 'LEFT', 8)).toBe(false);
  });

  it('allows the RIGHT player only in the right own half + lane', () => {
    expect(isInDeploymentZone(70, 50, 'RIGHT', 8)).toBe(true);
    expect(isInDeploymentZone(30, 50, 'RIGHT', 8)).toBe(false);
  });

  it('forbids deploying exactly on the river line', () => {
    expect(isInDeploymentZone(50, 50, 'LEFT', 8)).toBe(false);
    expect(isInDeploymentZone(50, 50, 'RIGHT', 8)).toBe(false);
  });

  it('rejects out-of-bounds positions', () => {
    expect(isInDeploymentZone(-1, 50, 'LEFT', 8)).toBe(false);
    expect(isInDeploymentZone(30, 120, 'LEFT', 8)).toBe(false);
  });
});
