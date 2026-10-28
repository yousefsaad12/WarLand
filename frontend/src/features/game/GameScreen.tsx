import { useEffect } from 'react';
import { GameCanvas } from '@/features/game/renderer/GameCanvas';
import { MotionToggle } from '@/features/game/components/MotionToggle';
import { AudioToggle } from '@/features/game/components/AudioToggle';
import { useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';
import { ResultOverlay } from './ResultOverlay';

export function GameScreen() {
  const view = useGameStore((s) => s.view);
  const connection = useGameStore((s) => s.connection);
  const result = useGameStore((s) => s.result);
  const rewards = useGameStore((s) => s.rewards);
  const error = useGameStore((s) => s.error);
  const side = useGameStore((s) => s.side);
  const lastFeedback = useGameStore((s) => s.lastFeedback);
  const leaveMatch = useGameStore((s) => s.leaveMatch);
  const clearFeedback = useGameStore((s) => s.clearFeedback);
  const clearError = useGameStore((s) => s.clearError);
  const loadCardRanges = useGameStore((s) => s.loadCardRanges);

  const pushToast = useUiStore((s) => s.pushToast);
  const setScreen = useUiStore((s) => s.setScreen);

  useEffect(() => {
    void loadCardRanges();
  }, [loadCardRanges]);

  useEffect(() => {
    if (lastFeedback && !lastFeedback.ok) {
      pushToast('error', lastFeedback.message);
      clearFeedback();
    }
  }, [lastFeedback, pushToast, clearFeedback]);

  useEffect(() => {
    if (error && view) {
      pushToast('error', error);
      clearError();
    }
  }, [error, view, pushToast, clearError]);

  const returnToLobby = () => {
    leaveMatch();
    setScreen('lobby');
  };

  const waitingForStart = !view;
  const joinFailed = waitingForStart && connection === 'disconnected';
  const connectionLost =
    !!view && (connection === 'disconnected' || connection === 'reconnecting');

  const waitingCopy = (() => {
    if (joinFailed && error) return error;
    if (connection === 'connecting') return 'Establishing connection';
    if (connection === 'connected') return 'Synchronizing battlefield state';
    if (connection === 'reconnecting') return 'Reconnecting to match';
    return 'Waiting for match state';
  })();

  return (
    <div className="relative min-h-[100dvh] h-full w-full overflow-hidden bg-[#050608]">
      <div className="absolute inset-0">
        {view ? <GameCanvas /> : null}
      </div>

      {view && (
        <div className="pointer-events-none absolute right-2 top-[max(0.5rem,env(safe-area-inset-top))] z-20 flex max-w-[calc(100%-1rem)] items-center gap-1 sm:right-4 sm:top-4">
          <div className="pointer-events-auto flex flex-wrap justify-end gap-1">
            <AudioToggle />
            <MotionToggle />
          </div>
        </div>
      )}

      {result && (
        <ResultOverlay
          result={result}
          side={side}
          rewards={rewards}
          onReturn={returnToLobby}
        />
      )}

      {!result && waitingForStart && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#050608]/90 backdrop-blur-md">
          <div className="mx-4 w-full max-w-md px-2 text-center">
            {!joinFailed && (
              <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border border-gold/40 border-t-gold" />
            )}
            <h3 className="text-lg font-semibold uppercase tracking-[0.2em] text-slate-100 sm:text-xl sm:tracking-[0.4em]">
              {joinFailed ? 'Connection Failed' : 'Deploying'}
            </h3>
            <p
              className={[
                'mt-3 text-sm',
                joinFailed ? 'text-amber-200/90' : 'text-slate-500',
              ].join(' ')}
            >
              {waitingCopy}
            </p>
            <button
              onClick={returnToLobby}
              className="mt-8 min-h-11 rounded-full border border-white/10 px-6 py-2 text-xs uppercase tracking-[0.25em] text-slate-300 transition-colors hover:text-slate-100 sm:tracking-[0.4em]"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}

      {!result && connectionLost && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#050608]/90 backdrop-blur-md">
          <div className="panel-frame mx-3 w-full max-w-sm rounded-3xl p-5 text-center sm:p-8">
            <h3 className="text-lg font-semibold text-amber-200">
              {connection === 'reconnecting' ? 'Reconnecting' : 'Connection Lost'}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {connection === 'reconnecting'
                ? 'Restoring your position on the battlefield.'
                : 'The connection to the match was interrupted.'}
            </p>
            <button
              onClick={returnToLobby}
              className="mt-6 w-full rounded-full border border-white/10 py-2.5 text-xs uppercase tracking-[0.4em] text-slate-300"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
