import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import type { GameSide, MatchView, UnitView } from '@/network/protocol';
import {
  createArenaTransform,
  isInDeploymentZone,
  MAP_CENTER,
  MAP_SIZE,
  type ArenaTransform,
  type MapPoint,
} from './coordinates';
import { drawHealthBar, drawUnitBody, unitStyle } from './art';
import { THEME, viewerColor } from './theme';

const MARGIN = 40;
/** Grid resolution of the tiled terrain. Odd so a column sits on x = 50 (the river). */
const GRID = 13;

const RTS = '/assets/kenney/medieval-rts';
const UNITS = '/assets/kenney/units';

const TILE_TEXTURES = {
  grass: [`${RTS}/grass-01.png`, `${RTS}/grass-02.png`, `${RTS}/grass-03.png`, `${RTS}/grass-04.png`],
  dirt: [`${RTS}/dirt-01.png`, `${RTS}/dirt-02.png`],
  stone: [`${RTS}/stone-01.png`, `${RTS}/stone-02.png`],
  water: [`${RTS}/water-01.png`, `${RTS}/water-02.png`],
  tree: [`${RTS}/tree-01.png`, `${RTS}/tree-02.png`, `${RTS}/tree-03.png`, `${RTS}/tree-04.png`],
  rock: [`${RTS}/rock-01.png`, `${RTS}/rock-02.png`, `${RTS}/rock-03.png`],
} as const;

const KEEP_TEXTURE = `${RTS}/keep.png`;

interface UnitVisual {
  container: Container;
  ring: Graphics;
  body: Graphics;
  sprite: Sprite | null;
  hpBar: Graphics;
  cardId: string;
  side: GameSide;
  color: number;
  maxHp: number;
  mapX: number;
  mapY: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  displayedX: number;
  displayedY: number;
  size: number;
}

interface Effect {
  g: Graphics;
  age: number;
  life: number;
  kind: 'impact' | 'death' | 'spawn';
  color: number;
}

export interface BattlefieldState {
  view: MatchView | null;
  localSide: GameSide | null;
  selectedCardId: string | null;
  hoverMap: MapPoint | null;
}

export interface BattlefieldCallbacks {
  onDeploy: (map: MapPoint) => void;
}

function hash2(x: number, y: number, salt = 0): number {
  let h = (x + 1) * 374761393 + (y + 1) * 668265263 + salt * 2246822519;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Battlefield {
  private readonly callbacks: BattlefieldCallbacks;

  private readonly root = new Container();
  private readonly groundLayer = new Container();
  private readonly decorLayer = new Container();
  private readonly zoneLayer = new Container();
  private readonly baseLayer = new Container();
  private readonly unitLayer = new Container();
  private readonly fxLayer = new Container();

  private readonly ground = new Graphics();
  private readonly terrainLayer = new Container();
  private readonly decorTiles = new Container();
  private readonly edgeShade = new Graphics();

  private readonly zone = new Graphics();
  private readonly ghost = new Graphics();
  private readonly baseShadow = new Graphics();
  private readonly leftRing = new Graphics();
  private readonly rightRing = new Graphics();
  private readonly leftBase: Sprite;
  private readonly rightBase: Sprite;
  private readonly leftHp = new Graphics();
  private readonly rightHp = new Graphics();
  private readonly leftLabel: Text;
  private readonly rightLabel: Text;
  private readonly zoneLabel: Text;

  private readonly textures = new Map<string, Texture>();
  private loaded = false;

  private transform: ArenaTransform;
  private width: number;
  private height: number;
  private mirror = false;
  private hoverValid = false;
  private baseMaxHp: Record<GameSide, number> = { LEFT: 0, RIGHT: 0 };
  private lastBaseHp: Record<GameSide, number> = { LEFT: -1, RIGHT: -1 };

  private readonly units = new Map<string, UnitVisual>();
  private readonly effects: Effect[] = [];

  private state: BattlefieldState = {
    view: null,
    localSide: null,
    selectedCardId: null,
    hoverMap: null,
  };

  private tickMs = 100;

  constructor(
    app: Application,
    width: number,
    height: number,
    callbacks: BattlefieldCallbacks,
  ) {
    this.callbacks = callbacks;
    this.width = width;
    this.height = height;
    this.transform = this.computeTransform();

    this.leftBase = new Sprite();
    this.rightBase = new Sprite();
    this.leftBase.anchor.set(0.5);
    this.rightBase.anchor.set(0.5);
    this.leftBase.visible = false;
    this.rightBase.visible = false;

    this.root.addChild(
      this.groundLayer,
      this.zoneLayer,
      this.baseLayer,
      this.unitLayer,
      this.fxLayer,
    );
    this.groundLayer.addChild(
      this.ground,
      this.terrainLayer,
      this.edgeShade,
      this.decorLayer,
    );
    this.decorLayer.addChild(this.decorTiles);
    this.baseLayer.addChild(
      this.baseShadow,
      this.leftRing,
      this.rightRing,
      this.leftBase,
      this.rightBase,
      this.leftHp,
      this.rightHp,
    );
    this.fxLayer.addChild(this.ghost);

    const labelStyle = {
      fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
      fontSize: 12,
      fontWeight: '700' as const,
      fill: THEME.colors.white,
      letterSpacing: 1,
    };
    this.leftLabel = new Text({ text: 'YOUR BASE', style: { ...labelStyle } });
    this.rightLabel = new Text({ text: 'ENEMY BASE', style: { ...labelStyle } });
    this.zoneLabel = new Text({
      text: 'YOUR DEPLOY ZONE',
      style: { ...labelStyle, fontSize: 11, fill: THEME.colors.gold },
    });
    this.zoneLabel.anchor.set(0.5);
    this.zoneLayer.addChild(this.zone, this.zoneLabel);
    this.baseLayer.addChild(this.leftLabel, this.rightLabel);

    app.stage.addChild(this.root);
    this.buildStatic();
    this.drawBases();
    void this.loadTextures();
  }

  private computeTransform(): ArenaTransform {
    const size = Math.max(120, Math.min(this.width, this.height) - MARGIN * 2);
    const x = (this.width - size) / 2;
    const y = (this.height - size) / 2;
    return createArenaTransform({ x, y, size }, this.mirror);
  }

  private async loadTextures(): Promise<void> {
    const entries: Array<[string, string]> = [];
    for (const [group, list] of Object.entries(TILE_TEXTURES)) {
      list.forEach((url, i) => entries.push([`${group}:${i}`, url]));
    }
    entries.push(['keep', KEEP_TEXTURE]);
    for (const cardId of ['knight', 'archer', 'guard', 'scout']) {
      entries.push([`unit:${cardId}`, `${UNITS}/${cardId}.png`]);
    }

    const results = await Promise.allSettled(
      entries.map(async ([key, url]) => {
        const texture = await Assets.load<Texture>(url);
        this.textures.set(key, texture);
      }),
    );
    this.loaded = results.some((r) => r.status === 'fulfilled');
    if (this.leftBase.texture === Texture.EMPTY) {
      this.setBaseTexture();
    }
    this.buildStatic();
    this.drawBases();
    this.reloadUnits();
  }

  private pick(group: keyof typeof TILE_TEXTURES, col: number, row: number): Texture | null {
    const list = TILE_TEXTURES[group];
    const idx = Math.floor(hash2(col, row, group.length) * list.length);
    return this.textures.get(`${group}:${idx}`) ?? null;
  }

  private setBaseTexture(): void {
    const keep = this.textures.get('keep');
    if (!keep) return;
    this.leftBase.texture = keep;
    this.rightBase.texture = keep;
    this.leftBase.visible = true;
    this.rightBase.visible = true;
  }

  private buildStatic(): void {
    const { rect } = this.transform;

    const g = this.ground;
    g.clear();
    g.roundRect(rect.x, rect.y, rect.size, rect.size, 16).fill(THEME.colors.arenaGround);
    g.roundRect(rect.x, rect.y, rect.size, rect.size * 0.42, 16).fill({
      color: THEME.colors.arenaGroundAlt,
      alpha: 0.5,
    });

    this.buildTerrain();
    this.buildDecor();

    // Team side washes + vignette.
    const shade = this.edgeShade;
    shade.clear();
    this.drawEdgeGradient(shade, rect.x, rect.y, rect.size, true);
    this.drawEdgeGradient(shade, rect.x, rect.y, rect.size, false);
    this.drawVignette(shade, rect.x, rect.y, rect.size);
    shade.roundRect(rect.x, rect.y, rect.size, rect.size, 16).stroke({
      width: 2,
      color: THEME.colors.arenaEdge,
    });

    this.leftLabel.position.set(rect.x + 10, rect.y + 8);
    this.leftLabel.anchor.set(0, 0);
    this.rightLabel.position.set(rect.x + rect.size - 10, rect.y + 8);
    this.rightLabel.anchor.set(1, 0);
  }

  private cellRect(col: number, row: number): { x: number; y: number; size: number } {
    const { rect } = this.transform;
    const cell = rect.size / GRID;
    return { x: rect.x + col * cell, y: rect.y + row * cell, size: cell };
  }

  private cellCenterMap(col: number, row: number): MapPoint {
    return {
      x: ((col + 0.5) / GRID) * MAP_SIZE,
      y: ((row + 0.5) / GRID) * MAP_SIZE,
    };
  }

  private buildTerrain(): void {
    this.terrainLayer.removeChildren().forEach((child) => child.destroy());

    const { rect } = this.transform;
    const cell = rect.size / GRID;
    for (let row = 0; row < GRID; row += 1) {
      for (let col = 0; col < GRID; col += 1) {
        if (!this.loaded) continue;
        const center = this.cellCenterMap(col, row);
        const cellInMapUnits = MAP_SIZE / GRID;
        const distToRiver = Math.abs(center.x - MAP_CENTER);

        let group: keyof typeof TILE_TEXTURES = 'grass';
        if (distToRiver <= cellInMapUnits / 2 + 0.5) {
          group = 'water';
        } else if (distToRiver <= cellInMapUnits * 0.95) {
          group = 'dirt';
        } else if (hash2(col, row, 7) > 0.93) {
          group = 'dirt';
        } else if (hash2(col, row, 13) > 0.95) {
          group = 'stone';
        }

        const texture = this.pick(group, col, row);
        if (!texture) continue;
        const sprite = new Sprite(texture);
        const { x, y } = this.cellRect(col, row);
        sprite.position.set(x, y);
        sprite.width = cell + 1;
        sprite.height = cell + 1;
        if (group !== 'water') {
          sprite.tint = 0xffffff;
          sprite.alpha = 1;
        }
        this.terrainLayer.addChild(sprite);
      }
    }
  }

  private buildDecor(): void {
    this.decorTiles.removeChildren().forEach((child) => child.destroy());
    if (!this.loaded) return;

    const { rect } = this.transform;
    const cell = rect.size / GRID;
    for (let row = 0; row < GRID; row += 1) {
      for (let col = 0; col < GRID; col += 1) {
        const center = this.cellCenterMap(col, row);
        // Only decorate the top / bottom forest strips, away from the river.
        const inStrip = center.y < 28 || center.y > 72;
        if (!inStrip) continue;
        if (Math.abs(center.x - MAP_CENTER) < 6) continue;
        const roll = hash2(col, row, 31);
        if (roll > 0.42) continue;

        const isTree = hash2(col, row, 41) > 0.3;
        const group: keyof typeof TILE_TEXTURES = isTree ? 'tree' : 'rock';
        const texture = this.pick(group, col, row);
        if (!texture) continue;

        const sprite = new Sprite(texture);
        const { x, y } = this.cellRect(col, row);
        const jitterX = (hash2(col, row, 51) - 0.5) * cell * 0.5;
        const jitterY = (hash2(col, row, 61) - 0.5) * cell * 0.5;
        const scale = 0.8 + hash2(col, row, 71) * 0.5;
        sprite.anchor.set(0.5);
        sprite.position.set(x + cell / 2 + jitterX, y + cell / 2 + jitterY);
        sprite.width = cell * 1.5 * scale;
        sprite.height = cell * 1.5 * scale;
        sprite.alpha = 0.96;
        this.decorTiles.addChild(sprite);
      }
    }
  }

  private drawEdgeGradient(
    g: Graphics,
    rectX: number,
    rectY: number,
    size: number,
    isLeft: boolean,
  ): void {
    const color = viewerColor(isLeft);
    const steps = 7;
    const bandW = (size * 0.34) / steps;
    for (let i = 0; i < steps; i += 1) {
      const alpha = 0.1 * (1 - i / steps);
      const x = isLeft ? rectX + i * bandW : rectX + size - (i + 1) * bandW;
      g.rect(x, rectY, bandW + 0.6, size).fill({ color, alpha });
    }
  }

  private drawVignette(g: Graphics, rectX: number, rectY: number, size: number): void {
    const steps = 5;
    const band = size * 0.14;
    for (let i = 0; i < steps; i += 1) {
      const alpha = 0.14 * (1 - i / steps);
      const inset = (i * band) / steps;
      const thickness = band / steps;
      // top & bottom
      g.rect(rectX, rectY + inset, size, thickness).fill({
        color: THEME.colors.shadow,
        alpha,
      });
      g.rect(rectX, rectY + size - inset - thickness, size, thickness).fill({
        color: THEME.colors.shadow,
        alpha,
      });
      // left & right
      g.rect(rectX + inset, rectY, thickness, size).fill({
        color: THEME.colors.shadow,
        alpha,
      });
      g.rect(rectX + size - inset - thickness, rectY, thickness, size).fill({
        color: THEME.colors.shadow,
        alpha,
      });
    }
  }

  private drawBases(): void {
    const localSide = this.state.localSide;
    const baseSize = this.transform.scale(20);
    this.drawBaseRing(this.leftRing, baseSize, localSide === 'LEFT');
    this.drawBaseRing(this.rightRing, baseSize, localSide === 'RIGHT');

    const leftPos = this.transform.toScreenXY(0, MAP_CENTER);
    const rightPos = this.transform.toScreenXY(MAP_SIZE, MAP_CENTER);

    const shadow = this.baseShadow;
    shadow.clear();
    for (const pos of [leftPos, rightPos]) {
      shadow
        .ellipse(pos.x, pos.y + baseSize * 0.42, baseSize * 0.62, baseSize * 0.22)
        .fill({ color: THEME.colors.shadow, alpha: 0.34 });
    }

    for (const [sprite, pos] of [
      [this.leftBase, leftPos],
      [this.rightBase, rightPos],
    ] as const) {
      sprite.position.set(pos.x, pos.y);
      sprite.width = baseSize;
      sprite.height = baseSize;
    }
    this.leftRing.position.set(leftPos.x, leftPos.y);
    this.rightRing.position.set(rightPos.x, rightPos.y);
    this.lastBaseHp = { LEFT: -1, RIGHT: -1 };
  }

  private drawBaseRing(
    g: Graphics,
    size: number,
    isLocal: boolean,
  ): void {
    const color = viewerColor(isLocal);
    const r = size * 0.46;
    g.clear();
    g.circle(0, 0, r).fill({ color, alpha: 0.2 });
    g.circle(0, 0, r).stroke({ width: Math.max(2, size * 0.05), color, alpha: 0.9 });
    g.circle(0, 0, r * 0.78).stroke({
      width: Math.max(1, size * 0.02),
      color: THEME.colors.white,
      alpha: 0.25,
    });
  }

  private applyTransformForSide(side: GameSide | null): void {
    const mirror = side === 'RIGHT';
    if (mirror !== this.mirror) {
      this.mirror = mirror;
      this.transform = this.computeTransform();
      this.buildStatic();
      this.repositionUnits();
    }
    this.drawBases();
  }

  private repositionUnits(): void {
    for (const visual of this.units.values()) {
      const pos = this.transform.toScreenXY(visual.mapX, visual.mapY);
      visual.fromX = pos.x;
      visual.fromY = pos.y;
      visual.toX = pos.x;
      visual.toY = pos.y;
      visual.displayedX = pos.x;
      visual.displayedY = pos.y;
      visual.progress = 1;
    }
    this.lastBaseHp = { LEFT: -1, RIGHT: -1 };
  }

  private reloadUnits(): void {
    for (const visual of this.units.values()) {
      visual.container.destroy({ children: true });
    }
    this.units.clear();
    this.syncUnits();
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.transform = this.computeTransform();
    this.buildStatic();
    this.drawBases();
    this.repositionUnits();
  }

  setState(next: Partial<BattlefieldState>): void {
    const sideChanged =
      'localSide' in next && next.localSide !== this.state.localSide;
    this.state = { ...this.state, ...next };
    if (sideChanged) this.applyTransformForSide(this.state.localSide);
    this.syncUnits();
    this.drawDynamic();
  }

  private cardAffordable(): boolean {
    const { view, localSide, selectedCardId } = this.state;
    if (!view || !localSide || !selectedCardId) return false;
    const card = view.players[localSide].cards.find(
      (c) => c.cardId === selectedCardId,
    );
    return Boolean(card) && view.players[localSide].energyHundredths >= card!.cost * 100;
  }

  private syncUnits(): void {
    const view = this.state.view;
    if (view) this.tickMs = 1000 / view.ticksPerSecond;
    if (!view) {
      for (const [id, visual] of this.units) {
        this.startDeath(id, visual);
      }
      return;
    }

    const seen = new Set<string>();
    for (const unit of view.units) {
      seen.add(unit.id);
      this.upsertUnit(unit, this.state.localSide);
    }
    for (const [id, visual] of this.units) {
      if (!seen.has(id)) this.startDeath(id, visual);
    }
  }

  private upsertUnit(unit: UnitView, localSide: GameSide | null): void {
    const style = unitStyle(unit.cardId);
    const ringR = this.transform.scale(style.radius * 1.9);
    const spriteSize = this.transform.scale(style.radius * 4.6);
    const isLocal = localSide === unit.owner;
    const color = viewerColor(isLocal);
    const existing = this.units.get(unit.id);

    if (!existing) {
      const container = new Container();
      const shadow = new Graphics();
      shadow.ellipse(0, spriteSize * 0.3, spriteSize * 0.4, spriteSize * 0.15).fill({
        color: THEME.colors.shadow,
        alpha: 0.32,
      });
      const ring = new Graphics();
      ring.circle(0, 0, ringR).fill({ color, alpha: 0.32 });
      ring.circle(0, 0, ringR).stroke({ width: Math.max(1.5, ringR * 0.16), color, alpha: 0.95 });

      const texture = this.textures.get(`unit:${unit.cardId}`);
      let sprite: Sprite | null = null;
      const body = new Graphics();
      if (texture) {
        sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.width = spriteSize;
        sprite.height = spriteSize;
        sprite.position.set(0, -spriteSize * 0.06);
      } else {
        drawUnitBody(body, unit.cardId, unit.owner, isLocal, ringR);
      }
      const hpBar = new Graphics();

      container.addChild(shadow, ring, sprite ?? body, hpBar);
      this.unitLayer.addChild(container);
      const spawn = this.transform.toScreenXY(unit.x, unit.y);
      container.position.set(spawn.x, spawn.y);
      drawHealthBar(hpBar, {
        width: this.transform.scale(5.4),
        height: 4,
        ratio: 1,
        y: -spriteSize * 0.6,
      });
      this.units.set(unit.id, {
        container,
        ring,
        body,
        sprite,
        hpBar,
        cardId: unit.cardId,
        side: unit.owner,
        color,
        maxHp: unit.hp,
        mapX: unit.x,
        mapY: unit.y,
        fromX: spawn.x,
        fromY: spawn.y,
        toX: spawn.x,
        toY: spawn.y,
        progress: 1,
        displayedX: spawn.x,
        displayedY: spawn.y,
        size: spriteSize,
      });
      this.addEffect('spawn', unit.x, unit.y, color);
      return;
    }

    existing.maxHp = Math.max(existing.maxHp, unit.hp);
    existing.mapX = unit.x;
    existing.mapY = unit.y;
    drawHealthBar(existing.hpBar, {
      width: this.transform.scale(5.4),
      height: 4,
      ratio: existing.maxHp > 0 ? unit.hp / existing.maxHp : 1,
      y: -existing.size * 0.6,
    });

    const target = this.transform.toScreenXY(unit.x, unit.y);
    if (
      Math.abs(target.x - existing.toX) > 0.01 ||
      Math.abs(target.y - existing.toY) > 0.01
    ) {
      existing.fromX = existing.displayedX;
      existing.fromY = existing.displayedY;
      existing.toX = target.x;
      existing.toY = target.y;
      existing.progress = 0;
    }
  }

  private startDeath(id: string, visual: UnitVisual): void {
    const mapPoint = this.transform.toMap({
      x: visual.displayedX,
      y: visual.displayedY,
    });
    this.addEffect('death', mapPoint.x, mapPoint.y, visual.color);
    visual.container.destroy({ children: true });
    this.units.delete(id);
  }

  private addEffect(
    kind: Effect['kind'],
    mapX: number,
    mapY: number,
    color: number,
  ): void {
    const g = new Graphics();
    const pos = this.transform.toScreenXY(mapX, mapY);
    g.position.set(pos.x, pos.y);
    this.fxLayer.addChild(g);
    this.effects.push({
      g,
      age: 0,
      life: kind === 'death' ? 460 : 280,
      kind,
      color,
    });
  }

  private drawDynamic(): void {
    const { view, localSide, selectedCardId } = this.state;

    this.zone.clear();
    this.zoneLabel.visible = false;

    if (!view || !localSide) return;

    const half = view.laneHalfWidth;
    const rect = this.transform.rect;
    const yTop = this.transform.toScreenXY(0, MAP_CENTER - half).y;
    const yBot = this.transform.toScreenXY(0, MAP_CENTER + half).y;

    this.zone
      .moveTo(rect.x, yTop)
      .lineTo(rect.x + rect.size, yTop)
      .stroke({ width: 1, color: THEME.colors.goldSoft, alpha: 0.18 })
      .moveTo(rect.x, yBot)
      .lineTo(rect.x + rect.size, yBot)
      .stroke({ width: 1, color: THEME.colors.goldSoft, alpha: 0.18 });

    const x0 = localSide === 'LEFT' ? 0 : MAP_CENTER;
    const x1 = localSide === 'LEFT' ? MAP_CENTER : MAP_SIZE;
    const topLeft = this.transform.toScreenXY(x0, MAP_CENTER - half);
    const bottomRight = this.transform.toScreenXY(x1, MAP_CENTER + half);
    const w = bottomRight.x - topLeft.x;
    const h = bottomRight.y - topLeft.y;
    const selected = Boolean(selectedCardId);
    const affordable = this.cardAffordable();
    const fillAlpha = !selected ? 0.03 : affordable ? 0.16 : 0.05;
    const strokeAlpha = !selected ? 0.3 : affordable ? 0.9 : 0.4;

    this.zone
      .roundRect(topLeft.x, topLeft.y, w, h, 14)
      .fill({ color: THEME.colors.gold, alpha: fillAlpha });
    this.zone
      .roundRect(topLeft.x, topLeft.y, w, h, 14)
      .stroke({
        width: selected ? 2 : 1.5,
        color: affordable || !selected ? THEME.colors.gold : THEME.colors.goldSoft,
        alpha: strokeAlpha,
      });

    if (selected) {
      this.zoneLabel.position.set(topLeft.x + w / 2, topLeft.y + 16);
      this.zoneLabel.visible = true;
    }
  }

  update(deltaMS: number, elapsedMS: number): void {
    const { view, localSide, hoverMap, selectedCardId } = this.state;

    for (const visual of this.units.values()) {
      if (visual.progress < 1) {
        visual.progress = Math.min(1, visual.progress + deltaMS / this.tickMs);
      }
      const t = visual.progress;
      visual.displayedX = visual.fromX + (visual.toX - visual.fromX) * t;
      visual.displayedY = visual.fromY + (visual.toY - visual.fromY) * t;
      visual.container.position.set(visual.displayedX, visual.displayedY);

      // Gentle idle bob while moving.
      if (visual.sprite && visual.progress < 1) {
        visual.sprite.y = -visual.size * 0.06 + Math.sin(elapsedMS / 90) * visual.size * 0.02;
      }
    }

    if (view) {
      const barW = this.transform.scale(11);
      const baseSize = this.transform.scale(20);
      if (view.players.LEFT.baseHp !== this.lastBaseHp.LEFT) {
        this.baseMaxHp.LEFT = Math.max(this.baseMaxHp.LEFT, view.players.LEFT.baseHp);
        this.leftHp.clear();
        drawHealthBar(this.leftHp, {
          width: barW,
          height: 7,
          ratio:
            this.baseMaxHp.LEFT > 0 ? view.players.LEFT.baseHp / this.baseMaxHp.LEFT : 1,
          y: 0,
        });
        this.lastBaseHp.LEFT = view.players.LEFT.baseHp;
      }
      if (view.players.RIGHT.baseHp !== this.lastBaseHp.RIGHT) {
        this.baseMaxHp.RIGHT = Math.max(this.baseMaxHp.RIGHT, view.players.RIGHT.baseHp);
        this.rightHp.clear();
        drawHealthBar(this.rightHp, {
          width: barW,
          height: 7,
          ratio:
            this.baseMaxHp.RIGHT > 0 ? view.players.RIGHT.baseHp / this.baseMaxHp.RIGHT : 1,
          y: 0,
        });
        this.lastBaseHp.RIGHT = view.players.RIGHT.baseHp;
      }
      const leftPos = this.transform.toScreenXY(0, MAP_CENTER);
      const rightPos = this.transform.toScreenXY(MAP_SIZE, MAP_CENTER);
      this.leftHp.position.set(leftPos.x, leftPos.y + baseSize * 0.62);
      this.rightHp.position.set(rightPos.x, rightPos.y + baseSize * 0.62);
    }

    this.ghost.clear();
    if (view && localSide && selectedCardId && hoverMap) {
      const { radius } = unitStyle(selectedCardId);
      const pos = this.transform.toScreenXY(hoverMap.x, hoverMap.y);
      const r = this.transform.scale(radius);
      this.ghost.position.set(pos.x, pos.y);
      const color = this.hoverValid ? THEME.colors.health : THEME.colors.enemy;
      this.ghost.circle(0, 0, r).fill({ color, alpha: 0.3 });
      this.ghost.circle(0, 0, r).stroke({ width: 2, color, alpha: 0.9 });
      this.ghost.visible = true;
    } else {
      this.ghost.visible = false;
    }

    if (this.zoneLabel.visible) {
      this.zone.alpha = 0.82 + 0.18 * Math.sin(elapsedMS / 420);
    } else {
      this.zone.alpha = 1;
    }

    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i]!;
      effect.age += deltaMS;
      const p = effect.age / effect.life;
      if (p >= 1) {
        effect.g.destroy();
        this.effects.splice(i, 1);
        continue;
      }
      effect.g.clear();
      if (effect.kind === 'death') {
        effect.g
          .circle(0, 0, 6 + p * 26)
          .stroke({ width: 3 * (1 - p), color: effect.color, alpha: 1 - p });
        effect.g
          .circle(0, 0, 3 + p * 12)
          .fill({ color: effect.color, alpha: 0.35 * (1 - p) });
      } else if (effect.kind === 'spawn') {
        effect.g
          .circle(0, 0, 4 + p * 16)
          .stroke({ width: 2 * (1 - p), color: effect.color, alpha: 0.85 * (1 - p) });
      } else {
        effect.g
          .circle(0, 0, p * 12)
          .fill({ color: effect.color, alpha: 1 - p });
      }
    }
  }

  pointerMove(localX: number, localY: number): void {
    const map = this.transform.toMap({ x: localX, y: localY });
    const { view, localSide, selectedCardId } = this.state;
    const inside =
      map.x >= 0 && map.x <= MAP_SIZE && map.y >= 0 && map.y <= MAP_SIZE;
    if (!view || !localSide || !selectedCardId || !inside) {
      this.hoverValid = false;
      this.state.hoverMap = null;
      return;
    }
    this.hoverValid =
      this.cardAffordable() &&
      isInDeploymentZone(map.x, map.y, localSide, view.laneHalfWidth);
    this.state.hoverMap = map;
  }

  pointerDown(localX: number, localY: number): void {
    const { view, localSide } = this.state;
    if (!view || !localSide) return;
    const map = this.transform.toMap({ x: localX, y: localY });
    if (map.x < 0 || map.x > MAP_SIZE || map.y < 0 || map.y > MAP_SIZE) return;
    this.callbacks.onDeploy(map);
  }

  pointerLeave(): void {
    this.state.hoverMap = null;
    this.hoverValid = false;
  }

  destroy(): void {
    for (const unit of this.units.values()) {
      unit.container.destroy({ children: true });
    }
    this.units.clear();
    for (const effect of this.effects) {
      effect.g.destroy();
    }
    this.effects.length = 0;
    this.root.destroy({ children: true });
  }
}
