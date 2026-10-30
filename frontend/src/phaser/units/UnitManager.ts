import Phaser from 'phaser';
import type { AttackEvent, GameSide, UnitView } from '@/network/protocol';
import { sfx } from '../audio/SfxManager';
import { ArenaLayout, MAP_CENTER, mapToScreen } from '../coords';
import {
  CARD_ACCENT,
  COLORS,
  FONT_DISPLAY,
  teamColor,
  UNIT_BODY_HEIGHT,
} from '../theme';
import type { VfxManager } from '../vfx/VfxManager';

interface UnitVisual {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  ring: Phaser.GameObjects.Arc;
  teamGlow: Phaser.GameObjects.Image;
  hpBg: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
  cardId: string;
  owner: GameSide;
  hp: number;
  maxHp: number;
  attacking: boolean;
  baseScale: number;
  lastDustAt: number;
  spawnTime: number;
  idlePhase: number;
  targetX: number;
  targetY: number;
  transitionStartX: number;
  transitionStartY: number;
  transitionElapsed: number;
  transitionDuration: number;
}

interface UnitsManifest {
  units: Record<
    string,
    {
      walk: { bodyHeight: number; anchorY: number };
      attack: { bodyHeight: number; anchorY: number };
    }
  >;
}

export class UnitManager {
  private units = new Map<string, UnitVisual>();
  private layer: Phaser.GameObjects.Container;
  private localSide: GameSide | null = null;

  constructor(
    private scene: Phaser.Scene,
    private vfx: VfxManager,
  ) {
    this.layer = scene.add.container(0, 0);
    this.layer.setDepth(5);
  }

  clear() {
    for (const u of this.units.values()) {
      u.container.destroy();
    }
    this.units.clear();
  }

  sync(
    list: UnitView[],
    layout: ArenaLayout,
    localSide: GameSide | null,
    tickMs: number,
    reduceMotion: boolean,
  ) {
    this.localSide = localSide;
    const seen = new Set<string>();
    for (const unit of list) {
      seen.add(unit.id);
      const existing = this.units.get(unit.id);
      if (!existing) {
        this.spawn(unit, layout, localSide, reduceMotion);
      } else {
        this.updateUnit(existing, unit, layout, tickMs, reduceMotion);
      }
    }
    for (const [id, u] of this.units) {
      if (!seen.has(id)) {
        this.kill(id, u, reduceMotion);
      }
    }
    this.layer.sort(
      'y',
      (a: UnitVisual['container'], b: UnitVisual['container']) => a.y - b.y,
    );
  }

  update(delta: number, reduceMotion: boolean) {
    const frameDelta = Math.min(Math.max(delta, 0), 100);

    for (const u of this.units.values()) {
      if (reduceMotion) {
        u.container.setPosition(u.targetX, u.targetY);
        u.transitionElapsed = u.transitionDuration;
      } else if (u.transitionElapsed < u.transitionDuration) {
        u.transitionElapsed = Math.min(
          u.transitionDuration,
          u.transitionElapsed + frameDelta,
        );
        const progress =
          u.transitionDuration > 0
            ? u.transitionElapsed / u.transitionDuration
            : 1;
        u.container.setPosition(
          Phaser.Math.Linear(u.transitionStartX, u.targetX, progress),
          Phaser.Math.Linear(u.transitionStartY, u.targetY, progress),
        );
      }

      const distance = Phaser.Math.Distance.Between(
        u.container.x,
        u.container.y,
        u.targetX,
        u.targetY,
      );
      if (!reduceMotion && distance > 0.5) {
        const now = this.scene.time.now;
        if (now - u.lastDustAt > 500) {
          u.lastDustAt = now;
          this.vfx.puffDust(u.container.x, u.container.y - 2, 2);
        }
      }

      if (!reduceMotion && !u.attacking) {
        const shadowScale =
          1 +
          Math.sin(
            this.scene.time.now / 400 + u.idlePhase + Math.PI,
          ) *
            0.06;
        u.shadow.setScale(shadowScale, shadowScale * 0.8);
      }

      const ratio = u.maxHp > 0 ? u.hp / u.maxHp : 1;
      if (!reduceMotion && ratio < 0.33 && ratio > 0) {
        u.sprite.setTint(
          Math.sin(this.scene.time.now / 200) > 0.3 ? 0xffaaaa : 0xffffff,
        );
      } else if (ratio >= 0.33) {
        u.sprite.clearTint();
      }
    }
  }

  playAttack(
    ev: AttackEvent,
    layout: ArenaLayout,
    reduceMotion: boolean,
    onBaseHit?: (side: GameSide) => void,
  ) {
    let targetPos: { x: number; y: number } | null = null;
    if (ev.targetId === 'BASE' && ev.targetSide) {
      targetPos = mapToScreen(
        layout,
        ev.targetSide === 'LEFT' ? 6 : 94,
        MAP_CENTER,
      );
      onBaseHit?.(ev.targetSide);
    } else {
      const t = this.units.get(ev.targetId);
      if (t) {
        targetPos = { x: t.container.x, y: t.container.y };
        this.hitReaction(t, ev.damage, reduceMotion);
      }
    }

    const isBaseTurret = ev.attackerId === 'BASE';
    const attacker = isBaseTurret ? undefined : this.units.get(ev.attackerId);
    const attackerSide = ev.attackerSide ?? attacker?.owner;

    if (isBaseTurret && attackerSide) {
      const basePos = mapToScreen(
        layout,
        attackerSide === 'LEFT' ? 6 : 94,
        MAP_CENTER,
      );
      const muzzleY = basePos.y - layout.height * 0.12;
      const muzzle = this.scene.add.image(basePos.x, muzzleY, 'fx_light');
      muzzle.setScale(0.42);
      muzzle.setTint(COLORS.gold);
      muzzle.setAlpha(0.9);
      muzzle.setDepth(17);
      this.scene.tweens.add({
        targets: muzzle,
        alpha: 0,
        scale: 0.75,
        duration: 180,
        onComplete: () => muzzle.destroy(),
      });
      this.vfx.burstEmbers(basePos.x, muzzleY + 5, 5);
      if (!reduceMotion) sfx.swing();
    } else if (attacker && !attacker.attacking) {
      attacker.attacking = true;
      this.applyAttackScale(attacker);
      const attackKey = this.animationKey(
        attacker.owner,
        attacker.cardId,
        'attack',
      );
      if (attacker.sprite.anims.exists(attackKey)) {
        attacker.sprite.play(attackKey);
        attacker.sprite.once('animationcomplete', () => {
          attacker.attacking = false;
          if (attacker.sprite.scene) {
            this.applyWalkScale(attacker);
            attacker.sprite.play(
              this.animationKey(attacker.owner, attacker.cardId, 'walk'),
            );
          }
        });
      } else {
        attacker.attacking = false;
      }
      if (!reduceMotion) {
        const dir = targetPos
          ? Math.sign(targetPos.x - attacker.container.x) || 1
          : attacker.owner === 'LEFT'
            ? 1
            : -1;
        this.scene.tweens.add({
          targets: attacker.sprite,
          x: attacker.sprite.x + dir * 7,
          angle: dir * 7,
          duration: 70,
          yoyo: true,
          ease: 'Quad.easeOut',
          onComplete: () => {
            if (attacker.sprite.scene) {
              attacker.sprite.setX(0);
              attacker.sprite.setAngle(0);
            }
          },
        });
        sfx.swing();
      }
    }

    if (!targetPos) return;

    if (ev.range > 6) {
      const from = attacker
        ? { x: attacker.container.x, y: attacker.container.y - 14 }
        : attackerSide
          ? {
              x: mapToScreen(
                layout,
                attackerSide === 'LEFT' ? 6 : 94,
                MAP_CENTER,
              ).x,
              y:
                mapToScreen(
                  layout,
                  attackerSide === 'LEFT' ? 6 : 94,
                  MAP_CENTER,
                ).y - 34,
            }
          : targetPos;
      const bolt = this.scene.add.image(from.x, from.y, 'fx_spark');
      bolt.setScale(0.4);
      bolt.setTint(teamColor(attackerSide ?? 'LEFT'));
      bolt.setRotation(Math.atan2(targetPos.y - from.y, targetPos.x - from.x));
      bolt.setDepth(18);
      const midX = (from.x + targetPos.x) / 2;
      const midY = Math.min(from.y, targetPos.y) - 18;
      const trail = this.scene.time.addEvent({
        delay: 30,
        repeat: 3,
        callback: () => {
          if (!bolt.scene) return;
          const ghost = this.scene.add.image(bolt.x, bolt.y, 'fx_spark');
          ghost.setScale(0.2);
          ghost.setTint(0xffe7a3);
          ghost.setAlpha(0.4);
          ghost.setDepth(17);
          this.scene.tweens.add({
            targets: ghost,
            alpha: 0,
            scale: 0.05,
            duration: 160,
            onComplete: () => ghost.destroy(),
          });
        },
      });
      this.scene.tweens.add({
        targets: bolt,
        x: midX,
        y: midY,
        duration: 65,
        ease: 'Sine.easeOut',
        onComplete: () => {
          if (!bolt.scene) return;
          this.scene.tweens.add({
            targets: bolt,
            x: targetPos!.x,
            y: targetPos!.y - 8,
            duration: 75,
            ease: 'Quad.easeIn',
            onComplete: () => {
              trail.remove();
              bolt.destroy();
              this.impact(targetPos!.x, targetPos!.y - 6, reduceMotion);
              this.floatDamage(
                targetPos!.x,
                targetPos!.y - 28,
                ev.damage,
                ev.targetSide,
              );
            },
          });
        },
      });
    } else {
      this.impact(targetPos.x, targetPos.y - 4, reduceMotion);
      this.floatDamage(targetPos.x, targetPos.y - 28, ev.damage, ev.targetSide);
      if (!reduceMotion) {
        const slash = this.scene.add.image(
          targetPos.x,
          targetPos.y - 8,
          'fx_slash',
        );
        slash.setScale(0.5);
        slash.setAlpha(0.9);
        slash.setDepth(18);
        this.scene.tweens.add({
          targets: slash,
          alpha: 0,
          scale: 0.9,
          angle: 25,
          duration: 190,
          onComplete: () => slash.destroy(),
        });
      }
    }
  }

  private spawn(
    unit: UnitView,
    layout: ArenaLayout,
    localSide: GameSide | null,
    reduceMotion: boolean,
  ) {
    const pos = mapToScreen(layout, unit.x, unit.y);
    const container = this.scene.add.container(pos.x, pos.y);
    this.layer.add(container);

    const shadow = this.scene.add.ellipse(0, 4, 48, 17, 0x000000, 0.32);
    const factionColor = teamColor(unit.owner);
    const ring = this.scene.add.circle(
      0,
      4,
      24,
      factionColor,
      0.3,
    );
    const teamGlow = this.scene.add
      .image(0, 2, 'fx_radial_soft')
      .setDisplaySize(68, 40)
      .setTint(factionColor)
      .setAlpha(0.2)
      .setBlendMode(Phaser.BlendModes.ADD);
    const walkKey = this.animationKey(unit.owner, unit.cardId, 'walk');
    const sprite = this.scene.add.sprite(0, 0, walkKey);
    sprite.setOrigin(0.5, 1);
    const baseScale = this.scaleFor(unit.cardId, 'walk');
    sprite.setScale(baseScale);
    sprite.play(walkKey);
    if (unit.owner === 'RIGHT') sprite.setFlipX(true);

    const hpBg = this.scene.add.rectangle(
      0,
      -UNIT_BODY_HEIGHT - 6,
      52,
      5,
      COLORS.ink900,
    );
    hpBg.setStrokeStyle(1, 0x000000, 0.6);
    hpBg.setVisible(false);
    const hpBar = this.scene.add
      .rectangle(-26, -UNIT_BODY_HEIGHT - 8, 52, 5, COLORS.hp)
      .setOrigin(0, 0.5);
    hpBar.setVisible(false);

    container.add([teamGlow, shadow, ring, sprite, hpBg, hpBar]);

    if (!reduceMotion) {
      // Dramatic spawn-in: scale up with bounce + fade in
      container.setScale(0.3);
      container.setAlpha(0);
      shadow.setScale(0.2);
      this.scene.tweens.add({
        targets: container,
        scale: 1,
        alpha: 1,
        duration: 340,
        ease: 'Back.easeOut',
      });
      // Shadow grows to full size
      this.scene.tweens.add({
        targets: shadow,
        scaleX: 1,
        scaleY: 1,
        duration: 340,
        ease: 'Cubic.easeOut',
      });
      // Team ring pulses
      this.scene.tweens.add({
        targets: ring,
        alpha: 0.5,
        scale: 1.12,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.scene.tweens.add({
        targets: teamGlow,
        alpha: 0.34,
        scale: 1.12,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      // Deploy rune circle expanding outward
      const rune = this.scene.add.image(pos.x, pos.y, 'fx_circle');
      rune.setTint(CARD_ACCENT[unit.cardId] ?? COLORS.gold);
      rune.setAlpha(0.75);
      rune.setScale(0.2);
      rune.setDepth(16);
      this.scene.tweens.add({
        targets: rune,
        scale: 0.9,
        alpha: 0,
        angle: 110,
        duration: 460,
        onComplete: () => rune.destroy(),
      });
      // Deploy shockwave ring + particle burst
      const accent = CARD_ACCENT[unit.cardId] ?? COLORS.gold;
      this.vfx.burstDeployRing(pos.x, pos.y, 8);
      this.vfx.expandRing(pos.x, pos.y, accent, 36, 350);
      this.vfx.burstGhost(pos.x, pos.y - 8, 6);
      // Ground stomp on heavier units
      if (unit.cardId === 'knight' || unit.cardId === 'guard') {
        this.vfx.groundStomp(pos.x, pos.y);
      }
    }

    if (localSide === unit.owner) {
      sfx.deploy(unit.cardId);
      if (!reduceMotion) this.scene.cameras.main.shake(70, 0.0012);
    }

    this.units.set(unit.id, {
      container,
      sprite,
      shadow,
      ring,
      teamGlow,
      hpBg,
      hpBar,
      cardId: unit.cardId,
      owner: unit.owner,
      hp: unit.hp,
      maxHp: unit.hp,
      attacking: false,
      baseScale,
      lastDustAt: 0,
      spawnTime: this.scene.time.now,
      idlePhase: Math.random() * Math.PI * 2,
      targetX: pos.x,
      targetY: pos.y,
      transitionStartX: pos.x,
      transitionStartY: pos.y,
      transitionElapsed: 0,
      transitionDuration: 0,
    });
  }

  private updateUnit(
    u: UnitVisual,
    unit: UnitView,
    layout: ArenaLayout,
    tickMs: number,
    reduceMotion: boolean,
  ) {
    u.maxHp = Math.max(u.maxHp, unit.hp);
    if (unit.hp < u.hp) {
      this.hitReaction(u, u.hp - unit.hp, reduceMotion);
    }
    u.hp = unit.hp;
    const ratio = u.maxHp > 0 ? unit.hp / u.maxHp : 1;
    const damaged = ratio < 0.999;
    u.hpBg.setVisible(damaged);
    u.hpBar.setVisible(damaged);
    u.hpBar.width = Math.max(1, 52 * ratio);
    u.hpBar.setFillStyle(ratio < 0.33 ? COLORS.hpLow : COLORS.hp);

    const pos = mapToScreen(layout, unit.x, unit.y);
    const dx = pos.x - u.targetX;
    const dy = pos.y - u.targetY;
    const targetChanged = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
    if (targetChanged) {
      u.transitionStartX = u.container.x;
      u.transitionStartY = u.container.y;
      u.transitionElapsed = 0;
      u.transitionDuration = Math.max(1, tickMs);
    }
    u.targetX = pos.x;
    u.targetY = pos.y;
    if (Math.abs(dx) > 2) {
      u.sprite.setFlipX(dx < 0);
    }
    if (reduceMotion) {
      u.container.setPosition(pos.x, pos.y);
      u.transitionElapsed = u.transitionDuration;
    }
  }

  private kill(id: string, u: UnitVisual, reduceMotion: boolean) {
    this.units.delete(id);
    sfx.death(u.cardId);
    if (reduceMotion) {
      u.container.destroy();
      return;
    }
    this.vfx.puffDeath(u.container.x, u.container.y - 12, 8);
    this.vfx.puffDust(u.container.x, u.container.y - 2, 5);
    this.vfx.expandRing(
      u.container.x,
      u.container.y + 2,
      teamColor(u.owner),
      34,
      360,
    );
    this.scene.tweens.add({
      targets: u.container,
      alpha: 0,
      y: u.container.y + 9,
      angle: u.owner === 'LEFT' ? 72 : -72,
      scale: 0.9,
      duration: 320,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        if (u.container.scene) u.container.destroy();
      },
    });
  }

  private hitReaction(u: UnitVisual, damage: number, reduceMotion: boolean) {
    if (reduceMotion) return;
    this.scene.tweens.killTweensOf(u.sprite);
    u.sprite.setTint(0xffffff);
    const base = u.baseScale;
    this.scene.tweens.add({
      targets: u.sprite,
      scaleX: base * 1.16,
      scaleY: base * 1.16,
      duration: 65,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: u.sprite,
      angle: Phaser.Math.Between(-6, 6),
      duration: 45,
      yoyo: true,
      repeat: 1,
    });
    this.vfx.burstHit(
      u.container.x,
      u.container.y - 22,
      Math.min(9, 4 + Math.floor(damage / 6)),
    );
    this.scene.tweens.add({
      targets: u.sprite,
      x: Phaser.Math.Between(-3, 3),
      duration: 45,
      yoyo: true,
      repeat: 1,
      ease: 'Quad.easeOut',
    });
    this.scene.time.delayedCall(75, () => {
      if (u.sprite.scene) {
        u.sprite.clearTint();
        u.sprite.setAngle(0);
      }
    });
    sfx.hit(damage);
    this.scene.cameras.main.shake(
      45,
      Math.min(0.004, 0.0008 + damage * 0.00014),
    );
  }

  private impact(x: number, y: number, reduceMotion: boolean) {
    const flash = this.scene.add.image(x, y, 'fx_light');
    flash.setScale(0.25);
    flash.setAlpha(0.95);
    flash.setDepth(17);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 0.75,
      duration: reduceMotion ? 80 : 160,
      onComplete: () => flash.destroy(),
    });
    this.vfx.burstHit(x, y, 7);
    if (!reduceMotion) {
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        const spark = this.scene.add.image(x, y, 'fx_spark2');
        spark.setScale(0.22);
        spark.setTint(0xfff2c0);
        spark.setDepth(17);
        this.scene.tweens.add({
          targets: spark,
          x: x + Math.cos(a) * 24,
          y: y + Math.sin(a) * 24,
          alpha: 0,
          duration: 230,
          onComplete: () => spark.destroy(),
        });
      }
    }
    sfx.hit(8);
  }

  private floatDamage(
    x: number,
    y: number,
    dmg: number,
    targetSide?: GameSide,
  ) {
    const isMine =
      this.localSide != null && targetSide != null
        ? targetSide === this.localSide
        : false;
    const color = isMine ? '#ff6b6b' : '#ffffff';
    const txt = this.scene.add.text(x, y, `-${dmg}`, {
      fontFamily: FONT_DISPLAY,
      fontSize: isMine ? '15px' : '16px',
      fontStyle: 'bold',
      color,
      stroke: '#0a0d12',
      strokeThickness: 4,
    });
    txt.setOrigin(0.5);
    txt.setDepth(22);
    txt.setScale(1.35);
    this.scene.tweens.add({
      targets: txt,
      y: y - 30,
      alpha: 0,
      scale: 1,
      duration: 620,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (txt.scene) txt.destroy();
      },
    });
  }

  private scaleFor(cardId: string, kind: 'walk' | 'attack'): number {
    const manifest = this.scene.registry.get('unitsManifest') as
      UnitsManifest | undefined;
    const body = manifest?.units[cardId]?.[kind].bodyHeight ?? 32;
    return UNIT_BODY_HEIGHT / body;
  }

  private animationKey(
    owner: GameSide,
    cardId: string,
    kind: 'walk' | 'attack',
  ): string {
    return `${owner === 'RIGHT' ? 'right' : 'left'}_${cardId}_${kind}`;
  }

  private applyWalkScale(
    u: Pick<UnitVisual, 'sprite' | 'cardId'> & Partial<UnitVisual>,
  ) {
    const scale = this.scaleFor(u.cardId, 'walk');
    u.sprite.setScale(scale);
    if ('baseScale' in u) u.baseScale = scale;
  }

  private applyAttackScale(u: UnitVisual) {
    const scale = this.scaleFor(u.cardId, 'attack');
    u.sprite.setScale(scale);
    u.baseScale = scale;
  }
}
