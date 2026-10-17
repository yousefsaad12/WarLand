import type { MatchStatus } from '@/network/protocol';
import { formatClock, remainingSeconds } from '@/game/format';

interface MatchTimerProps {
  tick: number;
  maxTicks: number;
  ticksPerSecond: number;
  status: MatchStatus;
}

export function MatchTimer({
  tick,
  maxTicks,
  ticksPerSecond,
  status,
}: MatchTimerProps) {
  const remaining = remainingSeconds(tick, maxTicks, ticksPerSecond);
  const pct = maxTicks > 0 ? Math.max(0, Math.min(1, 1 - tick / maxTicks)) : 0;
  const low = remaining <= 30;

  return (
    <div className="flex flex-col items-center">
      <span
        className={[
          'font-mono text-2xl font-bold tabular-nums sm:text-3xl',
          low ? 'text-red-400' : 'text-slate-100',
        ].join(' ')}
      >
        {status === 'RUNNING' ? formatClock(remaining) : status}
      </span>
      <div className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-ink-900 sm:w-40">
        <div
          className={[
            'h-full rounded-full transition-[width] duration-300',
            low ? 'bg-red-500' : 'bg-gold',
          ].join(' ')}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}
