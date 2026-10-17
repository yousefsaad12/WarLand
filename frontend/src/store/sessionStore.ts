import { create } from 'zustand';
import * as authApi from '@/network/authApi';
import { ApiError } from '@/network/http';
import type { PlayerPublic } from '@/network/protocol';

export type SessionStatus =
  | 'booting'
  | 'anonymous'
  | 'authenticating'
  | 'authenticated';

const TOKEN_KEY = 'warland.token';

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — session stays in memory only */
  }
}

interface SessionState {
  token: string | null;
  player: PlayerPublic | null;
  status: SessionStatus;
  error: string | null;
  restore: () => Promise<void>;
  login: (input: authApi.LoginInput) => Promise<boolean>;
  register: (input: authApi.RegisterInput) => Promise<boolean>;
  logout: () => void;
  setError: (message: string | null) => void;
  setPlayer: (player: PlayerPublic) => void;
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

export const useSessionStore = create<SessionState>()((set) => ({
  token: readToken(),
  player: null,
  status: 'booting',
  error: null,

  restore: async () => {
    const token = readToken();
    if (!token) {
      set({ token: null, player: null, status: 'anonymous' });
      return;
    }
    set({ token, status: 'booting', error: null });
    try {
      const player = await authApi.fetchMe(token);
      set({ player, status: 'authenticated' });
    } catch {
      writeToken(null);
      set({ token: null, player: null, status: 'anonymous' });
    }
  },

  login: async (input) => {
    set({ status: 'authenticating', error: null });
    try {
      const { accessToken, player } = await authApi.login(input);
      writeToken(accessToken);
      set({ token: accessToken, player, status: 'authenticated', error: null });
      return true;
    } catch (error) {
      set({ status: 'anonymous', error: messageOf(error) });
      return false;
    }
  },

  register: async (input) => {
    set({ status: 'authenticating', error: null });
    try {
      const { accessToken, player } = await authApi.register(input);
      writeToken(accessToken);
      set({ token: accessToken, player, status: 'authenticated', error: null });
      return true;
    } catch (error) {
      set({ status: 'anonymous', error: messageOf(error) });
      return false;
    }
  },

  logout: () => {
    writeToken(null);
    set({ token: null, player: null, status: 'anonymous', error: null });
  },

  setError: (error) => set({ error }),
  setPlayer: (player) => set({ player }),
}));
