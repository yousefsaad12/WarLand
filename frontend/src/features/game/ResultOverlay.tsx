import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { CardArt } from '@/components/CardArt';
import type {
  CardProgressReward,
  GameSide,
  MatchResult,
  PlayerReward,
} from '@/network/protocol';
import { matchOutcome, reasonLabel } from '@/features/game/format';

interface ResultOverlayProps {
  result: MatchResult;
  side: GameSide | null;
  rewards: PlayerReward | null;
  onReturn: () => void;
}

const OUTCOME_STYLE = {
  victory: {
    title: 'VICTORY',
    tone: 'gold-text',
    icon: 'trophy',
    iconClass: 'text-gold',
    border: 'border-gold/60',
    glow: 'shadow-[0_0_80px_-20px_rgba(216,181,106,0.8)]',
  },
  defeat: {
    title: 'DEFEAT',
    tone: 'text-red-400',
    icon: 'cross',
    iconClass: 'text-red-400',
    border: 'border-red-800/70',
    glow: 'shadow-[0_0_80px_-20px_rgba(239,68,68,0.6)]',
  },
  draw: {
    title: 'DRAW',
    tone: 'text-slate-300',
    icon: 'medal1',
    iconClass: 'text-slate-300',
    border: 'border-slate-600',
    glow: '',
  },
  cancelled: {
    title: 'CANCELLED',
    tone: 'text-amber-300',
    icon: 'pause',
    iconClass: 'text-amber-300',
    border: 'border-amber-700/70',
    glow: '',
  },
} as const;

export function ResultOverlay({
  result,
  side,
  rewards,
  onReturn,
}: ResultOverlayProps) {
  const outcome = matchOutcome(result, side);
  const style = OUTCOME_STYLE[outcome];

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950/85 p-3 backdrop-blur-sm">
      <div
        className={[
          'animate-rise panel-frame max-h-full w-full max-w-md overflow-y-auto rounded-2xl border p-6 text-center',
          style.border,
          style.glow,
        ].join(' ')}
      >
        <Icon
          name={style.icon}
          className={`mx-auto mb-1 h-12 w-12 ${style.iconClass}`}
        />
        <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500">
          Match complete
        </p>
        <h2
          className={`mt-1 font-display text-4xl font-bold tracking-[0.15em] ${style.tone}`}
        >
          {style.title}
        </h2>
        <p className="mt-1 text-sm text-slate-400">{reasonLabel(result.reason)}</p>

        {rewards ? (
          <RewardPanel rewards={rewards} />
        ) : (
          <div className="mt-6 flex items-center justify-center gap-3 rounded-xl border border-line bg-ink-900/60 py-6 text-sm text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/40 border-t-gold" />
            Settling rewards…
          </div>
        )}

        <Button
          variant="primary"
          fullWidth
          className="mt-6"
          disabled={!rewards}
          onClick={onReturn}
        >
          Return to lobby
        </Button>
      </div>
    </div>
  );
}

function RewardPanel({ rewards }: { rewards: PlayerReward }) {
  const rating = useCountUp(rewards.ratingBefore, rewards.ratingAfter, 900, 150);
  const deltaTone =
    rewards.ratingDelta > 0
      ? 'text-emerald-400'
      : rewards.ratingDelta < 0
        ? 'text-red-400'
        : 'text-slate-400';
  const deltaLabel =
    rewards.ratingDelta > 0
      ? `+${rewards.ratingDelta}`
      : String(rewards.ratingDelta);

  return (
    <div className="mt-5 space-y-4 text-left">
      <div className="rounded-xl border border-line bg-ink-900/60 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              Rating
            </p>
            <p className="font-display text-3xl font-bold text-slate-100 tabular-nums">
              {rating}
            </p>
          </div>
          <div className="text-right">
            <span
              className={`font-mono text-lg font-bold ${deltaTone} animate-pulse-soft`}
            >
              {deltaLabel}
            </span>
            <p className="text-[10px] uppercase tracking-widest text-slate-600">
              from {rewards.ratingBefore}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-slate-500">
          Card experience
        </p>
        {rewards.cards.map((card) => (
          <CardRewardRow key={card.cardId} card={card} />
        ))}
      </div>
    </div>
  );
}

function CardRewardRow({ card }: { card: CardProgressReward }) {
  const beforeRatio = clamp01(
    card.expToNextBefore > 0 ? card.expBefore / card.expToNextBefore : 1,
  );
  const afterRatio = card.maxed
    ? 1
    : clamp01(card.expToNext > 0 ? card.expAfter / card.expToNext : 0);

  const [ratio, setRatio] = useState(beforeRatio);
  const [noTransition, setNoTransition] = useState(false);
  const [level, setLevel] = useState(card.levelBefore);
  const [showLevelUp, setShowLevelUp] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    if (card.leveledUp && !card.maxed) {
      timers.push(window.setTimeout(() => setRatio(1), 80));
      timers.push(
        window.setTimeout(() => {
          setLevel(card.levelAfter);
          setShowLevelUp(true);
        }, 800),
      );
      timers.push(
        window.setTimeout(() => {
          setNoTransition(true);
          setRatio(0);
        }, 820),
      );
      timers.push(window.setTimeout(() => setNoTransition(false), 860));
      timers.push(window.setTimeout(() => setRatio(afterRatio), 900));
    } else {
      timers.push(window.setTimeout(() => setRatio(afterRatio), 80));
      timers.push(
        window.setTimeout(() => {
          if (card.leveledUp) {
            setLevel(card.levelAfter);
            setShowLevelUp(true);
          }
        }, 80),
      );
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-ink-900/50 p-2">
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md">
        <CardArt cardId={card.cardId} className="h-full w-full" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-slate-200">
            {card.name}
          </span>
          <span className="flex items-center gap-1.5">
            {showLevelUp && (
              <span className="rounded-full border border-gold/60 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold animate-pulse-soft">
                Level up
              </span>
            )}
            <span className="font-mono text-xs font-bold text-gold">
              Lv {level}
            </span>
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-soft to-gold"
            style={{
              width: `${ratio * 100}%`,
              transition: noTransition ? 'none' : 'width 700ms ease-out',
            }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
          <span className="text-emerald-400">+{card.expGained} XP</span>
          <span>
            {card.maxed
              ? 'Max level'
              : `${card.expAfter} / ${card.expToNext} XP`}
          </span>
        </div>
      </div>
    </div>
  );
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function useCountUp(
  from: number,
  to: number,
  duration = 900,
  delay = 0,
): number {
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (from === to) {
      setValue(to);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const timer = window.setTimeout(() => {
      const step = (now: number) => {
        if (start === null) start = now;
        const p = Math.min(1, (now - start) / duration);
        setValue(Math.round(from + (to - from) * p));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [from, to, duration, delay]);

  return value;
}
