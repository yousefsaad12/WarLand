import { useEffect, useMemo } from 'react';
import { GameCanvas } from '@/features/game/renderer/GameCanvas';
import { BaseBars } from '@/features/game/components/BaseBars';
import { MatchTimer } from '@/features/game/components/MatchTimer';
import { EnergyBar } from '@/features/game/components/EnergyBar';
import { CardHand } from '@/features/game/components/CardHand';
import { useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';
import { ResultOverlay } from './ResultOverlay';

export function GameScreen() {
  const view = useGameStore((s) => s.view);
  const side = useGameStore((s) => s.side);
  const connection = useGameStore((s) => s.connection);
  const selectedCardId = useGameStore((s) => s.selectedCardId);
  const pending = useGameStore((s) => s.pending);
  const result = useGameStore((s) => s.result);
  const rewards = useGameStore((s) => s.rewards);
  const error = useGameStore((s) => s.error);
  const opponentName = useGameStore((s) => s.opponentName);
  const opponentTag = useGameStore((s) => s.opponentTag);
  const lastFeedback = useGameStore((s) => s.lastFeedback);
  const selectCard = useGameStore((s) => s.selectCard);
  const deployAt = useGameStore((s) => s.deployAt);
  const leaveMatch = useGameStore((s) => s.leaveMatch);
  const clearFeedback = useGameStore((s) => s.clearFeedback);

  const pushToast = useUiStore((s) => s.pushToast);
  const setScreen = useUiStore((s) => s.setScreen);

  useEffect(() => {
    if (lastFeedback && !lastFeedback.ok) {
      pushToast('error', lastFeedback.message);
      clearFeedback();
    }
  }, [lastFeedback, pushToast, clearFeedback]);

  useEffect(() => {
    if (error) pushToast('error', error);
  }, [error, pushToast]);

  const handleDeploy = (x: number, y: number) => {
    const feedback = deployAt(x, y);
    if (!feedback.ok) pushToast('error', feedback.message);
  };

  const returnToLobby = () => {
    leaveMatch();
    setScreen('lobby');
  };

  const selectedCard = useMemo(() => {
    if (!view || !side || !selectedCardId) return null;
    return (
      view.players[side].cards.find((c) => c.cardId === selectedCardId) ?? null
    );
  }, [view, side, selectedCardId]);

  const waitingForStart = !view;
  const connectionLost =
    connection === 'disconnected' || connection === 'reconnecting';

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950">
      <div className="absolute inset-0">
        <GameCanvas onDeploy={handleDeploy} />
      </div>

      {view && (
        <header className="pointer-events-none absolute inset-x-0 top-0 z-20">
          <div className="pointer-events-auto border-b border-line/60 bg-gradient-to-b from-ink-950/95 to-ink-950/70 backdrop-blur-sm">
            <BaseBars
              view={view}
              side={side}
              opponentName={opponentName}
              opponentTag={opponentTag}
            />
          </div>
          <div className="absolute left-1/2 top-2 -translate-x-1/2">
            <MatchTimer
              tick={view.tick}
              maxTicks={view.maxTicks}
              ticksPerSecond={view.ticksPerSecond}
              status={view.status}
            />
          </div>
        </header>
      )}

      {view && (
        <footer className="absolute inset-x-0 bottom-0 z-20">
          <div className="border-t border-line/60 bg-gradient-to-t from-ink-950/98 to-ink-950/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm">
            <div className="mx-auto flex max-w-4xl flex-col items-center gap-3">
              <div className="flex w-full items-center justify-between gap-3">
                <EnergyBar
                  energyHundredths={view.players[side ?? 'LEFT'].energyHundredths}
                  maxEnergyHundredths={view.maxEnergyHundredths}
                />
                <div className="text-right text-xs text-slate-400">
                  {selectedCard ? (
                    <span>
                      Deploy <span className="gold-text">{selectedCard.name}</span>{' '}
                      — tap your zone
                    </span>
                  ) : (
                    <span>Select a card to deploy</span>
                  )}
                  {pending.length > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] text-amber-200">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
                      {pending.length} deploying
                    </span>
                  )}
                </div>
              </div>
              <CardHand
                cards={view.players[side ?? 'LEFT'].cards}
                energyHundredths={
                  view.players[side ?? 'LEFT'].energyHundredths
                }
                selectedCardId={selectedCardId}
                onSelect={selectCard}
              />
            </div>
          </div>
        </footer>
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
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink-950/85 backdrop-blur-sm">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-gold/40 border-t-gold" />
            <h3 className="font-display text-xl tracking-widest text-slate-100">
              Entering the arena…
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {connection === 'connecting'
                ? 'Syncing match state with the server.'
                : 'Waiting for the authoritative game state.'}
            </p>
            <button
              onClick={returnToLobby}
              className="mt-6 text-xs text-slate-500 underline hover:text-slate-300"
            >
              Back to lobby
            </button>
          </div>
        </div>
      )}

      {!result && !waitingForStart && connectionLost && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink-950/80 backdrop-blur-sm">
          <div className="panel w-full max-w-sm rounded-2xl border border-amber-800/60 p-7 text-center">
            <h3 className="text-lg font-semibold text-amber-200">
              {connection === 'reconnecting'
                ? 'Reconnecting…'
                : 'Connection lost'}
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              {connection === 'reconnecting'
                ? 'Attempting to restore your match. If this fails, return to the lobby.'
                : 'The match connection dropped. The server keeps the authoritative result.'}
            </p>
            <button
              onClick={returnToLobby}
              className="mt-5 w-full rounded-lg border border-line bg-ink-700 py-2.5 text-sm font-semibold text-slate-100 hover:bg-ink-800"
            >
              Return to lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
