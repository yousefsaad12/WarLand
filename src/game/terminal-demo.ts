import { createInterface, emitKeypressEvents } from 'node:readline';
import { Chalk } from 'chalk';
import boxen from 'boxen';
import {
  GAME_SIDE,
  advanceMatch,
  createMatchState,
  toMatchView,
  type CardSnapshot,
  type DeployCommand,
  type GameSide,
  type MatchState,
  type UnitState,
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
let lastDeployMessage =
  'Select a card, move the cursor, and press Enter to deploy.';

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const supportsAnsi =
  interactive &&
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== 'dumb';
const color = new Chalk({ level: supportsAnsi ? 3 : 0 });
const input = interactive
  ? undefined
  : createInterface({ input: process.stdin, output: process.stdout });

type BattleEffect =
  | {
      kind: 'arrow';
      owner: GameSide;
      from: { x: number; y: number };
      to: { x: number; y: number };
      frame: number;
      duration: number;
    }
  | {
      kind: 'slash' | 'spawn';
      owner: GameSide;
      at: { x: number; y: number };
      frame: number;
      duration: number;
    };

const battleEffects: BattleEffect[] = [];
const effectDuration = 3;
let previousFrame: string[] | undefined;
let tickTimer: ReturnType<typeof setInterval>;
let terminalRestored = false;

function advanceGame(): void {
  const previousState = state;
  const result = advanceMatch(state, pendingCommands.splice(0));
  state = result.state;
  updateBattleEffects(previousState, state);

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
  process.stdout.write('\u001b[?1049h\u001b[?25l');
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
      pendingCommands.length = 0;
      nextRequestId = 1;
      battleEffects.length = 0;
      previousFrame = undefined;
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
    selectSide(
      selectedSide === GAME_SIDE.LEFT ? GAME_SIDE.RIGHT : GAME_SIDE.LEFT,
    );
    renderScreen();
    return;
  }
  if (
    key.name === '1' ||
    key.name === '2' ||
    key.name === '3' ||
    key.name === '4'
  ) {
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

function updateBattleEffects(previous: MatchState, current: MatchState): void {
  for (let index = battleEffects.length - 1; index >= 0; index -= 1) {
    const effect = battleEffects[index];
    if (!effect) {
      continue;
    }
    effect.frame += 1;
    if (effect.frame > effect.duration) {
      battleEffects.splice(index, 1);
    }
  }

  const previousUnits = new Map(
    previous.units.map((unit) => [unit.id, unit] as const),
  );
  const currentUnits = new Map(
    current.units.map((unit) => [unit.id, unit] as const),
  );

  for (const unit of current.units) {
    if (!previousUnits.has(unit.id)) {
      battleEffects.push({
        kind: 'spawn',
        owner: unit.owner,
        at: { x: unit.x, y: unit.y },
        frame: 1,
        duration: effectDuration,
      });
    }
  }

  for (const unit of previous.units) {
    const card = findUnitCard(previous, unit);
    if (!card || unit.attackProgress + card.attackSpeed / ticksPerSecond < 1) {
      continue;
    }

    const attacker = currentUnits.get(unit.id) ?? unit;
    const targets = [
      ...current.units.filter((target) => target.owner !== unit.owner),
      ...previous.units.filter(
        (target) => target.owner !== unit.owner && !currentUnits.has(target.id),
      ),
    ];
    const target = targets
      .map((candidate) => ({
        unit: candidate,
        distance: distanceBetween(attacker, candidate),
      }))
      .filter(({ distance }) => distance <= card.range)
      .sort((first, second) => first.distance - second.distance)[0]?.unit;

    if (!target) {
      continue;
    }

    const targetPosition = currentUnits.get(target.id) ?? target;
    if (card.cardId === 'archer') {
      battleEffects.push({
        kind: 'arrow',
        owner: unit.owner,
        from: { x: attacker.x, y: attacker.y },
        to: { x: targetPosition.x, y: targetPosition.y },
        frame: 1,
        duration: effectDuration,
      });
    } else {
      battleEffects.push({
        kind: 'slash',
        owner: unit.owner,
        at: { x: targetPosition.x, y: targetPosition.y },
        frame: 1,
        duration: effectDuration,
      });
    }
  }
}

function findUnitCard(
  match: MatchState,
  unit: UnitState,
): CardSnapshot | undefined {
  return match.players[unit.owner].cards.find(
    (card) => card.snapshot.cardId === unit.cardId,
  )?.snapshot;
}

function distanceBetween(
  first: { x: number; y: number },
  second: { x: number; y: number },
): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function renderScreen(): void {
  const view = toMatchView(state);
  const width = 51;
  const height = 9;
  const board = Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, column) => {
      const centerRow = Math.floor(height / 2);
      if (row === centerRow) {
        return { glyph: column === Math.floor(width / 2) ? '┼' : '─' };
      }
      if (column === Math.floor(width / 2)) {
        return { glyph: '┊' };
      }
      return {
        glyph: (column * 7 + row * 11) % 19 === 0 ? '·' : ' ',
        color: '90',
      };
    }),
  );
  const centerColumn = Math.floor((width - 1) / 2);
  const centerRow = Math.floor(height / 2);
  board[centerRow]![0] = { glyph: '◈', color: '1;32' };
  board[centerRow]![width - 1] = { glyph: '◈', color: '1;32' };

  for (const unit of view.units) {
    const x = mapXToColumn(unit.x, width);
    const y = mapYToRow(unit.y, height);
    const cell = board[y]?.[x];
    if (cell) {
      const unitGlyph = unitBattleGlyph(unit.cardId, unit.owner);
      board[y]![x] =
        cell.glyph === ' ' ||
        cell.glyph === '·' ||
        cell.glyph === '┊' ||
        cell.glyph === '─'
          ? {
              glyph: unitGlyph,
              color: unit.owner === GAME_SIDE.LEFT ? '1;36' : '1;31',
            }
          : { glyph: '*', color: '1;35' };
    }
  }

  for (const effect of battleEffects) {
    if (effect.kind === 'arrow') {
      const progress = Math.min(1, effect.frame / effect.duration);
      const position = {
        x: effect.from.x + (effect.to.x - effect.from.x) * progress,
        y: effect.from.y + (effect.to.y - effect.from.y) * progress,
      };
      const dx = effect.to.x - effect.from.x;
      const dy = effect.to.y - effect.from.y;
      const glyph =
        Math.abs(dx) >= Math.abs(dy)
          ? dx >= 0
            ? '>'
            : '<'
          : dy >= 0
            ? 'v'
            : '^';
      setBoardCell(
        board,
        mapXToColumn(position.x, width),
        mapYToRow(position.y, height),
        glyph,
        effect.owner === GAME_SIDE.LEFT ? '1;36' : '1;31',
      );
    } else if (effect.kind === 'slash') {
      const glyph = effect.frame % 2 === 0 ? '\\' : '/';
      setBoardCell(
        board,
        mapXToColumn(effect.at.x, width),
        mapYToRow(effect.at.y, height),
        glyph,
        effect.frame === effect.duration
          ? '1;37'
          : effect.owner === GAME_SIDE.LEFT
            ? '1;36'
            : '1;31',
      );
    } else {
      const column = mapXToColumn(effect.at.x, width);
      const row = mapYToRow(effect.at.y, height);
      const pulse = effect.frame % 2 === 0 ? '*' : '+';
      const pulseColor = effect.owner === GAME_SIDE.LEFT ? '1;36' : '1;31';
      setBoardCell(board, column - 1, row, pulse, pulseColor);
      setBoardCell(board, column + 1, row, pulse, pulseColor);
      setBoardCell(board, column, row - 1, pulse, pulseColor);
      setBoardCell(board, column, row + 1, pulse, pulseColor);
    }
  }

  const cursorColumn = mapXToColumn(cursorX, width);
  const cursorRow = mapYToRow(cursorY, height);
  if (board[cursorRow]) {
    board[cursorRow]![cursorColumn] = { glyph: '@', color: '1;33' };
  }

  const lines = board.map((row) =>
    row
      .map((cell, column) =>
        colorize(
          cell.glyph,
          cell.color ?? (column === centerColumn ? '90' : undefined),
        ),
      )
      .join(''),
  );
  const secondsLeft = Math.ceil(
    (view.maxTicks - view.tick) / view.ticksPerSecond,
  );
  const side = view.players[selectedSide];
  const cardLines = STARTER_CARDS.map((card, index) => {
    const marker = index === selectedCardIndex ? '>' : ' ';
    const affordable = side.energyHundredths >= card.cost * 100;
    const affordability = affordable
      ? colorize('READY', '1;32')
      : colorize('WAIT', '90');
    const label = `${index + 1}. ${card.name.padEnd(7)} COST ${card.cost}`;
    const stats =
      `HP ${card.hp}  DMG ${card.damage}  ATK ${card.attackSpeed}/s  ` +
      `SPD ${card.movementSpeed}  RNG ${card.range}`;
    return `${marker} ${index === selectedCardIndex ? colorize(label, '1;33') : label}  ${stats}  ${affordability}`;
  });
  const cardPanels = STARTER_CARDS.map((card, index) => {
    const selected = index === selectedCardIndex;
    const sideColor = selectedSide === GAME_SIDE.LEFT ? 'cyan' : 'red';
    const sprite = cardSprite(card.cardId)
      .map((line) =>
        selected
          ? color.bold[colorMethod(sideColor)](line)
          : color[colorMethod(sideColor)](line),
      )
      .join('\n');
    const title = selected ? color.bold.yellow(card.name) : card.name;

    return boxen(`${sprite}\n${title}\n${card.cost} ENERGY`, {
      borderStyle: 'round',
      ...(supportsAnsi ? { borderColor: selected ? 'yellow' : sideColor } : {}),
      padding: 0,
      width: 18,
    });
  });
  const cardPanelRows = Array.from(
    {
      length: Math.max(...cardPanels.map((panel) => panel.split('\n').length)),
    },
    (_, row) =>
      cardPanels
        .map((panel) => panel.split('\n')[row] ?? ' '.repeat(18))
        .join('  '),
  );
  const left = view.players.LEFT;
  const right = view.players.RIGHT;
  const maxEnergy = view.players.LEFT.cards.length
    ? DEFAULT_GAME_RULES.maxEnergyHundredths
    : 1;
  const unitLines = view.units.slice(0, 4).map((unit) => {
    const sideColor = unit.owner === GAME_SIDE.LEFT ? '1;36' : '1;31';
    return (
      `${colorize(unit.owner === GAME_SIDE.LEFT ? 'L' : 'R', sideColor)} ${unit.cardName.padEnd(7)} ` +
      `(${unit.x.toFixed(0)},${unit.y.toFixed(0)})  ${unit.hp} HP`
    );
  });
  const titlePanel = boxen(
    `${colorize('WAR LAND', '1;36')}  ${colorize('// TACTICAL ARENA', '90')}\n` +
      `${colorize('●', '1;32')} LIVE SIMULATION  ${colorize('●', '1;36')} LEFT FORCES  ` +
      `${colorize('●', '1;31')} RIGHT FORCES`,
    {
      borderStyle: 'round',
      ...(supportsAnsi ? { borderColor: 'cyan' } : {}),
      padding: { left: 1, right: 1 },
      width: 72,
    },
  );

  const output = [
    ...titlePanel.split('\n'),
    `${colorize(view.status, view.status === 'RUNNING' ? '1;32' : '1;33')}  ` +
      `TICK ${view.tick.toString().padStart(3)}/${view.maxTicks}  ` +
      `TIME ${formatTime(secondsLeft)}  MATCH ${view.matchId}`,
    '',
    `${colorize('LEFT BASE', '1;36')}   ${healthBar(left.baseHp, DEFAULT_GAME_RULES.baseHp)} ` +
      `${left.baseHp}/${DEFAULT_GAME_RULES.baseHp} HP`,
    `${colorize('RIGHT BASE', '1;31')}  ${healthBar(right.baseHp, DEFAULT_GAME_RULES.baseHp)} ` +
      `${right.baseHp}/${DEFAULT_GAME_RULES.baseHp} HP`,
    `${colorize('LEFT ENERGY', '36')}  ${energyBar(left.energyHundredths, maxEnergy)} ` +
      `${formatEnergy(left.energyHundredths)}/${formatEnergy(maxEnergy)}`,
    `${colorize('RIGHT ENERGY', '31')} ${energyBar(right.energyHundredths, maxEnergy)} ` +
      `${formatEnergy(right.energyHundredths)}/${formatEnergy(maxEnergy)}`,
    '',
    `  ${colorize('LEFT GATE', '1;32')}  ┏${'━'.repeat(width)}┓  ${colorize('RIGHT GATE', '1;32')}`,
    ...lines.map((line) => `                 ┃${line}┃`),
    `                 ┗${'━'.repeat(width)}┛`,
    `                 0${' '.repeat(Math.floor(width / 2) - 1)}50${' '.repeat(Math.floor(width / 2) - 1)}100`,
    '',
    `COMMANDING ${colorize(selectedSide, selectedSide === GAME_SIDE.LEFT ? '1;36' : '1;31')}  ` +
      `CURSOR (${cursorX.toFixed(0)}, ${cursorY.toFixed(0)})  ` +
      `UNITS ${view.units.length}`,
    colorize('DEPLOY CARDS  |  SELECT WITH 1-4', '1;37'),
    ...cardPanelRows,
    ...cardLines,
    '',
    colorize('BATTLEFIELD CONTACTS', '1;37'),
    ...(unitLines.length
      ? unitLines.map((line) => `  ${line}`)
      : ['  No units deployed']),
    ...(view.units.length > unitLines.length
      ? [`  ...and ${view.units.length - unitLines.length} more`]
      : []),
    '',
    view.result
      ? `RESULT: ${view.result.winner ?? 'DRAW'} (${view.result.reason}) | R new match | Q quit`
      : `${colorize('WASD/ARROWS', '1;37')} move  ${colorize('1-4', '1;37')} card  ` +
        `${colorize('TAB', '1;37')} side  ${colorize('ENTER', '1;37')} deploy  ${colorize('Q', '1;37')} quit`,
    colorize(lastDeployMessage, '90'),
  ];

  renderChangedRows(output);
}

function setBoardCell(
  board: Array<Array<{ glyph: string; color?: string }>>,
  column: number,
  row: number,
  glyph: string,
  color: string,
): void {
  if (board[row]?.[column]) {
    board[row]![column] = { glyph, color };
  }
}

function unitBattleGlyph(cardId: string, owner: GameSide): string {
  switch (cardId) {
    case 'knight':
      return 'K';
    case 'archer':
      return 'A';
    case 'guard':
      return 'G';
    case 'scout':
      return owner === GAME_SIDE.LEFT ? '>' : '<';
    default:
      return '?';
  }
}

function cardSprite(cardId: string): string[] {
  switch (cardId) {
    case 'knight':
      return ['  /|\\  ', ' < K > ', '  \\|/  '];
    case 'archer':
      return ['  /\\   ', ' <(A)> ', '  /|\\  '];
    case 'guard':
      return [' .----. ', '[  G  ]', ' `----` '];
    case 'scout':
      return ['   ^   ', ' <<S>> ', '   v   '];
    default:
      return ['  ???  ', ' ? ? ? ', '  ???  '];
  }
}

function colorMethod(name: 'cyan' | 'red'): 'cyan' | 'red' {
  return name;
}

function renderChangedRows(lines: string[]): void {
  const output: string[] = [];
  if (!previousFrame) {
    output.push('\u001b[2J');
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (previousFrame?.[index] === line) {
      continue;
    }
    output.push(`\u001b[${index + 1};1H\u001b[2K${line}`);
  }

  if (previousFrame && previousFrame.length > lines.length) {
    for (let index = lines.length; index < previousFrame.length; index += 1) {
      output.push(`\u001b[${index + 1};1H\u001b[2K`);
    }
  }

  if (output.length) {
    process.stdout.write(output.join(''));
  }
  previousFrame = [...lines];
}

function mapXToColumn(x: number, width: number): number {
  return Math.max(0, Math.min(width - 1, Math.round((x / 100) * (width - 1))));
}

function mapYToRow(y: number, height: number): number {
  return Math.max(
    0,
    Math.min(height - 1, Math.round((y / 100) * (height - 1))),
  );
}

function colorize(value: string, code?: string): string {
  switch (code) {
    case '1;31':
      return color.bold.red(value);
    case '31':
      return color.red(value);
    case '1;32':
      return color.bold.green(value);
    case '1;33':
      return color.bold.yellow(value);
    case '1;35':
      return color.bold.magenta(value);
    case '1;36':
      return color.bold.cyan(value);
    case '36':
      return color.cyan(value);
    case '90':
      return color.gray(value);
    case '1;37':
      return color.bold.white(value);
    default:
      return value;
  }
}

function healthBar(current: number, max: number): string {
  const filled = Math.max(0, Math.min(12, Math.round((current / max) * 12)));
  const color =
    current / max > 0.5 ? '1;32' : current / max > 0.25 ? '1;33' : '1;31';
  return `[${colorize('#'.repeat(filled), color)}${colorize('.'.repeat(12 - filled), '90')}]`;
}

function energyBar(current: number, max: number): string {
  const filled = Math.max(0, Math.min(10, Math.round((current / max) * 10)));
  return `[${colorize('#'.repeat(filled), '1;33')}${colorize('.'.repeat(10 - filled), '90')}]`;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
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
  if (!interactive || terminalRestored) {
    return;
  }
  terminalRestored = true;
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false);
  }
  process.stdout.write('\u001b[0m\u001b[?25h\u001b[?1049l\n');
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
    requestId: suppliedRequestId ?? `terminal-${nextRequestId++}`,
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
  console.log(
    'Map coordinates are 0-100; left deploys at x <= 50, right at x >= 50.',
  );
  console.log(
    'Temporary demo stats are used; each player is controlled from this terminal.',
  );
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
    console.log(
      `Result: ${view.result.winner ?? 'no winner'} (${view.result.reason})`,
    );
  }
}

function formatEnergy(energyHundredths: number): string {
  return (energyHundredths / 100).toFixed(2);
}
