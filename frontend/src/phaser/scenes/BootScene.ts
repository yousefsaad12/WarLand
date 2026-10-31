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
    const tiny = '/assets/tiny-swords';
    const generated = `${tiny}/generated`;

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
    this.load.image('tiny_ground', `${generated}/ground.png`);
    this.load.image('tiny_water', `${generated}/water.png`);

    // Particles
    this.load.image('fx_spark', `${particles}/spark_01.png`);
    this.load.image('fx_spark2', `${particles}/spark_05.png`);
    this.load.image('fx_slash', `${particles}/slash_01.png`);
    this.load.image('fx_circle', `${particles}/circle_02.png`);
    this.load.image('fx_star', `${particles}/star_01.png`);
    this.load.image('fx_light', `${particles}/light_01.png`);
    this.load.image('fx_muzzle', `${particles}/muzzle_01.png`);
    this.load.image('fx_tiny_dust', `${generated}/dust.png`);
    this.load.image('fx_tiny_explosion', `${generated}/explosion.png`);
    this.load.image('fx_tiny_fire', `${generated}/fire.png`);

    // Icons
    this.load.image('icon_sword', `${icons}/sword.png`);
    this.load.image('icon_shield', `${icons}/shield.png`);
    this.load.image('icon_bow', `${icons}/bow.png`);

    // Card art
    this.load.image('knight_card', `${generated}/knight-card.png`);
    this.load.image('archer_card', `${generated}/archer-card.png`);
    this.load.image('guard_card', `${generated}/guard-card.png`);
    this.load.image('scout_card', `${generated}/scout-card.png`);
    this.load.image('tiny_tower_blue', `${tiny}/Buildings/Blue Buildings/Tower.png`);
    this.load.image('tiny_tower_red', `${tiny}/Buildings/Red Buildings/Tower.png`);
    this.load.image('tiny_castle_blue', `${tiny}/Buildings/Blue Buildings/Castle.png`);
    this.load.image('tiny_castle_red', `${tiny}/Buildings/Red Buildings/Castle.png`);
    this.load.json(
      'units_manifest',
      '/assets/units/tiny-swords-manifest.json',
    );
  }

  create() {
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
      this.computeUnitAnchors(manifest);
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
      for (const side of ['left', 'right'] as const) {
        const prefix = side === 'right' ? 'Red Units' : 'Blue Units';
        const walkFile = def.walk.file.replace('Blue Units', prefix);
        const attackFile = def.attack.file.replace('Blue Units', prefix);
        this.load.spritesheet(`${side}_${id}_walk`, walkFile, {
          frameWidth: def.walk.width,
          frameHeight: def.walk.height,
        });
        this.load.spritesheet(`${side}_${id}_attack`, attackFile, {
          frameWidth: def.attack.width,
          frameHeight: def.attack.height,
        });
      }
    }
  }

  private createUnitAnims(manifest: UnitsManifest) {
    for (const [id, def] of Object.entries(manifest.units)) {
      for (const side of ['left', 'right'] as const) {
        const walkKey = `${side}_${id}_walk`;
        const attackKey = `${side}_${id}_attack`;
        if (!this.anims.exists(walkKey)) {
          this.anims.create({
            key: walkKey,
            frames: this.anims.generateFrameNumbers(walkKey, {
              start: 0,
              end: def.walk.frames - 1,
            }),
            frameRate: def.walk.fps,
            repeat: -1,
          });
        }
        if (!this.anims.exists(attackKey)) {
          this.anims.create({
            key: attackKey,
            frames: this.anims.generateFrameNumbers(attackKey, {
              start: 0,
              end: def.attack.frames - 1,
            }),
            frameRate: def.attack.fps,
            repeat: 0,
          });
        }
      }
    }

    this.registry.set('unitsManifest', manifest);
  }

  /**
   * Unit sheets are square frames with a lot of transparent padding below the
   * characters' feet. Anchoring them with origin y = 1 makes them render well
   * above the tapped deploy point. Measure the lowest opaque row of each
   * animation and store the real feet ratio so sprites can stand on the ground.
   */
  private computeUnitAnchors(manifest: UnitsManifest) {
    const anchors: Record<string, number> = {};
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      this.registry.set('unitAnchors', anchors);
      return;
    }

    for (const [id, def] of Object.entries(manifest.units)) {
      for (const side of ['left', 'right'] as const) {
        for (const kind of ['walk', 'attack'] as const) {
          const anim = def[kind];
          const key = `${side}_${id}_${kind}`;
          const texture = this.textures.get(key);
          if (!texture || texture.key === '__MISSING') continue;

          const source = texture.getSourceImage() as
            | HTMLImageElement
            | HTMLCanvasElement;
          canvas.width = source.width;
          canvas.height = source.height;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(source as CanvasImageSource, 0, 0);
          const pixels = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;

          let maxBottom = -1;
          for (let f = 0; f < anim.frames; f += 1) {
            const x0 = f * anim.width;
            for (let y = anim.height - 1; y > maxBottom; y -= 1) {
              let found = false;
              for (let x = 0; x < anim.width; x += 1) {
                if (pixels[(y * canvas.width + (x0 + x)) * 4 + 3] > 8) {
                  found = true;
                  break;
                }
              }
              if (found) {
                maxBottom = y;
                break;
              }
            }
          }

          anchors[key] = maxBottom >= 0 ? (maxBottom + 1) / anim.height : 1;
        }
      }
    }

    this.registry.set('unitAnchors', anchors);
  }
}
