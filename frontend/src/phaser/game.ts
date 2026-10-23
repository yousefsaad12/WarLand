import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { BattleScene } from './scenes/BattleScene';

export function createPhaserGame(parent: HTMLElement) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: parent.clientWidth,
    height: parent.clientHeight,
    parent,
    backgroundColor: 0x0b0e14,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      pixelArt: false,
    },
    scene: [BootScene, BattleScene],
  });

  return game;
}

export { BattleScene };
