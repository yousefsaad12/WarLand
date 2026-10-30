import Phaser from 'phaser';

type EmitterOp =
  | Phaser.Types.GameObjects.Particles.EmitterOpOnEmitType
  | Phaser.Types.GameObjects.Particles.EmitterOpOnUpdateType;

/**
 * Centralised particle effects. Emitters are created once and reused via
 * `explode` so combat does not allocate a new game object per hit.
 */
export class VfxManager {
  private scene: Phaser.Scene;
  private emitters: Record<
    string,
    Phaser.GameObjects.Particles.ParticleEmitter | null
  > = {};
  private motes: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private fireflies: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(bounds: { x: number; y: number; width: number; height: number }) {
    if (!this.scene.textures.exists('fx_circle')) return;

    this.emitters.hitBurst = this.make({
      texture: 'fx_circle',
      speed: { min: 60, max: 130 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.14, end: 0.01 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 280,
      gravityY: 220,
      color: [0xfff2c0, 0xffd08a],
      depth: 18,
    });

    this.emitters.dust = this.make({
      texture: 'fx_tiny_dust',
      speed: { min: 16, max: 42 },
      angle: { min: -125, max: -55 },
      scale: { start: 0.16, end: 0.07 },
      alpha: { start: 0.45, end: 0 },
      lifespan: 460,
      color: [0xb8a07a, 0x8a7a5c],
      depth: 17,
    });

    this.emitters.death = this.make({
      texture: 'fx_tiny_explosion',
      speed: { min: 40, max: 90 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.2, end: 0.02 },
      alpha: { start: 0.75, end: 0 },
      lifespan: 520,
      gravityY: 140,
      color: [0xdddddd, 0x9aa4b2],
      depth: 17,
    });

    this.emitters.embers = this.make({
      texture: 'fx_spark',
      speed: { min: 10, max: 34 },
      angle: { min: -150, max: -30 },
      scale: { start: 0.09, end: 0 },
      alpha: { start: 0.95, end: 0 },
      lifespan: 720,
      gravityY: -20,
      color: [0xffcf8a, 0xff6b4d],
      depth: 16,
    });

    this.emitters.ghost = this.make({
      texture: 'fx_light',
      speed: { min: 8, max: 26 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.12, end: 0.04 },
      alpha: { start: 0.35, end: 0 },
      lifespan: 600,
      color: [0xd8b56a, 0xffe7a3],
      depth: 17,
    });

    // Deploy shockwave ring burst
    this.emitters.deployRing = this.make({
      texture: 'fx_circle',
      speed: { min: 90, max: 180 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.18, end: 0.03 },
      alpha: { start: 0.85, end: 0 },
      lifespan: 350,
      gravityY: 80,
      color: [0xffe7a3, 0xd8b56a, 0xffffff],
      depth: 19,
    });

    // Sparkle trail for ranged projectiles
    this.emitters.sparkTrail = this.make({
      texture: 'fx_star',
      speed: { min: 4, max: 18 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.1, end: 0 },
      alpha: { start: 0.7, end: 0 },
      lifespan: 240,
      color: [0xffe7a3, 0xbfe0ff, 0xffffff],
      depth: 17,
    });

    // Base fire embers when damaged
    this.emitters.baseFire = this.make({
      texture: 'fx_tiny_fire',
      speed: { min: 20, max: 55 },
      angle: { min: -130, max: -50 },
      scale: { start: 0.12, end: 0.02 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 580,
      gravityY: -35,
      color: [0xff6b4d, 0xff9944, 0xffcf8a],
      depth: 18,
    });

    // Heal / energy shimmer
    this.emitters.shimmer = this.make({
      texture: 'fx_star',
      speed: { min: 14, max: 36 },
      angle: { min: -120, max: -60 },
      scale: { start: 0.08, end: 0.02 },
      alpha: { start: 0.65, end: 0 },
      lifespan: 480,
      gravityY: -50,
      color: [0x53e08a, 0xa0ffcc, 0xffffff],
      depth: 18,
    });

    // Ambient dust motes (original, slower)
    this.motes = this.scene.add.particles(0, 0, 'fx_circle', {
      x: { min: bounds.x, max: bounds.x + bounds.width },
      y: { min: bounds.y, max: bounds.y + bounds.height },
      speed: { min: 2, max: 10 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.035, end: 0 },
      alpha: { start: 0.18, end: 0 },
      lifespan: { min: 2400, max: 5200 },
      frequency: 420,
      quantity: 1,
      tint: 0xffe7a3,
      blendMode: 'ADD',
    });
    this.motes.setDepth(2);

    // Ambient fireflies — larger, slower, green/gold twinkle
    this.fireflies = this.scene.add.particles(0, 0, 'fx_star', {
      x: { min: bounds.x + 20, max: bounds.x + bounds.width - 20 },
      y: { min: bounds.y + 10, max: bounds.y + bounds.height - 10 },
      speed: { min: 3, max: 12 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.04, end: 0.015 },
      alpha: { start: 0.35, end: 0 },
      lifespan: { min: 3200, max: 6400 },
      frequency: 800,
      quantity: 1,
      tint: [0xd8e89a, 0xffe7a3, 0x90d0a0],
      blendMode: 'ADD',
    });
    this.fireflies.setDepth(3);
  }

  private make(opts: {
    texture: string;
    speed: Phaser.Types.GameObjects.Particles.EmitterOpOnEmitType;
    angle: Phaser.Types.GameObjects.Particles.EmitterOpOnEmitType;
    scale: EmitterOp;
    alpha: EmitterOp;
    lifespan: Phaser.Types.GameObjects.Particles.EmitterOpOnEmitType;
    color: number[];
    depth: number;
    gravityY?: number;
  }): Phaser.GameObjects.Particles.ParticleEmitter {
    const emitter = this.scene.add.particles(0, 0, opts.texture, {
      speed: opts.speed,
      angle: opts.angle,
      scale: opts.scale,
      alpha: opts.alpha,
      lifespan: opts.lifespan,
      gravityY: opts.gravityY,
      color: opts.color,
      quantity: 1,
      emitting: false,
      blendMode: 'ADD',
    });
    emitter.setDepth(opts.depth);
    return emitter;
  }

  burstHit(x: number, y: number, count = 6) {
    this.emitters.hitBurst?.explode(count, x, y);
  }

  puffDust(x: number, y: number, count = 3) {
    this.emitters.dust?.explode(count, x, y);
  }

  puffDeath(x: number, y: number, count = 8) {
    this.emitters.death?.explode(count, x, y);
  }

  burstEmbers(x: number, y: number, count = 4) {
    this.emitters.embers?.explode(count, x, y);
  }

  burstGhost(x: number, y: number, count = 5) {
    this.emitters.ghost?.explode(count, x, y);
  }

  /** Deploy shockwave — expanding ring of golden particles. */
  burstDeployRing(x: number, y: number, count = 10) {
    this.emitters.deployRing?.explode(count, x, y);
  }

  /** Sparkle trail at a point (used along projectile paths). */
  sparkTrail(x: number, y: number, count = 3) {
    this.emitters.sparkTrail?.explode(count, x, y);
  }

  /** Base fire embers when base takes damage. */
  burstBaseFire(x: number, y: number, count = 6) {
    this.emitters.baseFire?.explode(count, x, y);
  }

  /** Green shimmer — healing / energy gain. */
  burstShimmer(x: number, y: number, count = 5) {
    this.emitters.shimmer?.explode(count, x, y);
  }

  /**
   * Animated expanding ring — a single circle that grows and fades.
   * Used for deploy shockwave, base hit emphasis, etc.
   */
  expandRing(
    x: number,
    y: number,
    color: number,
    maxRadius = 40,
    duration = 380,
  ) {
    const ring = this.scene.add
      .circle(x, y, 6)
      .setStrokeStyle(2.5, color, 0.85);
    ring.setFillStyle(color, 0.08);
    ring.setDepth(19);
    this.scene.tweens.add({
      targets: ring,
      scale: maxRadius / 6,
      alpha: 0,
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Animated ground stomp — concentric elliptical ripple for heavy melee hits.
   */
  groundStomp(x: number, y: number, color = 0xfff2c0) {
    for (let i = 0; i < 3; i += 1) {
      const ellipse = this.scene.add.ellipse(x, y + 4, 10, 5, color, 0.12);
      ellipse.setStrokeStyle(1.5, color, 0.55 - i * 0.12);
      ellipse.setDepth(16);
      this.scene.tweens.add({
        targets: ellipse,
        scaleX: 3 + i * 1.2,
        scaleY: 2 + i * 0.8,
        alpha: 0,
        duration: 300 + i * 80,
        delay: i * 50,
        ease: 'Cubic.easeOut',
        onComplete: () => ellipse.destroy(),
      });
    }
  }

  shatter(x: number, y: number, color = 0xff6b4d) {
    this.expandRing(x, y, color, 58, 520);
    this.burstEmbers(x, y - 8, 18);
    this.puffDeath(x, y - 12, 14);
    this.puffDust(x, y, 8);
  }

  destroy() {
    this.motes?.destroy();
    this.motes = null;
    this.fireflies?.destroy();
    this.fireflies = null;
    for (const key of Object.keys(this.emitters)) {
      this.emitters[key]?.destroy();
      this.emitters[key] = null;
    }
  }
}
