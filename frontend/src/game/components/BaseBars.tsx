import type { GameSide, MatchView } from '@/network/protocol';

interface BaseBarsProps {
  view: MatchView;
  side: GameSide | null;
  opponentName: string | null;
  opponentTag: string | null;
}

export function BaseBars({
  view,
  side,
  opponentName,
  opponentTag,
}: BaseBarsProps) {
  const localSide = side ?? 'LEFT';
  const enemySide: GameSide = localSide === 'LEFT' ? 'RIGHT' : 'LEFT';
  const maxHp = Math.max(
    view.players.LEFT.baseHp,
    view.players.RIGHT.baseHp,
    1,
  );

  return (
    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3">
      <BasePanel
        label="Your base"
        name={side ? `${view.players[localSide].playerId.slice(0, 6)}…` : '—'}
        hp={view.players[localSide].baseHp}
        maxHp={maxHp}
        align="left"
        accent="local"
      />
      <div className="text-center text-[10px] uppercase tracking-[0.3em] text-slate-600">
        vs
      </div>
      <BasePanel
        label="Enemy base"
        name={
          opponentName
            ? `${opponentName}${opponentTag ? `#${opponentTag}` : ''}`
            : 'Opponent'
        }
        hp={view.players[enemySide].baseHp}
        maxHp={maxHp}
        align="right"
        accent="enemy"
      />
    </div>
  );
}

interface BasePanelProps {
  label: string;
  name: string;
  hp: number;
  maxHp: number;
  align: 'left' | 'right';
  accent: 'local' | 'enemy';
}

function BasePanel({ label, name, hp, maxHp, align, accent }: BasePanelProps) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const barColor = accent === 'local' ? 'bg-team-left' : 'bg-team-right';
  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      <div
        className={[
          'flex items-center gap-2',
          align === 'right' ? 'justify-end' : 'justify-start',
        ].join(' ')}
      >
        <span className="text-[10px] uppercase tracking-widest text-slate-500">
          {label}
        </span>
        <span className="truncate text-xs font-semibold text-slate-300">
          {name}
        </span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full border border-line bg-ink-900">
        <div
          className={[
            'h-full rounded-full transition-[width] duration-200',
            barColor,
            align === 'right' ? 'ml-auto' : '',
          ].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 font-mono text-sm font-bold text-slate-200">
        {Math.round(hp)}
      </p>
    </div>
  );
}
