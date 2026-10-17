import { create } from 'zustand';
import { createMatchmakingSocket, type MatchmakingSocket } from '@/network/socket';
import { errorMessage, type MatchFoundPayload } from '@/network/protocol';

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export type QueueState = 'idle' | 'searching' | 'matched';

interface MatchmakingState {
  connection: ConnectionState;
  queue: QueueState;
  error: string | null;
  match: MatchFoundPayload | null;
  connect: (token: string) => void;
  disconnect: () => void;
  joinQueue: () => void;
  leaveQueue: () => void;
  clearMatch: () => void;
  clearError: () => void;
}

let socket: MatchmakingSocket | null = null;

export const useMatchmakingStore = create<MatchmakingState>()((set, get) => ({
  connection: 'idle',
  queue: 'idle',
  error: null,
  match: null,

  connect: (token) => {
    if (socket) return;
    set({ connection: 'connecting', error: null });
    const next = createMatchmakingSocket(token);
    socket = next;

    next.on('connect', () => set({ connection: 'connected' }));
    next.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        set({ connection: 'disconnected' });
      } else {
        set({ connection: 'reconnecting' });
      }
    });
    next.io.on('reconnect_attempt', () => set({ connection: 'reconnecting' }));
    next.io.on('reconnect_failed', () =>
      set({ connection: 'disconnected', queue: 'idle' }),
    );
    next.on('connect_error', (error) =>
      set({
        connection: 'disconnected',
        error: `Connection failed: ${error.message}`,
      }),
    );

    next.on('queue_joined', () => set({ queue: 'searching', error: null }));
    next.on('queue_left', () => set({ queue: 'idle' }));
    next.on('queue_error', (payload) =>
      set({ queue: 'idle', error: errorMessage(payload) }),
    );
    next.on('match_error', (payload) => {
      const message = errorMessage(payload);
      set((state) =>
        state.match ? { error: message } : { queue: 'idle', error: message },
      );
    });
    next.on('match_timeout', (payload) =>
      set({ queue: 'idle', error: errorMessage(payload) }),
    );
    next.on('match_found', (payload) => {
      const current = get().match;
      if (current && current.matchId === payload.matchId) return;
      set({ queue: 'matched', match: payload, error: null });
    });
  },

  disconnect: () => {
    if (socket) {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    set({ connection: 'idle', queue: 'idle', match: null });
  },

  joinQueue: () => {
    if (!socket || socket.disconnected) {
      set({ error: 'Not connected to the server. Reconnecting…' });
      return;
    }
    if (get().queue === 'searching' || get().queue === 'matched') return;
    set({ queue: 'searching', error: null });
    socket.emit('join_queue');
  },

  leaveQueue: () => {
    if (socket && !socket.disconnected) socket.emit('leave_queue');
    set({ queue: 'idle' });
  },

  clearMatch: () => set({ match: null, queue: 'idle' }),
  clearError: () => set({ error: null }),
}));
