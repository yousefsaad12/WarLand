/** Display font already loaded for the React shell. */
export const FONT_DISPLAY = "'Kenney Future', Georgia, serif";
export const FONT_UI = 'system-ui, sans-serif';
export const FONT_MONO = 'ui-monospace, monospace';

/** Shared colour tokens for the Phaser battle UI. */
export const COLORS = {
  ink950: 0x070a10,
  ink900: 0x0b0e14,
  ink850: 0x10151f,
  ink800: 0x151b26,
  ink700: 0x1e2634,
  line: 0x26303f,
  gold: 0xd8b56a,
  goldSoft: 0x8a733f,
  sand: 0xc8b48a,
  stone: 0x5a6377,
  warm: 0xe8c88a,
  cool: 0x5f7fa8,
  danger: 0xff4d4d,
  hp: 0x53e08a,
  hpLow: 0xf87171,
  teamLeft: 0x3b82f6,
  teamRight: 0xef4444,
  felt: 0x0a0d12,
  highlight: 0xffe7a3,
} as const;

export function teamColor(side: 'LEFT' | 'RIGHT'): number {
  return side === 'LEFT' ? COLORS.teamLeft : COLORS.teamRight;
}

export function teamTextColor(side: 'LEFT' | 'RIGHT'): string {
  return side === 'LEFT' ? '#9fc8ff' : '#ffaaa8';
}

export const CARD_ACCENT: Record<string, number> = {
  knight: 0xf0c674,
  guard: 0x9fc3ff,
  scout: 0xd9b07e,
  archer: 0xb8e6a1,
};

export const UNIT_BODY_HEIGHT = 96;
