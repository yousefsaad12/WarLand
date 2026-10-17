import { create } from 'zustand';

export type Screen = 'auth' | 'lobby' | 'game';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface UiState {
  screen: Screen;
  toasts: Toast[];
  setScreen: (screen: Screen) => void;
  pushToast: (kind: ToastKind, message: string) => void;
  dismissToast: (id: string) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>()((set) => ({
  screen: 'auth',
  toasts: [],
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
}));
