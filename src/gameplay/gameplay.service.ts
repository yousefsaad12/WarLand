import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import type {
  MatchState,
  CardSnapshot,
  PlayerSetup,
  DeployCommand,
  AdvanceMatchResult,
  MatchResult,
} from '../game/engine/engine';
import {
  createMatchState,
  toMatchView,
  advanceMatch,
} from '../game/engine/engine.js';
import {
  DEFAULT_GAME_RULES,
  MATCH_CARD_EXP,
  applyCardExp,
  cardExpToNextLevel,
  scaleStatByLevel,
  CARD_LEVEL_HP_BONUS,
  CARD_LEVEL_DAMAGE_BONUS,
  CARD_MAX_LEVEL,
  type MatchOutcome,
} from '../game/balance.js';
import { DbService } from '../prisma/db.js';
import { ActivePlayers } from '../matchmaking/active-players.store.js';

const JOIN_DEADLINE_MS = 30_000;
const ELO_K_FACTOR = 32;

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

export interface PlayerReward {
  playerId: string;
  outcome: MatchOutcome;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  cards: CardProgressReward[];
}

export interface MatchRewards {
  result: MatchResult;
  players: Record<'LEFT' | 'RIGHT', PlayerReward>;
}

@Injectable()
export class GameplayService implements OnModuleDestroy {
  private readonly matchStates: Map<string, MatchState> = new Map();
  private readonly joinedMatches: Set<string> = new Set();
  private readonly joinDeadlines: Map<
    string,
    ReturnType<typeof setTimeout>
  > = new Map();

  constructor(
    private readonly dbService: DbService,
    private readonly activePlayers: ActivePlayers,
  ) {}

  onModuleDestroy() {
    for (const timer of this.joinDeadlines.values()) {
      clearTimeout(timer);
    }
    this.joinDeadlines.clear();
    this.joinedMatches.clear();
    this.matchStates.clear();
  }

  async startMatch(matchId: string, player1Id: string, player2Id: string) {
    const [player1Cards, player2Cards] = await Promise.all([
      this.fetchPlayerCards(player1Id),
      this.fetchPlayerCards(player2Id),
    ]);

    const player1CardSnapshots = this.mapPlayerCardsToSnapshots(player1Cards);
    const player2CardSnapshots = this.mapPlayerCardsToSnapshots(player2Cards);
    const player1Setup: PlayerSetup = {
      playerId: player1Id,
      cards: player1CardSnapshots,
    };
    const player2Setup: PlayerSetup = {
      playerId: player2Id,
      cards: player2CardSnapshots,
    };
    const matchState = createMatchState(
      matchId,
      player1Setup,
      player2Setup,
      DEFAULT_GAME_RULES,
    );

    this.matchStates.set(matchId, matchState);
    this.scheduleJoinDeadline(matchId);
    return matchState;
  }

  getMatchViewForPlayer(matchId: string, playerId: string) {
    const matchState = this.getMatchState(matchId);

    const isParticipant =
      matchState.players.LEFT.playerId === playerId ||
      matchState.players.RIGHT.playerId === playerId;

    if (!isParticipant) {
      throw new ForbiddenException(
        `Player with ID ${playerId} is not a participant in match ${matchId}`,
      );
    }
    return toMatchView(matchState);
  }

  advanceMatchTick(
    matchId: string,
    commands: DeployCommand[] = [],
  ): AdvanceMatchResult {
    const currentState = this.getMatchState(matchId);
    const result = advanceMatch(currentState, commands);
    this.matchStates.set(matchId, result.state);
    return result;
  }

  private getMatchState(matchId: string): MatchState {
    const matchState = this.matchStates.get(matchId);

    if (!matchState) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }

    return matchState;
  }

  isMatchRunning(matchId: string): boolean {
    return this.matchStates.get(matchId)?.status === 'RUNNING';
  }

  
  markMatchJoined(matchId: string): void {
    this.joinedMatches.add(matchId);
    this.clearJoinDeadline(matchId);
  }


  disposeMatch(matchId: string, state?: MatchState): MatchState | undefined {
    const matchState = state ?? this.matchStates.get(matchId);

    if (matchState) {
      this.activePlayers.removePlayer(matchState.players.LEFT.playerId);
      this.activePlayers.removePlayer(matchState.players.RIGHT.playerId);
    }

    this.clearJoinDeadline(matchId);
    this.joinedMatches.delete(matchId);
    this.matchStates.delete(matchId);

    return matchState;
  }

  private scheduleJoinDeadline(matchId: string): void {
    this.clearJoinDeadline(matchId);

    const timer = setTimeout(() => {
      this.joinDeadlines.delete(matchId);

      const state = this.matchStates.get(matchId);
      if (
        !state ||
        state.status !== 'RUNNING' ||
        this.joinedMatches.has(matchId)
      ) {
        return;
      }

      void this.abandonMatch(matchId);
    }, JOIN_DEADLINE_MS);

    timer.unref?.();
    this.joinDeadlines.set(matchId, timer);
  }

  private clearJoinDeadline(matchId: string): void {
    const timer = this.joinDeadlines.get(matchId);
    if (timer) {
      clearTimeout(timer);
      this.joinDeadlines.delete(matchId);
    }
  }

  private async abandonMatch(matchId: string): Promise<void> {
    try {
      await this.dbService.match.updateMany({
        where: { id: matchId, status: 'PLAYING' },
        data: { status: 'FINISHED', endedAt: new Date() },
      });
    } catch (error) {
      console.error(
        `Failed to mark abandoned match ${matchId} as finished:`,
        error,
      );
    } finally {
      this.disposeMatch(matchId);
    }
  }

  private computeEloRatings(
    winnerRating: number,
    loserRating: number,
  ): [number, number] {
    const expectedWinner =
      1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
    const expectedLoser = 1 - expectedWinner;

    return [
      Math.round(winnerRating + ELO_K_FACTOR * (1 - expectedWinner)),
      Math.round(loserRating + ELO_K_FACTOR * (0 - expectedLoser)),
    ];
  }

  private async fetchPlayerCards(playerId: string) {
    const player = await this.dbService.player.findUnique({
      where: { id: playerId },
      select: {
        playerCards: {
          select: {
            cardId: true,
            level: true,
            exp: true,
            card: {
              select: {
                id: true,
                name: true,
                cost: true,
                baseHp: true,
                baseDamage: true,
                attackSpeed: true,
                movementSpeed: true,
                range: true,
              },
            },
          },
        },
      },
    });

    if (!player) {
      throw new NotFoundException(`Player with ID ${playerId} not found`);
    }

    return player.playerCards;
  }

  private mapPlayerCardsToSnapshots(
    playerCards: Awaited<ReturnType<typeof this.fetchPlayerCards>>,
  ): CardSnapshot[] {
    return playerCards.map((playerCard) => {
      const card = playerCard.card;

      return {
        cardId: playerCard.cardId,
        level: playerCard.level,
        name: card.name,
        cost: card.cost,
        hp: scaleStatByLevel(card.baseHp, playerCard.level, CARD_LEVEL_HP_BONUS),
        damage: scaleStatByLevel(
          card.baseDamage,
          playerCard.level,
          CARD_LEVEL_DAMAGE_BONUS,
        ),
        attackSpeed: card.attackSpeed,
        movementSpeed: card.movementSpeed,
        range: card.range,
      };
    });
  }

  async persistMatchResult(
    matchId: string,
    result: MatchResult,
  ): Promise<MatchRewards | null> {
    if (result.reason === 'CANCELLED' || result.winner === null) {
      throw new Error('Cancelled matches cannot be saved as finished matches.');
    }

    const matchState = this.getMatchState(matchId);

    if (matchState.status !== 'FINISHED' || !matchState.result) {
      throw new Error(`Match ${matchId} has not finished.`);
    }

    const leftId = matchState.players.LEFT.playerId;
    const rightId = matchState.players.RIGHT.playerId;
    const winnerSide = result.winner === 'DRAW' ? null : result.winner;

    return this.dbService.$transaction(async (transaction) => {
      const match = await transaction.match.findUnique({
        where: { id: matchId },
        select: { status: true },
      });

      if (!match) {
        throw new NotFoundException(`Match with ID ${matchId} not found`);
      }

      if (match.status !== 'PLAYING') {
        return null;
      }

      const updatedMatch = await transaction.match.updateMany({
        where: { id: matchId, status: 'PLAYING' },
        data: { status: 'FINISHED', endedAt: new Date() },
      });

      if (updatedMatch.count === 0) {
        return null;
      }

      const updatedPlayers = await transaction.matchPlayer.updateMany({
        where: { matchId },
        data: { isWinner: false },
      });

      if (updatedPlayers.count !== 2) {
        throw new Error(`Match ${matchId} must have exactly two players.`);
      }

      if (winnerSide) {
        await transaction.matchPlayer.update({
          where: {
            matchId_playerId: {
              matchId,
              playerId: winnerSide === 'LEFT' ? leftId : rightId,
            },
          },
          data: { isWinner: true },
        });
      }

      const loadSide = async (side: 'LEFT' | 'RIGHT') => {
        const playerId = side === 'LEFT' ? leftId : rightId;
        const player = await transaction.player.findUnique({
          where: { id: playerId },
          select: {
            rating: true,
            playerCards: {
              orderBy: { card: { name: 'asc' as const } },
              select: {
                cardId: true,
                level: true,
                exp: true,
                card: { select: { name: true } },
              },
            },
          },
        });

        if (!player) {
          throw new NotFoundException(`Player with ID ${playerId} not found`);
        }

        return { side, playerId, player };
      };

      const [leftData, rightData] = await Promise.all([
        loadSide('LEFT'),
        loadSide('RIGHT'),
      ]);

      let leftRating = leftData.player.rating;
      let rightRating = rightData.player.rating;

      if (winnerSide) {
        const winnerRating =
          winnerSide === 'LEFT' ? leftRating : rightRating;
        const loserRating = winnerSide === 'LEFT' ? rightRating : leftRating;
        const [newWinnerRating, newLoserRating] = this.computeEloRatings(
          winnerRating,
          loserRating,
        );
        if (winnerSide === 'LEFT') {
          leftRating = newWinnerRating;
          rightRating = newLoserRating;
        } else {
          rightRating = newWinnerRating;
          leftRating = newLoserRating;
        }
      }

      const outcomeOf = (side: 'LEFT' | 'RIGHT'): MatchOutcome =>
        result.winner === 'DRAW'
          ? 'DRAW'
          : result.winner === side
            ? 'WIN'
            : 'LOSS';

      const persistSide = async (
        data: Awaited<ReturnType<typeof loadSide>>,
        ratingAfter: number,
      ): Promise<PlayerReward> => {
        const outcome = outcomeOf(data.side);
        const ratingBefore = data.player.rating;
        const expGained = MATCH_CARD_EXP[outcome];
        const cards: CardProgressReward[] = [];

        for (const playerCard of data.player.playerCards) {
          const next = applyCardExp(
            { level: playerCard.level, exp: playerCard.exp },
            expGained,
          );

          if (next.level !== playerCard.level || next.exp !== playerCard.exp) {
            await transaction.playerCard.update({
              where: {
                playerId_cardId: {
                  playerId: data.playerId,
                  cardId: playerCard.cardId,
                },
              },
              data: { level: next.level, exp: next.exp },
            });
          }

          cards.push({
            cardId: playerCard.cardId,
            name: playerCard.card.name,
            levelBefore: playerCard.level,
            levelAfter: next.level,
            expBefore: playerCard.exp,
            expAfter: next.exp,
            expGained,
            expToNext: next.expToNext,
            expToNextBefore: cardExpToNextLevel(playerCard.level),
            leveledUp: next.leveledUp,
            maxed: next.level >= CARD_MAX_LEVEL,
          });
        }

        const playerUpdate: {
          rating: number;
          wins?: { increment: number };
          losses?: { increment: number };
        } = { rating: ratingAfter };
        if (outcome === 'WIN') playerUpdate.wins = { increment: 1 };
        if (outcome === 'LOSS') playerUpdate.losses = { increment: 1 };

        if (outcome !== 'DRAW') {
          await transaction.player.update({
            where: { id: data.playerId },
            data: playerUpdate,
          });
        }

        return {
          playerId: data.playerId,
          outcome,
          ratingBefore,
          ratingAfter,
          ratingDelta: ratingAfter - ratingBefore,
          cards,
        };
      };

      const [leftReward, rightReward] = await Promise.all([
        persistSide(leftData, leftRating),
        persistSide(rightData, rightRating),
      ]);

      return {
        result,
        players: { LEFT: leftReward, RIGHT: rightReward },
      };
    });
  }
}
