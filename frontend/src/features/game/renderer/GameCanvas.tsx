import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { Battlefield } from './battlefield';
import { useGameStore } from '@/store/gameStore';

interface GameCanvasProps {
  onDeploy: (x: number, y: number) => void;
}

export function GameCanvas({ onDeploy }: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const battlefieldRef = useRef<Battlefield | null>(null);
  const onDeployRef = useRef(onDeploy);
  onDeployRef.current = onDeploy;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;
    let battlefield: Battlefield | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let unsubscribe: (() => void) | null = null;

    const start = async () => {
      const initialWidth = Math.max(1, host.clientWidth);
      const initialHeight = Math.max(1, host.clientHeight);

      const nextApp = new Application();
      await nextApp.init({
        width: initialWidth,
        height: initialHeight,
        background: 0x0b0e14,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (disposed) {
        nextApp.destroy(true, { children: true });
        return;
      }
      app = nextApp;
      host.appendChild(nextApp.canvas);
      nextApp.canvas.style.display = 'block';
      nextApp.canvas.style.touchAction = 'none';

      const nextField = new Battlefield(
        nextApp,
        initialWidth,
        initialHeight,
        { onDeploy: (map) => onDeployRef.current(map.x, map.y) },
      );
      battlefield = nextField;
      battlefieldRef.current = nextField;

      const pushState = () => {
        const { view, side, selectedCardId } = useGameStore.getState();
        nextField.setState({ view, localSide: side, selectedCardId });
      };
      pushState();
      unsubscribe = useGameStore.subscribe(pushState);

      nextApp.ticker.add((ticker) => {
        nextField.update(ticker.deltaMS, performance.now());
      });

      resizeObserver = new ResizeObserver(() => {
        const w = Math.max(1, host.clientWidth);
        const h = Math.max(1, host.clientHeight);
        nextApp.renderer.resize(w, h);
        nextField.setSize(w, h);
      });
      resizeObserver.observe(host);
    };

    void start();

    return () => {
      disposed = true;
      unsubscribe?.();
      resizeObserver?.disconnect();
      battlefield?.destroy();
      battlefieldRef.current = null;
      if (app) {
        app.destroy(true, { children: true });
      }
    };
  }, []);

  const toLocal = (
    event: React.PointerEvent<HTMLDivElement>,
  ): { x: number; y: number } | null => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * target.clientWidth,
      y: ((event.clientY - rect.top) / rect.height) * target.clientHeight,
    };
  };

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 h-full w-full"
      onPointerMove={(event) => {
        const local = toLocal(event);
        if (local) battlefieldRef.current?.pointerMove(local.x, local.y);
      }}
      onPointerDown={(event) => {
        const local = toLocal(event);
        if (local) battlefieldRef.current?.pointerDown(local.x, local.y);
      }}
      onPointerLeave={() => battlefieldRef.current?.pointerLeave()}
    />
  );
}
