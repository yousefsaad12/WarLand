import Phaser from 'phaser';
import type { CardDefinition, GameSide, MatchView } from '@/network/protocol';
import { BASE_MAX_HP } from '@/features/game/rules';
import { useGameStore } from '@/store/gameStore';
import { sfx } from '../audio/SfxManager';
import { ArenaView } from '../arena/ArenaView';
import {
  MAP_CENTER,
  MAP_SIZE,
  isInPlayBand,
  mapToScreen,
  screenToMap,
} from '../coords';
import { COLORS } from '../theme';
import { MatchHud } from '../ui/MatchHud';
import { UnitManager } from '../units/UnitManager';
import { VfxManager } from '../vfx/VfxManager';

export interface BattleState {
  view: MatchView | null;
  localSide: GameSide | null;
  selectedCardId: string | null;
  cardRanges: Record<string, number>;
  cardCatalog: Record<string, CardDefinition>;
  reduceMotion: boolean;
}

export class BattleScene extends Phaser.Scene {
  private arena!: ArenaView;
  private units!: UnitManager;
  private hud!: MatchHud;
  private vfx!: VfxManager;

  private ghost!: Phaser.GameObjects.Container;
  private ghostSprite!: Phaser.GameObjects.Image;
  private ghostRing!: Phaser.GameObjects.Arc;
  private ghostArrow!: Phaser.GameObjects.Triangle;
  private rangeGfx!: Phaser.GameObjects.Graphics;
  private zoneHighlight!: Phaser.GameObjects.Graphics;

  private state: BattleState = {
    view: null,
    localSide: null,
    selectedCardId: null,
    cardRanges: {},
    cardCatalog: {},
    reduceMotion: false,
  };

  private lastTick = -1;
  private lastMatchId: string | null = null;
  private tickMs = 100;
  private lastBaseHp = { LEFT: BASE_MAX_HP, RIGHT: BASE_MAX_HP };
  private resultAnnounced = false;
  private ready = false;

  constructor() {
    super('BattleScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.felt);
    this.vfx = new VfxManager(this);
    this.arena = new ArenaView(this, this.vfx);
    this.units = new UnitManager(this, this.vfx);
    this.hud = new MatchHud(this);
    this.arena.rebuild();
    this.vfx.create(this.arena.getBounds());
    this.buildGhost();
    this.buildInput();

    this.scale.on('resize', () => {
      if (!this.ready) return;
      this.arena.rebuild();
      this.vfx.destroy();
      this.vfx.create(this.arena.getBounds());
      this.hud.rebuildLayout();
      this.units.clear();
      this.syncFromState();
    });

    this.ready = true;
    this.syncFromState();
  }

  override update(time: number) {
    if (!this.ready) return;
    this.tickMs = this.state.view ? 1000 / this.state.view.ticksPerSecond : 100;
    this.arena.update(time, this.state.reduceMotion);
  }

  setState(next: Partial<BattleState>) {
    this.state = { ...this.state, ...next };
    if (!this.ready) return;
    this.syncFromState();
  }

  private syncFromState() {
    if (!this.ready) return;
    const { view, localSide } = this.state;
    this.hud.sync(this.state);

    if (!view) {
      this.units.clear();
      this.zoneHighlight.clear();
      this.ghost.setVisible(false);
      return;
    }

    if (view.matchId !== this.lastMatchId) {
      this.lastMatchId = view.matchId;
      this.lastTick = -1;
      this.resultAnnounced = false;
      this.units.clear();
      this.cameras.main.resetFX();
      this.lastBaseHp = {
        LEFT: view.players.LEFT.baseHp,
        RIGHT: view.players.RIGHT.baseHp,
      };
    }

    this.arena.setBaseHp(
      view.players.LEFT.baseHp,
      view.players.RIGHT.baseHp,
      BASE_MAX_HP,
    );
    this.units.sync(
      view.units,
      this.arena.getLayout(),
      localSide,
      this.tickMs,
      this.state.reduceMotion,
    );
    this.processEvents();
    this.drawDeployZone();
    this.announceResult();
  }

  private processEvents() {
    const view = this.state.view;
    if (!view?.events?.length) return;
    if (view.tick <= this.lastTick) return;
    this.lastTick = view.tick;

    for (const ev of view.events) {
      this.units.playAttack(
        ev,
        this.arena.getLayout(),
        this.state.reduceMotion,
        (side) => {
          this.arena.pulseBase(side);
          if (!this.state.reduceMotion) {
            const own = side === this.state.localSide;
            sfx.baseHit();
            this.cameras.main.shake(own ? 140 : 90, own ? 0.0045 : 0.003);
            if (own) this.cameras.main.flash(90, 120, 24, 24, false);
            this.flashEdge(side);
          }
          this.arena.setBaseHp(
            view.players.LEFT.baseHp,
            view.players.RIGHT.baseHp,
            BASE_MAX_HP,
          );
        },
      );
    }

    for (const side of ['LEFT', 'RIGHT'] as const) {
      const hp = view.players[side].baseHp;
      if (hp < this.lastBaseHp[side]) {
        this.arena.pulseBase(side);
        if (hp <= 0) this.baseDestroyed(side);
      }
      this.lastBaseHp[side] = hp;
    }
  }

  private baseDestroyed(side: GameSide) {
    if (this.state.reduceMotion) return;
    this.cameras.main.zoomTo(1.025, 220, 'Quad.easeOut', true);
    this.cameras.main.flash(240, 255, 245, 225, false);
    this.cameras.main.shake(320, 0.006);
    sfx.baseHit();
    this.time.delayedCall(900, () => {
      if (this.cameras.main)
        this.cameras.main.zoomTo(1, 400, 'Quad.easeIn', true);
    });
    void side;
  }

  private announceResult() {
    const view = this.state.view;
    if (!view?.result || this.resultAnnounced) return;
    this.resultAnnounced = true;
    const winner = view.result.winner;
    if (winner === null || winner === 'DRAW') return;
    if (winner === this.state.localSide) {
      sfx.win();
    } else {
      sfx.lose();
    }
  }

  private flashEdge(side: GameSide) {
    const w = this.scale.width;
    const h = this.scale.height;
    const g = this.add.graphics();
    g.fillStyle(COLORS.danger, 0.28);
    if (side === this.state.localSide) {
      g.fillRect(0, 0, 28, h);
      g.fillRect(0, 0, w, 18);
      g.fillRect(0, h - 18, w, 18);
    } else {
      g.fillRect(w - 28, 0, 28, h);
    }
    g.setDepth(50);
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 220,
      onComplete: () => g.destroy(),
    });
  }

  private buildGhost() {
    this.ghost = this.add.container(0, 0);
    this.ghost.setDepth(20);
    this.ghost.setVisible(false);
    this.ghostSprite = this.add.image(0, -8, 'knight_card');
    this.ghostSprite.setDisplaySize(46, 46);
    this.ghostSprite.setAlpha(0.6);
    this.ghostRing = this.add.circle(0, 4, 20, COLORS.hp, 0);
    this.ghostRing.setStrokeStyle(2, COLORS.hp, 0.9);
    this.ghostArrow = this.add.triangle(
      0,
      -34,
      0,
      0,
      12,
      7,
      0,
      14,
      COLORS.highlight,
      0.9,
    );
    this.ghostArrow.setOrigin(0.5, 0.5);
    this.ghost.add([this.ghostRing, this.ghostSprite, this.ghostArrow]);
    this.rangeGfx = this.add.graphics();
    this.rangeGfx.setDepth(12);
    this.zoneHighlight = this.add.graphics();
    this.zoneHighlight.setDepth(3);
  }

  private buildInput() {
    const isMobileBottom = (py: number) => {
      const bottomThreshold = this.scale.width < 640 ? 168 : 150;
      return py > this.scale.height - bottomThreshold;
    };

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (isMobileBottom(p.y)) {
        this.ghost.setVisible(false);
        this.rangeGfx.clear();
        return;
      }
      const layout = this.arena.getLayout();
      const map = screenToMap(layout, p.x, p.y);
      if (
        !map ||
        !this.state.view ||
        !this.state.localSide ||
        !this.state.selectedCardId
      ) {
        this.ghost.setVisible(false);
        this.rangeGfx.clear();
        return;
      }
      this.placeGhost(map.x, map.y);
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (isMobileBottom(p.y)) return;

      const layout = this.arena.getLayout();
      const map = screenToMap(layout, p.x, p.y);
      if (
        !map ||
        !this.state.view ||
        !this.state.localSide ||
        !this.state.selectedCardId
      ) {
        return;
      }
      if (!this.isValidDeploy(map.x, map.y)) return;
      useGameStore.getState().deployAt(map.x, map.y);
    });
  }

  private placeGhost(mx: number, my: number) {
    const layout = this.arena.getLayout();
    const screen = mapToScreen(layout, mx, my);
    this.ghost.setPosition(screen.x, screen.y);

    const valid = this.isValidDeploy(mx, my);
    const card = this.state.selectedCardId!;
    if (this.textures.exists(`${card}_card`)) {
      this.ghostSprite.setTexture(`${card}_card`);
    }
    this.ghostRing.setStrokeStyle(2, valid ? COLORS.hp : COLORS.danger, 0.95);
    this.ghostSprite.setTint(valid ? 0xffffff : 0xff8888);
    this.ghostArrow.setFillStyle(valid ? COLORS.highlight : COLORS.danger, 0.9);
    this.ghostArrow.setAngle(this.state.localSide === 'RIGHT' ? 180 : 0);
    if (!this.state.reduceMotion) {
      const pulse = 1 + Math.sin(this.time.now / 180) * 0.06;
      this.ghostRing.setScale(pulse);
    } else {
      this.ghostRing.setScale(1);
    }
    this.ghost.setVisible(true);

    this.rangeGfx.clear();
    const range = this.state.cardRanges[card];
    if (range) {
      this.drawDashedCircle(
        this.rangeGfx,
        screen.x,
        screen.y,
        range * layout.scale,
        valid ? COLORS.gold : COLORS.danger,
        0.5,
      );
    }
    if (!valid) {
      this.rangeGfx.lineStyle(2.5, COLORS.danger, 0.85);
      this.rangeGfx.lineBetween(
        screen.x - 12,
        screen.y - 12,
        screen.x + 12,
        screen.y + 12,
      );
      this.rangeGfx.lineBetween(
        screen.x + 12,
        screen.y - 12,
        screen.x - 12,
        screen.y + 12,
      );
    }
  }

  private drawDashedCircle(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    r: number,
    color: number,
    alpha: number,
  ) {
    g.lineStyle(1.5, color, alpha);
    const segments = 40;
    const step = (Math.PI * 2) / segments;
    for (let i = 0; i < segments; i += 2) {
      g.beginPath();
      g.arc(cx, cy, r, i * step, (i + 1) * step);
      g.strokePath();
    }
  }

  private isValidDeploy(mx: number, my: number): boolean {
    const view = this.state.view;
    const side = this.state.localSide;
    if (!view || !side) return false;
    if (mx < 0 || mx > MAP_SIZE || my < 0 || my > MAP_SIZE) return false;
    if (!isInPlayBand(my, view.laneHalfWidth)) return false;
    return side === 'LEFT' ? mx < MAP_CENTER : mx > MAP_CENTER;
  }

  private drawDeployZone() {
    this.zoneHighlight.clear();
    const view = this.state.view;
    const side = this.state.localSide;
    if (!view || !side || !this.state.selectedCardId) return;

    const layout = this.arena.getLayout();
    const half = view.laneHalfWidth;
    const x0 = side === 'LEFT' ? 0 : MAP_CENTER;
    const x1 = side === 'LEFT' ? MAP_CENTER : MAP_SIZE;
    const y0 = MAP_CENTER - half;
    const y1 = MAP_CENTER + half;
    const a = mapToScreen(layout, x0, y0);
    const b = mapToScreen(layout, x1, y1);
    const pulse = this.state.reduceMotion
      ? 1
      : 0.85 + Math.sin(this.time.now / 320) * 0.15;
    this.zoneHighlight.fillStyle(COLORS.gold, 0.055 * pulse);
    this.zoneHighlight.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    this.zoneHighlight.lineStyle(1.5, COLORS.gold, 0.35 * pulse);
    this.zoneHighlight.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
}
