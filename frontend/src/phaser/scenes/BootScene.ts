import Phaser from 'phaser';

interface UnitAnimDef {
  file: string;
  frames: number;
  width: number;
  height: number;
  fps: number;
  anchorY: number;
  bodyHeight: number;
}

interface UnitsManifest {
  units: Record<
    string,
    {
      walk: UnitAnimDef;
      attack: UnitAnimDef;
    }
  >;
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const rts = '/assets/kenney/medieval-rts';
    const tdt = '/assets/kenney/tower-defense-top-down';
    const particles = '/assets/kenney/particle-pack';
    const icons = '/assets/kenney/board-game-icons';

    // Terrain - more grounded palette
    this.load.image('grass1', `${rts}/grass-01.png`);
    this.load.image('grass2', `${rts}/grass-02.png`);
    this.load.image('grass3', `${rts}/grass-03.png`);
    this.load.image('grass4', `${rts}/grass-04.png`);
    this.load.image('dirt1', `${rts}/dirt-01.png`);
    this.load.image('dirt2', `${rts}/dirt-02.png`);
    this.load.image('stone1', `${rts}/stone-01.png`);
    this.load.image('stone2', `${rts}/stone-02.png`);
    this.load.image('water1', `${rts}/water-01.png`);
    this.load.image('water2', `${rts}/water-02.png`);
    this.load.image('tree1', `${rts}/tree-01.png`);
    this.load.image('tree2', `${rts}/tree-02.png`);
    this.load.image('tree3', `${rts}/tree-03.png`);
    this.load.image('tree4', `${rts}/tree-04.png`);
    this.load.image('rock1', `${rts}/rock-01.png`);
    this.load.image('rock2', `${rts}/rock-02.png`);
    this.load.image('rock3', `${rts}/rock-03.png`);
    this.load.image('keep', `${rts}/keep.png`);
    this.load.image('tower_round', `${rts}/tower-round.png`);
    this.load.image('tower_square', `${rts}/tower-square.png`);
    this.load.image('td_grass', `${tdt}/terrain-grass.png`);
    this.load.image('td_stone', `${tdt}/terrain-stone.png`);
    this.load.image('td_river', `${tdt}/river-water.png`);

    // Particles
    this.load.image('fx_spark', `${particles}/spark_01.png`);
    this.load.image('fx_spark2', `${particles}/spark_05.png`);
    this.load.image('fx_slash', `${particles}/slash_01.png`);
    this.load.image('fx_circle', `${particles}/circle_02.png`);
    this.load.image('fx_star', `${particles}/star_01.png`);
    this.load.image('fx_light', `${particles}/light_01.png`);
    this.load.image('fx_muzzle', `${particles}/muzzle_01.png`);

    // Icons
    this.load.image('icon_sword', `${icons}/sword.png`);
    this.load.image('icon_shield', `${icons}/shield.png`);
    this.load.image('icon_bow', `${icons}/bow.png`);

    // Card art - try new cards folder first, fallback to units-neo
    this.load.image('knight_card', '/assets/cards/knight_card.png');
    this.load.image('archer_card', '/assets/cards/archer_card.png');
    this.load.image('guard_card', '/assets/cards/guard_card.png');
    this.load.image('scout_card', '/assets/cards/scout_card.png');
    this.load.image('knight_card_fallback', '/assets/units-neo/knight_card.png');
    this.load.image('archer_card_fallback', '/assets/units-neo/archer_card.png');
    this.load.image('guard_card_fallback', '/assets/units-neo/guard_card.png');
    this.load.image('scout_card_fallback', '/assets/units-neo/scout_card.png');

    this.load.json('units_manifest', '/assets/units/manifest.json');
  }

  create() {
    // Use fallbacks if new cards missing
    const cards = ['knight', 'archer', 'guard', 'scout'] as const;
    for (const c of cards) {
      if (!this.textures.exists(`${c}_card`) || this.textures.get(`${c}_card`).key === '__MISSING') {
        if (this.textures.exists(`${c}_card_fallback`)) {
          this.textures.renameTexture(`${c}_card_fallback`, `${c}_card`);
        }
      }
    }

    const manifest = this.cache.json.get('units_manifest') as UnitsManifest | undefined;
    if (!manifest?.units) {
      console.error('Unit manifest missing; starting battle without sheets.');
      this.scene.start('BattleScene');
      return;
    }

    this.loadUnitSheets(manifest);

    let started = false;
    const startBattle = () => {
      if (started) return;
      started = true;
      this.createUnitAnims(manifest);
      this.scene.start('BattleScene');
    };

    this.load.once(Phaser.Loader.Events.COMPLETE, startBattle);
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: { key?: string }) => {
      console.warn('Asset failed to load:', file?.key ?? file);
    });

    this.load.start();
    this.time.delayedCall(0, () => {
      if (!started && !this.load.isLoading()) startBattle();
    });
  }

  private loadUnitSheets(manifest: UnitsManifest) {
    for (const [id, def] of Object.entries(manifest.units)) {
      this.load.spritesheet(`${id}_walk`, def.walk.file, {
        frameWidth: def.walk.width,
        frameHeight: def.walk.height,
      });
      this.load.spritesheet(`${id}_attack`, def.attack.file, {
        frameWidth: def.attack.width,
        frameHeight: def.attack.height,
      });
    }
  }

  private createUnitAnims(manifest: UnitsManifest) {
    for (const [id, def] of Object.entries(manifest.units)) {
      if (!this.anims.exists(`${id}_walk`)) {
        this.anims.create({
          key: `${id}_walk`,
          frames: this.anims.generateFrameNumbers(`${id}_walk`, {
            start: 0,
            end: def.walk.frames - 1,
          }),
          frameRate: def.walk.fps,
          repeat: -1,
        });
      }
      if (!this.anims.exists(`${id}_attack`)) {
        this.anims.create({
          key: `${id}_attack`,
          frames: this.anims.generateFrameNumbers(`${id}_attack`, {
            start: 0,
            end: def.attack.frames - 1,
          }),
          frameRate: def.attack.fps,
          repeat: 0,
        });
      }
    }

    this.registry.set('unitsManifest', manifest);
  }
}
