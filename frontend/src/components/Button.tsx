import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-neo btn-neo-primary',
  secondary: 'btn-neo btn-neo-secondary',
  danger: 'btn-neo btn-neo-danger',
  ghost: 'btn-neo btn-neo-ghost',
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
        'min-h-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold/70',
        'disabled:cursor-not-allowed disabled:opacity-40',
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
