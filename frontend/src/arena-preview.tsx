import { createRoot } from 'react-dom/client';
import { GameCanvas } from '@/features/game/renderer/GameCanvas';
import type {
  CardDefinition,
  MatchView,
} from '@/network/protocol';
import { useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/store/uiStore';
import '@/styles/index.css';

const catalog: Record<string, CardDefinition> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    cost: 3,
    baseHp: 180,
    baseDamage: 14,
    attackSpeed: 1,
    movementSpeed: 6,
    range: 2,
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    cost: 4,
    baseHp: 85,
    baseDamage: 8,
    attackSpeed: 1.25,
    movementSpeed: 5,
    range: 11,
  },
  guard: {
    id: 'guard',
    name: 'Guard',
    cost: 4,
    baseHp: 250,
    baseDamage: 10,
    attackSpeed: 0.8,
    movementSpeed: 4,
    range: 2,
  },
  scout: {
    id: 'scout',
    name: 'Scout',
    cost: 2,
    baseHp: 70,
    baseDamage: 4,
    attackSpeed: 1.5,
    movementSpeed: 10,
    range: 2,
  },
};

const cards = Object.values(catalog).map(({ id, name, cost }) => ({
  cardId: id,
  name,
  cost,
}));

const view: MatchView = {
  matchId: 'preview-arena',
  status: 'RUNNING',
  tick: 240,
  maxTicks: 1800,
  ticksPerSecond: 10,
  laneHalfWidth: 20,
  maxEnergyHundredths: 1000,
  players: {
    LEFT: {
      playerId: 'left-player',
      displayName: 'Aurelia',
      tag: '0421',
      baseHp: 820,
      energyHundredths: 320,
      cards,
    },
    RIGHT: {
      playerId: 'right-player',
      displayName: 'Brakk',
      tag: '7782',
      baseHp: 640,
      energyHundredths: 610,
      cards,
    },
  },
  units: [
    { id: 'u1', owner: 'LEFT', cardId: 'knight', cardName: 'Knight', x: 27, y: 44, hp: 180 },
    { id: 'u2', owner: 'LEFT', cardId: 'archer', cardName: 'Archer', x: 36, y: 56, hp: 85 },
    { id: 'u3', owner: 'LEFT', cardId: 'scout', cardName: 'Scout', x: 21, y: 52, hp: 70 },
    { id: 'u4', owner: 'RIGHT', cardId: 'guard', cardName: 'Guard', x: 61, y: 46, hp: 250 },
    { id: 'u5', owner: 'RIGHT', cardId: 'scout', cardName: 'Scout', x: 54, y: 38, hp: 70 },
    { id: 'u6', owner: 'RIGHT', cardId: 'archer', cardName: 'Archer', x: 72, y: 54, hp: 85 },
  ],
};

useGameStore.setState({
  view,
  side: 'LEFT',
  selectedCardId: 'knight',
  cardCatalog: catalog,
  cardRanges: {
    knight: 2,
    archer: 11,
    guard: 2,
    scout: 2,
  },
  connection: 'connected',
});
useUiStore.setState({ reduceMotion: false, screen: 'game' });

createRoot(document.getElementById('root')!).render(
  <div className="h-full w-full">
    <GameCanvas />
  </div>,
);
