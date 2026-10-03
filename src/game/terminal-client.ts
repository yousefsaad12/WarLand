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

let socket: Socket | undefined;
let input: ReturnType<typeof createInterface> | undefined;
let inQueue = false;
let matchFound = false;
let closing = false;

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
    console.log(
      `Opponent: ${payload.opponentName}#${payload.opponentTag} `,
    );
    console.log(
      'This server currently provides matchmaking only; it has no game-state or deploy WebSocket events yet.',
    );
    console.log('Type "quit" to disconnect.');
  });
  socket.on('disconnect', (reason: string) => {
    if (!closing) {
      console.log(`Disconnected from the server: ${reason}`);
    }
  });

  input = createInterface({ input: stdin, output: stdout });
  console.log('Commands: leave (while searching), quit, help');
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
  const command = line.trim().toLowerCase();
  if (command === 'help') {
    console.log('Commands: leave (while searching), quit');
    return;
  }
  if (command === 'leave') {
    if (inQueue) {
      socket?.emit('leave_queue');
    } else if (matchFound) {
      console.log('A match was found; the server has no match-cancel event.');
    } else {
      console.log('You are not currently in the matchmaking queue.');
    }
    return;
  }
  if (command === 'quit' || command === 'exit') {
    closeClient();
    return;
  }
  console.log('Unknown command. Type "help" for available commands.');
}

function closeClient(): void {
  if (closing) {
    return;
  }
  closing = true;
  if (inQueue && !matchFound) {
    socket?.emit('leave_queue');
  }
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
