import { io, type Socket } from 'socket.io-client';
import { GAMEPLAY_NAMESPACE, SERVER_URL } from './config';
import type {
  DeployQueuedPayload,
  DeployResultPayload,
  ErrorPayload,
  GameStartedPayload,
  MatchFinishedPayload,
  MatchFoundPayload,
  MatchTimeoutPayload,
  MatchView,
  QueueJoinedPayload,
  QueueLeftPayload,
} from './protocol';

interface MatchmakingServerEvents {
  queue_joined: (payload: QueueJoinedPayload) => void;
  queue_left: (payload: QueueLeftPayload) => void;
  queue_error: (payload: ErrorPayload) => void;
  match_error: (payload: ErrorPayload) => void;
  match_timeout: (payload: MatchTimeoutPayload) => void;
  match_found: (payload: MatchFoundPayload) => void;
}

interface MatchmakingClientEvents {
  join_queue: () => void;
  leave_queue: () => void;
}

interface GameplayServerEvents {
  game_started: (payload: GameStartedPayload) => void;
  game_state: (payload: MatchView) => void;
  deploy_queued: (payload: DeployQueuedPayload) => void;
  deploy_result: (payload: DeployResultPayload) => void;
  match_finished: (payload: MatchFinishedPayload) => void;
  game_error: (payload: ErrorPayload) => void;
}

interface GameplayClientEvents {
  join_game: (payload: { matchId: string }) => void;
  deploy: (payload: {
    requestId: string;
    cardId: string;
    x: number;
    y: number;
  }) => void;
}

export type MatchmakingSocket = Socket<
  MatchmakingServerEvents,
  MatchmakingClientEvents
>;

export type GameplaySocket = Socket<GameplayServerEvents, GameplayClientEvents>;

export interface DeployCommandInput {
  requestId: string;
  cardId: string;
  x: number;
  y: number;
}

function baseOptions(token: string) {
  return {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10_000,
  };
}

export function createMatchmakingSocket(token: string): MatchmakingSocket {
  return io(SERVER_URL, baseOptions(token)) as MatchmakingSocket;
}

export function createGameplaySocket(token: string): GameplaySocket {
  return io(GAMEPLAY_NAMESPACE, baseOptions(token)) as GameplaySocket;
}
