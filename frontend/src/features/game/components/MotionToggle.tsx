import { useUiStore } from '@/store/uiStore';

/**
 * In-game accessibility toggle. When enabled, every animated effect in the
 * renderer (shake, bloom, slow-motion, pulses) becomes a no-op.
 */
export function MotionToggle() {
  const reduceMotion = useUiStore((s) => s.reduceMotion);
  const toggleReduceMotion = useUiStore((s) => s.toggleReduceMotion);

  return (
    <button
      type="button"
      onClick={toggleReduceMotion}
      aria-pressed={reduceMotion}
      title={
        reduceMotion
          ? 'Reduce motion is on: effects are simplified'
          : 'Reduce motion is off: full effects'
      }
      className={[
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-widest transition-colors',
        reduceMotion
          ? 'border-gold/70 bg-gold/15 text-gold'
          : 'border-line bg-ink-900/70 text-slate-400 hover:text-slate-200',
      ].join(' ')}
    >
      <span
        className={[
          'h-1.5 w-1.5 rounded-full',
          reduceMotion ? 'bg-gold' : 'bg-slate-600',
        ].join(' ')}
      />
      Motion
    </button>
  );
}
