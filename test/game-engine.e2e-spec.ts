import { describe, expect, it } from 'vitest';
import {
  advanceMatch,
  createMatchState,
  toMatchView,
} from '../src/game/engine/engine.js';
import { DEFAULT_GAME_RULES, STARTER_CARDS } from '../src/game/balance.js';

describe('game engine (end to end)', () => {
  it('plays a full match to a terminal result and is deterministic', () => {
    const run = () => {
      const rules = { ...DEFAULT_GAME_RULES, maxTicks: 300 };
      let state = createMatchState(
        'e2e-match',
        { playerId: 'left', cards: STARTER_CARDS },
        { playerId: 'right', cards: STARTER_CARDS },
        rules,
      );

      let nextId = 0;
      while (state.status === 'RUNNING') {
        const commands = [
          {
            requestId: `l-${nextId}`,
            playerId: 'left',
            cardId: STARTER_CARDS[nextId % STARTER_CARDS.length]!.cardId,
            x: 20,
            y: 50,
          },
          {
            requestId: `r-${nextId}`,
            playerId: 'right',
            cardId: STARTER_CARDS[nextId % STARTER_CARDS.length]!.cardId,
            x: 80,
            y: 50,
          },
        ];
        nextId += 1;
        state = advanceMatch(state, commands).state;
      }

      return state;
    };

    const first = run();
    const second = run();

    expect(first.status).toBe('FINISHED');
    expect(first.result).toBeDefined();
    expect(['LEFT', 'RIGHT', 'DRAW']).toContain(first.result!.winner);
    expect(['BASE_DESTROYED', 'TIME_LIMIT']).toContain(first.result!.reason);

    const view = toMatchView(first);
    expect(view).not.toHaveProperty('requestLedger');
    expect(JSON.stringify(view)).toBe(JSON.stringify(toMatchView(second)));
  });
});
