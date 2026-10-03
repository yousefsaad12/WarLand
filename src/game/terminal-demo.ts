import { createInterface, emitKeypressEvents } from 'node:readline';
import {
  GAME_SIDE,
  advanceMatch,
  createMatchState,
  toMatchView,
  type DeployCommand,
  type GameSide,
  type MatchState,
} from './engine/engine.js';
import { DEFAULT_GAME_RULES, STARTER_CARDS } from './balance.js';

const ticksPerSecond = DEFAULT_GAME_RULES.ticksPerSecond;

let state: MatchState = createMatchState(
  'terminal-demo',
  { playerId: 'left-player', cards: STARTER_CARDS },
  { playerId: 'right-player', cards: STARTER_CARDS },
  DEFAULT_GAME_RULES,
);

const pendingCommands: DeployCommand[] = [];
let nextRequestId = 1;
let selectedSide: GameSide = GAME_SIDE.LEFT;
let selectedCardIndex = 0;
let cursorX = 20;
let cursorY = 50;
let lastDeployMessage = 'Select a card, move the cursor, and press Enter to deploy.';

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const input = interactive
  ? undefined
  : createInterface({ input: process.stdin, output: process.stdout });

let tickTimer: ReturnType<typeof setInterval>;

function advanceGame(): void {
  const result = advanceMatch(state, pendingCommands.splice(0));
  state = result.state;

  for (const deployResult of result.deployResults) {
    lastDeployMessage =
      deployResult.status === 'ACCEPTED'
        ? `${deployResult.requestId}: deployed.`
        : `${deployResult.requestId}: ${deployResult.status} (${deployResult.reason}).`;
    if (!interactive) {
      console.log(lastDeployMessage);
    }
  }

  if (interactive) {
    renderScreen();
  } else if (state.tick % ticksPerSecond === 0 || state.status !== 'RUNNING') {
    printStatus(state);
  }

  if (state.status !== 'RUNNING') {
    clearInterval(tickTimer);
    if (!interactive) {
      console.log('Match finished. Type "quit" to exit.');
    }
  }
}

tickTimer = setInterval(advanceGame, 1000 / ticksPerSecond);

if (interactive) {
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('keypress', onKeypress);
  process.on('exit', restoreTerminal);
  process.on('SIGINT', exit);
  renderScreen();
} else {
  console.log('War Land local terminal match');
  console.log('Type "help" for commands.');
  printStatus(state);
  input?.on('line', handleCommandLine);
  input?.on('close', () => clearInterval(tickTimer));
}

function handleCommandLine(line: string): void {
  const [command, ...args] = line.trim().split(/\s+/);

  if (command === 'help') {
    printHelp();
    return;
  }
  if (command === 'status') {
    printStatus(state);
    return;
  }
  if (command === 'quit' || command === 'exit') {
    exit();
    return;
  }
  if (command !== 'deploy') {
    console.log('Unknown command. Type "help" for available commands.');
    return;
  }

  const deployCommand = parseDeployCommand(args);
  if (!deployCommand) {
    console.log('Invalid deploy command. Type "help" for the format.');
    return;
  }
  queueDeployment(deployCommand);
}

function onKeypress(
  inputKey: string,
  key: { name?: string; ctrl?: boolean },
): void {
  if (key.ctrl && key.name === 'c') {
    exit();
    return;
  }
  if (key.name === 'q' || key.name === 'escape') {
    exit();
    return;
  }
  if (state.status !== 'RUNNING') {
    if (key.name === 'r') {
      state = createMatchState(
        `terminal-demo-${Date.now()}`,
        { playerId: 'left-player', cards: STARTER_CARDS },
        { playerId: 'right-player', cards: STARTER_CARDS },
        DEFAULT_GAME_RULES,
      );
      lastDeployMessage = 'New match started.';
      tickTimer = setInterval(advanceGame, 1000 / ticksPerSecond);
    }
    renderScreen();
    return;
  }

  const movement = movementForKey(key.name);
  if (movement) {
    moveCursor(movement.dx, movement.dy);
    renderScreen();
    return;
  }
  if (key.name === 'tab') {
    selectSide(selectedSide === GAME_SIDE.LEFT ? GAME_SIDE.RIGHT : GAME_SIDE.LEFT);
    renderScreen();
    return;
  }
  if (key.name === '1' || key.name === '2' || key.name === '3' || key.name === '4') {
    selectedCardIndex = Number(key.name) - 1;
    renderScreen();
    return;
  }
  if (key.name === 'return' || key.name === 'space') {
    deploySelectedCard();
    renderScreen();
    return;
  }
  if (inputKey.toLowerCase() === 'h') {
    lastDeployMessage =
      'Arrows/WASD move | 1-4 select card | Tab switches side | Enter deploys | Q quits';
    renderScreen();
  }
}

function movementForKey(
  keyName: string | undefined,
): { dx: number; dy: number } | undefined {
  switch (keyName) {
    case 'left':
    case 'a':
      return { dx: -1, dy: 0 };
    case 'right':
    case 'd':
      return { dx: 1, dy: 0 };
    case 'up':
    case 'w':
      return { dx: 0, dy: -1 };
    case 'down':
    case 's':
      return { dx: 0, dy: 1 };
    default:
      return undefined;
  }
}

function moveCursor(dx: number, dy: number): void {
  const xStep = 100 / 40;
  const yStep = 100 / 12;
  const ownHalf = selectedSide === GAME_SIDE.LEFT ? [0, 50] : [50, 100];
  cursorX = Math.max(ownHalf[0], Math.min(ownHalf[1], cursorX + dx * xStep));
  cursorY = Math.max(0, Math.min(100, cursorY + dy * yStep));
}

function selectSide(side: GameSide): void {
  selectedSide = side;
  cursorX = side === GAME_SIDE.LEFT ? 20 : 80;
  cursorY = 50;
}

function deploySelectedCard(): void {
  const card = STARTER_CARDS[selectedCardIndex];
  if (!card) {
    lastDeployMessage = 'Select a valid card first.';
    return;
  }

  queueDeployment({
    requestId: `terminal-${nextRequestId++}`,
    playerId: selectedSide === GAME_SIDE.LEFT ? 'left-player' : 'right-player',
    cardId: card.cardId,
    x: cursorX,
    y: cursorY,
  });
}

function queueDeployment(command: DeployCommand): void {
  if (state.status !== 'RUNNING') {
    lastDeployMessage = 'This match is already finished.';
    return;
  }
  pendingCommands.push(command);
  lastDeployMessage =
    `Queued ${command.cardId} for ${command.playerId === 'left-player' ? 'LEFT' : 'RIGHT'} ` +
    `at (${command.x.toFixed(1)}, ${command.y.toFixed(1)}).`;
}

function renderScreen(): void {
  const view = toMatchView(state);
  const width = 41;
  const height = 13;
  const board = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ' '),
  );
  const centerColumn = Math.floor((width - 1) / 2);

  for (const row of board) {
    row[centerColumn] = '|';
  }
  board[Math.floor(height / 2)]![centerColumn] = '+';
  board[Math.floor(height / 2)]![0] = 'B';
  board[Math.floor(height / 2)]![width - 1] = 'B';

  for (const unit of view.units) {
    const x = mapXToColumn(unit.x, width);
    const y = mapYToRow(unit.y, height);
    const old = board[y]?.[x];
    if (board[y]) {
      board[y]![x] = old === ' ' || old === '|' || old === '+' ? (unit.owner === GAME_SIDE.LEFT ? 'o' : 'x') : '*';
    }
  }

  const cursorColumn = mapXToColumn(cursorX, width);
  const cursorRow = mapYToRow(cursorY, height);
  if (board[cursorRow]) {
    board[cursorRow]![cursorColumn] = '@';
  }

  const lines = board.map((row) =>
    row
      .map((cell, column) => colorCell(cell, column, centerColumn))
      .join(''),
  );
  const secondsLeft = Math.ceil((view.maxTicks - view.tick) / view.ticksPerSecond);
  const side = view.players[selectedSide];
  const cardLines = STARTER_CARDS.map((card, index) => {
    const marker = index === selectedCardIndex ? '>' : ' ';
    const affordability = side.energyHundredths >= card.cost * 100 ? 'ready' : 'need energy';
    return `${marker} ${index + 1}. ${card.name.padEnd(7)} cost ${card.cost}  ${affordability}`;
  });
  const unitLines = view.units.length
    ? view.units.map(
        (unit) =>
          `${unit.owner === GAME_SIDE.LEFT ? 'L' : 'R'} ${unit.cardName} ` +
          `(${unit.x.toFixed(0)},${unit.y.toFixed(0)}) ${unit.hp} HP`,
      )
    : ['No units deployed yet.'];

  const output = [
    'WAR LAND  |  LOCAL MATCH',
    `Tick ${view.tick}/${view.maxTicks}   Time ${formatTime(secondsLeft)}   ${view.status}`,
    `LEFT  base ${view.players.LEFT.baseHp.toString().padStart(3)} HP   energy ${formatEnergy(view.players.LEFT.energyHundredths)}`,
    `RIGHT base ${view.players.RIGHT.baseHp.toString().padStart(3)} HP   energy ${formatEnergy(view.players.RIGHT.energyHundredths)}`,
    '',
    '  LEFT BASE                                      RIGHT BASE',
    '  +---------------------------------------+',
    ...lines.map((line) => `  |${line}|`),
    '  +---------------------------------------+',
    '  0                 50                    100',
    '',
    `Deploying for: ${selectedSide}   Cursor: (${cursorX.toFixed(1)}, ${cursorY.toFixed(1)})`,
    ...cardLines,
    '',
    `Units (${unitLines.length === 1 && unitLines[0] === 'No units deployed yet.' ? 0 : unitLines.length}):`,
    ...unitLines.slice(0, 5).map((line) => `  ${line}`),
    ...(unitLines.length > 5 ? [`  ...and ${unitLines.length - 5} more`] : []),
    '',
    view.result
      ? `RESULT: ${view.result.winner ?? 'DRAW'} (${view.result.reason}) | R new match | Q quit`
      : 'ARROWS/WASD move | 1-4 select card | TAB switch player | ENTER deploy | Q quit',
    lastDeployMessage,
  ];

  process.stdout.write(`\u001b[2J\u001b[H${output.join('\n')}\n`);
}

function mapXToColumn(x: number, width: number): number {
  return Math.max(0, Math.min(width - 1, Math.round((x / 100) * (width - 1))));
}

function mapYToRow(y: number, height: number): number {
  return Math.max(0, Math.min(height - 1, Math.round((y / 100) * (height - 1))));
}

function colorCell(cell: string, column: number, centerColumn: number): string {
  if (cell === '@') {
    return `\u001b[1;33m${cell}\u001b[0m`;
  }
  if (cell === 'o') {
    return `\u001b[1;36m${cell}\u001b[0m`;
  }
  if (cell === 'x') {
    return `\u001b[1;31m${cell}\u001b[0m`;
  }
  if (cell === '*') {
    return `\u001b[1;35m${cell}\u001b[0m`;
  }
  if (cell === 'B') {
    return `\u001b[1;32m${cell}\u001b[0m`;
  }
  if (column === centerColumn) {
    return `\u001b[90m${cell}\u001b[0m`;
  }
  return cell;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function exit(): void {
  clearInterval(tickTimer);
  restoreTerminal();
  input?.close();
  process.exit(0);
}

function restoreTerminal(): void {
  if (interactive && process.stdin.isTTY) {
    process.stdin.setRawMode(false);
    process.stdout.write('\u001b[0m\n');
  }
}

function parseDeployCommand(args: string[]): DeployCommand | undefined {
  if (args.length < 4 || args.length > 5) {
    return undefined;
  }

  const [sideName, cardId, rawX, rawY, suppliedRequestId] = args;
  const side = parseSide(sideName);
  const x = Number(rawX);
  const y = Number(rawY);
  if (!side || !cardId || !Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }

  return {
    requestId:
      suppliedRequestId ?? `terminal-${nextRequestId++}`,
    playerId: side === GAME_SIDE.LEFT ? 'left-player' : 'right-player',
    cardId,
    x,
    y,
  };
}

function parseSide(value: string | undefined): GameSide | undefined {
  switch (value?.toLowerCase()) {
    case 'left':
      return GAME_SIDE.LEFT;
    case 'right':
      return GAME_SIDE.RIGHT;
    default:
      return undefined;
  }
}

function printHelp(): void {
  console.log('Commands:');
  console.log('  deploy <left|right> <card-id> <x> <y> [request-id]');
  console.log('  status');
  console.log('  help');
  console.log('  quit');
  console.log(`Cards: ${STARTER_CARDS.map((card) => card.cardId).join(', ')}`);
  console.log('Map coordinates are 0-100; left deploys at x <= 50, right at x >= 50.');
  console.log('Temporary demo stats are used; each player is controlled from this terminal.');
}

function printStatus(match: MatchState): void {
  const view = toMatchView(match);
  console.log(
    `\nTick ${view.tick}/${view.maxTicks} | ` +
      `LEFT base ${view.players.LEFT.baseHp} HP, energy ${formatEnergy(view.players.LEFT.energyHundredths)} | ` +
      `RIGHT base ${view.players.RIGHT.baseHp} HP, energy ${formatEnergy(view.players.RIGHT.energyHundredths)}`,
  );
  console.log(
    view.units.length === 0
      ? 'No units on the battlefield.'
      : view.units
          .map(
            (unit) =>
              `  ${unit.owner} ${unit.cardName} (${unit.id}) ` +
              `at (${unit.x.toFixed(1)}, ${unit.y.toFixed(1)}), ${unit.hp} HP`,
          )
          .join('\n'),
  );
  if (view.result) {
    console.log(`Result: ${view.result.winner ?? 'no winner'} (${view.result.reason})`);
  }
}

function formatEnergy(energyHundredths: number): string {
  return (energyHundredths / 100).toFixed(2);
}
