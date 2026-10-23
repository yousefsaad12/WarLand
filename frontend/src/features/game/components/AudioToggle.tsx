import { useUiStore } from '@/store/uiStore';

/**
 * In-game and lobby audio toggle. Controls Web Audio SFX generation.
 */
export function AudioToggle() {
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const toggleSound = useUiStore((s) => s.toggleSound);

  return (
    <button
      type="button"
      onClick={toggleSound}
      aria-pressed={soundEnabled}
      title={soundEnabled ? 'Mute sound effects' : 'Unmute sound effects'}
      className={[
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-widest transition-colors',
        soundEnabled
          ? 'border-gold/70 bg-gold/15 text-gold'
          : 'border-line bg-ink-900/70 text-slate-400 hover:text-slate-200',
      ].join(' ')}
    >
      <span
        className={[
          'h-1.5 w-1.5 rounded-full',
          soundEnabled ? 'bg-gold' : 'bg-slate-600',
        ].join(' ')}
      />
      {soundEnabled ? 'SFX On' : 'SFX Off'}
    </button>
  );
}
