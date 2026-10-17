import { create } from 'zustand';
import {
  createGameplaySocket,
  type GameplaySocket,
  type DeployCommandInput,
} from '@/network/socket';
import {
  deployRejectionMessage,
  errorMessage,
  type DeployResultPayload,
  type GameSide,
  type MatchFoundPayload,
  type MatchResult,
  type MatchView,
  type PlayerReward,
} from '@/network/protocol';
import { isInDeploymentZone } from '@/game/renderer/coordinates';

export type GameConnection =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export interface PendingDeploy {
  requestId: string;
  cardId: string;
  x: number;
  y: number;
  sentAt: number;
  queued: boolean;
}

export interface DeployFeedback {
  ok: boolean;
  message: string;
  at: number;
}

interface GameState {
  connection: GameConnection;
  matchId: string | null;
  side: GameSide | null;
  opponentName: string | null;
  opponentTag: string | null;
  view: MatchView | null;
  selectedCardId: string | null;
  pending: PendingDeploy[];
  lastFeedback: DeployFeedback | null;
  result: MatchResult | null;
  rewards: PlayerReward | null;
  error: string | null;
  joinedAt: number | null;

  joinMatch: (match: MatchFoundPayload, token: string) => void;
  leaveMatch: () => void;
  selectCard: (cardId: string | null) => void;
  deployAt: (x: number, y: number) => DeployFeedback;
  clearFeedback: () => void;
}

let socket: GameplaySocket | null = null;
let deploySeq = 0;
let lastDeploy = { key: '', at: 0 };

function makeRequestId(playerId: string): string {
  deploySeq += 1;
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${playerId.slice(0, 8)}-${deploySeq}-${uuid}`.slice(0, 120);
}

export const useGameStore = create<GameState>()((set, get) => ({
  connection: 'idle',
  matchId: null,
  side: null,
  opponentName: null,
  opponentTag: null,
  view: null,
  selectedCardId: null,
  pending: [],
  lastFeedback: null,
  result: null,
  rewards: null,
  error: null,
  joinedAt: null,

  joinMatch: (match, token) => {
    const existing = get().matchId;
    if (socket && existing === match.matchId) return;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }

    set({
      connection: 'connecting',
      matchId: match.matchId,
      side: null,
      opponentName: match.opponentName,
      opponentTag: match.opponentTag,
      view: null,
      selectedCardId: null,
      pending: [],
      lastFeedback: null,
      result: null,
      rewards: null,
      error: null,
      joinedAt: Date.now(),
    });

    const next = createGameplaySocket(token);
    socket = next;

    next.on('connect', () => {
      set({ connection: 'connected' });
      next.emit('join_game', { matchId: match.matchId });
    });
    next.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        set({ connection: 'disconnected' });
      } else {
        set({ connection: 'reconnecting' });
      }
    });
    next.io.on('reconnect_attempt', () => set({ connection: 'reconnecting' }));
    next.io.on('reconnect_failed', () =>
      set({ connection: 'disconnected' }),
    );
    next.on('connect_error', (error) =>
      set({
        connection: 'disconnected',
        error: `Connection failed: ${error.message}`,
      }),
    );

    next.on('game_started', (payload) => {
      const hand = payload.state.players[payload.side].cards;
      set({
        connection: 'connected',
        side: payload.side,
        view: payload.state,
        selectedCardId: hand[0]?.cardId ?? null,
        result: payload.state.result ?? get().result,
        error: null,
      });
    });

    next.on('game_state', (payload) => {
      const state = get();
      set({
        view: payload,
        ...(payload.result && !state.result ? { result: payload.result } : {}),
      });
    });

    next.on('deploy_queued', ({ requestId }) => {
      set((state) => ({
        pending: state.pending.map((p) =>
          p.requestId === requestId ? { ...p, queued: true } : p,
        ),
      }));
    });

    next.on('deploy_result', (payload: DeployResultPayload) => {
      set((state) => {
        const pending = state.pending.filter(
          (p) => p.requestId !== payload.requestId,
        );
        if (payload.status === 'ACCEPTED') {
          return { pending };
        }
        return {
          pending,
          lastFeedback: {
            ok: false,
            message: deployRejectionMessage(payload.reason),
            at: Date.now(),
          },
        };
      });
    });

    next.on('match_finished', (payload: { result: MatchResult; rewards: PlayerReward | null }) => {
      set((state) => ({
        result: state.result ?? payload.result,
        rewards: payload.rewards ?? state.rewards,
      }));
    });

    next.on('game_error', (payload) => {
      set({ error: errorMessage(payload) });
    });
  },

  leaveMatch: () => {
    if (socket) {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    lastDeploy = { key: '', at: 0 };
    set({
      connection: 'idle',
      matchId: null,
      side: null,
      opponentName: null,
      opponentTag: null,
      view: null,
      selectedCardId: null,
      pending: [],
      lastFeedback: null,
      result: null,
      rewards: null,
      error: null,
      joinedAt: null,
    });
  },

  selectCard: (cardId) =>
    set((state) => ({
      selectedCardId: state.selectedCardId === cardId ? null : cardId,
    })),

  deployAt: (x, y) => {
    const state = get();
    const now = Date.now();

    if (!socket || socket.disconnected) {
      return { ok: false, message: 'Not connected.', at: now };
    }
    if (!state.view || state.view.status !== 'RUNNING') {
      return { ok: false, message: 'The match is not running.', at: now };
    }
    if (!state.side || !state.selectedCardId) {
      return { ok: false, message: 'Select a card first.', at: now };
    }

    const player = state.view.players[state.side];
    const card = player.cards.find((c) => c.cardId === state.selectedCardId);
    if (!card) {
      return { ok: false, message: 'That card is not in your hand.', at: now };
    }

    // Client-side UX checks only. The server remains authoritative.
    if (player.energyHundredths < card.cost * 100) {
      return { ok: false, message: 'Not enough energy.', at: now };
    }
    if (!isInDeploymentZone(x, y, state.side, state.view.laneHalfWidth)) {
      return {
        ok: false,
        message: 'Outside your deployment zone.',
        at: now,
      };
    }

    // Guard against accidental duplicate clicks (double-tap) while still
    // allowing legitimate retries: identical card + snapped position within
    // a short window is treated as one command.
    const key = `${card.cardId}:${Math.round(x)}:${Math.round(y)}`;
    if (key === lastDeploy.key && now - lastDeploy.at < 220) {
      return { ok: false, message: 'Already deploying…', at: now };
    }
    lastDeploy = { key, at: now };

    const requestId = makeRequestId(player.playerId);
    const command: DeployCommandInput = { requestId, cardId: card.cardId, x, y };
    set((s) => ({
      pending: [
        ...s.pending,
        { requestId, cardId: card.cardId, x, y, sentAt: now, queued: false },
      ],
      lastFeedback: null,
    }));
    socket.emit('deploy', command);
    return { ok: true, message: 'Deploying…', at: now };
  },

  clearFeedback: () => set({ lastFeedback: null }),
}));
