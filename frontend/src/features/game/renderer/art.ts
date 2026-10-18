import { Graphics } from 'pixi.js';
import type { GameSide } from '@/network/protocol';
import {
  THEME,
  viewerColor,
  viewerColorDark,
} from './theme';

export interface UnitStyle {
  radius: number;
  shape: 'knight' | 'archer' | 'guard' | 'scout';
}

const CARD_STYLES: Record<string, UnitStyle> = {
  knight: { radius: 2.9, shape: 'knight' },
  archer: { radius: 2.5, shape: 'archer' },
  guard: { radius: 3.2, shape: 'guard' },
  scout: { radius: 2.1, shape: 'scout' },
};

export function unitStyle(cardId: string): UnitStyle {
  return CARD_STYLES[cardId] ?? { radius: 2.7, shape: 'knight' };
}

/**
 * Draws a unit body centred on (0, 0). `size` is the screen-space radius.
 *
 * Colours are viewer-relative: the local player's army is always blue and the
 * opponent is always red, matching the HUD, regardless of assigned side.
 */
export function drawUnitBody(
  g: Graphics,
  cardId: string,
  _side: GameSide,
  isLocal: boolean,
  size: number,
): void {
  const style = unitStyle(cardId);
  const fill = viewerColor(isLocal);
  const dark = viewerColorDark(isLocal);
  const light = isLocal
    ? THEME.colors.friendlyLight
    : THEME.colors.enemyLight;

  g.clear();

  // Drop shadow.
  g.ellipse(0, size * 0.66, size * 1.02, size * 0.42).fill({
    color: THEME.colors.shadow,
    alpha: 0.38,
  });

  // Team base plate ring.
  g.circle(0, 0, size).fill({ color: dark, alpha: 0.95 });
  g.circle(0, 0, size).stroke({
    width: Math.max(1.5, size * 0.14),
    color: isLocal ? THEME.colors.local : fill,
    alpha: isLocal ? 1 : 0.85,
  });

  const body = new Graphics();
  switch (style.shape) {
    case 'knight':
      body
        .roundRect(-size * 0.6, -size * 0.64, size * 1.2, size * 1.28, size * 0.3)
        .fill(fill);
      body.rect(-size * 0.12, -size * 0.5, size * 0.24, size * 1).fill(light);
      body.rect(-size * 0.5, -size * 0.14, size, size * 0.22).fill(light);
      break;
    case 'archer':
      body
        .poly([0, -size * 0.82, size * 0.76, size * 0.62, -size * 0.76, size * 0.62])
        .fill(fill);
      body
        .moveTo(size * 0.05, -size * 0.52)
        .arc(0, -size * 0.08, size * 0.68, Math.PI * 0.12, Math.PI * 0.88)
        .stroke({ width: Math.max(1.5, size * 0.14), color: light });
      break;
    case 'guard':
      body
        .moveTo(0, -size * 0.86)
        .lineTo(size * 0.74, -size * 0.44)
        .lineTo(size * 0.68, size * 0.54)
        .lineTo(0, size * 0.94)
        .lineTo(-size * 0.68, size * 0.54)
        .lineTo(-size * 0.74, -size * 0.44)
        .closePath()
        .fill(fill);
      body.circle(0, 0, size * 0.28).fill(light);
      break;
    case 'scout':
      body
        .poly([0, -size * 0.9, size * 0.74, 0, 0, size * 0.9, -size * 0.74, 0])
        .fill(fill);
      body.circle(0, 0, size * 0.22).fill(light);
      break;
  }
  g.addChild(body);
}

/** Draws a base keep centred on (0, 0). */
export function drawBase(
  g: Graphics,
  _side: GameSide,
  size: number,
  isLocal: boolean,
): void {
  const fill = viewerColor(isLocal);
  const dark = viewerColorDark(isLocal);
  const w = size * 1.5;
  const h = size * 1.9;

  g.clear();
  g.ellipse(0, h * 0.52, w * 0.78, size * 0.3).fill({
    color: THEME.colors.shadow,
    alpha: 0.4,
  });

  // Keep body with a soft team glow.
  g.roundRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, size * 0.26).fill({
    color: fill,
    alpha: 0.16,
  });
  g.roundRect(-w / 2, -h / 2, w, h, size * 0.22).fill(THEME.colors.stone);
  g.roundRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3, size * 0.2).fill(
    THEME.colors.stoneLight,
  );
  g.roundRect(-w / 2, -h / 2, w, h, size * 0.22).stroke({
    width: Math.max(1.5, size * 0.1),
    color: isLocal ? THEME.colors.local : fill,
    alpha: 0.95,
  });

  // Battlements.
  const merlonW = w / 5;
  for (let i = 0; i < 3; i += 1) {
    g.rect(
      -w / 2 + i * 2 * merlonW + merlonW * 0.5,
      -h / 2 - size * 0.24,
      merlonW,
      size * 0.32,
    ).fill(THEME.colors.stoneLight);
  }

  // Team banner.
  g.rect(-size * 0.17, -h * 0.16, size * 0.34, h * 0.52).fill(dark);
  g.poly([0, -h * 0.16, size * 0.6, -h * 0.02, 0, h * 0.14]).fill(fill);

  // Turret.
  g.circle(0, -h * 0.62, size * 0.52).fill(THEME.colors.stoneLight);
  g.circle(0, -h * 0.62, size * 0.36).fill(dark);
  g.circle(0, -h * 0.62, size * 0.22).fill(fill);
}

export interface HealthBarOptions {
  width: number;
  height: number;
  ratio: number;
  y: number;
}

export function drawHealthBar(g: Graphics, opts: HealthBarOptions): void {
  const { width, height, ratio, y } = opts;
  const clamped = Math.max(0, Math.min(1, ratio));
  g.clear();
  g.roundRect(-width / 2 - 1.5, y - 1.5, width + 3, height + 3, height).fill({
    color: THEME.colors.shadow,
    alpha: 0.65,
  });
  g.roundRect(-width / 2, y, width, height, height).fill(
    THEME.colors.hpTrack,
  );
  const color = clamped > 0.4 ? THEME.colors.health : THEME.colors.healthLow;
  if (clamped > 0) {
    g.roundRect(-width / 2, y, width * clamped, height, height).fill(color);
  }
}
