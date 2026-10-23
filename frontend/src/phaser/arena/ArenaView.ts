import Phaser from 'phaser';
import {
  ArenaLayout,
  MAP_CENTER,
  PLAY_Y_MAX,
  PLAY_Y_MIN,
  VIEW_Y0,
  VIEW_Y1,
  computeArenaLayout,
  mapToScreen,
} from '../coords';
import { COLORS } from '../theme';
import { sfx } from '../audio/SfxManager';
import type { VfxManager } from '../vfx/VfxManager';
import { ensureArenaTextures } from './textures';

type BaseSide = 'LEFT' | 'RIGHT';

const GRID_X = 26;
const GRID_Y = 13;
const AREA_PAD = 22;
const FRAME_PAD = 8;

interface BaseVisual {
  keep: Phaser.GameObjects.Sprite;
  keepHeight: number;
  keepScale: number;
  platformY: number;
  glow: Phaser.GameObjects.Image;
  pool: Phaser.GameObjects.Image;
  hpFill: Phaser.GameObjects.Rectangle;
  hpWidth: number;
  cracks: Phaser.GameObjects.Graphics;
  smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  banner: Phaser.GameObjects.Triangle;
  flagpole: Phaser.GameObjects.Rectangle;
  emblem: Phaser.GameObjects.Arc;
  crystal: Phaser.GameObjects.Image;
  crystalAura: Phaser.GameObjects.Image;
  crystalRing: Phaser.GameObjects.Arc;
  crystalBaseY: number;
  torches: { glow: Phaser.GameObjects.Image; core: Phaser.GameObjects.Arc }[];
  pos: { x: number; y: number };
  destroyed: boolean;
  lastPulseAt: number;
}

/**
 * The battle board. Built like a lit war-table diorama: warm base pools,
 * a cool river, a clearly framed legal band and oversized cards in the HUD.
 */
export class ArenaView {
  private root: Phaser.GameObjects.Container;
  private waterTiles: Phaser.GameObjects.TileSprite[] = [];
  private banners: Phaser.GameObjects.Triangle[] = [];
  private flames: {
    glow: Phaser.GameObjects.Image;
    glowScale: number;
    core: Phaser.GameObjects.Arc;
    phase: number;
  }[] = [];
  private layout!: ArenaLayout;
  private bases: Record<BaseSide, BaseVisual> = {} as never;
  private playTop = 0;
  private playBottom = 0;

  constructor(
    private scene: Phaser.Scene,
    private vfx: VfxManager,
  ) {
    this.root = scene.add.container(0, 0);
    this.root.setDepth(0);
  }

  getLayout(): ArenaLayout {
    return this.layout;
  }

  rebuild() {
    this.root.removeAll(true);
    this.waterTiles = [];
    this.banners = [];
    this.flames = [];
    this.bases = {} as never;
    ensureArenaTextures(this.scene);
    this.layout = computeArenaLayout(
      this.scene.scale.width,
      this.scene.scale.height,
    );
    this.playTop = mapToScreen(this.layout, 0, PLAY_Y_MIN).y;
    this.playBottom = mapToScreen(this.layout, 0, PLAY_Y_MAX).y;
    this.drawTable();
    this.drawArenaBed();
    this.drawGround();
    this.drawLane();
    this.drawRiver();
    this.drawBridge();
    this.drawFoliage();
    this.drawLighting();
    this.drawVignette();
    this.drawBases();
  }

  update(time: number, reduceMotion: boolean) {
    if (reduceMotion) return;
    for (const tile of this.waterTiles) {
      tile.setTilePosition(Math.sin(time / 1150) * 3, time * 0.014);
    }
    const sway = Math.sin(time / 1100) * 0.05;
    for (const banner of this.banners) {
      banner.setRotation(sway);
    }
    for (const flame of this.flames) {
      const flicker = 0.72 + Math.sin(time / 130 + flame.phase) * 0.2;
      flame.glow.setAlpha(flicker);
      flame.glow.setScale(flame.glowScale * (0.92 + flicker * 0.14));
      flame.core.setScale(0.9 + flicker * 0.2);
    }
    for (const side of ['LEFT', 'RIGHT'] as const) {
      const b = this.bases[side];
      if (b && !b.destroyed && b.crystal) {
        const bob = Math.sin(time / 480 + (side === 'LEFT' ? 0 : 2.5)) * 3.5;
        b.crystal.y = b.crystalBaseY + bob;
        b.crystalAura.y = b.crystalBaseY + bob;
        b.crystalRing.y = b.crystalBaseY + bob;
        b.crystalAura.setAlpha(0.45 + Math.sin(time / 280) * 0.2);
      }
    }
  }

  setBaseHp(leftHp: number, rightHp: number, maxHp: number) {
    this.applyBase('LEFT', leftHp, maxHp);
    this.applyBase('RIGHT', rightHp, maxHp);
  }

  pulseBase(side: BaseSide) {
    const base = this.bases[side];
    if (!base || base.destroyed) return;
    const now = this.scene.time.now;
    if (now - base.lastPulseAt < 90) return;
    base.lastPulseAt = now;

    if (base.crystal) {
      this.scene.tweens.add({
        targets: [base.crystal, base.crystalRing],
        scale: 1.35,
        duration: 90,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }

    this.scene.tweens.add({
      targets: base.keep,
      scaleX: base.keepScale * 1.045,
      scaleY: base.keepScale * 1.045,
      duration: 55,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: base.glow,
      alpha: 0.62,
      duration: 130,
      yoyo: true,
    });
    const ring = this.scene.add
      .circle(base.pos.x, base.pos.y - base.keepHeight * 0.32, 18)
      .setStrokeStyle(3, 0xff6b6b, 0.9);
    this.scene.tweens.add({
      targets: ring,
      scale: 3.4,
      alpha: 0,
      duration: 430,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    this.vfx.burstEmbers(base.pos.x, base.pos.y - base.keepHeight * 0.3, 4);
  }

  getBounds() {
    return {
      x: this.layout.x,
      y: this.layout.y,
      width: this.layout.width,
      height: this.layout.height,
    };
  }

  private applyBase(side: BaseSide, hp: number, maxHp: number) {
    const base = this.bases[side];
    if (!base) return;
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    base.hpFill.width = Math.max(0, base.hpWidth * ratio);
    base.hpFill.setFillStyle(ratio < 0.33 ? COLORS.hpLow : COLORS.gold);

    base.keep.setTint(
      ratio < 0.33 ? 0xffb8ad : ratio < 0.66 ? 0xffe3d6 : 0xffffff,
    );
    base.glow.setAlpha(0.2 + (1 - ratio) * 0.3);
    base.pool.setAlpha(0.18 + ratio * 0.2);
    base.emblem.setAlpha(0.55 + ratio * 0.35);

    this.drawCracks(base, ratio);
    if (ratio < 0.34 && ratio > 0) {
      if (!base.smoke.emitting) base.smoke.start();
    } else if (base.smoke.emitting) {
      base.smoke.stop();
    }

    if (hp <= 0 && !base.destroyed) {
      this.destroyBase(side);
    }
  }

  private drawCracks(base: BaseVisual, ratio: number) {
    base.cracks.clear();
    if (ratio >= 0.66) return;
    const count = ratio < 0.33 ? 10 : 5;
    const rng = new Phaser.Math.RandomDataGenerator([
      `${base.pos.x.toFixed(1)}-${ratio.toFixed(2)}`,
    ]);
    base.cracks.lineStyle(1.6, 0x121620, 0.82);
    for (let i = 0; i < count; i += 1) {
      let x =
        base.pos.x +
        rng.between(-base.keepHeight * 0.22, base.keepHeight * 0.22);
      let y = base.keep.y - base.keepHeight * rng.between(0.16, 0.68);
      base.cracks.beginPath();
      base.cracks.moveTo(x, y);
      for (let step = 0; step < 4; step += 1) {
        x += rng.between(-6, 6);
        y += rng.between(5, 10);
        base.cracks.lineTo(x, y);
      }
      base.cracks.strokePath();
    }
  }

  private destroyBase(side: BaseSide) {
    const base = this.bases[side];
    if (!base) return;
    base.destroyed = true;
    base.smoke.start();
    base.banner.setVisible(false);
    base.flagpole.setVisible(false);
    base.emblem.setVisible(false);
    if (base.crystal) {
      base.crystal.setVisible(false);
      base.crystalAura.setVisible(false);
      base.crystalRing.setVisible(false);
    }
    for (const torch of base.torches) {
      torch.glow.setVisible(false);
      torch.core.setVisible(false);
    }
    base.glow.setTint(0xff3f3f).setAlpha(0.45);
    base.pool.setTint(0xff3f3f).setAlpha(0.28);
    sfx.baseHit();
    this.scene.cameras.main.shake(300, 0.0065);
    this.vfx.shatter(
      base.pos.x,
      base.pos.y - base.keepHeight * 0.24,
      side === 'LEFT' ? COLORS.teamLeft : COLORS.teamRight,
    );

    const scorch = this.scene.add
      .ellipse(
        base.pos.x,
        base.platformY,
        base.keepHeight * 1.35,
        base.keepHeight * 0.42,
        0x08070a,
        0.62,
      )
      .setDepth(6);
    this.root.add(scorch);
    const rng = new Phaser.Math.RandomDataGenerator([`rubble-${side}`]);
    for (let i = 0; i < 5; i += 1) {
      const rock = this.scene.add.image(
        base.pos.x + rng.between(-base.keepHeight * 0.6, base.keepHeight * 0.6),
        base.platformY +
          rng.between(-base.keepHeight * 0.1, base.keepHeight * 0.22),
        `rock${(i % 3) + 1}`,
      );
      rock.setScale(rng.realInRange(0.16, 0.3));
      rock.setAlpha(0.85);
      rock.setAngle(rng.between(-25, 25));
      this.root.add(rock);
    }

    this.scene.tweens.add({
      targets: base.keep,
      angle: side === 'LEFT' ? -10 : 10,
      y: base.keep.y + base.keepHeight * 0.16,
      alpha: 0.48,
      duration: 580,
      ease: 'Cubic.easeIn',
    });
  }

  private drawTable() {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const table = this.scene.add.graphics();
    table.fillGradientStyle(0x181e2b, 0x181e2b, 0x07090f, 0x07090f, 1);
    table.fillRect(0, 0, w, h);
    this.root.add(table);

    const ambient = this.scene.add
      .image(w / 2, h * 0.38, 'fx_radial_soft')
      .setDisplaySize(w * 1.15, h * 1.05)
      .setTint(0x647ba8)
      .setAlpha(0.24)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.root.add(ambient);

    const ridges = this.scene.add.graphics();
    ridges.fillStyle(0x151a27, 0.9);
    ridges.beginPath();
    ridges.moveTo(0, h * 0.3);
    ridges.lineTo(w * 0.16, h * 0.23);
    ridges.lineTo(w * 0.33, h * 0.27);
    ridges.lineTo(w * 0.52, h * 0.2);
    ridges.lineTo(w * 0.7, h * 0.26);
    ridges.lineTo(w * 0.86, h * 0.21);
    ridges.lineTo(w, h * 0.25);
    ridges.lineTo(w, 0);
    ridges.lineTo(0, 0);
    ridges.closePath();
    ridges.fillPath();
    ridges.fillStyle(0x0e131d, 0.85);
    ridges.beginPath();
    ridges.moveTo(0, h * 0.36);
    ridges.lineTo(w * 0.22, h * 0.3);
    ridges.lineTo(w * 0.44, h * 0.34);
    ridges.lineTo(w * 0.66, h * 0.28);
    ridges.lineTo(w * 0.88, h * 0.33);
    ridges.lineTo(w, h * 0.3);
    ridges.lineTo(w, 0);
    ridges.lineTo(0, 0);
    ridges.closePath();
    ridges.fillPath();
    this.root.add(ridges);

    const grain = this.scene.add
      .tileSprite(0, 0, w, h, 'fx_grain')
      .setOrigin(0)
      .setAlpha(0.55);
    this.root.add(grain);

    const cliffs = this.scene.add.graphics();
    cliffs.fillStyle(0x0c111b, 0.95);
    cliffs.beginPath();
    cliffs.moveTo(this.layout.x - AREA_PAD - 42, 0);
    cliffs.lineTo(this.layout.x - AREA_PAD - 14, h * 0.18);
    cliffs.lineTo(this.layout.x - AREA_PAD - 8, h);
    cliffs.lineTo(this.layout.x - AREA_PAD - 110, h);
    cliffs.closePath();
    cliffs.fillPath();
    cliffs.fillStyle(0x0e1420, 0.95);
    cliffs.beginPath();
    cliffs.moveTo(this.layout.x + this.layout.width + AREA_PAD + 42, 0);
    cliffs.lineTo(this.layout.x + this.layout.width + AREA_PAD + 14, h * 0.18);
    cliffs.lineTo(this.layout.x + this.layout.width + AREA_PAD + 8, h);
    cliffs.lineTo(this.layout.x + this.layout.width + AREA_PAD + 110, h);
    cliffs.closePath();
    cliffs.fillPath();
    this.root.add(cliffs);
  }

  private drawArenaBed() {
    const { x, y, width, height } = this.layout;
    const outerX = x - AREA_PAD - FRAME_PAD;
    const outerY = y - AREA_PAD - FRAME_PAD;
    const outerW = width + (AREA_PAD + FRAME_PAD) * 2;
    const outerH = height + (AREA_PAD + FRAME_PAD) * 2;

    const shadow = this.scene.add.graphics();
    shadow.fillStyle(0x000000, 0.42);
    shadow.fillRoundedRect(outerX + 3, outerY + 12, outerW, outerH, 34);
    this.root.add(shadow);

    const frame = this.scene.add.graphics();
    frame.fillStyle(0x121826, 1);
    frame.fillRoundedRect(outerX, outerY, outerW, outerH, 32);
    frame.lineStyle(2, 0x3a455c, 0.85);
    frame.strokeRoundedRect(outerX, outerY, outerW, outerH, 32);
    frame.fillStyle(0x232c3e, 1);
    frame.fillRoundedRect(
      x - AREA_PAD,
      y - AREA_PAD,
      width + AREA_PAD * 2,
      height + AREA_PAD * 2,
      24,
    );
    frame.lineStyle(1, 0x5a6680, 0.55);
    frame.strokeRoundedRect(
      x - AREA_PAD,
      y - AREA_PAD,
      width + AREA_PAD * 2,
      height + AREA_PAD * 2,
      24,
    );
    const innerX = x - 7;
    const innerY = y - 7;
    const innerW = width + 14;
    const innerH = height + 14;
    frame.fillGradientStyle(0x0b0f17, 0x0b0f17, 0x05070b, 0x05070b, 1);
    frame.fillRoundedRect(innerX, innerY, innerW, innerH, 16);
    frame.lineStyle(1, 0x1d2534, 0.9);
    frame.strokeRoundedRect(innerX, innerY, innerW, innerH, 16);

    for (const [cx, cy] of [
      [outerX + 18, outerY + 18],
      [outerX + outerW - 18, outerY + 18],
      [outerX + 18, outerY + outerH - 18],
      [outerX + outerW - 18, outerY + outerH - 18],
    ]) {
      frame.fillStyle(0x6b7792, 0.7);
      frame.fillCircle(cx, cy, 3.5);
      frame.fillStyle(0xc7d2e8, 0.5);
      frame.fillCircle(cx - 1, cy - 1, 1.3);
    }
    this.root.add(frame);

    const margin = this.scene.add
      .tileSprite(x - 6, y - 6, width + 12, height + 12, 'dirt1')
      .setOrigin(0)
      .setTint(0x4b5468)
      .setAlpha(0.55);
    this.root.add(margin);

    const hatch = this.scene.add.graphics();
    hatch.lineStyle(1, 0xffffff, 0.035);
    for (let i = -height; i < width + height; i += 15) {
      hatch.lineBetween(x + i, y - 7, x + i + height, y + height + 7);
    }
    hatch.lineStyle(1, 0xc09a5a, 0.1);
    for (let i = 0; i < width; i += 42) {
      hatch.lineBetween(x + i, this.playTop - 15, x + i + 16, this.playTop - 2);
      hatch.lineBetween(
        x + i,
        this.playBottom + 15,
        x + i + 16,
        this.playBottom + 2,
      );
    }
    this.root.add(hatch);

    const kerb = this.scene.add.graphics();
    kerb.fillStyle(0x1a2130, 1);
    kerb.fillRect(x - 7, this.playTop - 6, width + 14, 9);
    kerb.fillRect(x - 7, this.playBottom - 3, width + 14, 9);
    kerb.lineStyle(1.5, 0x8d7745, 0.5);
    kerb.lineBetween(x - 4, this.playTop - 5, x + width + 4, this.playTop - 5);
    kerb.lineBetween(
      x - 4,
      this.playBottom + 5,
      x + width + 4,
      this.playBottom + 5,
    );
    kerb.fillStyle(0x5f6a80, 0.75);
    for (let i = 0; i < width; i += 34) {
      kerb.fillRect(x + i, this.playTop - 7, 26, 7);
      kerb.fillRect(x + i + 12, this.playBottom + 1, 26, 7);
    }
    this.root.add(kerb);
  }

  private drawGround() {
    const { x, width } = this.layout;
    const cellW = width / GRID_X;
    const cellH = (this.playBottom - this.playTop) / GRID_Y;
    const grass = ['grass1', 'grass2', 'grass3', 'grass4'];
    const dirt = ['dirt1', 'dirt2'];
    const tints = [0xffffff, 0xf4ffe7, 0xe7f5d7, 0xfbfff2, 0xdcefd0];

    const bed = this.scene.add.graphics();
    bed.fillStyle(0x6c8652, 1);
    bed.fillRect(x, this.playTop, width, this.playBottom - this.playTop);
    this.root.add(bed);

    for (let row = 0; row < GRID_Y; row += 1) {
      for (let col = 0; col < GRID_X; col += 1) {
        const mx = ((col + 0.5) / GRID_X) * 100;
        const my = VIEW_Y0 + ((row + 0.5) / GRID_Y) * (VIEW_Y1 - VIEW_Y0);
        const hash = ((col * 73856093) ^ (row * 19349663)) >>> 0;
        const roll = (hash % 1000) / 1000;
        const road = Math.abs(my - MAP_CENTER) < 7.5;
        const baseYard = mx < 12 || mx > 88;
        let tex = grass[(hash >> 3) % grass.length];
        if (road && roll < 0.72) tex = dirt[(hash >> 5) % dirt.length];
        else if (baseYard && roll < 0.32) tex = dirt[(hash >> 7) % dirt.length];
        else if (roll > 0.93) tex = 'stone1';

        const cx = x + col * cellW + cellW / 2;
        const cy = this.playTop + row * cellH + cellH / 2;
        const tile = this.scene.add.image(cx, cy, tex);
        tile.setDisplaySize(cellW + 1.4, cellH + 1.4);
        tile.setAlpha(0.97);
        tile.setTint(tints[hash % tints.length]);
        tile.setFlipX((hash & 1) === 1);
        tile.setFlipY((hash & 2) === 2);
        this.root.add(tile);
      }
    }

    const rng = new Phaser.Math.RandomDataGenerator(['arena-ground']);
    for (let i = 0; i < 14; i += 1) {
      const patch = this.scene.add
        .image(
          x + rng.between(20, width - 20),
          rng.between(this.playTop + 20, this.playBottom - 20),
          'fx_radial_soft',
        )
        .setDisplaySize(rng.between(60, 150), rng.between(24, 56))
        .setTint(i % 2 === 0 ? 0x3c522e : 0x8b7347)
        .setAlpha(0.12);
      this.root.add(patch);
    }
  }

  private drawLane() {
    const { x, width, height } = this.layout;
    const mid = mapToScreen(this.layout, MAP_CENTER, MAP_CENTER);
    const roadH = height * 0.24;
    const lane = this.scene.add
      .tileSprite(x - 2, mid.y - roadH / 2, width + 4, roadH, 'dirt1')
      .setOrigin(0)
      .setTint(0xffe6b8)
      .setAlpha(0.2);
    this.root.add(lane);

    const guide = this.scene.add.graphics();
    guide.fillStyle(0xb49b68, 0.08);
    guide.fillRect(x, mid.y - roadH * 0.28, width, roadH * 0.56);
    guide.lineStyle(1, 0xe6c88a, 0.12);
    guide.lineBetween(x, mid.y, x + width, mid.y);
    this.root.add(guide);

    const rng = new Phaser.Math.RandomDataGenerator(['lane-dressing']);
    for (let i = 0; i < 18; i += 1) {
      const px = x + rng.between(12, width - 12);
      const py =
        mid.y +
        (rng.frac() > 0.5 ? 1 : -1) * roadH * rng.realInRange(0.34, 0.48);
      const pebble = this.scene.add.image(px, py, `rock${(i % 3) + 1}`);
      pebble.setScale(rng.realInRange(0.08, 0.16));
      pebble.setAlpha(0.5);
      pebble.setTint(0xd8c9a8);
      this.root.add(pebble);
    }
  }

  private drawRiver() {
    const { x, y, width, height } = this.layout;
    const riverW = Phaser.Math.Clamp(width * 0.08, 48, 106);
    const cx = x + width / 2;

    const banks = this.scene.add.graphics();
    banks.fillStyle(0x101722, 0.5);
    banks.fillRect(cx - riverW / 2 - 24, y - 12, riverW + 48, height + 24);
    banks.fillStyle(0x8f7b55, 0.34);
    banks.fillRect(cx - riverW / 2 - 17, y - 10, riverW + 34, height + 20);
    banks.fillStyle(0xb5a378, 0.28);
    banks.fillRect(cx - riverW / 2 - 8, y - 8, riverW + 16, height + 16);
    this.root.add(banks);

    const base = this.scene.add
      .tileSprite(cx - riverW / 2, y - 10, riverW, height + 20, 'water1')
      .setOrigin(0)
      .setTint(0x9fd6ef)
      .setAlpha(0.96);
    this.root.add(base);
    this.waterTiles.push(base);

    const shimmer = this.scene.add
      .tileSprite(cx - riverW / 2, y - 10, riverW, height + 20, 'water2')
      .setOrigin(0)
      .setTint(0xe8fbff)
      .setAlpha(0.24);
    this.root.add(shimmer);
    this.waterTiles.push(shimmer);

    const edges = this.scene.add.graphics();
    edges.lineStyle(2, 0x1c2a30, 0.6);
    edges.lineBetween(
      cx - riverW / 2,
      y - 10,
      cx - riverW / 2,
      y + height + 10,
    );
    edges.lineBetween(
      cx + riverW / 2,
      y - 10,
      cx + riverW / 2,
      y + height + 10,
    );
    edges.lineStyle(1, 0xd9f4ff, 0.25);
    edges.lineBetween(
      cx - riverW / 2 + 3,
      y - 10,
      cx - riverW / 2 + 3,
      y + height + 10,
    );
    this.root.add(edges);
  }

  private drawBridge() {
    const { width, height } = this.layout;
    const mid = mapToScreen(this.layout, MAP_CENTER, MAP_CENTER);
    const riverW = Phaser.Math.Clamp(width * 0.08, 48, 106);
    const bridgeW = riverW + 62;
    const bridgeH = Phaser.Math.Clamp(height * 0.11, 58, 92);
    const left = mid.x - bridgeW / 2;
    const top = mid.y - bridgeH / 2;

    const shadow = this.scene.add
      .image(mid.x, mid.y + 8, 'fx_radial_shadow')
      .setDisplaySize(bridgeW * 1.25, bridgeH * 2)
      .setAlpha(0.55);
    this.root.add(shadow);

    const bridge = this.scene.add.graphics();
    bridge.fillStyle(0x241f18, 0.95);
    bridge.fillRoundedRect(left - 4, top - 3, bridgeW + 8, bridgeH + 9, 11);
    bridge.fillStyle(0x66543c, 1);
    bridge.fillRoundedRect(left, top, bridgeW, bridgeH, 9);
    bridge.fillStyle(0x8b7350, 1);
    bridge.fillRoundedRect(left + 4, top + 5, bridgeW - 8, bridgeH - 10, 7);
    bridge.lineStyle(1, 0x2f261b, 0.85);
    for (let i = 1; i < 8; i += 1) {
      const px = left + (bridgeW / 8) * i;
      bridge.lineBetween(px, top + 7, px, top + bridgeH - 7);
    }
    bridge.lineStyle(2, 0xb49b6c, 0.8);
    bridge.lineBetween(left + 2, top + 3, left + bridgeW - 2, top + 3);
    bridge.lineBetween(
      left + 2,
      top + bridgeH - 3,
      left + bridgeW - 2,
      top + bridgeH - 3,
    );
    bridge.lineStyle(1, 0x3c3022, 0.7);
    bridge.lineBetween(
      left + 2,
      top + bridgeH * 0.48,
      left + bridgeW - 2,
      top + bridgeH * 0.48,
    );

    for (const [px, py] of [
      [left + 1, top],
      [left + bridgeW - 1, top],
      [left + 1, top + bridgeH],
      [left + bridgeW - 1, top + bridgeH],
    ]) {
      bridge.fillStyle(0x3d3326, 1);
      bridge.fillRoundedRect(px - 5, py - 6, 10, 12, 3);
      bridge.fillStyle(0x9a8561, 0.8);
      bridge.fillRoundedRect(px - 4, py - 5, 8, 6, 2);
    }
    bridge.lineStyle(1, 0xf3e2bc, 0.28);
    bridge.lineBetween(left + 12, top + 10, left + bridgeW * 0.3, top + 13);
    bridge.lineBetween(
      left + bridgeW * 0.55,
      top + bridgeH - 12,
      left + bridgeW - 14,
      top + bridgeH - 15,
    );
    this.root.add(bridge);

    const foam = this.scene.add.graphics();
    foam.lineStyle(1.5, 0xe8fbff, 0.35);
    foam.lineBetween(left - 2, top + 4, left - 2, top + bridgeH - 4);
    foam.lineBetween(
      left + bridgeW + 2,
      top + 4,
      left + bridgeW + 2,
      top + bridgeH - 4,
    );
    this.root.add(foam);
  }

  private drawFoliage() {
    const { x, y, width, height } = this.layout;
    const trees = ['tree1', 'tree2', 'tree3', 'tree4'];
    const rng = new Phaser.Math.RandomDataGenerator(['arena-foliage']);
    const topH = this.playTop - y;
    const bottomH = y + height - this.playBottom;
    const riverW = Phaser.Math.Clamp(width * 0.08, 48, 106);
    const riverClear = riverW * 0.5 + 24;
    const centerX = x + width / 2;

    const plantRow = (bandTop: number, bandH: number, count: number) => {
      for (let i = 0; i < count; i += 1) {
        const px =
          x + 24 + ((i + 0.5) / count) * (width - 48) + rng.between(-16, 16);
        const py = bandTop + bandH * rng.realInRange(0.42, 0.72);
        if (Math.abs(px - centerX) < riverClear) continue;
        const tree = this.scene.add.image(
          px,
          py,
          trees[rng.between(0, trees.length - 1)],
        );
        tree.setOrigin(0.5, 0.86);
        tree.setScale(rng.realInRange(0.3, 0.5));
        tree.setAlpha(0.96);
        tree.setTint(rng.frac() > 0.6 ? 0xeaffea : 0xffffff);
        this.root.add(tree);
      }
    };
    plantRow(y, topH, 9);
    plantRow(this.playBottom, bottomH, 9);

    for (let i = 0; i < 10; i += 1) {
      const inTop = i % 2 === 0;
      const bandTop = inTop ? y : this.playBottom;
      const bandH = inTop ? topH : bottomH;
      const px = x + rng.between(26, width - 26);
      if (Math.abs(px - centerX) < riverClear) continue;
      const rock = this.scene.add.image(
        px,
        bandTop + bandH * rng.realInRange(0.5, 0.9),
        `rock${(i % 3) + 1}`,
      );
      rock.setScale(rng.realInRange(0.16, 0.28));
      rock.setAlpha(0.85);
      rock.setAngle(rng.between(-20, 20));
      this.root.add(rock);
    }
  }

  private drawLighting() {
    const { x, y, width, height } = this.layout;
    const rim = this.scene.add
      .image(x + width / 2, y - height * 0.06, 'fx_radial_soft')
      .setDisplaySize(width * 1.1, height * 0.4)
      .setTint(0xffd9a0)
      .setAlpha(0.1)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.root.add(rim);

    const shade = this.scene.add
      .image(x + width / 2, this.playTop + height * 0.02, 'fx_radial_shadow')
      .setDisplaySize(width, height * 0.18)
      .setAlpha(0.24);
    this.root.add(shade);
  }

  private drawVignette() {
    const { x, y, width, height } = this.layout;
    const vig = this.scene.add
      .image(x + width / 2, y + height / 2, 'fx_vignette')
      .setDisplaySize(width + 180, height + 180)
      .setAlpha(0.92);
    this.root.add(vig);
  }

  private drawBases() {
    const keepHeight = Phaser.Math.Clamp(this.layout.height * 0.22, 108, 220);
    const keepScale = keepHeight / 128;
    const towerHeight = keepHeight * 0.64;
    const towerScale = towerHeight / 64;
    const platformW = keepHeight * 1.72;
    const platformH = platformW * 0.4;

    for (const [side, mx, team] of [
      ['LEFT', 6, COLORS.teamLeft],
      ['RIGHT', 94, COLORS.teamRight],
    ] as const) {
      const pos = mapToScreen(this.layout, mx, MAP_CENTER);
      const dir = side === 'LEFT' ? 1 : -1;
      const platformY = pos.y + platformH * 0.16;

      const shadow = this.scene.add
        .image(pos.x, platformY + platformH * 0.16, 'fx_radial_shadow')
        .setDisplaySize(platformW * 1.5, platformH * 2.3)
        .setAlpha(0.62);
      this.root.add(shadow);

      const pool = this.scene.add
        .image(pos.x, platformY - platformH * 0.1, 'fx_radial_soft')
        .setDisplaySize(platformW * 2.5, platformH * 3.4)
        .setTint(team)
        .setAlpha(0.28)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.root.add(pool);

      const platform = this.scene.add.graphics();
      platform.fillStyle(0x2b3242, 1);
      platform.fillEllipse(pos.x, platformY + 5, platformW + 16, platformH + 8);
      platform.fillStyle(0x4e576c, 1);
      platform.fillEllipse(pos.x, platformY, platformW, platformH);
      platform.fillStyle(0x69748b, 1);
      platform.fillEllipse(
        pos.x,
        platformY - 4,
        platformW * 0.82,
        platformH * 0.78,
      );
      platform.lineStyle(1.5, 0x9ca7bd, 0.35);
      platform.strokeEllipse(
        pos.x,
        platformY - 4,
        platformW * 0.82,
        platformH * 0.78,
      );
      platform.lineStyle(1, 0x333c4e, 0.7);
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * Math.PI * 2;
        platform.lineBetween(
          pos.x + Math.cos(a) * platformW * 0.3,
          platformY - 4 + Math.sin(a) * platformH * 0.3,
          pos.x + Math.cos(a) * platformW * 0.42,
          platformY - 4 + Math.sin(a) * platformH * 0.42,
        );
      }
      this.root.add(platform);

      const foundation = this.scene.add.graphics();
      foundation.fillStyle(0x182131, 0.96);
      foundation.fillRoundedRect(
        pos.x - keepHeight * 0.36,
        platformY - keepHeight * 0.08,
        keepHeight * 0.72,
        keepHeight * 0.28,
        keepHeight * 0.05,
      );
      foundation.lineStyle(1.5, team, 0.42);
      foundation.strokeRoundedRect(
        pos.x - keepHeight * 0.36,
        platformY - keepHeight * 0.08,
        keepHeight * 0.72,
        keepHeight * 0.28,
        keepHeight * 0.05,
      );
      this.root.add(foundation);

      const shadowTowers = this.scene.add
        .image(pos.x, platformY, 'fx_radial_shadow')
        .setDisplaySize(platformW * 0.9, platformH * 1.2)
        .setAlpha(0.4);
      this.root.add(shadowTowers);

      const makeTower = (tx: number, key: string) => {
        const tower = this.scene.add.sprite(tx, platformY + 2, key);
        tower.setOrigin(0.5, 0.92);
        tower.setScale(towerScale);
        if (side === 'RIGHT') tower.setFlipX(true);
        this.root.add(tower);
        return tower;
      };
      makeTower(pos.x + dir * platformW * 0.36, 'tower_square');
      makeTower(pos.x - dir * platformW * 0.36, 'tower_round');

      const gate = this.scene.add.graphics();
      gate.fillStyle(0x090d15, 0.9);
      gate.fillRoundedRect(
        pos.x - keepHeight * 0.1,
        platformY - keepHeight * 0.08,
        keepHeight * 0.2,
        keepHeight * 0.25,
        keepHeight * 0.08,
      );
      gate.lineStyle(1.2, team, 0.55);
      gate.strokeRoundedRect(
        pos.x - keepHeight * 0.1,
        platformY - keepHeight * 0.08,
        keepHeight * 0.2,
        keepHeight * 0.25,
        keepHeight * 0.08,
      );
      this.root.add(gate);

      const runeSigil = this.scene.add.graphics();
      runeSigil.lineStyle(1.6, team, 0.45);
      runeSigil.strokeEllipse(
        pos.x,
        platformY - 4,
        platformW * 0.72,
        platformH * 0.7,
      );
      runeSigil.lineStyle(1, team, 0.25);
      runeSigil.strokeEllipse(
        pos.x,
        platformY - 4,
        platformW * 0.5,
        platformH * 0.48,
      );
      this.root.add(runeSigil);

      const shieldL = this.scene.add.image(
        pos.x + dir * platformW * 0.36,
        platformY - towerHeight * 0.42,
        'icon_shield',
      );
      shieldL.setDisplaySize(14, 14).setTint(team).setAlpha(0.85);
      const shieldR = this.scene.add.image(
        pos.x - dir * platformW * 0.36,
        platformY - towerHeight * 0.42,
        'icon_shield',
      );
      shieldR.setDisplaySize(14, 14).setTint(team).setAlpha(0.85);
      if (side === 'RIGHT') shieldR.setFlipX(true);
      this.root.add([shieldL, shieldR]);

      const glow = this.scene.add
        .image(pos.x, pos.y - keepHeight * 0.4, 'fx_radial_glow')
        .setDisplaySize(keepHeight * 1.7, keepHeight * 1.4)
        .setTint(team)
        .setAlpha(0.34)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.root.add(glow);

      const warm = this.scene.add
        .image(pos.x, pos.y - keepHeight * 0.18, 'fx_radial_glow')
        .setDisplaySize(keepHeight * 0.95, keepHeight * 0.9)
        .setTint(0xffb066)
        .setAlpha(0.16)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.root.add(warm);

      const keep = this.scene.add.sprite(
        pos.x,
        pos.y + platformH * 0.3,
        'keep',
      );
      keep.setOrigin(0.5, 0.9);
      keep.setScale(keepScale);
      this.root.add(keep);

      const crystalBaseY = keep.y - keepHeight * 0.86;
      const crystalAura = this.scene.add
        .image(pos.x, crystalBaseY, 'fx_radial_glow')
        .setDisplaySize(keepHeight * 0.55, keepHeight * 0.55)
        .setTint(team)
        .setAlpha(0.65)
        .setBlendMode(Phaser.BlendModes.ADD);
      const crystalRing = this.scene.add
        .circle(pos.x, crystalBaseY, keepHeight * 0.11)
        .setStrokeStyle(1.8, team, 0.85);
      const crystal = this.scene.add
        .image(pos.x, crystalBaseY, 'fx_star')
        .setDisplaySize(keepHeight * 0.3, keepHeight * 0.36)
        .setTint(0xffffff)
        .setAlpha(0.95);
      this.root.add([crystalAura, crystalRing, crystal]);

      const emblemY = keep.y - keepHeight * 0.44;
      const emblem = this.scene.add.circle(
        pos.x + dir * keepHeight * 0.12,
        emblemY,
        keepHeight * 0.05,
        team,
        0.85,
      );
      emblem.setStrokeStyle(1.5, 0x0b0f17, 0.7);
      this.root.add(emblem);

      const poleX = pos.x - dir * keepHeight * 0.19;
      const poleTop = keep.y - keepHeight * 0.88;
      const flagpole = this.scene.add.rectangle(
        poleX,
        poleTop,
        3,
        keepHeight * 0.34,
        0xd9c49a,
        0.95,
      );
      flagpole.setOrigin(0.5, 1);
      const bannerH = keepHeight * 0.15;
      const banner = this.scene.add.triangle(
        poleX,
        poleTop - keepHeight * 0.34,
        0,
        0,
        dir * keepHeight * 0.26,
        bannerH * 0.36,
        0,
        bannerH,
        team,
        0.98,
      );
      banner.setOrigin(0, 0);
      this.banners.push(banner);
      this.root.add(flagpole);
      this.root.add(banner);

      const torches: BaseVisual['torches'] = [];
      for (const offset of [-0.42, 0.42]) {
        const tx = pos.x + platformW * offset;
        const ty = platformY - platformH * 0.06;
        const torchGlow = this.scene.add
          .image(tx, ty, 'fx_radial_glow')
          .setDisplaySize(keepHeight * 0.3, keepHeight * 0.3)
          .setTint(0xff8a3c)
          .setAlpha(0.7)
          .setBlendMode(Phaser.BlendModes.ADD);
        const core = this.scene.add.circle(tx, ty, 3.4, 0xffc16a, 1);
        this.root.add(torchGlow);
        this.root.add(core);
        torches.push({ glow: torchGlow, core });
        this.flames.push({
          glow: torchGlow,
          glowScale: torchGlow.scaleX,
          core,
          phase: (side === 'LEFT' ? 0 : 2.1) + offset * 4,
        });
      }

      const hpWidth = Math.min(platformW * 0.76, 168);
      const hpY = platformY + platformH * 0.6 + 18;
      const hpBg = this.scene.add.rectangle(
        pos.x,
        hpY,
        hpWidth + 3,
        9,
        0x070a10,
        0.96,
      );
      hpBg.setStrokeStyle(1, 0x3a445f, 0.9);
      const hpFill = this.scene.add
        .rectangle(pos.x - hpWidth / 2, hpY, hpWidth, 6, COLORS.gold)
        .setOrigin(0, 0.5);
      this.root.add(hpBg);
      this.root.add(hpFill);

      const cracks = this.scene.add.graphics();
      this.root.add(cracks);

      const smoke = this.scene.add.particles(
        pos.x,
        keep.y - keepHeight * 0.5,
        'fx_muzzle',
        {
          speedY: { min: -32, max: -56 },
          speedX: { min: -14, max: 14 },
          scale: { start: 0.24, end: 0.44 },
          alpha: { start: 0.36, end: 0 },
          lifespan: { min: 1000, max: 1760 },
          frequency: 220,
          quantity: 1,
          tint: 0x8a94b3,
          emitting: false,
        },
      );
      smoke.setDepth(9);

      this.bases[side] = {
        keep,
        keepHeight,
        keepScale,
        platformY,
        glow,
        pool,
        hpFill,
        hpWidth,
        cracks,
        smoke,
        banner,
        flagpole,
        emblem,
        crystal,
        crystalAura,
        crystalRing,
        crystalBaseY,
        torches,
        pos,
        destroyed: false,
        lastPulseAt: 0,
      };
    }
  }
}
