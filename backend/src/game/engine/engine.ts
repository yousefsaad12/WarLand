export const GAME_SIDE = {
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
} as const;

export type GameSide = (typeof GAME_SIDE)[keyof typeof GAME_SIDE];

export const MAP_SIZE = 100;
export const STARTER_DECK_SIZE = 4;

const POSITION_EPSILON = 1e-9;
const SEPARATION_PASSES = 3;

export interface CardSnapshot {
  cardId: string;
  name: string;
  level: number;
  cost: number;
  hp: number;
  damage: number;
  attackSpeed: number;
  movementSpeed: number;
  range: number;
}

export interface TurretStats {
  damage: number;
  attackSpeed: number;
  range: number;
}

export interface GameRules {
  ticksPerSecond: number;
  maxTicks: number;
  startingEnergyHundredths: number;
  maxEnergyHundredths: number;
  energyRegenHundredthsPerTick: number;
  baseHp: number;
  baseTurret: TurretStats;
  /** Deploy band is y = 50 +/- laneHalfWidth. */
  laneHalfWidth: number;
  /** Minimum distance between any two units; keep below the smallest card range. */
  unitSeparation: number;
  /** How many ticks a request ID is remembered for replay protection. */
  requestLedgerRetentionTicks: number;
}

export interface PlayerSetup {
  playerId: string;
  cards: CardSnapshot[];
  /**
   * Public display identity. Optional so the pure engine stays usable without
   * a database; when omitted the match view reports an empty name/tag.
   */
  displayName?: string;
  tag?: string;
}

export interface InMatchCard {
  snapshot: CardSnapshot;
  deployedCount: number;
}

export interface PlayerState {
  playerId: string;
  displayName: string;
  tag: string;
  baseHp: number;
  energyHundredths: number;
  turretAttackProgress: number;
  cards: InMatchCard[];
}

export interface UnitState {
  id: string;
  spawnSequence: number;
  owner: GameSide;
  cardId: string;
  x: number;
  y: number;
  hp: number;
  attackProgress: number;
}

/**
 * Sentinel id used by attack events for a base, either as the attacker (a base
 * turret) or as the target. Unit ids are `<matchId>:<spawnSequence>`, so the
 * sentinel can never collide with a real unit id.
 */
export const BASE_EVENT_ID = 'BASE';

/**
 * A single attack that landed during a tick.
 *
 * `attackerId` is the attacking unit's id, or {@link BASE_EVENT_ID} when a
 * base turret fired — `attackerSide` then says which base. `targetId` is the
 * damaged unit's id, or {@link BASE_EVENT_ID} when a base was hit —
 * `targetSide` then says which base.
 *
 * `range` is the attacker's range stat. The client uses it to choose between
 * a melee lunge and a ranged projectile instead of hard-coding card ids,
 * because the match view deliberately does not expose unit stats.
 */
export interface AttackEvent {
  attackerId: string;
  attackerSide?: GameSide;
  targetId: string;
  targetSide?: GameSide;
  damage: number;
  range: number;
  tick: number;
}

export type MatchResultReason =
  | 'BASE_DESTROYED'
  | 'TIME_LIMIT'
  | 'CANCELLED';

export interface MatchResult {
  winner: GameSide | 'DRAW' | null;
  reason: MatchResultReason;
}

export interface DeployCommand {
  requestId: string;
  playerId: string;
  cardId: string;
  x: number;
  y: number;
}

export type DeployRejectionReason =
  | 'INVALID_REQUEST_ID'
  | 'PLAYER_NOT_IN_MATCH'
  | 'CARD_NOT_IN_DECK'
  | 'INVALID_POSITION'
  | 'OUTSIDE_DEPLOYMENT_ZONE'
  | 'INSUFFICIENT_ENERGY';

type StoredDeployResult =
  | { status: 'ACCEPTED'; unitId: string }
  | { status: 'REJECTED'; reason: DeployRejectionReason };

interface RequestLedgerEntry {
  tick: number;
  command: Omit<DeployCommand, 'requestId'>;
  result: StoredDeployResult;
}

export type DeployResult =
  | {
      requestId: string;
      status: 'ACCEPTED';
      unitId: string;
      replayed: boolean;
    }
  | {
      requestId: string;
      status: 'REJECTED';
      reason: DeployRejectionReason;
      replayed: boolean;
    }
  | {
      requestId: string;
      status: 'CONFLICT';
      reason: 'REQUEST_ID_REUSED';
      replayed: false;
    };

export type MatchStatus = 'RUNNING' | 'FINISHED' | 'CANCELLED';

export interface MatchState {
  matchId: string;
  status: MatchStatus;
  tick: number;
  nextSpawnSequence: number;
  rules: GameRules;
  players: Record<GameSide, PlayerState>;
  units: UnitState[];
  requestLedger: Map<string, RequestLedgerEntry>;
  /** Attacks that landed during the most recently resolved tick. */
  events: AttackEvent[];
  result?: MatchResult;
}

export interface MatchView {
  matchId: string;
  status: MatchStatus;
  tick: number;
  maxTicks: number;
  ticksPerSecond: number;
  /** Half-width of the deployment band around y = 50 (y = 50 +/- laneHalfWidth). */
  laneHalfWidth: number;
  maxEnergyHundredths: number;
  players: Record<
    GameSide,
    {
      playerId: string;
      /** Display name of the player. May be empty when unknown. */
      displayName: string;
      /** Four digit discriminator shown as `#tag`. May be empty when unknown. */
      tag: string;
      baseHp: number;
      energyHundredths: number;
      cards: Array<{ cardId: string; name: string; cost: number }>;
    }
  >;
  units: Array<{
    id: string;
    owner: GameSide;
    cardId: string;
    cardName: string;
    x: number;
    y: number;
    hp: number;
  }>;
  /**
   * Attacks that landed during the most recently resolved tick. Present for
   * rendering feedback only — the simulation never reads it back.
   */
  events?: AttackEvent[];
  result?: MatchResult;
}

export interface AdvanceMatchResult {
  state: MatchState;
  deployResults: DeployResult[];
}

export function createMatchState(
  matchId: string,
  left: PlayerSetup,
  right: PlayerSetup,
  rules: GameRules,
): MatchState {
  if (!matchId.trim()) {
    throw new Error('Match ID must not be empty');
  }
  if (!left.playerId.trim() || !right.playerId.trim()) {
    throw new Error('Player IDs must not be empty');
  }
  if (left.playerId === right.playerId) {
    throw new Error('A player cannot occupy both sides of a match');
  }

  validateRules(rules);
  validateDeck(left.cards, rules);
  validateDeck(right.cards, rules);

  const leftCardIds = new Set(left.cards.map((card) => card.cardId));
  if (right.cards.some((card) => !leftCardIds.has(card.cardId))) {
    throw new Error('Both players must use the same starter deck');
  }

  return {
    matchId,
    status: 'RUNNING',
    tick: 0,
    nextSpawnSequence: 1,
    rules: cloneRules(rules),
    players: {
      LEFT: createPlayerState(left, rules),
      RIGHT: createPlayerState(right, rules),
    },
    units: [],
    requestLedger: new Map(),
    events: [],
  };
}

export function advanceMatch(
  state: MatchState,
  commands: DeployCommand[] = [],
): AdvanceMatchResult {
  if (state.status !== 'RUNNING') {
    throw new Error(`Cannot advance a ${state.status.toLowerCase()} match`);
  }
  if (state.tick >= state.rules.maxTicks) {
    throw new Error('Running match has already reached its time limit');
  }

  const next = cloneMatchState(state);

  for (const side of Object.values(next.players)) {
    side.energyHundredths = Math.min(
      next.rules.maxEnergyHundredths,
      side.energyHundredths + next.rules.energyRegenHundredthsPerTick,
    );
  }

  // Deployments are created at the position chosen by the player. They begin
  // moving on the following tick rather than being advanced immediately.
  moveUnits(next);
  const deployResults = commands.map((command) =>
    processDeployCommand(next, command),
  );
  // `next.tick` is incremented right after this call, so the tick recorded on
  // each attack event is the tick the client will see in the match view.
  resolveAttacks(next, next.tick + 1);
  removeDefeatedUnits(next);
  separateUnits(next);

  next.tick += 1;
  pruneRequestLedger(next);
  finishIfRequired(next);

  return { state: next, deployResults };
}

export function cancelMatch(state: MatchState): MatchState {
  if (state.status !== 'RUNNING') {
    throw new Error(`Cannot cancel a ${state.status.toLowerCase()} match`);
  }

  const cancelled = cloneMatchState(state);
  cancelled.status = 'CANCELLED';
  cancelled.result = { winner: null, reason: 'CANCELLED' };
  return cancelled;
}

export function toMatchView(state: MatchState): MatchView {
  const units = state.units.map((unit) => {
    const card = findCard(state.players[unit.owner], unit.cardId);
    if (!card) {
      throw new Error(`Unit ${unit.id} refers to a card outside its deck`);
    }
    return {
      id: unit.id,
      owner: unit.owner,
      cardId: unit.cardId,
      cardName: card.snapshot.name,
      x: unit.x,
      y: unit.y,
      hp: unit.hp,
    };
  });

  const view: MatchView = {
    matchId: state.matchId,
    status: state.status,
    tick: state.tick,
    maxTicks: state.rules.maxTicks,
    ticksPerSecond: state.rules.ticksPerSecond,
    laneHalfWidth: state.rules.laneHalfWidth,
    maxEnergyHundredths: state.rules.maxEnergyHundredths,
    players: {
      LEFT: toPlayerView(state.players.LEFT),
      RIGHT: toPlayerView(state.players.RIGHT),
    },
    units,
    ...(state.events.length > 0
      ? { events: state.events.map((event) => ({ ...event })) }
      : {}),
    ...(state.result ? { result: { ...state.result } } : {}),
  };

  return view;
}

function createPlayerState(setup: PlayerSetup, rules: GameRules): PlayerState {
  return {
    playerId: setup.playerId,
    displayName: setup.displayName ?? '',
    tag: setup.tag ?? '',
    baseHp: rules.baseHp,
    energyHundredths: rules.startingEnergyHundredths,
    turretAttackProgress: 0,
    cards: setup.cards.map((snapshot) => ({
      snapshot: { ...snapshot },
      deployedCount: 0,
    })),
  };
}

function validateRules(rules: GameRules): void {
  requirePositiveInteger(rules.ticksPerSecond, 'ticksPerSecond');
  requirePositiveInteger(rules.maxTicks, 'maxTicks');
  requireNonNegativeInteger(
    rules.startingEnergyHundredths,
    'startingEnergyHundredths',
  );
  requirePositiveInteger(rules.maxEnergyHundredths, 'maxEnergyHundredths');
  requireNonNegativeInteger(
    rules.energyRegenHundredthsPerTick,
    'energyRegenHundredthsPerTick',
  );
  requirePositiveInteger(rules.baseHp, 'baseHp');
  if (rules.startingEnergyHundredths > rules.maxEnergyHundredths) {
    throw new Error('Starting energy cannot exceed maximum energy');
  }

  validateDamage(rules.baseTurret.damage, 'baseTurret.damage');
  validateAttackSpeed(rules.baseTurret.attackSpeed, rules.ticksPerSecond);
  validateRange(rules.baseTurret.range, 'baseTurret.range');

  requireNonNegativeFinite(rules.laneHalfWidth, 'laneHalfWidth');
  if (rules.laneHalfWidth > MAP_SIZE / 2) {
    throw new Error('laneHalfWidth cannot exceed half the map size');
  }
  requireNonNegativeFinite(rules.unitSeparation, 'unitSeparation');
  requirePositiveInteger(
    rules.requestLedgerRetentionTicks,
    'requestLedgerRetentionTicks',
  );
}

function validateDeck(cards: CardSnapshot[], rules: GameRules): void {
  if (cards.length !== STARTER_DECK_SIZE) {
    throw new Error(`A match deck must contain exactly ${STARTER_DECK_SIZE} cards`);
  }

  const cardIds = new Set<string>();
  for (const card of cards) {
    if (!card.cardId.trim() || !card.name.trim()) {
      throw new Error('Card IDs and names must not be empty');
    }
    if (cardIds.has(card.cardId)) {
      throw new Error(`Duplicate card in deck: ${card.cardId}`);
    }
    cardIds.add(card.cardId);

    requirePositiveInteger(card.level, `${card.cardId}.level`);
    requireNonNegativeInteger(card.cost, `${card.cardId}.cost`);
    validateDamage(card.hp, `${card.cardId}.hp`);
    validateDamage(card.damage, `${card.cardId}.damage`);
    validateAttackSpeed(
      card.attackSpeed,
      rules.ticksPerSecond,
      `${card.cardId}.attackSpeed`,
    );
    requireNonNegativeFinite(card.movementSpeed, `${card.cardId}.movementSpeed`);
    validateRange(card.range, `${card.cardId}.range`);
  }
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
}

function requireNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
}

function validateDamage(value: number, name: string): void {
  requirePositiveInteger(value, name);
}

function validateRange(value: number, name: string): void {
  requireNonNegativeFinite(value, name);
}

function validateAttackSpeed(
  value: number,
  ticksPerSecond: number,
  name = 'attackSpeed',
): void {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    value > ticksPerSecond
  ) {
    throw new Error(
      `${name} must be greater than 0 and no more than ${ticksPerSecond} attacks per second`,
    );
  }
}

function processDeployCommand(
  state: MatchState,
  command: DeployCommand,
): DeployResult {
  if (!command.requestId.trim() || command.requestId.length > 128) {
    return {
      requestId: command.requestId,
      status: 'REJECTED',
      reason: 'INVALID_REQUEST_ID',
      replayed: false,
    };
  }

  const payload = {
    playerId: command.playerId,
    cardId: command.cardId,
    x: command.x,
    y: command.y,
  };
  const previous = state.requestLedger.get(command.requestId);
  if (previous) {
    if (!sameCommand(previous.command, payload)) {
      return {
        requestId: command.requestId,
        status: 'CONFLICT',
        reason: 'REQUEST_ID_REUSED',
        replayed: false,
      };
    }
    return { requestId: command.requestId, ...previous.result, replayed: true };
  }

  const side = findSideByPlayerId(state, command.playerId);
  if (!side) {
    return recordRejected(state, command, payload, 'PLAYER_NOT_IN_MATCH');
  }

  const card = findCard(state.players[side], command.cardId);
  if (!card) {
    return recordRejected(state, command, payload, 'CARD_NOT_IN_DECK');
  }

  if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) {
    return recordRejected(state, command, payload, 'INVALID_POSITION');
  }

  const inBounds =
    command.x >= 0 &&
    command.x <= MAP_SIZE &&
    command.y >= 0 &&
    command.y <= MAP_SIZE;
  // Strict comparison: nobody may deploy exactly on the river line (x = 50).
  const inOwnHalf =
    side === GAME_SIDE.LEFT
      ? command.x < MAP_SIZE / 2
      : command.x > MAP_SIZE / 2;
  const inLane =
    Math.abs(command.y - MAP_SIZE / 2) <= state.rules.laneHalfWidth;
  if (!inBounds || !inOwnHalf || !inLane) {
    return recordRejected(
      state,
      command,
      payload,
      'OUTSIDE_DEPLOYMENT_ZONE',
    );
  }

  const costHundredths = card.snapshot.cost * 100;
  const player = state.players[side];
  if (player.energyHundredths < costHundredths) {
    return recordRejected(state, command, payload, 'INSUFFICIENT_ENERGY');
  }

  const unitId = `${state.matchId}:${state.nextSpawnSequence}`;
  const result: StoredDeployResult = { status: 'ACCEPTED', unitId };
  player.energyHundredths -= costHundredths;
  card.deployedCount += 1;
  state.units.push({
    id: unitId,
    spawnSequence: state.nextSpawnSequence,
    owner: side,
    cardId: card.snapshot.cardId,
    x: command.x,
    y: command.y,
    hp: card.snapshot.hp,
    attackProgress: 0,
  });
  state.nextSpawnSequence += 1;
  state.requestLedger.set(command.requestId, {
    tick: state.tick,
    command: payload,
    result,
  });

  return { requestId: command.requestId, ...result, replayed: false };
}

function recordRejected(
  state: MatchState,
  command: DeployCommand,
  payload: Omit<DeployCommand, 'requestId'>,
  reason: DeployRejectionReason,
): DeployResult {
  const result: StoredDeployResult = { status: 'REJECTED', reason };
  state.requestLedger.set(command.requestId, {
    tick: state.tick,
    command: payload,
    result,
  });
  return { requestId: command.requestId, ...result, replayed: false };
}

function sameCommand(
  first: RequestLedgerEntry['command'],
  second: RequestLedgerEntry['command'],
): boolean {
  return (
    first.playerId === second.playerId &&
    first.cardId === second.cardId &&
    Object.is(first.x, second.x) &&
    Object.is(first.y, second.y)
  );
}

function findSideByPlayerId(
  state: MatchState,
  playerId: string,
): GameSide | undefined {
  if (state.players.LEFT.playerId === playerId) {
    return GAME_SIDE.LEFT;
  }
  if (state.players.RIGHT.playerId === playerId) {
    return GAME_SIDE.RIGHT;
  }
  return undefined;
}

function findCard(
  player: PlayerState,
  cardId: string,
): InMatchCard | undefined {
  return player.cards.find((card) => card.snapshot.cardId === cardId);
}

function moveUnits(state: MatchState): void {
  const startPositions = new Map(
    state.units.map((unit) => [
      unit.spawnSequence,
      { x: unit.x, y: unit.y },
    ]),
  );

  for (const unit of state.units) {
    const ownPlayer = state.players[unit.owner];
    const card = findCard(ownPlayer, unit.cardId);
    if (!card) {
      throw new Error(`Unit ${unit.id} refers to a card outside its deck`);
    }

    const start = startPositions.get(unit.spawnSequence);
    if (!start) {
      throw new Error(`Unit ${unit.id} has no starting position`);
    }

    const enemies = state.units
      .filter((other) => other.owner !== unit.owner)
      .map((other) => {
        const position = startPositions.get(other.spawnSequence);
        if (!position) {
          throw new Error(`Unit ${other.id} has no starting position`);
        }
        return { unit: other, position };
      });

    if (
      enemies.some(
        ({ position }) =>
          distance(start, position) <= card.snapshot.range + POSITION_EPSILON,
      )
    ) {
      continue;
    }

    const basePosition = getBasePosition(
      oppositeSide(unit.owner),
      state.rules,
    );
    const distanceToBase = distance(start, basePosition);
    const distanceToMove = Math.min(
      card.snapshot.movementSpeed / state.rules.ticksPerSecond,
      Math.max(0, distanceToBase - card.snapshot.range),
    );
    if (distanceToMove <= POSITION_EPSILON || distanceToBase === 0) {
      continue;
    }

    const scale = distanceToMove / distanceToBase;
    const intendedEnd = {
      x: start.x + (basePosition.x - start.x) * scale,
      y: start.y + (basePosition.y - start.y) * scale,
    };

    const firstEnemyRange = findFirstRangeEntry(
      start,
      intendedEnd,
      enemies,
      card.snapshot.range,
    );
    if (firstEnemyRange) {
      unit.x =
        start.x + (intendedEnd.x - start.x) * firstEnemyRange.fraction;
      unit.y =
        start.y + (intendedEnd.y - start.y) * firstEnemyRange.fraction;
    } else {
      unit.x = intendedEnd.x;
      unit.y = intendedEnd.y;
    }
  }
}

function findFirstRangeEntry(
  start: { x: number; y: number },
  end: { x: number; y: number },
  enemies: Array<{ unit: UnitState; position: { x: number; y: number } }>,
  range: number,
): { fraction: number; spawnSequence: number } | undefined {
  let first: { fraction: number; spawnSequence: number } | undefined;

  for (const enemy of enemies) {
    const fraction = segmentCircleEntryFraction(
      start,
      end,
      enemy.position,
      range,
    );
    if (fraction === undefined) {
      continue;
    }

    if (
      !first ||
      fraction < first.fraction - POSITION_EPSILON ||
      (Math.abs(fraction - first.fraction) <= POSITION_EPSILON &&
        enemy.unit.spawnSequence < first.spawnSequence)
    ) {
      first = { fraction, spawnSequence: enemy.unit.spawnSequence };
    }
  }

  return first;
}

function segmentCircleEntryFraction(
  start: { x: number; y: number },
  end: { x: number; y: number },
  center: { x: number; y: number },
  radius: number,
): number | undefined {
  if (distance(start, center) <= radius + POSITION_EPSILON) {
    return 0;
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return undefined;
  }

  const projection =
    ((center.x - start.x) * dx + (center.y - start.y) * dy) /
    lengthSquared;

  const closestX = start.x + projection * dx;
  const closestY = start.y + projection * dy;
  const closestDistance = distance({ x: closestX, y: closestY }, center);
  if (closestDistance > radius + POSITION_EPSILON) {
    return undefined;
  }

  const halfChord = Math.sqrt(
    Math.max(0, radius * radius - closestDistance * closestDistance) /
      lengthSquared,
  );
  const entry = projection - halfChord;
  const exit = projection + halfChord;
  if (exit < -POSITION_EPSILON || entry > 1 + POSITION_EPSILON) {
    return undefined;
  }

  return Math.min(1, Math.max(0, entry));
}

function resolveAttacks(state: MatchState, eventTick: number): void {
  state.events = [];
  const unitDamage = new Map<number, number>();
  const baseDamage: Record<GameSide, number> = { LEFT: 0, RIGHT: 0 };

  for (const unit of state.units) {
    const card = findCard(state.players[unit.owner], unit.cardId);
    if (!card) {
      throw new Error(`Unit ${unit.id} refers to a card outside its deck`);
    }

    const enemy = findNearestEnemyInRange(state, unit, card.snapshot.range);
    const enemyBase = getBasePosition(oppositeSide(unit.owner), state.rules);
    const attacksBase =
      !enemy &&
      distance(unit, enemyBase) <= card.snapshot.range + POSITION_EPSILON;
    const attackCount = advanceAttackProgress(
      unit,
      card.snapshot.attackSpeed,
      state.rules.ticksPerSecond,
      Boolean(enemy) || attacksBase,
    );
    if (attackCount === 0) {
      continue;
    }

    if (enemy) {
      unitDamage.set(
        enemy.spawnSequence,
        (unitDamage.get(enemy.spawnSequence) ?? 0) +
          attackCount * card.snapshot.damage,
      );
      for (let i = 0; i < attackCount; i += 1) {
        state.events.push({
          attackerId: unit.id,
          targetId: enemy.id,
          damage: card.snapshot.damage,
          range: card.snapshot.range,
          tick: eventTick,
        });
      }
    } else if (attacksBase) {
      const enemySide = oppositeSide(unit.owner);
      baseDamage[enemySide] += attackCount * card.snapshot.damage;
      for (let i = 0; i < attackCount; i += 1) {
        state.events.push({
          attackerId: unit.id,
          targetId: BASE_EVENT_ID,
          targetSide: enemySide,
          damage: card.snapshot.damage,
          range: card.snapshot.range,
          tick: eventTick,
        });
      }
    }
  }

  for (const side of [GAME_SIDE.LEFT, GAME_SIDE.RIGHT] as const) {
    const player = state.players[side];
    const basePosition = getBasePosition(side, state.rules);
    const target = findNearestUnitInRange(
      state.units.filter((unit) => unit.owner !== side),
      basePosition,
      state.rules.baseTurret.range,
    );
    const attackCount = advancePlayerTurretProgress(
      player,
      state.rules.baseTurret.attackSpeed,
      state.rules.ticksPerSecond,
      Boolean(target),
    );
    if (target && attackCount > 0) {
      unitDamage.set(
        target.spawnSequence,
        (unitDamage.get(target.spawnSequence) ?? 0) +
          attackCount * state.rules.baseTurret.damage,
      );
      for (let i = 0; i < attackCount; i += 1) {
        state.events.push({
          attackerId: BASE_EVENT_ID,
          attackerSide: side,
          targetId: target.id,
          damage: state.rules.baseTurret.damage,
          range: state.rules.baseTurret.range,
          tick: eventTick,
        });
      }
    }
  }

  for (const unit of state.units) {
    unit.hp = Math.max(
      0,
      unit.hp - (unitDamage.get(unit.spawnSequence) ?? 0),
    );
  }
  state.players.LEFT.baseHp = Math.max(
    0,
    state.players.LEFT.baseHp - baseDamage.LEFT,
  );
  state.players.RIGHT.baseHp = Math.max(
    0,
    state.players.RIGHT.baseHp - baseDamage.RIGHT,
  );
}

function findNearestEnemyInRange(
  state: MatchState,
  unit: UnitState,
  range: number,
): UnitState | undefined {
  return findNearestUnitInRange(
    state.units.filter((other) => other.owner !== unit.owner),
    unit,
    range,
  );
}

function findNearestUnitInRange(
  candidates: UnitState[],
  origin: { x: number; y: number },
  range: number,
): UnitState | undefined {
  let nearest: UnitState | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const candidateDistance = distance(origin, candidate);
    if (candidateDistance > range + POSITION_EPSILON) {
      continue;
    }
    if (
      candidateDistance < nearestDistance - POSITION_EPSILON ||
      (Math.abs(candidateDistance - nearestDistance) <= POSITION_EPSILON &&
        (!nearest || candidate.spawnSequence < nearest.spawnSequence))
    ) {
      nearest = candidate;
      nearestDistance = candidateDistance;
    }
  }

  return nearest;
}

function advanceAttackProgress(
  unit: UnitState,
  attackSpeed: number,
  ticksPerSecond: number,
  hasTarget: boolean,
): number {
  const progress = unit.attackProgress + attackSpeed / ticksPerSecond;
  if (!hasTarget) {
    unit.attackProgress = Math.min(1, progress);
    return 0;
  }

  const attackCount = Math.floor(progress + POSITION_EPSILON);
  unit.attackProgress = progress - attackCount;
  return attackCount;
}

function advancePlayerTurretProgress(
  player: PlayerState,
  attackSpeed: number,
  ticksPerSecond: number,
  hasTarget: boolean,
): number {
  const progress = player.turretAttackProgress + attackSpeed / ticksPerSecond;
  if (!hasTarget) {
    player.turretAttackProgress = Math.min(1, progress);
    return 0;
  }

  const attackCount = Math.floor(progress + POSITION_EPSILON);
  player.turretAttackProgress = progress - attackCount;
  return attackCount;
}

function removeDefeatedUnits(state: MatchState): void {
  state.units = state.units.filter((unit) => unit.hp > 0);
}

/**
 * Pushes overlapping units apart so they never share one point.
 * Deterministic: units are processed in spawn order, and exact overlaps
 * split along the y axis.
 */
function separateUnits(state: MatchState): void {
  const minDistance = state.rules.unitSeparation;
  if (minDistance <= 0 || state.units.length < 2) {
    return;
  }

  for (let pass = 0; pass < SEPARATION_PASSES; pass += 1) {
    for (let i = 0; i < state.units.length; i += 1) {
      for (let j = i + 1; j < state.units.length; j += 1) {
        const a = state.units[i]!;
        const b = state.units[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const gap = Math.hypot(dx, dy);
        if (gap >= minDistance) {
          continue;
        }

        const nx = gap <= POSITION_EPSILON ? 0 : dx / gap;
        const ny = gap <= POSITION_EPSILON ? 1 : dy / gap;
        const push = (minDistance - gap) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }

  for (const unit of state.units) {
    unit.x = Math.min(MAP_SIZE, Math.max(0, unit.x));
    unit.y = Math.min(MAP_SIZE, Math.max(0, unit.y));
  }
}

function pruneRequestLedger(state: MatchState): void {
  const cutoff = state.tick - state.rules.requestLedgerRetentionTicks;
  for (const [requestId, entry] of state.requestLedger) {
    if (entry.tick < cutoff) {
      state.requestLedger.delete(requestId);
    }
  }
}

function finishIfRequired(state: MatchState): void {
  const leftDestroyed = state.players.LEFT.baseHp <= 0;
  const rightDestroyed = state.players.RIGHT.baseHp <= 0;

  if (leftDestroyed || rightDestroyed) {
    state.status = 'FINISHED';
    state.result = {
      winner:
        leftDestroyed && rightDestroyed
          ? 'DRAW'
          : leftDestroyed
            ? GAME_SIDE.RIGHT
            : GAME_SIDE.LEFT,
      reason: 'BASE_DESTROYED',
    };
    return;
  }

  if (state.tick >= state.rules.maxTicks) {
    state.status = 'FINISHED';
    state.result = {
      winner:
        state.players.LEFT.baseHp === state.players.RIGHT.baseHp
          ? 'DRAW'
          : state.players.LEFT.baseHp > state.players.RIGHT.baseHp
            ? GAME_SIDE.LEFT
            : GAME_SIDE.RIGHT,
      reason: 'TIME_LIMIT',
    };
  }
}

function getBasePosition(
  side: GameSide,
  _rules: GameRules,
): { x: number; y: number } {
  return {
    x: side === GAME_SIDE.LEFT ? 0 : MAP_SIZE,
    y: MAP_SIZE / 2,
  };
}

function oppositeSide(side: GameSide): GameSide {
  return side === GAME_SIDE.LEFT ? GAME_SIDE.RIGHT : GAME_SIDE.LEFT;
}

function distance(
  first: { x: number; y: number },
  second: { x: number; y: number },
): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function toPlayerView(player: PlayerState): MatchView['players'][GameSide] {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    tag: player.tag,
    baseHp: player.baseHp,
    energyHundredths: player.energyHundredths,
    cards: player.cards.map(({ snapshot }) => ({
      cardId: snapshot.cardId,
      name: snapshot.name,
      cost: snapshot.cost,
    })),
  };
}

function cloneRules(rules: GameRules): GameRules {
  return {
    ...rules,
    baseTurret: { ...rules.baseTurret },
  };
}

function cloneMatchState(state: MatchState): MatchState {
  return {
    matchId: state.matchId,
    status: state.status,
    tick: state.tick,
    nextSpawnSequence: state.nextSpawnSequence,
    rules: cloneRules(state.rules),
    players: {
      LEFT: clonePlayerState(state.players.LEFT),
      RIGHT: clonePlayerState(state.players.RIGHT),
    },
    units: state.units.map((unit) => ({ ...unit })),
    requestLedger: new Map(
      [...state.requestLedger.entries()].map(([requestId, entry]) => [
        requestId,
        {
          tick: entry.tick,
          command: { ...entry.command },
          result: { ...entry.result },
        },
      ]),
    ),
    events: state.events.map((event) => ({ ...event })),
    ...(state.result ? { result: { ...state.result } } : {}),
  };
}

function clonePlayerState(player: PlayerState): PlayerState {
  return {
    ...player,
    cards: player.cards.map((card) => ({
      snapshot: { ...card
        .snapshot },
      deployedCount: card.deployedCount,
    })),
  };
}