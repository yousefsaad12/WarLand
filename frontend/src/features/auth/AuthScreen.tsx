import { useState } from 'react';
import { Button } from '@/components/Button';
import { Panel } from '@/components/Panel';
import { useSessionStore } from '@/store/sessionStore';
import { WarlandLogo } from '@/components/WarlandLogo';

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
  if (
    mode === 'register' &&
    (displayName.length < 1 || displayName.length > 80)
  ) {
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
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-auto bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px),radial-gradient(70%_75%_at_18%_15%,rgba(54,112,190,0.18),transparent_72%),radial-gradient(65%_70%_at_88%_85%,rgba(230,180,80,0.12),transparent_70%),linear-gradient(180deg,#080c16_0%,#050608_100%)] bg-[length:52px_52px,52px_52px,auto,auto,auto] p-3 sm:p-8">
      <div className="relative grid w-full max-w-6xl items-center gap-7 sm:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] lg:gap-20">
        <section className="animate-rise text-center lg:text-left">
          <WarlandLogo className="justify-center lg:justify-start" />
          <div className="mt-7 sm:mt-10 max-w-xl">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-gold">
              Strategy meets the arena
            </p>
            <h1 className="font-display text-[clamp(2.25rem,8vw,3.75rem)] font-bold leading-[1.08] tracking-tight text-slate-100">
              Build your army.
              <span className="block gold-text">Own the lanes.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-400 sm:text-lg">
              A fast, competitive lane battler where every deployment matters.
              Read the field, outplay your rival, and make the final push.
            </p>
          </div>
          <div className="mt-9 grid max-w-lg grid-cols-3 gap-3 text-left">
            <Stat value="1v1" label="Live matches" />
            <Stat value="4" label="Battle units" />
            <Stat value="∞" label="Ways to win" />
          </div>
          <div className="mt-8 hidden items-center gap-3 text-xs text-slate-500 sm:flex">
            <span className="h-px w-8 bg-gold/50" />
            Server-authoritative. Fair by design.
          </div>
        </section>

        <Panel className="animate-rise shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_30px_80px_-46px_rgba(0,0,0,0.98),0_0_70px_-50px_rgba(230,180,80,0.45)] p-4 sm:p-8">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Welcome, commander
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-slate-100">
              Enter the battlefield
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Sign in to continue your campaign.
            </p>
          </div>
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
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
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

        <p className="mt-4 text-center text-xs text-slate-600 lg:col-span-2">
          Server-authoritative matches. No gameplay simulation runs in your
          browser.
        </p>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3">
      <p className="font-display text-xl font-semibold text-slate-200">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
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
      {error && (
        <span className="mt-1 block text-xs text-red-300">{error}</span>
      )}
    </label>
  );
}
