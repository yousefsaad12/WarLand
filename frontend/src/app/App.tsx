import { useEffect } from 'react';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { LobbyScreen } from '@/features/lobby/LobbyScreen';
import { GameScreen } from '@/features/game/GameScreen';
import { Toasts } from '@/components/Toasts';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';
import { useMatchmakingStore } from '@/store/matchmakingStore';
import { useGameStore } from '@/store/gameStore';

export function App() {
  const status = useSessionStore((s) => s.status);
  const restore = useSessionStore((s) => s.restore);

  const screen = useUiStore((s) => s.screen);
  const setScreen = useUiStore((s) => s.setScreen);

  const disconnectMatchmaking = useMatchmakingStore((s) => s.disconnect);
  const leaveMatch = useGameStore((s) => s.leaveMatch);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (status === 'anonymous') {
      leaveMatch();
      disconnectMatchmaking();
      setScreen('auth');
    } else if (status === 'authenticated' && screen === 'auth') {
      setScreen('lobby');
    }
  }, [status, screen, setScreen, leaveMatch, disconnectMatchmaking]);

  if (status === 'booting') {
    return (
      <div className="warland-bg flex h-full items-center justify-center">
        <div className="text-center">
          <p className="font-display text-3xl tracking-[0.2em] gold-text">
            WARLAND
          </p>
          <div className="mx-auto mt-4 h-8 w-8 animate-spin rounded-full border-2 border-gold/40 border-t-gold" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      {screen === 'auth' && <AuthScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'game' && <GameScreen />}
      <Toasts />
    </div>
  );
}
