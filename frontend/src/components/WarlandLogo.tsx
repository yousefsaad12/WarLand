interface WarlandLogoProps {
  compact?: boolean;
  className?: string;
}

export function WarlandLogo({
  compact = false,
  className = '',
}: WarlandLogoProps) {
  return (
    <div className={['flex items-center gap-3', className].join(' ')}>
      <svg
        aria-hidden="true"
        className={compact ? 'h-10 w-10' : 'h-14 w-14'}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M32 4 54 12v17c0 14.5-9 24.9-22 31C19 53.9 10 43.5 10 29V12L32 4Z"
          fill="url(#shield)"
          stroke="#F5C16E"
          strokeWidth="2"
        />
        <path
          d="M18 22 22 42l5-11 5 11 5-20h-5l-2 10-3-7-3 7-1-10h-5Z"
          fill="#FFF1D1"
        />
        <path d="M39 22v20h10v-4h-5V22h-5Z" fill="#F5C16E" />
        <defs>
          <linearGradient id="shield" x1="32" y1="4" x2="32" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2C3852" />
            <stop offset="1" stopColor="#111827" />
          </linearGradient>
        </defs>
      </svg>
      <span className="font-display text-xl font-bold tracking-[0.18em] text-slate-100">
        WAR<span className="text-gold">LAND</span>
      </span>
    </div>
  );
}
