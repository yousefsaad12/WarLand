import { Icon } from '@/components/Icon';
import { useUiStore, type ToastKind } from '@/store/uiStore';

const STYLES: Record<ToastKind, string> = {
  info: 'border-line bg-ink-800/95 text-slate-200',
  success: 'border-emerald-700/60 bg-emerald-950/80 text-emerald-100',
  error: 'border-red-800/70 bg-red-950/80 text-red-100',
};

const ICON: Record<ToastKind, string> = {
  info: 'exclamation',
  success: 'checkmark',
  error: 'cross',
};

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className={[
            'animate-rise pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-lg border px-4 py-2 text-left text-sm shadow-lg backdrop-blur break-words',
            STYLES[toast.kind],
          ].join(' ')}
        >
          <Icon name={ICON[toast.kind]} className="h-4 w-4 shrink-0" />
          {toast.message}
        </button>
      ))}
    </div>
  );
}
