import { useState } from 'react';

interface CardArtProps {
  cardId: string;
  className?: string;
}

/**
 * Card artwork. Uses the same Kenney unit sprite that appears on the
 * battlefield so the hand reads consistently with the arena. Falls back to a
 * procedural SVG sigil if the sprite fails to load.
 */
export function CardArt({ cardId, className = '' }: CardArtProps) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={['relative', className].join(' ')}>
      <svg
        viewBox="0 0 64 64"
        className="h-full w-full"
        role="img"
        aria-label={`${cardId} artwork`}
      >
        <defs>
          <linearGradient id={`plate-${cardId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d2637" />
            <stop offset="100%" stopColor="#0f141d" />
          </linearGradient>
        </defs>
        <rect
          x="1"
          y="1"
          width="62"
          height="62"
          rx="10"
          fill={`url(#plate-${cardId})`}
          stroke="#2a3444"
        />
        {failed && (
          <g
            stroke="#d8b56a"
            strokeWidth="2.2"
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
          src={`/assets/kenney/units/${cardId}.png`}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
          className="pointer-events-none absolute inset-0 h-full w-full scale-[0.82] object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]"
        />
      )}
    </div>
  );
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
