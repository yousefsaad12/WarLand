import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Panel } from '@/components/Panel';
import { CardArt } from '@/components/CardArt';
import { AudioToggle } from '@/features/game/components/AudioToggle';
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
import { WarlandLogo } from '@/components/WarlandLogo';

const CONNECTION_LABEL: Record<string, { text: string; tone: string }> = {
  idle: { text: 'Offline', tone: 'bg-slate-500' },
  connecting: { text: 'Connecting', tone: 'bg-amber-400' },
  connected: { text: 'Online', tone: 'bg-emerald-400' },
  reconnecting: { text: 'Reconnecting', tone: 'bg-amber-400' },
  disconnected: { text: 'Disconnected', tone: 'bg-red-500' },
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

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
  const pushToast = useUiStore((s) => s.pushToast);

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [inspectedCard, setInspectedCard] = useState<OwnedCard | null>(null);
  const searchStart = useRef<number | null>(null);

  useEffect(() => {
    if (token) connect(token);
  }, [token, connect]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void fetchProfile(token)
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setProfile(null);
        pushToast('error', `Could not load your profile: ${messageOf(error)}`);
      });
    void fetchLeaderboard(10)
      .then((rows) => {
        if (!active) return;
        setLeaderboard(rows);
        setLeaderboardError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLeaderboard([]);
        const message = messageOf(error);
        setLeaderboardError(message);
        pushToast('error', `Could not load the leaderboard: ${message}`);
      });
    return () => {
      active = false;
    };
  }, [token, pushToast]);

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
    const found = match;
    joinMatch(found, token);
    clearMatch();
    setScreen('game');
  }, [match, token, joinMatch, clearMatch, setScreen]);

  const identity = profile ?? player;
  const conn = CONNECTION_LABEL[connection] ?? CONNECTION_LABEL.idle!;
  const canQueue = connection === 'connected' && queue === 'idle';

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden overflow-y-auto bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px),radial-gradient(140%_90%_at_50%_-10%,rgba(230,180,80,0.08),transparent_65%),radial-gradient(90%_70%_at_50%_110%,rgba(79,155,255,0.06),transparent_65%),linear-gradient(180deg,#070a12_0%,#050608_100%)] bg-[length:52px_52px,52px_52px,auto,auto,auto]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(120%_120%_at_50%_0%,rgba(245,193,110,0.12),transparent_70%)]" />
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-gradient-to-b from-[#0a0e17]/75 to-transparent px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_16px_40px_-34px_rgba(0,0,0,0.95)] sm:px-6 sm:py-5">
        <div className="flex items-center gap-3">
          <WarlandLogo compact />
          <p className="hidden text-[10px] uppercase tracking-[0.35em] text-slate-500 sm:block">
            Tactical Lane Warfare
          </p>
        </div>
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-4">
          <AudioToggle />
          <div className="flex items-center gap-1.5 sm:gap-2 rounded-full border border-white/5 bg-white/[0.01] px-2.5 py-1 text-xs text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${conn.tone}`} />
            {conn.text}
          </div>
          <Button
            variant="ghost"
            onClick={logout}
            className="text-xs px-3 py-1.5"
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-4 px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:gap-5 sm:px-6 sm:py-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-6">
          <Panel className="relative min-h-[232px] motion-safe:animate-rise p-5 sm:p-8">
            <div
              className="pointer-events-none absolute bottom-[-1.25rem] right-6 rotate-[-12deg] text-gold/[0.07] max-sm:scale-[0.78] max-sm:right-2"
              aria-hidden="true"
            >
              <Icon name="shield" className="h-28 w-28" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="relative z-10">
                <p className="text-[10px] uppercase tracking-[0.6em] text-slate-500">
                  Commander
                </p>
                <h2 className="mt-2 max-w-[calc(100vw-9rem)] truncate text-2xl font-semibold text-slate-100 sm:max-w-none sm:text-4xl">
                  {identity ? `${identity.displayName}#${identity.tag}` : '—'}
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-slate-500">
                  Lead your forces to victory
                </p>
              </div>
              <div className="relative z-10 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 sm:px-4 sm:py-2 text-[10px] sm:text-xs uppercase tracking-[0.3em] text-gold shrink-0">
                Ranked
              </div>
            </div>
            {identity && (
              <div className="mt-6 sm:mt-8 grid grid-cols-3 gap-2 sm:gap-4">
                <Stat label="Rating" value={String(identity.rating)} />
                <Stat label="Level" value={String(identity.level)} />
                <Stat
                  label="Record"
                  value={`${identity.wins}W • ${identity.losses}L`}
                />
              </div>
            )}
          </Panel>

          {profile && profile.deck.length > 0 && (
            <Panel className="bg-gradient-to-b from-[#111723]/95 to-[#080b12]/[0.98] motion-safe:animate-rise p-5 sm:p-7 [animation-delay:100ms]">
              <div className="mb-4 sm:mb-5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.6em] text-slate-500">
                    Active Deck
                  </p>
                  <p className="mt-1 text-base sm:text-lg font-semibold text-slate-100">
                    Battle Loadout (tap card to inspect)
                  </p>
                </div>
                <Icon name="star" className="h-4 w-4 text-gold" />
              </div>
              <div className="deck-grid grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                {profile.deck.map((owned, index) => (
                  <DeckCard
                    key={owned.card.id}
                    owned={owned}
                    index={index}
                    onSelect={() => setInspectedCard(owned)}
                  />
                ))}
              </div>
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Panel className="order-2 relative flex min-h-[300px] flex-col items-center justify-between overflow-hidden bg-[radial-gradient(80%_55%_at_50%_24%,rgba(230,180,80,0.13),transparent_72%),linear-gradient(160deg,rgba(19,26,39,0.98),rgba(7,10,16,0.99))] motion-safe:animate-rise p-5 text-center after:pointer-events-none after:absolute after:inset-4 after:rounded-2xl after:border after:border-gold/[0.08] sm:min-h-[340px] sm:p-6 [animation-delay:80ms]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(120%_120%_at_50%_0%,rgba(245,193,110,0.14),transparent_70%)]" />
            <div className="relative z-10 flex min-h-[250px] w-full max-w-sm flex-col items-center justify-center">
              {queue === 'searching' ? (
                <>
                  <div className="relative mb-8 flex h-28 w-28 items-center justify-center">
                    <span className="absolute h-full w-full animate-ping rounded-full border border-gold/30" />
                    <span className="absolute h-20 w-20 rounded-full border border-gold/40" />
                    <span className="text-2xl font-semibold tracking-[0.4em] gold-text">
                      {elapsed}s
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-100">
                    Searching for opponent
                  </h3>
                  <p className="mt-2 max-w-xs text-sm text-slate-500">
                    Finding a commander of comparable skill level
                  </p>
                  <Button
                    variant="ghost"
                    className="mt-8"
                    onClick={() => leaveQueue()}
                  >
                    Cancel search
                  </Button>
                </>
              ) : (
                <>
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-gold/40 bg-gold/10">
                    <Icon name="target" className="h-6 w-6 text-gold" />
                  </div>
                  <h3 className="text-2xl font-semibold text-slate-100">
                    Ready for Battle
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                    Command your deck across a single lane. Destroy the enemy
                    base before time runs out.
                  </p>
                  <Button
                    variant="primary"
                    className="mt-8 w-full max-w-xs justify-center px-12 py-3 sm:max-w-sm"
                    disabled={!canQueue}
                    loading={connection === 'connecting'}
                    onClick={() => joinQueue()}
                  >
                    Find Match
                  </Button>
                  {!canQueue && connection !== 'connecting' && (
                    <p className="mt-4 text-xs text-amber-300">
                      {connection === 'connected'
                        ? 'Preparing matchmaker'
                        : 'Not connected to server'}
                    </p>
                  )}
                </>
              )}

              {error && (
                <div className="mt-8 flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  <span>{error}</span>
                  <button className="text-red-300/80" onClick={clearError}>
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </Panel>

          <Panel className="order-1 max-h-[250px] overflow-y-auto bg-gradient-to-b from-[#111723]/95 to-[#080b12]/[0.98] motion-safe:animate-rise p-5 sm:max-h-[270px] sm:p-6 [animation-delay:180ms]">
            <div className="mb-4 flex items-start justify-between gap-4 sm:mb-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.6em] text-slate-500">
                  Leaderboard
                </p>
                <p className="mt-1 text-base font-semibold text-slate-100 sm:text-lg">
                  Top Commanders
                </p>
              </div>
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-gold/25 bg-gold/10 text-gold">
                <Icon name="trophy" className="h-4 w-4" />
              </div>
            </div>
            {leaderboardError ? (
              <p className="text-sm text-amber-300">
                Leaderboard unavailable: {leaderboardError}
              </p>
            ) : leaderboard.length === 0 ? (
              <p className="text-sm text-slate-500">No ranked players yet.</p>
            ) : (
              <ol className="space-y-1.5">
                {leaderboard.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between rounded-xl border border-transparent px-2.5 py-2.5 text-sm transition-colors hover:border-white/5 hover:bg-white/[0.03] sm:px-3"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={[
                          'grid h-7 w-7 shrink-0 place-items-center rounded-lg border font-mono text-xs font-semibold',
                          row.rank === 1
                            ? 'border-gold/50 bg-gold/15 text-gold'
                            : row.rank === 2
                              ? 'border-slate-300/30 bg-slate-300/10 text-slate-200'
                              : row.rank === 3
                                ? 'border-amber-700/40 bg-amber-800/15 text-amber-300'
                                : 'border-white/5 bg-white/[0.02] text-slate-500',
                        ].join(' ')}
                      >
                        {row.rank}
                      </span>
                      <span className="min-w-0 truncate text-slate-200">
                        {row.displayName}
                        <span className="text-slate-600">#{row.tag}</span>
                      </span>
                    </span>
                    <span className="ml-3 shrink-0 text-right">
                      <span className="block font-mono text-sm font-semibold text-gold">
                        {row.rating}
                      </span>
                      <span className="block text-[9px] uppercase tracking-[0.2em] text-slate-600">
                        rating
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </main>

      {/* Card inspection modal */}
      {inspectedCard && (
        <CardInspectModal
          owned={inspectedCard}
          onClose={() => setInspectedCard(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.01] px-4 py-4 text-center after:absolute after:bottom-2 after:right-3 after:h-px after:w-6 after:bg-gold/45 sm:px-6 sm:py-5">
      <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.5em] text-slate-500">
        {label}
      </p>
      <p className="mt-1.5 text-xl sm:text-2xl font-semibold text-slate-100">
        {value}
      </p>
    </div>
  );
}

function DeckCard({
  owned,
  index,
  onSelect,
}: {
  owned: OwnedCard;
  index: number;
  onSelect?: () => void;
}) {
  const ratio = owned.maxed
    ? 1
    : owned.expToNext > 0
      ? Math.max(0, Math.min(1, owned.exp / owned.expToNext))
      : 0;

  return (
    <div
      className="group motion-safe:animate-rise overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent transition-all hover:scale-[1.02] hover:border-gold/30 active:scale-[0.98]"
      style={{ animationDelay: `${140 + index * 55}ms` } as CSSProperties}
      onClick={() => onSelect?.()}
    >
      <div className="relative h-20 w-full">
        <CardArt cardId={owned.card.id} className="h-full w-full" />
        <span className="absolute right-2 top-2 rounded-full border border-gold/40 bg-black/40 px-2 py-0.5 font-mono text-[10px] font-semibold text-gold">
          Lv {owned.level}
        </span>
      </div>
      <div className="px-3 py-3">
        <p className="truncate text-sm font-medium text-slate-200">
          {owned.card.name}
        </p>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-soft to-gold"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          {owned.maxed ? 'Max Level' : `${owned.exp} / ${owned.expToNext} XP`}
        </p>
      </div>
    </div>
  );
}

// ─── Card Inspection Modal ──────────────────────────────────────────────────

interface CardInspectModalProps {
  owned: OwnedCard;
  onClose: () => void;
}

function CardInspectModal({ owned, onClose }: CardInspectModalProps) {
  const { card, level, exp, expToNext, maxed } = owned;
  const ratio = maxed
    ? 1
    : expToNext > 0
      ? Math.max(0, Math.min(1, exp / expToNext))
      : 0;

  // Stat rows: label + value + optional bar fill fraction
  const stats: { label: string; value: string; fill?: number }[] = [
    { label: 'Energy Cost', value: `${card.cost}` },
    {
      label: 'HP',
      value: `${card.baseHp}`,
      fill: Math.min(1, card.baseHp / 300),
    },
    {
      label: 'Damage',
      value: `${card.baseDamage}`,
      fill: Math.min(1, card.baseDamage / 100),
    },
    {
      label: 'Atk Speed',
      value: `${card.attackSpeed.toFixed(1)}/s`,
      fill: Math.min(1, card.attackSpeed / 3),
    },
    {
      label: 'Move Speed',
      value: `${card.movementSpeed}`,
      fill: Math.min(1, card.movementSpeed / 200),
    },
    {
      label: 'Range',
      value: card.range >= 200 ? 'Ranged' : 'Melee',
      fill: Math.min(1, card.range / 400),
    },
  ];

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:px-4 sm:pb-0"
      onClick={onClose}
    >
      {/* Modal panel */}
      <div
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto rounded-3xl border border-white/10 bg-[#0d0f15] shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gold top glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(120%_120%_at_50%_0%,rgba(245,193,110,0.18),transparent_70%)]" />

        {/* Card art banner */}
        <div className="relative h-44 w-full">
          <CardArt cardId={card.id} className="h-full w-full object-cover" />
          {/* Gradient overlay at bottom of art */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0d0f15] to-transparent" />
          {/* Level badge */}
          <span className="absolute left-3 top-3 rounded-full border border-gold/50 bg-black/60 px-3 py-1 font-mono text-xs font-bold text-gold backdrop-blur-sm">
            LV {level}
          </span>
          {/* Close button */}
          <button
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 text-slate-300 backdrop-blur-sm transition hover:text-white"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="relative z-10 px-6 pb-8 pt-3">
          {/* Name */}
          <h2 className="text-2xl font-bold tracking-wide text-slate-100">
            {card.name}
          </h2>

          {/* XP bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">
                Experience
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {maxed ? 'MAX LEVEL' : `${exp} / ${expToNext} XP`}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold-soft to-gold transition-all"
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="my-5 h-px bg-white/5" />

          {/* Stats grid */}
          <div className="space-y-3">
            {stats.map(({ label, value, fill }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.4em] text-slate-500">
                  {label}
                </span>
                <div className="flex flex-1 items-center gap-2">
                  {fill !== undefined && (
                    <div className="flex-1 h-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-slate-600 to-slate-400"
                        style={{ width: `${fill * 100}%` }}
                      />
                    </div>
                  )}
                  <span className="shrink-0 font-mono text-sm font-semibold text-slate-100">
                    {value}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Close CTA */}
          <button
            className="mt-7 w-full rounded-2xl border border-white/8 bg-white/[0.03] py-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
