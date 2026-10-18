import { createInterface, emitKeypressEvents } from 'node:readline';
import { createInterface as createPromptInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { io, type Socket } from 'socket.io-client';

interface LoginResponse {
  accessToken: string;
  player: {
    displayName: string;
    tag: string;
  };
}

interface MatchFound {
  matchId: string;
  opponentId: string;
  opponentName: string;
  opponentTag: string;
}

interface GameUnit {
  owner: 'LEFT' | 'RIGHT';
  cardName: string;
  x: number;
  y: number;
  hp: number;
}

interface GameView {
  matchId: string;
  status: string;
  tick: number;
  maxTicks: number;
  ticksPerSecond: number;
  players: Record<
    'LEFT' | 'RIGHT',
    {
      playerId: string;
      baseHp: number;
      energyHundredths: number;
      cards: Array<{ cardId: string; name: string; cost: number }>;
    }
  >;
  units: GameUnit[];
}

interface GameStarted {
  matchId: string;
  side: 'LEFT' | 'RIGHT';
  state: GameView;
}

let socket: Socket | undefined;
let gameplaySocket: Socket | undefined;
let input: ReturnType<typeof createInterface> | undefined;
let inQueue = false;
let matchFound = false;
let closing = false;
let activeMatchId: string | undefined;
let gameState: GameView | undefined;
let nextDeployRequestId = 1;

async function main(): Promise<void> {
  const prompts = createPromptInterface({ input: stdin, output: stdout });
  const serverUrl =
    (
      await prompts.question(
        `NestJS server URL [${process.env.WARLAND_SERVER_URL ?? 'http://localhost:3000'}]: `,
      )
    ).trim() ||
    process.env.WARLAND_SERVER_URL ||
    'http://localhost:3000';
  const username = (await prompts.question('Username: ')).trim();
  prompts.close();

  if (!username) {
    throw new Error('Username must not be empty.');
  }

  const password = await promptPassword();
  const login = await loginToServer(serverUrl, username, password);
  console.log(`Logged in as ${login.player.displayName}#${login.player.tag}.`);

  socket = io(serverUrl, {
    auth: { token: login.accessToken },
    transports: ['websocket'],
    timeout: 10_000,
    reconnection: false,
  });

  socket.on('connect', () => {
    console.log('Connected to matchmaking. Searching for an opponent...');
    socket?.emit('join_queue');
  });
  socket.on('connect_error', (error: Error) => {
    console.error(`WebSocket connection failed: ${error.message}`);
  });
  socket.on('queue_joined', () => {
    inQueue = true;
    console.log('You are in the matchmaking queue. Type "leave" to cancel.');
  });
  socket.on('queue_left', () => {
    inQueue = false;
    console.log('Left the matchmaking queue.');
  });
  socket.on('queue_error', (payload: unknown) => {
    console.error(`Queue error: ${messageFrom(payload)}`);
  });
  socket.on('match_error', (payload: unknown) => {
    console.error(`Matchmaking error: ${messageFrom(payload)}`);
  });
  socket.on('match_timeout', (payload: unknown) => {
    inQueue = false;
    console.log(`Search ended: ${messageFrom(payload)}`);
  });
  socket.on('match_found', (payload: unknown) => {
    if (!isMatchFound(payload)) {
      console.error('The server returned an invalid match_found message.');
      return;
    }

    inQueue = false;
    matchFound = true;
    console.log(`Match found: ${payload.matchId}`);
    console.log(`Opponent: ${payload.opponentName}#${payload.opponentTag} `);
    connectToGameplay(serverUrl, login.accessToken, payload.matchId);
  });
  socket.on('disconnect', (reason: string) => {
    if (!closing) {
      console.log(`Disconnected from the server: ${reason}`);
    }
  });

  input = createInterface({ input: stdin, output: stdout });
  console.log(
    'Commands: leave (while searching), deploy <card-id> <x> <y>, status, quit, help',
  );
  input.on('line', handleCommand);
  input.on('close', closeClient);
  process.once('SIGINT', closeClient);
}

async function loginToServer(
  serverUrl: string,
  username: string,
  password: string,
): Promise<LoginResponse> {
  let response: Response;
  try {
    response = await fetch(`${serverUrl.replace(/\/+$/, '')}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch (error) {
    throw new Error(
      `Could not reach the NestJS server: ${errorMessage(error)}`,
    );
  }

  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      `Login failed (${response.status}): ${messageFrom(payload)}`,
    );
  }
  if (!isLoginResponse(payload)) {
    throw new Error('The server returned an invalid login response.');
  }
  return payload;
}

async function promptPassword(): Promise<string> {
  stdout.write('Password: ');
  if (!stdin.isTTY) {
    const prompts = createPromptInterface({ input: stdin, output: stdout });
    const password = await prompts.question('');
    prompts.close();
    return password;
  }

  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let password = '';

    const restoreInput = () => {
      stdin.off('keypress', onKeypress);
      stdin.setRawMode(false);
      stdout.write('\n');
    };

    const onKeypress = (
      character: string,
      key: { name?: string; ctrl?: boolean },
    ) => {
      if (key.ctrl && key.name === 'c') {
        restoreInput();
        reject(new Error('Login cancelled.'));
        return;
      }
      if (key.name === 'return') {
        restoreInput();
        resolve(password);
        return;
      }
      if (key.name === 'backspace') {
        password = password.slice(0, -1);
        stdout.write('\b \b');
        return;
      }
      if (character && !key.ctrl) {
        password += character;
        stdout.write('*');
      }
    };

    stdin.on('keypress', onKeypress);
  });
}

function handleCommand(line: string): void {
  const [command, ...args] = line.trim().split(/\s+/);
  const normalizedCommand = command?.toLowerCase();
  if (normalizedCommand === 'help') {
    console.log(
      'Commands: leave (while searching), deploy <card-id> <x> <y>, status, quit',
    );
    return;
  }
  if (normalizedCommand === 'status') {
    if (gameState) {
      printGameState(gameState);
    } else {
      console.log('No active game state is available yet.');
    }
    return;
  }
  if (normalizedCommand === 'deploy') {
    if (!activeMatchId || !gameplaySocket?.connected) {
      console.log('You are not connected to an active game.');
      return;
    }
    const [cardId, rawX, rawY] = args;
    const x = Number(rawX);
    const y = Number(rawY);
    if (
      !cardId ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      args.length !== 3
    ) {
      console.log('Usage: deploy <card-id> <x> <y>');
      return;
    }
    const requestId = `terminal-${nextDeployRequestId++}`;
    gameplaySocket.emit('deploy', { requestId, cardId, x, y });
    console.log(`Deployment ${requestId} sent to the server.`);
    return;
  }
  if (normalizedCommand === 'leave') {
    if (inQueue) {
      socket?.emit('leave_queue');
    } else if (matchFound) {
      console.log('A match was found; use "quit" to disconnect.');
    } else {
      console.log('You are not currently in the matchmaking queue.');
    }
    return;
  }
  if (normalizedCommand === 'quit' || normalizedCommand === 'exit') {
    closeClient();
    return;
  }
  console.log('Unknown command. Type "help" for available commands.');
}

function connectToGameplay(
  serverUrl: string,
  accessToken: string,
  matchId: string,
): void {
  activeMatchId = matchId;
  gameplaySocket = io(`${serverUrl.replace(/\/+$/, '')}/gameplay`, {
    auth: { token: accessToken },
    transports: ['websocket'],
    timeout: 10_000,
    reconnection: false,
  });

  gameplaySocket.on('connect', () => {
    gameplaySocket?.emit('join_game', { matchId });
  });
  gameplaySocket.on('connect_error', (error: Error) => {
    console.error(`Gameplay connection failed: ${error.message}`);
  });
  gameplaySocket.on('game_started', (payload: unknown) => {
    if (!isGameStarted(payload)) {
      console.error('The server returned an invalid game_started message.');
      return;
    }
    gameState = payload.state;
    console.log(`Joined the game as ${payload.side}.`);
    console.log('Deploy cards with: deploy <card-id> <x> <y>');
    console.log(
      `Your cards: ${payload.state.players[payload.side].cards
        .map((card) => `${card.name} (${card.cardId})`)
        .join(', ')}`,
    );
    printGameState(payload.state);
  });
  gameplaySocket.on('game_state', (payload: unknown) => {
    if (!isGameView(payload)) {
      console.error('The server returned an invalid game_state message.');
      return;
    }
    gameState = payload;
    if (payload.tick % Math.max(1, payload.ticksPerSecond) === 0) {
      printGameState(payload);
    }
  });
  gameplaySocket.on('deploy_queued', (payload: unknown) => {
    if (isRecord(payload) && typeof payload.requestId === 'string') {
      console.log(`Deployment ${payload.requestId} is queued for validation.`);
    }
  });
  gameplaySocket.on('deploy_result', (payload: unknown) => {
    if (!isRecord(payload)) {
      console.error('The server returned an invalid deploy_result message.');
      return;
    }
    console.log(
      `Deployment ${String(payload.requestId ?? '')}: ` +
        `${String(payload.status)}${payload.reason ? ` (${String(payload.reason)})` : ''}`,
    );
  });
  gameplaySocket.on('match_finished', (payload: unknown) => {
    if (!isRecord(payload) || !isRecord(payload.result)) {
      console.error('The server returned an invalid match_finished message.');
      return;
    }
    console.log(
      `Match finished: ${String(payload.result.winner ?? 'DRAW')} ` +
        `(${String(payload.result.reason)}).`,
    );
    activeMatchId = undefined;
  });
  gameplaySocket.on('game_error', (payload: unknown) => {
    console.error(`Gameplay error: ${messageFrom(payload)}`);
  });
}

function printGameState(view: GameView): void {
  const left = view.players.LEFT;
  const right = view.players.RIGHT;
  console.log(
    `\nMatch ${view.matchId} | Tick ${view.tick}/${view.maxTicks} | ${view.status}`,
  );
  console.log(
    `LEFT base ${left.baseHp} HP, energy ${(left.energyHundredths / 100).toFixed(2)} | ` +
      `RIGHT base ${right.baseHp} HP, energy ${(right.energyHundredths / 100).toFixed(2)}`,
  );
  if (view.units.length === 0) {
    console.log('No units deployed yet.');
    return;
  }
  for (const unit of view.units) {
    console.log(
      `  ${unit.owner} ${unit.cardName} at (${unit.x.toFixed(1)}, ${unit.y.toFixed(1)}) — ${unit.hp} HP`,
    );
  }
}

function closeClient(): void {
  if (closing) {
    return;
  }
  closing = true;
  if (inQueue && !matchFound) {
    socket?.emit('leave_queue');
  }
  gameplaySocket?.disconnect();
  socket?.disconnect();
  input?.close();
}

function isLoginResponse(value: unknown): value is LoginResponse {
  return (
    isRecord(value) &&
    typeof value.accessToken === 'string' &&
    isRecord(value.player) &&
    typeof value.player.displayName === 'string' &&
    typeof value.player.tag === 'string'
  );
}

function isMatchFound(value: unknown): value is MatchFound {
  return (
    isRecord(value) &&
    typeof value.matchId === 'string' &&
    typeof value.opponentId === 'string' &&
    typeof value.opponentName === 'string' &&
    typeof value.opponentTag === 'string'
  );
}

function isGameStarted(value: unknown): value is GameStarted {
  return (
    isRecord(value) &&
    typeof value.matchId === 'string' &&
    (value.side === 'LEFT' || value.side === 'RIGHT') &&
    isGameView(value.state)
  );
}

function isGameView(value: unknown): value is GameView {
  if (
    !isRecord(value) ||
    typeof value.matchId !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.tick !== 'number' ||
    typeof value.maxTicks !== 'number' ||
    typeof value.ticksPerSecond !== 'number' ||
    !isRecord(value.players) ||
    !Array.isArray(value.units)
  ) {
    return false;
  }

  return (
    isPlayerView(value.players.LEFT) &&
    isPlayerView(value.players.RIGHT) &&
    value.units.every(
      (unit) =>
        isRecord(unit) &&
        (unit.owner === 'LEFT' || unit.owner === 'RIGHT') &&
        typeof unit.cardName === 'string' &&
        typeof unit.x === 'number' &&
        typeof unit.y === 'number' &&
        typeof unit.hp === 'number',
    )
  );
}

function isPlayerView(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.playerId === 'string' &&
    typeof value.baseHp === 'number' &&
    typeof value.energyHundredths === 'number' &&
    Array.isArray(value.cards) &&
    value.cards.every(
      (card) =>
        isRecord(card) &&
        typeof card.cardId === 'string' &&
        typeof card.name === 'string' &&
        typeof card.cost === 'number',
    )
  );
}

function messageFrom(value: unknown): string {
  if (!isRecord(value) || !('message' in value)) {
    return 'No additional details were provided.';
  }
  if (typeof value.message === 'string') {
    return value.message;
  }
  if (
    Array.isArray(value.message) &&
    value.message.every((message) => typeof message === 'string')
  ) {
    return value.message.join('; ');
  }
  return 'The server returned an invalid error message.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  closeClient();
  process.exitCode = 1;
});
