import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-kenney btn-img-primary text-[#4a3708] hover:brightness-110 active:brightness-95',
  secondary:
    'btn-kenney btn-img-secondary text-[#262a35] hover:brightness-105 active:brightness-95',
  danger: 'btn-kenney btn-img-danger text-white hover:brightness-110 active:brightness-95',
  ghost: 'bg-transparent text-slate-300 hover:bg-white/5 border border-transparent',
};

export function Button({
  variant = 'secondary',
  loading = false,
  fullWidth = false,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold tracking-wide transition-all',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold/70',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
