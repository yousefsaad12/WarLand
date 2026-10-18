import type { GameSide } from '@/network/protocol';

/** Matches the backend engine constants. */
export const MAP_SIZE = 100;
export const MAP_CENTER = MAP_SIZE / 2;

export interface MapPoint {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Square screen rectangle (in canvas-local pixels) that the 0..100 map is
 * drawn into. A uniform scale on both axes keeps Euclidean distances (movement,
 * attack ranges) visually accurate.
 */
export interface ArenaRect {
  x: number;
  y: number;
  size: number;
}

export interface ArenaTransform {
  readonly rect: ArenaRect;
  readonly width: number;
  readonly height: number;
  /** When true the map is mirrored horizontally so map x=100 is on the left. */
  readonly mirror: boolean;
  toScreen(map: MapPoint): ScreenPoint;
  toScreenXY(x: number, y: number): ScreenPoint;
  toMap(screen: ScreenPoint): MapPoint;
  /** Converts a length in map units (0..100) to pixels. */
  scale(lengthInMapUnits: number): number;
}

export function createArenaTransform(
  rect: ArenaRect,
  mirror = false,
): ArenaTransform {
  const { x, y, size } = rect;
  const xFraction = (mapX: number) =>
    mirror ? (MAP_SIZE - mapX) / MAP_SIZE : mapX / MAP_SIZE;
  return {
    rect,
    width: size,
    height: size,
    mirror,
    toScreen: (map) => ({
      x: x + xFraction(map.x) * size,
      y: y + (map.y / MAP_SIZE) * size,
    }),
    toScreenXY: (mapX, mapY) => ({
      x: x + xFraction(mapX) * size,
      y: y + (mapY / MAP_SIZE) * size,
    }),
    toMap: (screen) => {
      const fx = (screen.x - x) / size;
      const fy = (screen.y - y) / size;
      const mapX = mirror ? 1 - fx : fx;
      return { x: mapX * MAP_SIZE, y: fy * MAP_SIZE };
    },
    scale: (lengthInMapUnits) => (lengthInMapUnits / MAP_SIZE) * size,
  };
}

export function clampToMap(x: number, y: number): MapPoint {
  return {
    x: Math.min(MAP_SIZE, Math.max(0, x)),
    y: Math.min(MAP_SIZE, Math.max(0, y)),
  };
}

export function isInsideMap(x: number, y: number): boolean {
  return x >= 0 && x <= MAP_SIZE && y >= 0 && y <= MAP_SIZE;
}

export function isInOwnHalf(x: number, side: GameSide): boolean {
  // Strict comparison mirrors the engine: nobody may deploy on x = 50.
  return side === 'LEFT' ? x < MAP_CENTER : x > MAP_CENTER;
}

export function isInLane(y: number, laneHalfWidth: number): boolean {
  return Math.abs(y - MAP_CENTER) <= laneHalfWidth;
}

/**
 * Mirrors the engine's `OUTSIDE_DEPLOYMENT_ZONE` rule. This is used for UI
 * feedback only; the backend remains authoritative.
 */
export function isInDeploymentZone(
  x: number,
  y: number,
  side: GameSide,
  laneHalfWidth: number,
): boolean {
  return (
    isInsideMap(x, y) && isInOwnHalf(x, side) && isInLane(y, laneHalfWidth)
  );
}

export const BASE_POSITION: Record<GameSide, MapPoint> = {
  LEFT: { x: 0, y: MAP_CENTER },
  RIGHT: { x: MAP_SIZE, y: MAP_CENTER },
};

export function oppositeSide(side: GameSide): GameSide {
  return side === 'LEFT' ? 'RIGHT' : 'LEFT';
}
