/** Shared visual tokens for the PixiJS battlefield and HUD. */
export const THEME = {
  colors: {
    background: 0x0b0e14,

    // Arena terrain
    arenaGround: 0x161c28,
    arenaGroundAlt: 0x1d2532,
    arenaEdge: 0x33405a,
    grid: 0x2b3546,
    river: 0x184a5e,
    riverGlow: 0x52a7bd,
    riverBank: 0x2a3a48,

    // Structures
    stone: 0x3a4356,
    stoneLight: 0x59657c,
    stoneShadow: 0x232a38,

    // Accents
    gold: 0xd8b56a,
    goldSoft: 0x8a733f,

    // Viewer-relative teams (local is always the "friendly" colour)
    friendly: 0x4f8cff,
    friendlyDark: 0x1d3f86,
    friendlyLight: 0xa9c8ff,
    enemy: 0xff5d5d,
    enemyDark: 0x7f1f1f,
    enemyLight: 0xffb3b3,

    // Legacy alias used by the base/unit art.
    left: 0x4f8cff,
    leftDark: 0x1d3f86,
    right: 0xff5d5d,
    rightDark: 0x7f1f1f,
    local: 0xffd98a,

    health: 0x53e08a,
    healthLow: 0xf87171,
    hpTrack: 0x1a2130,

    white: 0xf5f5f4,
    shadow: 0x000000,
  },
  fonts: {
    unit: 'PixiJS',
  },
} as const;

export type TeamSide = 'LEFT' | 'RIGHT';

export function teamColor(side: TeamSide): number {
  return side === 'LEFT' ? THEME.colors.friendly : THEME.colors.enemy;
}

export function teamColorDark(side: TeamSide): number {
  return side === 'LEFT' ? THEME.colors.friendlyDark : THEME.colors.enemyDark;
}

/** Colour a unit/base should render as, relative to the local viewer. */
export function viewerColor(isLocal: boolean): number {
  return isLocal ? THEME.colors.friendly : THEME.colors.enemy;
}

export function viewerColorDark(isLocal: boolean): number {
  return isLocal ? THEME.colors.friendlyDark : THEME.colors.enemyDark;
}
