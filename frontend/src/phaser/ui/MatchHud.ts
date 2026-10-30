import Phaser from 'phaser';
import type {
  CardDefinition,
  GameSide,
  MatchCardView,
  MatchView,
} from '@/network/protocol';
import { BASE_MAX_HP } from '@/features/game/rules';
import { useGameStore } from '@/store/gameStore';
import { sfx } from '../audio/SfxManager';
import {
  CARD_ACCENT,
  COLORS,
  FONT_DISPLAY,
  FONT_MONO,
  FONT_UI,
  teamTextColor,
} from '../theme';

interface HudState {
  view: MatchView | null;
  localSide: GameSide | null;
  selectedCardId: string | null;
  cardCatalog: Record<string, CardDefinition>;
  reduceMotion: boolean;
}

interface CardWidget {
  root: Phaser.GameObjects.Container;
  cardId: string;
  halo: Phaser.GameObjects.Graphics;
  frame: Phaser.GameObjects.Graphics;
  ring: Phaser.GameObjects.Graphics;
  costBg: Phaser.GameObjects.Graphics;
  costText: Phaser.GameObjects.Text;
  art: Phaser.GameObjects.Image;
  nameText: Phaser.GameObjects.Text;
  hpText: Phaser.GameObjects.Text;
  atkText: Phaser.GameObjects.Text;
  hitArea: Phaser.GameObjects.Rectangle;
  hovered: boolean;
  selected: boolean;
  affordable: boolean;
  index: number;
  total: number;
  lastKey: string;
}

const CARD_W = 96;
const CARD_H = 146;
const HP_BAR_W = 148;

/**
 * In-canvas match chrome: header (names + HP + timer), energy segments,
 * and a fanned card hand with real stats and affordability feedback.
 */
export class MatchHud {
  private root: Phaser.GameObjects.Container;
  private leftName!: Phaser.GameObjects.Text;
  private rightName!: Phaser.GameObjects.Text;
  private leftHpText!: Phaser.GameObjects.Text;
  private rightHpText!: Phaser.GameObjects.Text;
  private leftBar!: Phaser.GameObjects.Rectangle;
  private rightBar!: Phaser.GameObjects.Rectangle;
  private leftGhost!: Phaser.GameObjects.Rectangle;
  private rightGhost!: Phaser.GameObjects.Rectangle;
  private timerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private energyLabel!: Phaser.GameObjects.Text;
  private energySegs: Phaser.GameObjects.Rectangle[] = [];
  private energyLead!: Phaser.GameObjects.Rectangle;
  private cards: CardWidget[] = [];
  private handRoot!: Phaser.GameObjects.Container;
  private lastEnergy = -1;
  private lastMatchId: string | null = null;
  private pendingDeal = false;
  private dealUntil = 0;
  private hoveredCardId: string | null = null;
  private lastReduceMotion = false;
  private lastLeftRatio = -1;
  private lastRightRatio = -1;
  private hpBarWidth = HP_BAR_W;

  constructor(private scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0);
    this.root.setDepth(40);
    this.buildHeader();
    this.buildEnergy();
    this.buildHand();
    this.buildHint();
  }

  rebuildLayout() {
    this.root.removeAll(true);
    this.energySegs = [];
    this.cards = [];
    this.lastMatchId = null;
    this.lastEnergy = -1;
    this.lastLeftRatio = -1;
    this.lastRightRatio = -1;
    this.pendingDeal = false;
    this.dealUntil = 0;
    this.buildHeader();
    this.buildEnergy();
    this.buildHand();
    this.buildHint();
  }

  sync(state: HudState) {
    const { view, localSide } = state;
    if (!view || !localSide) {
      this.root.setVisible(false);
      return;
    }
    this.root.setVisible(true);
    this.lastReduceMotion = state.reduceMotion;

    if (view.matchId !== this.lastMatchId) {
      this.lastMatchId = view.matchId;
      this.pendingDeal = true;
      this.hoveredCardId = null;
      this.lastLeftRatio = -1;
      this.lastRightRatio = -1;
    }

    const leftPlayer = view.players.LEFT;
    const rightPlayer = view.players.RIGHT;
    const you = view.players[localSide];

    this.leftName.setText(
      `${label(leftPlayer)}${localSide === 'LEFT' ? '  ·  YOU' : ''}`,
    );
    this.rightName.setText(
      `${label(rightPlayer)}${localSide === 'RIGHT' ? '  ·  YOU' : ''}`,
    );
    this.leftName.setColor(teamTextColor('LEFT'));
    this.rightName.setColor(teamTextColor('RIGHT'));

    this.leftHpText.setText(`${Math.round(leftPlayer.baseHp)} HP`);
    this.rightHpText.setText(`${Math.round(rightPlayer.baseHp)} HP`);

    const lr = Math.max(0, Math.min(1, leftPlayer.baseHp / BASE_MAX_HP));
    const rr = Math.max(0, Math.min(1, rightPlayer.baseHp / BASE_MAX_HP));
    this.syncHpBar(
      this.leftBar,
      this.leftGhost,
      lr,
      this.lastLeftRatio,
      COLORS.teamLeft,
      state.reduceMotion,
    );
    this.syncHpBar(
      this.rightBar,
      this.rightGhost,
      rr,
      this.lastRightRatio,
      COLORS.teamRight,
      state.reduceMotion,
    );
    this.lastLeftRatio = lr;
    this.lastRightRatio = rr;

    const remaining = Math.max(0, view.maxTicks - view.tick);
    const secs = Math.floor(remaining / view.ticksPerSecond);
    const mm = Math.floor(secs / 60);
    const ss = String(secs % 60).padStart(2, '0');
    this.timerText.setText(`${mm}:${ss}`);
    const urgent = secs <= 30;
    this.timerText.setColor(urgent ? '#ff6b6b' : '#e8c88a');
    if (urgent && !state.reduceMotion) {
      this.timerText.setScale(1 + Math.sin(this.scene.time.now / 250) * 0.05);
    } else {
      this.timerText.setScale(1);
    }

    this.syncEnergy(
      you.energyHundredths,
      view.maxEnergyHundredths,
      state.reduceMotion,
    );
    this.syncHand(
      you.cards,
      you.energyHundredths,
      state.selectedCardId,
      state.cardCatalog,
      state.reduceMotion,
    );

    const selected = state.selectedCardId
      ? you.cards.find((c) => c.cardId === state.selectedCardId)
      : null;
    const hovered = this.hoveredCardId
      ? state.cardCatalog[this.hoveredCardId]
      : null;
    if (hovered) {
      this.hintText.setText(
        `${hovered.name.toUpperCase()}  ·  ${hovered.baseHp} HP  ·  ${hovered.baseDamage} DMG  ·  RANGE ${hovered.range}`,
      );
      this.hintText.setColor('#cbd8ea');
    } else if (selected) {
      const missing = selected.cost * 100 - you.energyHundredths;
      if (missing > 0) {
        this.hintText.setText(
          `NEED ${formatEnergy(missing)} MORE ENERGY  ·  ${selected.name.toUpperCase()} COSTS ${selected.cost}`,
        );
        this.hintText.setColor('#f0b35c');
      } else {
        this.hintText.setText(
          `TAP YOUR HALF OF THE LANE TO DEPLOY ${selected.name.toUpperCase()}`,
        );
        this.hintText.setColor('#d8e4f4');
      }
    } else {
      this.hintText.setText('TAP A CARD TO SELECT');
      this.hintText.setColor('#8fa0b8');
    }
  }

  private syncHpBar(
    bar: Phaser.GameObjects.Rectangle,
    ghost: Phaser.GameObjects.Rectangle,
    ratio: number,
    previous: number,
    color: number,
    reduceMotion: boolean,
  ) {
    const width = this.hpBarWidth * ratio;
    bar.width = Math.max(0, width);
    bar.setFillStyle(ratio < 0.33 ? COLORS.hpLow : color);

    if (previous < 0 || reduceMotion) {
      ghost.width = Math.max(0, width);
      return;
    }
    if (ratio < previous - 0.001) {
      this.scene.tweens.add({
        targets: ghost,
        width: Math.max(0, width),
        duration: 460,
        delay: 120,
        ease: 'Quad.easeOut',
      });
    } else if (ratio > previous + 0.001) {
      ghost.width = Math.max(0, width);
    }
  }

  private buildHeader() {
    const w = this.scene.scale.width;
    const isMobile = w < 600;
    this.hpBarWidth = Math.max(
      68,
      Math.min(HP_BAR_W, Math.floor((w - (isMobile ? 108 : 140)) / 2)),
    );

    const g = this.scene.add.graphics();
    g.fillGradientStyle(0x151c2b, 0x151c2b, 0x06080e, 0x06080e, 1);
    g.fillRect(0, 0, w, 66);
    g.fillStyle(0x000000, 0.2);
    g.fillRect(0, 58, w, 8);
    g.lineStyle(1, 0x2c374a, 0.9);
    g.lineBetween(0, 66, w, 66);
    g.fillStyle(COLORS.teamLeft, 0.65);
    g.fillRect(0, 64, w * 0.3, 2);
    g.fillStyle(COLORS.teamRight, 0.65);
    g.fillRect(w * 0.7, 64, w * 0.3, 2);

    const timerBoxW = isMobile ? 86 : 104;
    g.fillStyle(0x070a10, 0.92);
    g.fillRoundedRect(w / 2 - timerBoxW / 2, 7, timerBoxW, 34, 11);
    g.lineStyle(1, COLORS.gold, 0.3);
    g.strokeRoundedRect(w / 2 - timerBoxW / 2, 7, timerBoxW, 34, 11);
    this.root.add(g);

    const leftCrest = this.scene.add
      .image(isMobile ? 20 : 28, 17, 'icon_shield')
      .setDisplaySize(14, 14)
      .setTint(COLORS.teamLeft)
      .setAlpha(0.9);
    const rightCrest = this.scene.add
      .image(w - (isMobile ? 20 : 28), 17, 'icon_shield')
      .setDisplaySize(14, 14)
      .setTint(COLORS.teamRight)
      .setAlpha(0.9);
    rightCrest.setFlipX(true);

    this.leftName = this.scene.add.text(isMobile ? 32 : 40, 8, '', {
      fontFamily: FONT_DISPLAY,
      fontSize: isMobile ? '11px' : '14px',
      color: '#e8f1ff',
    });
    this.rightName = this.scene.add.text(w - (isMobile ? 32 : 40), 8, '', {
      fontFamily: FONT_DISPLAY,
      fontSize: isMobile ? '11px' : '14px',
      color: '#f3d6d6',
    });
    this.rightName.setOrigin(1, 0);

    this.leftHpText = this.scene.add.text(16, 29, '', {
      fontFamily: FONT_MONO,
      fontSize: isMobile ? '10px' : '11px',
      color: '#9fb0c8',
    });
    this.rightHpText = this.scene.add.text(w - 16, 29, '', {
      fontFamily: FONT_MONO,
      fontSize: isMobile ? '10px' : '11px',
      color: '#9fb0c8',
    });
    this.rightHpText.setOrigin(1, 0);

    const barOffset = isMobile ? 16 : 20;
    const leftBg = this.scene.add.rectangle(
      barOffset,
      45,
      this.hpBarWidth + 4,
      12,
      COLORS.ink900,
    );
    leftBg.setOrigin(0, 0.5);
    leftBg.setStrokeStyle(1, COLORS.line);
    this.leftGhost = this.scene.add
      .rectangle(barOffset + 2, 45, this.hpBarWidth, 8, 0xffe7a3, 0.4)
      .setOrigin(0, 0.5);
    this.leftBar = this.scene.add
      .rectangle(barOffset + 2, 45, this.hpBarWidth, 8, COLORS.teamLeft)
      .setOrigin(0, 0.5);

    const rightBg = this.scene.add.rectangle(
      w - barOffset,
      45,
      this.hpBarWidth + 4,
      12,
      COLORS.ink900,
    );
    rightBg.setOrigin(1, 0.5);
    rightBg.setStrokeStyle(1, COLORS.line);
    this.rightGhost = this.scene.add
      .rectangle(w - barOffset - 2, 45, this.hpBarWidth, 8, 0xffe7a3, 0.4)
      .setOrigin(1, 0.5);
    this.rightBar = this.scene.add
      .rectangle(w - barOffset - 2, 45, this.hpBarWidth, 8, COLORS.teamRight)
      .setOrigin(1, 0.5);

    this.timerText = this.scene.add.text(w / 2, 24, '3:00', {
      fontFamily: FONT_DISPLAY,
      fontSize: isMobile ? '18px' : '23px',
      color: '#e8c88a',
      fontStyle: 'bold',
      stroke: '#05070b',
      strokeThickness: 4,
    });
    this.timerText.setOrigin(0.5);

    this.root.add([
      leftCrest,
      rightCrest,
      this.leftName,
      this.rightName,
      this.leftHpText,
      this.rightHpText,
      leftBg,
      this.leftGhost,
      this.leftBar,
      rightBg,
      this.rightGhost,
      this.rightBar,
      this.timerText,
    ]);
  }

  private buildEnergy() {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const isMobile = w < 640;
    const boxX = isMobile ? Math.floor(w / 2 - 76) : 24;
    const boxY = isMobile ? h - 162 : h - 150;
    const box = this.scene.add.container(boxX, boxY);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x070a10, 0.72);
    bg.fillRoundedRect(-10, -20, 172, 54, 12);
    bg.lineStyle(1, COLORS.line, 0.8);
    bg.strokeRoundedRect(-10, -20, 172, 54, 12);
    bg.fillStyle(COLORS.gold, 0.5);
    bg.fillRoundedRect(-10, -20, 3, 54, 2);
    box.add(bg);

    const caption = this.scene.add.text(0, -13, 'ENERGY', {
      fontFamily: FONT_UI,
      fontSize: '9px',
      color: '#7d8ba1',
    });
    caption.setLetterSpacing(1.5);
    box.add(caption);

    this.energyLabel = this.scene.add.text(0, -1, '0 / 10', {
      fontFamily: FONT_MONO,
      fontSize: '16px',
      color: '#e2c27d',
      fontStyle: 'bold',
    });
    box.add(this.energyLabel);

    const segW = 13;
    const gap = 2;
    for (let i = 0; i < 10; i += 1) {
      const x = i * (segW + gap);
      const segBg = this.scene.add.rectangle(x, 20, segW, 12, COLORS.ink800);
      segBg.setStrokeStyle(1, COLORS.goldSoft, 0.45);
      segBg.setOrigin(0, 0.5);
      const fill = this.scene.add.rectangle(
        x + 1,
        20,
        segW - 2,
        8,
        COLORS.gold,
        0,
      );
      fill.setOrigin(0, 0.5);
      this.energySegs.push(fill);
      box.add([segBg, fill]);
    }
    this.energyLead = this.scene.add.rectangle(0, 20, 2, 14, 0xfff1c2, 0);
    this.energyLead.setOrigin(0.5);
    box.add(this.energyLead);
    this.root.add(box);

    if (isMobile) box.setScale(0.82);
    else if (w < 768) box.setScale(0.9);
  }

  private buildHand() {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const isMobile = w < 640;
    this.handRoot = this.scene.add.container(w / 2, isMobile ? h - 74 : h - 84);
    this.root.add(this.handRoot);
  }

  private buildHint() {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const isMobile = w < 640;
    this.hintText = this.scene.add.text(w / 2, isMobile ? h - 186 : h - 180, '', {
      fontFamily: FONT_UI,
      fontSize: isMobile ? '10px' : '12px',
      color: '#8fa0b8',
      stroke: '#05070b',
      strokeThickness: 3,
    });
    this.hintText.setOrigin(0.5);
    this.root.add(this.hintText);
  }

  private syncEnergy(energyH: number, maxH: number, reduceMotion: boolean) {
    const value = energyH / 100;
    const max = Math.max(1, maxH / 100);
    this.energyLabel.setText(
      `${value.toFixed(1).replace(/\.0$/, '')} / ${max.toFixed(0)}`,
    );

    const whole = Math.floor(value);
    const frac = value - whole;
    for (let i = 0; i < 10; i += 1) {
      const seg = this.energySegs[i];
      if (i < whole) {
        seg.setAlpha(1);
        seg.width = 11;
      } else if (i === whole) {
        seg.setAlpha(0.95);
        seg.width = Math.max(1, 11 * frac);
      } else {
        seg.setAlpha(0);
        seg.width = 11;
      }
    }
    const leadX = Math.min(9, whole) * 15 + (whole < 10 ? frac * 15 : 0);
    this.energyLead.x = leadX;
    const full = value >= max;
    this.energyLead.setAlpha(full ? 1 : whole < 10 ? 0.9 : 0);

    const spent = this.lastEnergy >= 0 && energyH < this.lastEnergy - 40;
    if (spent && !reduceMotion) {
      this.scene.tweens.add({
        targets: [this.energyLead, this.energyLabel],
        alpha: 0.25,
        duration: 70,
        yoyo: true,
      });
    }

    if (full && !reduceMotion) {
      this.energyLabel.setColor('#ffe7a3');
      this.energyLead.setAlpha(0.6 + Math.sin(this.scene.time.now / 180) * 0.4);
    } else {
      this.energyLabel.setColor('#e2c27d');
    }

    if (full && this.lastEnergy < maxH && !reduceMotion) {
      this.scene.tweens.add({
        targets: this.energyLabel,
        scale: 1.18,
        duration: 160,
        yoyo: true,
      });
    }
    this.lastEnergy = energyH;
  }

  private syncHand(
    cards: MatchCardView[],
    energyH: number,
    selectedId: string | null,
    catalog: Record<string, CardDefinition>,
    reduceMotion: boolean,
  ) {
    if (this.cards.length !== cards.length) {
      this.handRoot.removeAll(true);
      this.cards = cards.map((c, i) => this.makeCard(c, i, cards.length));
      this.pendingDeal = true;
    }

    const now = this.scene.time.now;
    const shouldDeal = this.pendingDeal;
    if (shouldDeal) {
      this.pendingDeal = false;
      this.dealUntil = now + 300 + cards.length * 80 + 320;
    }
    const dealingNow = now < this.dealUntil;

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const isMobile = width < 640;
    const handShift = isMobile ? 0 : width < 900 ? 34 : 0;
    const handY = isMobile ? height - 74 : height - 84;
    this.handRoot.setPosition(width / 2 + handShift, handY);
    this.handRoot.setScale(
      Phaser.Math.Clamp((width - 32) / 380, 0.65, 1),
    );
    this.hintText.setX(width / 2 + (isMobile ? 0 : handShift * 0.4));

    const n = cards.length;
    cards.forEach((card, i) => {
      const widget = this.cards[i];
      const affordable = energyH >= card.cost * 100;
      const selected = selectedId === card.cardId;
      const accent = CARD_ACCENT[card.cardId] ?? COLORS.gold;
      const def = catalog[card.cardId];

      widget.cardId = card.cardId;
      widget.index = i;
      widget.total = n;
      widget.selected = selected;
      widget.affordable = affordable;

      widget.nameText.setText(card.name.toUpperCase());
      widget.nameText.setColor(
        selected || widget.hovered ? '#fff7e0' : '#e6edf8',
      );
      widget.hpText.setText(def ? String(def.baseHp) : '—');
      widget.atkText.setText(def ? String(def.baseDamage) : '—');

      const artKey = `${card.cardId}_card`;
      if (this.scene.textures.exists(artKey)) {
        widget.art.setTexture(artKey);
      }

      widget.costText.setText(String(card.cost));
      widget.costText.setColor(affordable ? '#ffe7a3' : '#6b7a90');
      this.drawCostBadge(widget, affordable);
      this.drawRing(widget, energyH, card.cost, affordable, accent);

      widget.halo.clear();
      widget.frame.clear();
      widget.frame.fillGradientStyle(0x1b2433, 0x1b2433, 0x080b12, 0x080b12, 1);
      widget.frame.fillRoundedRect(-48, -73, CARD_W, CARD_H, 13);
      widget.frame.lineStyle(
        2,
        selected || widget.hovered ? accent : 0x33405a,
        selected ? 1 : widget.hovered ? 0.9 : 0.75,
      );
      widget.frame.strokeRoundedRect(-48, -73, CARD_W, CARD_H, 13);
      widget.frame.lineStyle(1, 0xffffff, selected ? 0.1 : 0.04);
      widget.frame.strokeRoundedRect(-45, -70, CARD_W - 6, CARD_H - 6, 11);
      widget.frame.fillStyle(accent, selected ? 0.9 : 0.5);
      widget.frame.fillRoundedRect(-28, -72, 56, 2, 1);
      widget.frame.fillStyle(accent, selected ? 0.22 : 0.1);
      widget.frame.fillRoundedRect(-40, 61, 80, 5, 2.5);
      if (selected || widget.hovered) {
        widget.halo.fillStyle(accent, selected ? 0.12 : 0.07);
        widget.halo.fillRoundedRect(-54, -79, CARD_W + 12, CARD_H + 12, 17);
        widget.halo.lineStyle(1.5, accent, selected ? 0.4 : 0.22);
        widget.halo.strokeRoundedRect(-54, -79, CARD_W + 12, CARD_H + 12, 17);
      }

      const mode: CardMode = shouldDeal
        ? 'deal'
        : dealingNow
          ? 'peek'
          : 'tween';
      this.positionCard(widget, mode, reduceMotion);
    });
  }

  private drawCostBadge(widget: CardWidget, affordable: boolean) {
    const points: Phaser.Math.Vector2[] = [];
    const cx = -31;
    const cy = -53;
    const radius = 13;
    for (let i = 0; i < 6; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 3;
      points.push(
        new Phaser.Math.Vector2(
          cx + Math.cos(angle) * radius,
          cy + Math.sin(angle) * radius,
        ),
      );
    }
    widget.costBg.clear();
    widget.costBg.fillStyle(COLORS.ink950, 0.97);
    widget.costBg.fillPoints(points, true);
    widget.costBg.lineStyle(
      1.6,
      affordable ? COLORS.gold : 0x4b576b,
      0.95,
    );
    widget.costBg.strokePoints(points, true);
    widget.costBg.lineStyle(1, 0xffffff, 0.08);
    widget.costBg.strokePoints(
      points.map(
        (p) =>
          new Phaser.Math.Vector2(
            cx + (p.x - cx) * 0.74,
            cy + (p.y - cy) * 0.74,
          ),
      ),
      true,
    );
  }

  private drawRing(
    widget: CardWidget,
    energyH: number,
    cost: number,
    affordable: boolean,
    accent: number,
  ) {
    const cx = -31;
    const cy = -53;
    const radius = 18;
    const progress = Phaser.Math.Clamp(energyH / Math.max(1, cost * 100), 0, 1);
    widget.ring.clear();
    widget.ring.lineStyle(2.5, 0xffffff, 0.07);
    widget.ring.beginPath();
    widget.ring.arc(cx, cy, radius, 0, Math.PI * 2);
    widget.ring.strokePath();
    if (progress > 0.01) {
      widget.ring.lineStyle(
        2.5,
        affordable ? COLORS.highlight : accent,
        0.9,
      );
      widget.ring.beginPath();
      widget.ring.arc(
        cx,
        cy,
        radius,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * progress,
      );
      widget.ring.strokePath();
    }
  }

  private positionCard(
    widget: CardWidget,
    mode: CardMode,
    reduceMotion: boolean,
  ) {
    const n = Math.max(1, widget.total);
    const width = this.scene.scale.width;
    const spread = Phaser.Math.Clamp(
      (width - (width < 640 ? 40 : 80)) / n,
      52,
      94,
    );
    const fan = (widget.index - (n - 1) / 2) * spread;
    const targetY = widget.selected ? -18 : widget.hovered ? -10 : 0;
    const targetScale = widget.selected ? 1.1 : widget.hovered ? 1.07 : 1;
    const targetAlpha = widget.affordable ? 1 : 0.92;
    const angle = (widget.index - (n - 1) / 2) * 1.8;

    if (mode === 'peek') {
      widget.root.x = fan;
      return;
    }

    if (mode === 'deal') {
      widget.root.setPosition(fan, targetY + 180);
      widget.root.setScale(0.68);
      widget.root.setAlpha(0);
      widget.root.setAngle(0);
      this.scene.tweens.add({
        targets: widget.root,
        x: fan,
        y: targetY,
        scale: targetScale,
        alpha: targetAlpha,
        angle,
        delay: 120 + widget.index * 80,
        duration: 360,
        ease: 'Back.easeOut',
      });
      widget.lastKey = `${fan}|${targetY}|${targetScale}|${targetAlpha}|${angle}`;
      return;
    }

    const key = `${fan}|${targetY}|${targetScale}|${targetAlpha}|${angle}`;
    if (reduceMotion) {
      widget.root.setPosition(fan, targetY);
      widget.root.setScale(targetScale);
      widget.root.setAlpha(targetAlpha);
      widget.root.setAngle(angle);
      widget.lastKey = key;
      return;
    }
    if (widget.lastKey === key) return;
    widget.lastKey = key;
    this.scene.tweens.add({
      targets: widget.root,
      x: fan,
      y: targetY,
      scale: targetScale,
      alpha: targetAlpha,
      angle,
      duration: 140,
      ease: 'Quad.easeOut',
    });
  }

  private makeCard(
    card: MatchCardView,
    index: number,
    total: number,
  ): CardWidget {
    const root = this.scene.add.container(0, 0);
    const halo = this.scene.add.graphics();
    const frame = this.scene.add.graphics();

    const artFrame = this.scene.add.graphics();
    artFrame.fillStyle(0x04060a, 1);
    artFrame.fillRoundedRect(-42, -62, 84, 84, 9);
    artFrame.lineStyle(1, 0xffffff, 0.05);
    artFrame.strokeRoundedRect(-42, -62, 84, 84, 9);
    artFrame.lineStyle(1, 0x000000, 0.55);
    artFrame.strokeRoundedRect(-40, -60, 80, 80, 8);

    const art = this.scene.add.image(0, -20, `${card.cardId}_card`);
    art.setDisplaySize(76, 76);

    const ring = this.scene.add.graphics();

    const nameBanner = this.scene.add.graphics();
    nameBanner.fillStyle(0x070a10, 0.8);
    nameBanner.fillRoundedRect(-42, 20, 84, 19, 5);
    nameBanner.lineStyle(1, 0xffffff, 0.05);
    nameBanner.strokeRoundedRect(-42, 20, 84, 19, 5);

    const nameText = this.scene.add.text(0, 29.5, card.name.toUpperCase(), {
      fontFamily: FONT_DISPLAY,
      fontSize: '10px',
      color: '#e6edf8',
      fontStyle: 'bold',
    });
    nameText.setOrigin(0.5);

    const shield = this.scene.add
      .image(-32, 50, 'icon_shield')
      .setDisplaySize(11, 11)
      .setTint(0x9fc3ff);
    const hpText = this.scene.add.text(-23, 50, '', {
      fontFamily: FONT_MONO,
      fontSize: '10px',
      color: '#dbeafe',
      fontStyle: 'bold',
    });
    hpText.setOrigin(0, 0.5);

    const sword = this.scene.add
      .image(4, 50, 'icon_sword')
      .setDisplaySize(11, 11)
      .setTint(0xf0c674);
    const atkText = this.scene.add.text(13, 50, '', {
      fontFamily: FONT_MONO,
      fontSize: '10px',
      color: '#fde6b0',
      fontStyle: 'bold',
    });
    atkText.setOrigin(0, 0.5);

    const costBg = this.scene.add.graphics();
    const costText = this.scene.add.text(-31, -53, String(card.cost), {
      fontFamily: FONT_MONO,
      fontSize: '14px',
      color: '#ffe7a3',
      fontStyle: 'bold',
    });
    costText.setOrigin(0.5);

    const hitArea = this.scene.add.rectangle(
      0,
      0,
      CARD_W,
      CARD_H,
      0xffffff,
      0.001,
    );
    hitArea.setInteractive({ useHandCursor: true });

    root.add([
      halo,
      frame,
      artFrame,
      art,
      ring,
      nameBanner,
      nameText,
      shield,
      hpText,
      sword,
      atkText,
      costBg,
      costText,
      hitArea,
    ]);
    root.x = 0;
    this.handRoot.add(root);

    const widget: CardWidget = {
      root,
      cardId: card.cardId,
      halo,
      frame,
      ring,
      costBg,
      costText,
      art,
      nameText,
      hpText,
      atkText,
      hitArea,
      hovered: false,
      selected: false,
      affordable: true,
      index,
      total,
      lastKey: '',
    };

    hitArea.on('pointerover', () => {
      widget.hovered = true;
      this.hoveredCardId = card.cardId;
      this.positionCard(widget, 'tween', this.lastReduceMotion);
    });
    hitArea.on('pointerout', () => {
      widget.hovered = false;
      if (this.hoveredCardId === card.cardId) this.hoveredCardId = null;
      this.positionCard(widget, 'tween', this.lastReduceMotion);
    });
    hitArea.on('pointerdown', () => {
      const store = useGameStore.getState();
      const side = store.side;
      const view = store.view;
      if (!view || !side) return;
      const live = view.players[side].cards.find((c) => c.cardId === card.cardId);
      if (!live) return;
      sfx.select();
      this.scene.tweens.add({
        targets: root,
        scale: 1.04,
        duration: 60,
        yoyo: true,
      });
      store.selectCard(card.cardId);
    });

    return widget;
  }
}

type CardMode = 'deal' | 'peek' | 'tween';

function formatEnergy(hundredths: number): string {
  return (hundredths / 100).toFixed(1).replace(/\.0$/, '');
}

function label(p: {
  displayName: string;
  tag: string;
  playerId: string;
}): string {
  if (p.displayName && p.tag) return `${p.displayName}#${p.tag}`;
  if (p.displayName) return p.displayName;
  return p.playerId.slice(0, 6);
}
