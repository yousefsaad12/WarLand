import { useState } from 'react';

interface CardArtProps {
  cardId: string;
  className?: string;
}

/**
 * Production-grade collectible card artwork with metallic filigree,
 * role badge, multi-layered gradient backdrop, and unit portrait.
 */
export function CardArt({ cardId, className = '' }: CardArtProps) {
  const [failed, setFailed] = useState(false);
  const accent = getAccent(cardId);
  const role = getRole(cardId);

  return (
    <div
      className={[
        'relative overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-lg transition-transform duration-200 group-hover:scale-[1.03]',
        className,
      ].join(' ')}
    >
      <svg
        viewBox="0 0 96 96"
        className="h-full w-full"
        role="img"
        aria-label={`${cardId} artwork`}
      >
        <defs>
          <linearGradient id={`card-bg-${cardId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="45%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <radialGradient id={`card-glow-${cardId}`} cx="50%" cy="32%" r="65%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="60%" stopColor={accent} stopOpacity="0.06" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`card-border-${cardId}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f5c16e" stopOpacity="0.8" />
            <stop offset="50%" stopColor={accent} stopOpacity="0.4" />
            <stop offset="100%" stopColor="#78350f" stopOpacity="0.6" />
          </linearGradient>
        </defs>

        <rect width="96" height="96" fill={`url(#card-bg-${cardId})`} />
        <rect width="96" height="96" fill={`url(#card-glow-${cardId})`} />

        {/* Decorative corner runes */}
        <path
          d="M 6 14 L 6 6 L 14 6 M 82 6 L 90 6 L 90 14 M 90 82 L 90 90 L 82 90 M 14 90 L 6 90 L 6 82"
          stroke={accent}
          strokeWidth="1.5"
          strokeOpacity="0.6"
          fill="none"
        />

        {/* Outer gold-metallic bevel */}
        <rect
          x="2"
          y="2"
          width="92"
          height="92"
          rx="10"
          fill="none"
          stroke={`url(#card-border-${cardId})`}
          strokeWidth="1.5"
        />

        {/* Inner frame */}
        <rect
          x="4.5"
          y="4.5"
          width="87"
          height="87"
          rx="8"
          fill="none"
          stroke="#1e293b"
          strokeOpacity="0.85"
        />

        {/* Unit portrait aura circle */}
        <circle cx="48" cy="48" r="32" fill="none" stroke={accent} strokeWidth="1" strokeOpacity="0.2" strokeDasharray="3 3" />

        {failed && (
          <g
            stroke={accent}
            strokeWidth="2.4"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            {renderGlyph(cardId)}
          </g>
        )}
      </svg>

      {!failed && (
        <img
          src={`/assets/tiny-swords/generated/${cardId}-card.png`}
          alt=""
          draggable={false}
          onError={() => {
            setFailed(true);
          }}
          className="pointer-events-none absolute inset-x-0 bottom-[-2px] mx-auto h-[90%] w-auto object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.85)] filter transition-transform duration-300 group-hover:scale-105"
        />
      )}

      {/* Role Badge in top-left */}
      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-md border border-white/10 bg-slate-900/85 px-1.5 py-0.5 shadow-sm backdrop-blur-xs">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-300">
          {role}
        </span>
      </div>

      {/* Glossy top-down glass shine reflection */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-white/10 via-white/5 to-transparent" />
    </div>
  );
}

function getRole(cardId: string): string {
  switch (cardId) {
    case 'knight':
      return 'Melee';
    case 'archer':
      return 'Ranged';
    case 'guard':
      return 'Tank';
    case 'scout':
      return 'Fast';
    default:
      return 'Unit';
  }
}

function getAccent(cardId: string) {
  switch (cardId) {
    case 'knight':
      return '#f0c674';
    case 'guard':
      return '#9fc3ff';
    case 'scout':
      return '#d9b07e';
    case 'archer':
      return '#86efac';
    default:
      return '#d8b56a';
  }
}

function renderGlyph(cardId: string) {
  switch (cardId) {
    case 'knight':
      return (
        <>
          <path d="M20 46 V26 L32 16 L44 26 V46 Z" fill="#243049" />
          <path d="M32 17 V45" />
          <path d="M22 30 H42" />
          <path d="M24 20 L32 15 L40 20" />
        </>
      );
    case 'archer':
      return (
        <>
          <path d="M40 14 A20 20 0 0 0 40 50" />
          <path d="M40 14 L40 50" stroke="#8a733f" />
          <path d="M18 32 H40" />
          <path d="M40 32 L34 27 M40 32 L34 37" />
        </>
      );
    case 'guard':
      return (
        <>
          <path
            d="M32 12 L48 20 V34 C48 44 40 50 32 53 C24 50 16 44 16 34 V20 Z"
            fill="#243049"
          />
          <path d="M32 22 V42" />
          <path d="M24 30 H40" />
        </>
      );
    case 'scout':
      return (
        <>
          <path d="M32 14 L40 30 L34 30 L42 50 L24 34 L30 34 L22 18 Z" fill="#243049" />
        </>
      );
    default:
      return <circle cx="32" cy="32" r="12" />;
  }
}
