import { useState } from 'react';
import { Button } from '@/components/Button';
import { Panel } from '@/components/Panel';
import { useSessionStore } from '@/store/sessionStore';

type Mode = 'login' | 'register';

interface FieldErrors {
  username?: string;
  displayName?: string;
  password?: string;
}

function validate(
  mode: Mode,
  username: string,
  displayName: string,
  password: string,
): FieldErrors {
  const errors: FieldErrors = {};
  if (username.length < 3 || username.length > 30) {
    errors.username = 'Username must be 3–30 characters.';
  } else if (mode === 'register' && !/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.username = 'Letters, numbers, and underscores only.';
  }
  if (mode === 'register' && (displayName.length < 1 || displayName.length > 80)) {
    errors.displayName = 'Display name must be 1–80 characters.';
  }
  if (mode === 'register') {
    if (password.length < 8 || password.length > 128) {
      errors.password = 'Password must be 8–128 characters.';
    }
  } else if (password.length < 1) {
    errors.password = 'Enter your password.';
  }
  return errors;
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const login = useSessionStore((s) => s.login);
  const register = useSessionStore((s) => s.register);
  const status = useSessionStore((s) => s.status);
  const serverError = useSessionStore((s) => s.error);
  const setError = useSessionStore((s) => s.setError);

  const busy = status === 'authenticating';

  const submit = async () => {
    const nextErrors = validate(mode, username, displayName, password);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setError(null);
    if (mode === 'login') {
      await login({ username, password });
    } else {
      await register({ username, displayName, password });
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setError(null);
  };

  return (
    <div className="warland-bg flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <header className="mb-7 text-center">
          <h1 className="font-display text-5xl font-bold tracking-[0.2em] gold-text">
            WARLAND
          </h1>
          <p className="mt-2 text-xs uppercase tracking-[0.35em] text-slate-500">
            Two-sided lane battles
          </p>
        </header>

        <Panel className="p-6">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-ink-900/70 p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={[
                  'rounded-md py-2 text-sm font-semibold capitalize transition-colors',
                  mode === m
                    ? 'bg-ink-700 text-gold'
                    : 'text-slate-400 hover:text-slate-200',
                ].join(' ')}
              >
                {m}
              </button>
            ))}
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field
              label="Username"
              value={username}
              onChange={setUsername}
              autoComplete="username"
              error={errors.username}
              disabled={busy}
            />
            {mode === 'register' && (
              <Field
                label="Display name"
                value={displayName}
                onChange={setDisplayName}
                autoComplete="nickname"
                error={errors.displayName}
                disabled={busy}
              />
            )}
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              error={errors.password}
              disabled={busy}
            />

            {serverError && (
              <p className="rounded-md border border-red-900/60 bg-red-950/50 px-3 py-2 text-sm text-red-200">
                {serverError}
              </p>
            )}

            <Button type="submit" variant="primary" fullWidth loading={busy}>
              {mode === 'login' ? 'Enter the fray' : 'Create account'}
            </Button>
          </form>
        </Panel>

        <p className="mt-4 text-center text-xs text-slate-600">
          Server-authoritative matches. No gameplay simulation runs in your
          browser.
        </p>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  error?: string;
  disabled?: boolean;
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  error,
  disabled,
}: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'w-full rounded-lg border bg-ink-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors',
          'placeholder:text-slate-600 focus:border-gold/70',
          error ? 'border-red-800' : 'border-line',
        ].join(' ')}
      />
      {error && <span className="mt-1 block text-xs text-red-300">{error}</span>}
    </label>
  );
}
