/**
 * Frontend protocol types.
 *
 * These mirror the actual serialized payloads emitted by the Warland backend
 * (NestJS + Socket.IO). They are intentionally defined on the client instead of
 * importing the backend engine, so the frontend build never couples to
 * backend-only dependencies. Keep this file in sync with:
 *   - src/game/engine/engine.ts        (MatchView, MatchResult)
 *   - src/matchmaking/matchmaking.gateway.ts
 *   - src/gameplay/gameplay.gateway.ts
 *   - src/auth/auth.service.ts         (public player shape)
 */

export type GameSide = 'LEFT' | 'RIGHT';

export type MatchStatus = 'RUNNING' | 'FINISHED' | 'CANCELLED';

export type MatchResultReason = 'BASE_DESTROYED' | 'TIME_LIMIT' | 'CANCELLED';

export interface MatchResult {
  winner: GameSide | 'DRAW' | null;
  reason: MatchResultReason;
}

export interface PlayerPublic {
  id: string;
  username: string;
  displayName: string;
  tag: string;
  rating: number;
  level: number;
  wins: number;
  losses: number;
  createdAt: string;
  updatedAt: string;
}

export interface CardDefinition {
  id: string;
  name: string;
  cost: number;
  baseHp: number;
  baseDamage: number;
  attackSpeed: number;
  movementSpeed: number;
  range: number;
}

export interface OwnedCard {
  level: number;
  exp: number;
  expToNext: number;
  maxed: boolean;
  card: CardDefinition;
}

/** Response from POST /auth/login and POST /auth/register. */
export interface AuthResponse {
  accessToken: string;
  player: PlayerPublic;
}

/** Response from GET /players/me and GET /players/:displayName/:tag. */
export interface PlayerProfile {
  id: string;
  displayName: string;
  tag: string;
  rating: number;
  level: number;
  wins: number;
  losses: number;
  winRate: number;
  createdAt: string;
  deck: OwnedCard[];
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  displayName: string;
  tag: string;
  rating: number;
  level: number;
  wins: number;
  losses: number;
  winRate: number;
}

// ---------------------------------------------------------------------------
// Gameplay payloads
// ---------------------------------------------------------------------------

export interface MatchCardView {
  cardId: string;
  name: string;
  cost: number;
}

export interface PlayerView {
  playerId: string;
  baseHp: number;
  energyHundredths: number;
  cards: MatchCardView[];
}

export interface UnitView {
  id: string;
  owner: GameSide;
  cardId: string;
  cardName: string;
  x: number;
  y: number;
  hp: number;
}

/** Matches the backend `MatchView` returned by `toMatchView`. */
export interface MatchView {
  matchId: string;
  status: MatchStatus;
  tick: number;
  maxTicks: number;
  ticksPerSecond: number;
  laneHalfWidth: number;
  maxEnergyHundredths: number;
  players: Record<GameSide, PlayerView>;
  units: UnitView[];
  result?: MatchResult;
}

export interface GameStartedPayload {
  matchId: string;
  side: GameSide;
  state: MatchView;
}

export interface DeployQueuedPayload {
  requestId: string;
}

export type DeployResultPayload =
  | { requestId: string; status: 'ACCEPTED'; unitId: string; replayed: boolean }
  | {
      requestId: string;
      status: 'REJECTED';
      reason: string;
      replayed: boolean;
    }
  | {
      requestId: string;
      status: 'CONFLICT';
      reason: 'REQUEST_ID_REUSED';
      replayed: false;
    };

export interface MatchFinishedPayload {
  result: MatchResult;
  rewards: PlayerReward | null;
}

export type MatchOutcome = 'WIN' | 'LOSS' | 'DRAW';

/** Per-card progression after a match. */
export interface CardProgressReward {
  cardId: string;
  name: string;
  levelBefore: number;
  levelAfter: number;
  expBefore: number;
  expAfter: number;
  expGained: number;
  expToNext: number;
  expToNextBefore: number;
  leveledUp: boolean;
  maxed: boolean;
}

/** End-of-match rewards for the local player. */
export interface PlayerReward {
  playerId: string;
  outcome: MatchOutcome;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  cards: CardProgressReward[];
}

export interface ErrorPayload {
  message: string | string[];
}

// ---------------------------------------------------------------------------
// Matchmaking payloads
// ---------------------------------------------------------------------------

export interface MatchFoundPayload {
  matchId: string;
  opponentId: string;
  opponentName: string;
  opponentTag: string;
}

export interface QueueJoinedPayload {
  status: 'searching';
}

export interface QueueLeftPayload {
  status: 'cancelled';
}

export interface MatchTimeoutPayload {
  message: string;
}

/** User-facing deployment rejection reasons (backend enum + gateway extras). */
export const DEPLOY_REJECTION_MESSAGES: Record<string, string> = {
  INVALID_REQUEST_ID: 'The deployment request was malformed. Try again.',
  PLAYER_NOT_IN_MATCH: 'You are not part of this match.',
  CARD_NOT_IN_DECK: 'That card is not in your deck.',
  INVALID_POSITION: 'That position is not a valid coordinate.',
  OUTSIDE_DEPLOYMENT_ZONE:
    'You can only deploy inside your highlighted deployment zone.',
  INSUFFICIENT_ENERGY: 'Not enough energy for that card.',
  TICK_DEPLOYMENT_LIMIT: 'Too many deployments at once — slow down.',
  REQUEST_ID_REUSED: 'That deployment request id was already used.',
};

export function deployRejectionMessage(reason: string): string {
  return DEPLOY_REJECTION_MESSAGES[reason] ?? `Deployment rejected (${reason}).`;
}

/** Normalises a backend error payload that may be a string or string[]. */
export function errorMessage(payload: unknown): string {
  if (payload == null) return 'Unknown error';
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return 'Unknown error';
}
