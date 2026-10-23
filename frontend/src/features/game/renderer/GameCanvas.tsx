import { useEffect, useRef } from 'react';
import { createPhaserGame } from '@/phaser/game';
import { useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

/**
 * Hosts the Phaser match canvas. All in-match UI (arena, cards, HUD) lives
 * inside Phaser; React only mounts the canvas and overlays (result / errors).
 */
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const game = createPhaserGame(host);

    const pushState = () => {
      const {
        view,
        side,
        selectedCardId,
        cardRanges,
        cardCatalog,
      } = useGameStore.getState();
      const battle = game.scene.getScene('BattleScene') as
        | { setState?: (s: unknown) => void }
        | undefined;
      if (battle && typeof battle.setState === 'function') {
        battle.setState({
          view,
          localSide: side,
          selectedCardId,
          cardRanges,
          cardCatalog,
          reduceMotion: useUiStore.getState().reduceMotion,
        });
      }
    };

    game.events.once('ready', pushState);
    // BattleScene may start after BootScene finishes loading sheets.
    const bootCheck = window.setInterval(() => {
      const battle = game.scene.getScene('BattleScene');
      if (battle && battle.sys.isActive()) {
        pushState();
        window.clearInterval(bootCheck);
      }
    }, 50);

    const unsub = useGameStore.subscribe(pushState);
    const unsubUi = useUiStore.subscribe(pushState);

    const onResize = () => {
      game.scale.resize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.clearInterval(bootCheck);
      unsub();
      unsubUi();
      window.removeEventListener('resize', onResize);
      game.destroy(true);
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0 h-full w-full" />;
}
