import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Panel } from '@/components/Panel';
import { CardArt } from '@/components/CardArt';
import { fetchProfile } from '@/network/authApi';
import { fetchLeaderboard } from '@/network/playerApi';
import type {
  LeaderboardEntry,
  OwnedCard,
  PlayerProfile,
} from '@/network/protocol';
import { useMatchmakingStore } from '@/store/matchmakingStore';
import { useSessionStore } from '@/store/sessionStore';
import { useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';

const CONNECTION_LABEL: Record<string, { text: string; tone: string }> = {
  idle: { text: 'Offline', tone: 'bg-slate-500' },
  connecting: { text: 'Connecting…', tone: 'bg-amber-400' },
  connected: { text: 'Connected', tone: 'bg-emerald-400' },
  reconnecting: { text: 'Reconnecting…', tone: 'bg-amber-400' },
  disconnected: { text: 'Disconnected', tone: 'bg-red-500' },
};

export function LobbyScreen() {
  const token = useSessionStore((s) => s.token);
  const player = useSessionStore((s) => s.player);
  const logout = useSessionStore((s) => s.logout);

  const connection = useMatchmakingStore((s) => s.connection);
  const queue = useMatchmakingStore((s) => s.queue);
  const match = useMatchmakingStore((s) => s.match);
  const error = useMatchmakingStore((s) => s.error);
  const connect = useMatchmakingStore((s) => s.connect);
  const joinQueue = useMatchmakingStore((s) => s.joinQueue);
  const leaveQueue = useMatchmakingStore((s) => s.leaveQueue);
  const clearMatch = useMatchmakingStore((s) => s.clearMatch);
  const clearError = useMatchmakingStore((s) => s.clearError);

  const joinMatch = useGameStore((s) => s.joinMatch);
  const setScreen = useUiStore((s) => s.setScreen);

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const searchStart = useRef<number | null>(null);

  useEffect(() => {
    if (token) connect(token);
  }, [token, connect]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void fetchProfile(token)
      .then((p) => active && setProfile(p))
      .catch(() => undefined);
    void fetchLeaderboard(8)
      .then((rows) => active && setLeaderboard(rows))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (queue !== 'searching') {
      searchStart.current = null;
      setElapsed(0);
      return;
    }
    searchStart.current = Date.now();
    const timer = window.setInterval(() => {
      if (searchStart.current) {
        setElapsed(Math.floor((Date.now() - searchStart.current) / 1000));
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [queue]);

  useEffect(() => {
    if (!match || !token) return;
    joinMatch(match, token);
    clearMatch();
    setScreen('game');
  }, [match, token, joinMatch, clearMatch, setScreen]);

  const identity = profile ?? player;
  const conn = CONNECTION_LABEL[connection] ?? CONNECTION_LABEL.idle!;
  const canQueue = connection === 'connected' && queue === 'idle';

  return (
    <div className="warland-bg flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[0.18em] gold-text">
            WARLAND
          </h1>
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
            Lane Battles
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-xs text-slate-400">
            <span className={`h-2 w-2 rounded-full ${conn.tone}`} />
            {conn.text}
          </span>
          <Button variant="ghost" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-5 p-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-5">
          <Panel className="p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Commander
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-100">
              {identity ? `${identity.displayName}#${identity.tag}` : '—'}
            </h2>
            {identity && (
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <Stat label="Rating" value={String(identity.rating)} />
                <Stat label="Level" value={String(identity.level)} />
                <Stat
                  label="Record"
                  value={`${identity.wins}W – ${identity.losses}L`}
                />
              </div>
            )}
          </Panel>

          {profile && profile.deck.length > 0 && (
            <Panel className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <Icon name="star" className="h-4 w-4 text-gold" />
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Your deck
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {profile.deck.map((owned) => (
                  <DeckCard key={owned.card.id} owned={owned} />
                ))}
              </div>
            </Panel>
          )}

          <Panel className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon name="trophy" className="h-4 w-4 text-gold" />
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Leaderboard
              </p>
            </div>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-slate-500">No ranked players yet.</p>
            ) : (
              <ol className="space-y-1.5">
                {leaderboard.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm odd:bg-white/[0.02]"
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-5 text-right font-mono text-xs text-slate-500">
                        {row.rank}
                      </span>
                      <span className="text-slate-200">
                        {row.displayName}
                        <span className="text-slate-600">#{row.tag}</span>
                      </span>
                    </span>
                    <span className="gold-text font-semibold">{row.rating}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <Panel className="flex flex-col items-center justify-center p-8 text-center">
          {queue === 'searching' ? (
            <>
              <div className="relative mb-6 flex h-24 w-24 items-center justify-center">
                <span className="absolute h-full w-full animate-ping rounded-full border border-gold/30" />
                <span className="absolute h-16 w-16 animate-pulse-soft rounded-full border border-gold/50" />
                <span className="font-display text-2xl gold-text">
                  {elapsed}s
                </span>
              </div>
              <h3 className="text-lg font-semibold text-slate-100">
                Searching for an opponent…
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Matching you against a commander of similar rating.
              </p>
              <Button
                variant="danger"
                className="mt-6"
                onClick={() => leaveQueue()}
              >
                Cancel search
              </Button>
            </>
          ) : (
            <>
              <Icon name="target" className="mb-3 h-10 w-10 text-gold" />
              <h3 className="font-display text-xl font-semibold text-slate-100">
                Ready for battle
              </h3>
              <p className="mt-1 max-w-xs text-sm text-slate-500">
                Four cards. One lane. Destroy the enemy base before the timer
                runs out.
              </p>
              <Button
                variant="primary"
                className="mt-6 px-10 py-3 text-base"
                disabled={!canQueue}
                loading={connection === 'connecting'}
                onClick={() => joinQueue()}
              >
                Find match
              </Button>
              {!canQueue && connection !== 'connecting' && (
                <p className="mt-3 text-xs text-amber-300">
                  {connection === 'connected'
                    ? 'Waiting…'
                    : 'Not connected to the server.'}
                </p>
              )}
            </>
          )}

          {error && (
            <p className="mt-6 w-full rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
              <button
                className="ml-2 text-red-300 underline"
                onClick={clearError}
              >
                dismiss
              </button>
            </p>
          )}
        </Panel>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink-900/50 py-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function DeckCard({ owned }: { owned: OwnedCard }) {
  const ratio = owned.maxed
    ? 1
    : owned.expToNext > 0
      ? Math.max(0, Math.min(1, owned.exp / owned.expToNext))
      : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink-900/50">
      <div className="relative h-16 w-full">
        <CardArt cardId={owned.card.id} className="h-full w-full" />
        <span className="absolute right-1 top-1 rounded-full border border-gold/50 bg-ink-950/90 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gold">
          Lv {owned.level}
        </span>
      </div>
      <div className="border-t border-line px-2 py-1.5">
        <p className="truncate text-[11px] font-semibold text-slate-200">
          {owned.card.name}
        </p>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ink-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-soft to-gold"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <p className="mt-0.5 text-[9px] text-slate-500">
          {owned.maxed
            ? 'Max level'
            : `${owned.exp} / ${owned.expToNext} XP`}
        </p>
      </div>
    </div>
  );
}
