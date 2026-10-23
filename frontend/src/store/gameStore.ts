import { create } from 'zustand';
import { requestJson } from '@/network/http';
import {
  createGameplaySocket,
  type GameplaySocket,
  type DeployCommandInput,
} from '@/network/socket';
import {
  deployRejectionMessage,
  errorMessage,
  type CardDefinition,
  type DeployResultPayload,
  type GameSide,
  type MatchFoundPayload,
  type MatchResult,
  type MatchView,
  type PlayerReward,
} from '@/network/protocol';

const MAP_SIZE = 100;
const MAP_CENTER = MAP_SIZE / 2;
const JOIN_TIMEOUT_MS = 12_000;
/** Server join deadline is 30s; wait a bit longer for the abandon notice. */
const FROZEN_MATCH_MS = 35_000;

function isInDeploymentZone(
  x: number,
  y: number,
  side: GameSide,
  laneHalfWidth: number,
) {
  if (x < 0 || x > MAP_SIZE || y < 0 || y > MAP_SIZE) return false;
  if (side === 'LEFT') {
    if (x >= MAP_CENTER) return false;
  } else {
    if (x <= MAP_CENTER) return false;
  }
  if (Math.abs(y - MAP_CENTER) > laneHalfWidth) return false;
  return true;
}

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
  /** Attack range per card id (map units), used by the range overlay. */
  cardRanges: Record<string, number>;
  /** Full card definitions for HUD stats (HP / ATK). */
  cardCatalog: Record<string, CardDefinition>;

  joinMatch: (match: MatchFoundPayload, token: string) => void;
  leaveMatch: () => void;
  selectCard: (cardId: string | null) => void;
  deployAt: (x: number, y: number) => DeployFeedback;
  clearFeedback: () => void;
  clearError: () => void;
  loadCardRanges: () => Promise<void>;
}

let socket: GameplaySocket | null = null;
let deploySeq = 0;
let lastDeploy = { key: '', at: 0 };
let joinWatchdog: ReturnType<typeof setTimeout> | null = null;
let frozenWatchdog: ReturnType<typeof setTimeout> | null = null;

function clearJoinWatchdog() {
  if (joinWatchdog) {
    clearTimeout(joinWatchdog);
    joinWatchdog = null;
  }
}

function clearFrozenWatchdog() {
  if (frozenWatchdog) {
    clearTimeout(frozenWatchdog);
    frozenWatchdog = null;
  }
}

function destroySocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.io.removeAllListeners();
  socket.disconnect();
  socket = null;
}

function makeRequestId(playerId: string): string {
  deploySeq += 1;
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${playerId.slice(0, 8)}-${deploySeq}-${uuid}`.slice(0, 120);
}

export const useGameStore = create<GameState>()((set, get) => {
  const failJoin = (message: string) => {
    destroySocket();
    clearJoinWatchdog();
    clearFrozenWatchdog();
    set({ connection: 'disconnected', error: message, view: null });
  };

  const armJoinWatchdog = () => {
    clearJoinWatchdog();
    joinWatchdog = setTimeout(() => {
      joinWatchdog = null;
      const state = get();
      if (state.view || state.result) return;
      failJoin(
        state.connection === 'connecting'
          ? 'Could not connect to the match server. Check that the backend is running, then return to lobby and queue again.'
          : 'Match state never arrived. The server may have restarted — return to lobby and find a new match.',
      );
    }, JOIN_TIMEOUT_MS);
  };

  const armFrozenWatchdog = () => {
    clearFrozenWatchdog();
    frozenWatchdog = setTimeout(() => {
      frozenWatchdog = null;
      const state = get();
      if (state.result) return;
      // Ticks only start once BOTH players have joined the gameplay room.
      if (state.view && state.view.tick === 0 && state.view.status === 'RUNNING') {
        failJoin(
          'Opponent failed to join in time. Return to lobby and queue again.',
        );
      }
    }, FROZEN_MATCH_MS);
  };

  const emitJoin = (matchId: string) => {
    if (!socket) return;
    set({ connection: 'connected', error: null });
    socket.emit('join_game', { matchId });
  };

  return {
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
    cardRanges: {},
    cardCatalog: {},

    joinMatch: (match, token) => {
      const existing = get().matchId;
      if (socket && existing === match.matchId && get().view) return;

      destroySocket();
      clearJoinWatchdog();
      clearFrozenWatchdog();

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
      armJoinWatchdog();

      const onConnected = () => emitJoin(match.matchId);

      next.on('connect', onConnected);
      // Socket.IO can fire `connect` before listeners attach in rare cases.
      if (next.connected) onConnected();

      next.on('disconnect', (reason) => {
        if (reason === 'io client disconnect') {
          set({ connection: 'disconnected' });
        } else {
          set({ connection: 'reconnecting' });
        }
      });
      next.io.on('reconnect_attempt', () => set({ connection: 'reconnecting' }));
      next.io.on('reconnect_failed', () => {
        if (!get().view) {
          failJoin('Could not reconnect to the match server.');
          return;
        }
        set({ connection: 'disconnected' });
      });
      next.on('connect_error', (error) => {
        if (!get().view) {
          failJoin(`Connection failed: ${error.message}`);
          return;
        }
        set({
          connection: 'reconnecting',
          error: `Connection failed: ${error.message}`,
        });
      });

      next.on('game_started', (payload) => {
        clearJoinWatchdog();
        armFrozenWatchdog();
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
        if (payload.tick > 0 || payload.status !== 'RUNNING') {
          clearFrozenWatchdog();
        }
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
          // Room broadcast — ignore opponent / foreign request ids.
          const mine = state.pending.some(
            (p) => p.requestId === payload.requestId,
          );
          if (!mine) return state;

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

      next.on(
        'match_finished',
        (payload: { result: MatchResult; rewards: PlayerReward | null }) => {
          clearFrozenWatchdog();
          set((state) => ({
            result: state.result ?? payload.result,
            rewards: payload.rewards ?? state.rewards,
          }));
        },
      );

      next.on('game_error', (payload) => {
        const message = errorMessage(payload);
        // A join-time error (missing match after server restart, auth, etc.)
        // should stop the spinner instead of hanging forever.
        if (!get().view) {
          failJoin(message);
          return;
        }
        set({ error: message });
      });
    },

    leaveMatch: () => {
      destroySocket();
      clearJoinWatchdog();
      clearFrozenWatchdog();
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
      const command: DeployCommandInput = {
        requestId,
        cardId: card.cardId,
        x,
        y,
      };
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
    clearError: () => set({ error: null }),

    loadCardRanges: async () => {
      if (Object.keys(get().cardRanges).length > 0) return;
      try {
        const cards = await requestJson<CardDefinition[]>('/cards');
        const ranges: Record<string, number> = {};
        const catalog: Record<string, CardDefinition> = {};
        for (const card of cards) {
          ranges[card.id] = card.range;
          catalog[card.id] = card;
        }
        set({ cardRanges: ranges, cardCatalog: catalog });
      } catch {
        // The range overlay is optional; a failure must not break the match.
      }
    },
  };
});
