import Phaser from 'phaser';

type ColorStop = readonly [offset: number, color: string];

const GLOW_SIZE = 256;
const VIGNETTE_SIZE = 512;
const GRAIN_SIZE = 96;

function radialGradient(
  scene: Phaser.Scene,
  key: string,
  size: number,
  stops: ColorStop[],
): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, size, size);
  if (!texture) return;
  const ctx = texture.context;
  const radius = size / 2;
  const gradient = ctx.createRadialGradient(
    radius,
    radius,
    0,
    radius,
    radius,
    radius,
  );
  for (const [offset, color] of stops) {
    gradient.addColorStop(offset, color);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  texture.refresh();
}

function grain(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, GRAIN_SIZE, GRAIN_SIZE);
  if (!texture) return;
  const ctx = texture.context;
  const image = ctx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = 120 + Math.floor(Math.random() * 110);
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = Math.floor(Math.random() * 30);
  }
  ctx.putImageData(image, 0, 0);
  texture.refresh();
}

/**
 * Runtime textures that would bloat the asset folder: soft radial falloff for
 * torch/base lighting, a smooth vignette, and a faint film grain for the table.
 */
export function ensureArenaTextures(scene: Phaser.Scene): void {
  radialGradient(scene, 'fx_radial_glow', GLOW_SIZE, [
    [0, 'rgba(255,255,255,0.95)'],
    [0.25, 'rgba(255,255,255,0.6)'],
    [0.55, 'rgba(255,255,255,0.22)'],
    [0.8, 'rgba(255,255,255,0.06)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  radialGradient(scene, 'fx_radial_soft', GLOW_SIZE, [
    [0, 'rgba(255,255,255,0.55)'],
    [0.4, 'rgba(255,255,255,0.2)'],
    [0.72, 'rgba(255,255,255,0.06)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  radialGradient(scene, 'fx_radial_shadow', GLOW_SIZE, [
    [0, 'rgba(0,0,0,0.8)'],
    [0.45, 'rgba(0,0,0,0.45)'],
    [0.78, 'rgba(0,0,0,0.12)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  radialGradient(scene, 'fx_vignette', VIGNETTE_SIZE, [
    [0, 'rgba(0,0,0,0)'],
    [0.52, 'rgba(0,0,0,0)'],
    [0.72, 'rgba(0,0,0,0.16)'],
    [0.86, 'rgba(0,0,0,0.44)'],
    [1, 'rgba(0,0,0,0.78)'],
  ]);
  grain(scene, 'fx_grain');
}
