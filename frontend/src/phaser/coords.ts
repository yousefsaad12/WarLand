/**
 * Map ↔ screen transforms for the landscape "war table" viewport.
 *
 * Engine map is 100×100. Only y≈30..70 is playable; we crop to that band
 * (plus a small margin) so the arena reads as a wide diorama, not a square.
 */

export const MAP_SIZE = 100;
export const MAP_CENTER = 50;
export const PLAY_Y_MIN = 30;
export const PLAY_Y_MAX = 70;
/** Extra map units shown above/below the legal band. */
export const VIEW_Y_PAD = 8;

export const VIEW_Y0 = PLAY_Y_MIN - VIEW_Y_PAD;
export const VIEW_Y1 = PLAY_Y_MAX + VIEW_Y_PAD;
export const VIEW_H = VIEW_Y1 - VIEW_Y0;

export interface ArenaLayout {
  /** Top-left of the playable map rect in screen space. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Pixels per map unit. */
  scale: number;
}

/** HUD chrome reserved so the board does not sit under cards/header. */
export function computeArenaLayout(
  screenW: number,
  screenH: number,
): ArenaLayout {
  const topPad = Math.max(72, screenH * 0.1);
  const bottomPad = Math.max(168, screenH * 0.22);
  const sidePad = Math.max(16, screenW * 0.02);

  const availW = screenW - sidePad * 2;
  const availH = screenH - topPad - bottomPad;

  const scale = Math.min(availW / MAP_SIZE, availH / VIEW_H);
  const width = MAP_SIZE * scale;
  const height = VIEW_H * scale;
  const x = (screenW - width) / 2;
  const y = topPad + (availH - height) / 2;

  return { x, y, width, height, scale };
}

export function mapToScreen(
  layout: ArenaLayout,
  mx: number,
  my: number,
): { x: number; y: number } {
  return {
    x: layout.x + (mx / MAP_SIZE) * layout.width,
    y: layout.y + ((my - VIEW_Y0) / VIEW_H) * layout.height,
  };
}

export function screenToMap(
  layout: ArenaLayout,
  sx: number,
  sy: number,
): { x: number; y: number } | null {
  const mx = ((sx - layout.x) / layout.width) * MAP_SIZE;
  const my = VIEW_Y0 + ((sy - layout.y) / layout.height) * VIEW_H;
  if (
    mx < -4 ||
    mx > MAP_SIZE + 4 ||
    my < VIEW_Y0 - 4 ||
    my > VIEW_Y1 + 4
  ) {
    return null;
  }
  return { x: mx, y: my };
}

export function isInPlayBand(my: number, laneHalfWidth: number): boolean {
  return Math.abs(my - MAP_CENTER) <= laneHalfWidth;
}
