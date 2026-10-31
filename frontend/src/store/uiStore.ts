import { create } from 'zustand';
import { sfx } from '@/phaser/audio/SfxManager';

export type Screen = 'auth' | 'lobby' | 'leaderboard' | 'game';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

const REDUCE_MOTION_KEY = 'warland.reduceMotion';
const SOUND_KEY = 'warland.soundEnabled';

function readReduceMotion(): boolean {
  try {
    return window.localStorage.getItem(REDUCE_MOTION_KEY) === '1';
  } catch {
    return false;
  }
}

function writeReduceMotion(value: boolean): void {
  try {
    window.localStorage.setItem(REDUCE_MOTION_KEY, value ? '1' : '0');
  } catch {
    /* storage unavailable — the preference stays in memory only */
  }
}

function readSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeSoundEnabled(value: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, value ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

interface UiState {
  screen: Screen;
  toasts: Toast[];
  /**
   * When enabled, every animated effect (shake, bloom, slow-motion, pulses)
   * becomes a no-op. Persisted across sessions.
   */
  reduceMotion: boolean;
  soundEnabled: boolean;
  setScreen: (screen: Screen) => void;
  pushToast: (kind: ToastKind, message: string) => void;
  dismissToast: (id: string) => void;
  setReduceMotion: (value: boolean) => void;
  toggleReduceMotion: () => void;
  toggleSound: () => void;
}

let toastSeq = 0;
const initialSound = readSoundEnabled();
sfx.setEnabled(initialSound);

export const useUiStore = create<UiState>()((set, get) => ({
  screen: 'auth',
  toasts: [],
  reduceMotion: readReduceMotion(),
  soundEnabled: initialSound,
  setScreen: (screen) => set({ screen }),
  pushToast: (kind, message) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { id: `toast-${(toastSeq += 1)}`, kind, message },
      ].slice(-4),
    })),
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  setReduceMotion: (value) => {
    writeReduceMotion(value);
    set({ reduceMotion: value });
  },
  toggleReduceMotion: () => {
    const next = !get().reduceMotion;
    writeReduceMotion(next);
    set({ reduceMotion: next });
  },
  toggleSound: () => {
    const next = !get().soundEnabled;
    writeSoundEnabled(next);
    sfx.setEnabled(next);
    set({ soundEnabled: next });
  },
}));
