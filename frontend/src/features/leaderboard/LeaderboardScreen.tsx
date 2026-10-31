import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Panel } from '@/components/Panel';
import { WarlandLogo } from '@/components/WarlandLogo';
import { AudioToggle } from '@/features/game/components/AudioToggle';
import { fetchLeaderboard } from '@/network/playerApi';
import type { LeaderboardEntry } from '@/network/protocol';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

export function LeaderboardScreen() {
  const setScreen = useUiStore((s) => s.setScreen);
  const me = useSessionStore((s) => s.player);

  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);
    void fetchLeaderboard(50)
      .then((data) => {
        if (!active) return;
        setRows(data);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setRows([]);
        setError(messageOf(err));
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden overflow-y-auto bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px),radial-gradient(140%_90%_at_50%_-10%,rgba(230,180,80,0.08),transparent_65%),radial-gradient(90%_70%_at_50%_110%,rgba(79,155,255,0.06),transparent_65%),linear-gradient(180deg,#070a12_0%,#050608_100%)] bg-[length:52px_52px,52px_52px,auto,auto,auto]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(120%_120%_at_50%_0%,rgba(245,193,110,0.12),transparent_70%)]" />

      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-gradient-to-b from-[#0a0e17]/75 to-transparent px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_16px_40px_-34px_rgba(0,0,0,0.95)] sm:px-6 sm:py-5">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            className="px-3 py-1.5 text-xs"
            onClick={() => setScreen('lobby')}
          >
            ← Lobby
          </Button>
          <WarlandLogo compact />
          <p className="hidden text-[10px] uppercase tracking-[0.35em] text-slate-500 sm:block">
            Tactical Lane Warfare
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <AudioToggle />
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
        <Panel className="relative overflow-hidden bg-gradient-to-b from-[#111723]/95 to-[#080b12]/[0.98] motion-safe:animate-rise">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(120%_120%_at_50%_0%,rgba(245,193,110,0.14),transparent_70%)]" />

          <div className="relative flex items-center justify-between gap-3 border-b border-white/5 px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gold/25 bg-gold/10 text-gold">
                <Icon name="trophy" className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.6em] text-slate-500">
                  Leaderboard
                </p>
                <h1 className="mt-0.5 text-lg font-semibold text-slate-100 sm:text-xl">
                  Top Commanders
                </h1>
              </div>
            </div>
            <Button
              variant="ghost"
              className="px-3 py-1.5 text-xs"
              onClick={reload}
              loading={status === 'loading'}
            >
              Refresh
            </Button>
          </div>

          {status === 'loading' && rows.length === 0 ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-9 w-9 animate-spin rounded-full border border-gold/30 border-t-gold" />
                <p className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-500">
                  Loading rankings
                </p>
              </div>
            </div>
          ) : status === 'error' ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center px-6 text-center">
              <p className="text-sm text-amber-300">
                Leaderboard unavailable: {error}
              </p>
              <Button variant="secondary" className="mt-5" onClick={reload}>
                Try again
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center px-6 text-center">
              <Icon name="medal1" className="h-10 w-10 text-slate-600" />
              <p className="mt-4 text-sm text-slate-500">
                No ranked players yet. Be the first to claim the top spot.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[3rem_1fr_5rem_6rem_5rem_6rem] items-center gap-2 px-6 py-2 text-[9px] uppercase tracking-[0.25em] text-slate-600 sm:grid">
                <span>Rank</span>
                <span>Commander</span>
                <span className="text-right">Level</span>
                <span className="text-right">Record</span>
                <span className="text-right">Win rate</span>
                <span className="text-right">Rating</span>
              </div>
              <ol className="px-2 pb-3 sm:px-4">
                {rows.map((row) => {
                  const isMe = !!me && row.id === me.id;
                  return (
                    <li
                      key={row.id}
                      className={[
                        'grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 rounded-xl border px-2.5 py-2.5 transition-colors sm:grid-cols-[3rem_1fr_5rem_6rem_5rem_6rem] sm:px-3',
                        isMe
                          ? 'border-gold/40 bg-gold/[0.07]'
                          : 'border-transparent hover:border-white/5 hover:bg-white/[0.03]',
                      ].join(' ')}
                    >
                      <RankBadge rank={row.rank} />
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm text-slate-200">
                            {row.displayName}
                            <span className="text-slate-600">#{row.tag}</span>
                          </span>
                          {isMe && (
                            <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.2em] text-gold">
                              You
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-slate-500 sm:hidden">
                          Lv {row.level} · {row.wins}W {row.losses}L ·{' '}
                          {row.winRate}% WR
                        </span>
                      </span>
                      <span className="hidden text-right font-mono text-xs text-slate-400 sm:block">
                        {row.level}
                      </span>
                      <span className="hidden text-right font-mono text-xs text-slate-400 sm:block">
                        {row.wins}W · {row.losses}L
                      </span>
                      <span className="hidden text-right font-mono text-xs text-slate-400 sm:block">
                        {row.winRate}%
                      </span>
                      <span className="text-right font-mono text-sm font-semibold text-gold">
                        {row.rating}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </Panel>
      </main>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const tone =
    rank === 1
      ? 'border-gold/50 bg-gold/15 text-gold'
      : rank === 2
        ? 'border-slate-300/30 bg-slate-300/10 text-slate-200'
        : rank === 3
          ? 'border-amber-700/40 bg-amber-800/15 text-amber-300'
          : 'border-white/5 bg-white/[0.02] text-slate-500';
  return (
    <span
      className={[
        'grid h-7 w-7 place-items-center rounded-lg border font-mono text-xs font-semibold sm:h-8 sm:w-8',
        tone,
      ].join(' ')}
    >
      {rank}
    </span>
  );
}
