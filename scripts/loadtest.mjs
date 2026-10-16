#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { io } from 'socket.io-client';

const TICK_MS = 100;
const DEFAULTS = {
  url: process.env.WARLAND_SERVER_URL ?? 'http://localhost:3000',
  bots: 40,
  rampMs: 10_000,
  durationMs: 60_000,
  graceMs: 200_000,
  thinkMs: 250,
  seed: 1,
  regConcurrency: 4,
  out: 'loadtest-report.json',
  minAcceptRate: 0.9,
  maxTickP95Drift: 30,
  maxErrorRate: 0.05,
  minMatches: 0,
  searchTimeoutMs: 340_000,
  gameStartTimeoutMs: 30_000,
  matchTimeoutMs: 210_000,
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(
    [
      'Usage: npm run loadtest -- [options]',
      '',
      `  --url <url>                 Server URL (default ${DEFAULTS.url})`,
      `  --bots <n>                  Bot accounts, paired up (default ${DEFAULTS.bots})`,
      `  --ramp-ms <n>               Stagger bot starts over this window (default ${DEFAULTS.rampMs})`,
      `  --duration-ms <n>           Keep starting matches this long after the ramp (default ${DEFAULTS.durationMs})`,
      `  --grace-ms <n>              Wait for in-flight matches after the deadline (default ${DEFAULTS.graceMs})`,
      `  --think-ms <n>              Minimum delay between deploy attempts (default ${DEFAULTS.thinkMs})`,
      `  --seed <n>                  Bot username seed (default ${DEFAULTS.seed})`,
      `  --out <file>                JSON report path (default ${DEFAULTS.out})`,
      `  --min-accept-rate <n>       Threshold (default ${DEFAULTS.minAcceptRate})`,
      `  --max-tick-p95-drift <n>    Threshold in ms (default ${DEFAULTS.maxTickP95Drift})`,
      `  --max-error-rate <n>        Threshold (default ${DEFAULTS.maxErrorRate})`,
      `  --min-matches <n>           Threshold for finished matches (default ${DEFAULTS.minMatches})`,
      '  --no-thresholds             Never fail the exit code on thresholds',
      '  --help                      Show this help',
    ].join('\n'),
  );
  process.exit(0);
}

const config = {
  url: String(args.url ?? DEFAULTS.url).replace(/\/+$/, ''),
  bots: int(args.bots, DEFAULTS.bots, 2),
  rampMs: int(args['ramp-ms'], DEFAULTS.rampMs, 0),
  durationMs: int(args['duration-ms'], DEFAULTS.durationMs, 0),
  graceMs: int(args['grace-ms'], DEFAULTS.graceMs, 0),
  thinkMs: int(args['think-ms'], DEFAULTS.thinkMs, 50),
  seed: int(args.seed, DEFAULTS.seed, 0),
  regConcurrency: int(args['reg-concurrency'], DEFAULTS.regConcurrency, 1),
  out: String(args.out ?? DEFAULTS.out),
  minAcceptRate: number(args['min-accept-rate'], DEFAULTS.minAcceptRate),
  maxTickP95Drift: number(args['max-tick-p95-drift'], DEFAULTS.maxTickP95Drift),
  maxErrorRate: number(args['max-error-rate'], DEFAULTS.maxErrorRate),
  minMatches: int(args['min-matches'], DEFAULTS.minMatches, 0),
  searchTimeoutMs: int(args['search-timeout-ms'], DEFAULTS.searchTimeoutMs, 1000),
  gameStartTimeoutMs: int(args['game-start-timeout-ms'], DEFAULTS.gameStartTimeoutMs, 1000),
  matchTimeoutMs: int(args['match-timeout-ms'], DEFAULTS.matchTimeoutMs, 1000),
  thresholds: !args['no-thresholds'],
};

if (config.bots % 2 !== 0) {
  console.warn('Warning: odd bot count, the last bot will wait for an opponent.');
}

const rng = mulberry32(config.seed);
const metrics = createMetrics();
const bots = [];
let activeMatches = 0;
let stopping = false;
let stopReason = 'completed';
let peakConcurrentMatches = 0;
let concurrentSamples = 0;
let concurrentSum = 0;
let testStartTime = 0;

main().catch((error) => {
  console.error('Load test failed:', errorMessage(error));
  process.exit(1);
});

async function main() {
  console.log(
    `Load test against ${config.url}: ${config.bots} bots, ramp ${config.rampMs}ms, duration ${config.durationMs}ms`,
  );

  const accounts = await createAccounts(config.bots);
  testStartTime = Date.now();
  const stopTime = testStartTime + config.rampMs + config.durationMs;

  const progress = setInterval(printProgress, 5000);
  const sampler = setInterval(() => {
    concurrentSum += activeMatches;
    concurrentSamples += 1;
    peakConcurrentMatches = Math.max(peakConcurrentMatches, activeMatches);
  }, 1000);

  const onSigint = () => {
    stopping = true;
    stopReason = 'interrupted';
    console.log('\nInterrupted, draining active matches...');
  };
  process.once('SIGINT', onSigint);

  for (let i = 0; i < accounts.length; i += 1) {
    const startIn = accounts.length > 1 ? Math.floor((i * config.rampMs) / accounts.length) : 0;
    const bot = createBot(i, accounts[i]);
    bots.push(bot);
    bot.task = (async () => {
      await sleep(startIn);
      await bot.run(stopTime);
    })();
  }

  const deadline = stopTime + config.graceMs;
  while (true) {
    if (stopping) break;
    if (Date.now() >= deadline) {
      stopReason = activeMatches > 0 ? 'grace-expired' : 'completed';
      break;
    }
    if (
      Date.now() >= stopTime &&
      activeMatches === 0 &&
      bots.length > 0 &&
      bots.every((bot) => bot.settled)
    ) {
      stopReason = 'completed';
      break;
    }
    await sleep(250);
  }

  stopping = true;
  clearInterval(progress);
  clearInterval(sampler);
  process.removeListener('SIGINT', onSigint);

  for (const bot of bots) {
    bot.close();
  }
  await Promise.allSettled(bots.map((bot) => bot.task));

  const report = buildReport(stopReason);
  writeFileSync(config.out, `${JSON.stringify(report, null, 2)}\n`);
  printSummary(report);
  console.log(`\nFull report written to ${config.out}`);
  process.exit(report.passed ? 0 : 1);
}

function createBot(index, account) {
  const bot = {
    index,
    id: `bot${index}`,
    account,
    mmSocket: null,
    gpSocket: null,
    side: null,
    state: null,
    inMatch: false,
    settled: false,
    queueStartedAt: 0,
    matchStartedAt: 0,
    lastStateAt: 0,
    lastDeployAt: 0,
    pendingRequests: new Map(),
    deploySeq: 0,
    waiters: [],
    task: null,

    async run(stopTime) {
      try {
        this.mmSocket = connectSocket(config.url, this.account.token);
        this.attachMmListeners(this.mmSocket);
        await waitForConnect(this.mmSocket, 15_000);

        while (!stopping && Date.now() < stopTime) {
          const matchId = await this.queueForMatch();
          if (!matchId) break;
          await this.playMatch(matchId);
        }
      } catch (error) {
        const message = errorMessage(error);
        if (!message.startsWith('connection')) countError('bot_failure', message);
      } finally {
        this.settled = true;
        this.close();
      }
    },

    attachMmListeners(socket) {
      socket.on('match_found', (payload) => {
        metrics.matchesFound += 1;
        if (this.queueStartedAt) {
          metrics.queueWaitMs.push(Date.now() - this.queueStartedAt);
          this.queueStartedAt = 0;
        }
        this.dispatch('match_found', payload);
      });
      socket.on('queue_error', (payload) => {
        countError('queue_error', messageFrom(payload));
        this.dispatch('queue_error', payload);
      });
      socket.on('match_error', (payload) => {
        countError('match_error', messageFrom(payload));
        this.dispatch('match_error', payload);
      });
      socket.on('match_timeout', (payload) => {
        if (!stopping) countError('match_timeout', messageFrom(payload));
        this.dispatch('match_timeout', payload);
      });
      attachTransportListeners(socket, this);
    },

    async queueForMatch() {
      this.queueStartedAt = Date.now();
      this.mmSocket.emit('join_queue');
      const event = await this.wait(
        ['match_found', 'match_timeout', 'queue_error', 'match_error'],
        config.searchTimeoutMs,
      );
      if (!event || event.name !== 'match_found') return null;
      const matchId = event.payload?.matchId;
      if (typeof matchId !== 'string' || !matchId) {
        countError('bad_payload', 'match_found without matchId');
        return null;
      }
      this.inMatch = true;
      activeMatches += 1;
      peakConcurrentMatches = Math.max(peakConcurrentMatches, activeMatches);
      return matchId;
    },

    async playMatch(matchId) {
      this.side = null;
      this.state = null;
      this.lastStateAt = 0;
      this.lastDeployAt = 0;
      this.matchStartedAt = Date.now();

      const socket = connectSocket(`${config.url}/gameplay`, this.account.token);
      this.gpSocket = socket;

      socket.on('game_started', (payload) => {
        if (payload?.side === 'LEFT' || payload?.side === 'RIGHT') {
          this.side = payload.side;
          metrics.matchesJoined += 1;
        }
        this.state = payload?.state;
        this.dispatch('game_started', payload);
      });
      socket.on('game_state', (payload) => this.onGameState(payload));
      socket.on('deploy_result', (payload) => this.onDeployResult(payload));
      socket.on('match_finished', (payload) => {
        const reason = payload?.result?.reason ?? 'UNKNOWN';
        metrics.matchesFinished += 1;
        metrics.matchesByReason[reason] = (metrics.matchesByReason[reason] ?? 0) + 1;
        metrics.matchDurationMs.push(Date.now() - this.matchStartedAt);
        this.endMatch();
        this.dispatch('match_finished', payload);
      });
      socket.on('game_error', (payload) => {
        countError('game_error', messageFrom(payload));
        this.dispatch('game_error', payload);
      });
      attachTransportListeners(socket, this);

      try {
        await waitForConnect(socket, 15_000);
        socket.emit('join_game', { matchId });

        const started = await this.wait(['game_started', 'game_error'], config.gameStartTimeoutMs);
        if (!started || started.name !== 'game_started') {
          if (!stopping) {
            countError('game_start_failed', started ? messageFrom(started.payload) : 'timed out');
          }
          metrics.matchesUnfinished += 1;
          this.endMatch();
          return;
        }
        if (!this.side) {
          if (!stopping) countError('game_start_failed', 'missing side in game_started');
          metrics.matchesUnfinished += 1;
          this.endMatch();
          return;
        }

        const finished = await this.wait(['match_finished', 'game_error'], config.matchTimeoutMs);
        if (!finished || finished.name !== 'match_finished') {
          if (!finished) {
            if (!stopping) countError('match_timeout', `match ${matchId} did not finish in time`);
          } else if (stopping) {
            countError('match_aborted', `match ${matchId} closed before finishing`);
          }
          metrics.matchesUnfinished += 1;
          this.endMatch();
        }
      } finally {
        metrics.deploysLost += this.pendingRequests.size;
        this.pendingRequests.clear();
        socket.removeAllListeners();
        socket.disconnect();
        if (this.gpSocket === socket) this.gpSocket = null;
      }
    },

    onGameState(payload) {
      if (!payload || typeof payload.tick !== 'number') return;
      if (payload.status === 'RUNNING') {
        const now = Date.now();
        if (this.lastStateAt) {
          metrics.tickDriftMs.push(Math.abs(now - this.lastStateAt - TICK_MS));
        }
        this.lastStateAt = now;
      }
      this.state = payload;
      if (!this.side || payload.status !== 'RUNNING') return;
      const now = Date.now();
      if (now - this.lastDeployAt < config.thinkMs) return;
      this.tryDeploy(now);
    },

    tryDeploy(now) {
      const me = this.state?.players?.[this.side];
      if (!me || !Array.isArray(me.cards) || !this.gpSocket) return;
      let pending = 0;
      for (const cost of this.pendingRequests.values()) pending += cost;
      const affordable = me.cards.filter(
        (card) => typeof card.cost === 'number' && me.energyHundredths >= card.cost * 100 + 10 + pending,
      );
      if (affordable.length === 0) return;
      const card = affordable[Math.floor(rng() * affordable.length)];
      const frontline = 42 + rng() * 6;
      const x = this.side === 'LEFT' ? frontline : 100 - frontline;
      const y = 44 + rng() * 12;
      const requestId = `${this.id}-${this.deploySeq += 1}`;
      this.pendingRequests.set(requestId, card.cost * 100);
      this.lastDeployAt = now;
      metrics.deploysSent += 1;
      metrics.deploySentAt.set(requestId, now);
      this.gpSocket.emit('deploy', { requestId, cardId: card.cardId, x, y });
    },

    onDeployResult(payload) {
      if (!payload || typeof payload.requestId !== 'string') return;
      if (!payload.requestId.startsWith(`${this.id}-`)) return;
      const sentAt = metrics.deploySentAt.get(payload.requestId);
      if (sentAt !== undefined) {
        metrics.deployLatencyMs.push(Date.now() - sentAt);
        metrics.deploySentAt.delete(payload.requestId);
      }
      this.pendingRequests.delete(payload.requestId);
      if (payload.status === 'ACCEPTED') {
        metrics.deploysAccepted += 1;
        return;
      }
      metrics.deploysRejected += 1;
      const reason = typeof payload.reason === 'string' ? payload.reason : String(payload.status);
      metrics.deployRejectReasons[reason] = (metrics.deployRejectReasons[reason] ?? 0) + 1;
    },

    endMatch() {
      if (!this.inMatch) return;
      this.inMatch = false;
      activeMatches = Math.max(0, activeMatches - 1);
    },

    wait(names, timeoutMs) {
      return new Promise((resolve) => {
        const waiter = { names: new Set(names), timer: null, resolve: null };
        waiter.resolve = (event) => {
          clearTimeout(waiter.timer);
          const position = this.waiters.indexOf(waiter);
          if (position >= 0) this.waiters.splice(position, 1);
          resolve(event);
        };
        waiter.timer = setTimeout(() => waiter.resolve(null), timeoutMs);
        this.waiters.push(waiter);
      });
    },

    dispatch(name, payload) {
      for (const waiter of Array.from(this.waiters)) {
        if (waiter.names.has(name)) {
          waiter.resolve({ name, payload });
          return;
        }
      }
    },

    flushWaiters() {
      for (const waiter of Array.from(this.waiters)) {
        waiter.resolve({ name: 'closed', payload: null });
      }
    },

    close() {
      this.flushWaiters();
      this.endMatch();
      for (const socket of [this.gpSocket, this.mmSocket]) {
        if (!socket) continue;
        socket.removeAllListeners();
        socket.disconnect();
      }
      this.gpSocket = null;
      this.mmSocket = null;
    },
  };
  return bot;
}

function attachTransportListeners(socket, bot) {
  socket.on('disconnect', (reason) => {
    if (reason !== 'io client disconnect' && !stopping) {
      countError('server_disconnect', `${socket.io.uri}: ${reason}`);
    }
    bot.flushWaiters();
  });
  socket.on('connect_error', (error) => {
    if (!stopping) countError('connect_error', error.message);
  });
}

async function createAccounts(count) {
  const accounts = Array.from({ length: count });
  let next = 0;
  const worker = async () => {
    while (next < count) {
      const index = next;
      next += 1;
      accounts[index] = await createAccount(index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(config.regConcurrency, count) }, worker));
  return accounts;
}

async function createAccount(index) {
  const username = `lt${config.seed}_${index}`;
  const password = `loadtest-${config.seed}-pw`;
  const displayName = `LoadBot${config.seed}_${index}`;

  const login = await httpJson('POST', '/auth/login', { username, password });
  if (login.ok && typeof login.body?.accessToken === 'string') {
    metrics.accountsReused += 1;
    return { username, token: login.body.accessToken };
  }

  const register = await httpJson('POST', '/auth/register', {
    username,
    displayName,
    password,
  });
  if (!register.ok || typeof register.body?.accessToken !== 'string') {
    metrics.accountsFailed += 1;
    throw new Error(
      `Could not create account ${username}: HTTP ${register.status} ${messageFrom(register.body)}`,
    );
  }
  metrics.accountsCreated += 1;
  return { username, token: register.body.accessToken };
}

async function httpJson(method, path, body) {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (method !== 'GET') options.body = JSON.stringify(body);
  const response = await fetch(`${config.url}${path}`, options);
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { ok: response.ok, status: response.status, body: parsed };
}

function connectSocket(url, token) {
  return io(url, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    timeout: 15_000,
    forceNew: true,
  });
}

function waitForConnect(socket, timeoutMs) {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`connection to ${socket.io.uri} timed out`));
    }, timeoutMs);
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(new Error(`connection to ${socket.io.uri} failed: ${error.message}`));
    };
    socket.on('connect', onConnect);
    socket.on('connect_error', onError);
  });
}

function countError(type, detail) {
  metrics.errorsByType[type] = (metrics.errorsByType[type] ?? 0) + 1;
  metrics.errorTotal += 1;
  if (metrics.lastErrors.length < 20) metrics.lastErrors.push(`${type}: ${detail}`);
}

function createMetrics() {
  return {
    accountsCreated: 0,
    accountsReused: 0,
    accountsFailed: 0,
    queueWaitMs: reservoir(50_000),
    matchDurationMs: reservoir(50_000),
    tickDriftMs: reservoir(300_000),
    deployLatencyMs: reservoir(100_000),
    deploySentAt: new Map(),
    deploysSent: 0,
    deploysAccepted: 0,
    deploysRejected: 0,
    deploysLost: 0,
    deployRejectReasons: {},
    matchesFound: 0,
    matchesJoined: 0,
    matchesFinished: 0,
    matchesUnfinished: 0,
    matchesByReason: {},
    errorsByType: {},
    errorTotal: 0,
    lastErrors: [],
  };
}

function buildReport(stopReason) {
  const finishedResults = metrics.deploysAccepted + metrics.deploysRejected;
  const acceptRate = finishedResults > 0 ? metrics.deploysAccepted / finishedResults : 1;
  const operations = metrics.matchesFound + metrics.deploysSent + config.bots;
  const errorRate = metrics.errorTotal / Math.max(1, operations);
  const tickStats = summarize(metrics.tickDriftMs);
  const elapsedMs = Date.now() - testStartTime;

  const checks = [
    {
      name: 'min_accept_rate',
      value: round(acceptRate, 4),
      limit: config.minAcceptRate,
      pass: acceptRate >= config.minAcceptRate,
    },
    {
      name: 'max_tick_p95_drift_ms',
      value: tickStats.p95 ?? 0,
      limit: config.maxTickP95Drift,
      pass: (tickStats.p95 ?? 0) <= config.maxTickP95Drift,
    },
    {
      name: 'max_error_rate',
      value: round(errorRate, 4),
      limit: config.maxErrorRate,
      pass: errorRate <= config.maxErrorRate,
    },
    {
      name: 'min_finished_matches',
      value: metrics.matchesFinished,
      limit: config.minMatches,
      pass: metrics.matchesFinished >= config.minMatches,
    },
  ];

  return {
    config,
    stopReason,
    startedAt: new Date(testStartTime).toISOString(),
    elapsedMs,
    accounts: {
      created: metrics.accountsCreated,
      reused: metrics.accountsReused,
      failed: metrics.accountsFailed,
    },
    queue: { waitMs: summarize(metrics.queueWaitMs) },
    matches: {
      found: metrics.matchesFound,
      joined: metrics.matchesJoined,
      finished: metrics.matchesFinished,
      unfinished: metrics.matchesUnfinished,
      byReason: metrics.matchesByReason,
      durationMs: summarize(metrics.matchDurationMs),
      finishedPerMinute: round(metrics.matchesFinished / Math.max(1, elapsedMs / 60_000), 2),
      concurrentPeak: peakConcurrentMatches,
      concurrentAvg: round(concurrentSamples > 0 ? concurrentSum / concurrentSamples : 0, 2),
    },
    deploys: {
      sent: metrics.deploysSent,
      accepted: metrics.deploysAccepted,
      rejected: metrics.deploysRejected,
      lost: metrics.deploysLost,
      acceptRate: round(acceptRate, 4),
      rejectReasons: metrics.deployRejectReasons,
      latencyMs: summarize(metrics.deployLatencyMs),
    },
    ticks: { driftMs: tickStats },
    errors: {
      total: metrics.errorTotal,
      rate: round(errorRate, 4),
      byType: metrics.errorsByType,
      last: metrics.lastErrors,
    },
    thresholds: { enabled: config.thresholds, checks },
    passed: !config.thresholds || checks.every((check) => check.pass),
  };
}

function printProgress() {
  const elapsed = Math.round((Date.now() - testStartTime) / 1000);
  const settled = bots.filter((bot) => bot.settled).length;
  const drift = summarize(metrics.tickDriftMs);
  const resolved = metrics.deploysAccepted + metrics.deploysRejected;
  const accept = resolved > 0 ? Math.round((metrics.deploysAccepted / resolved) * 100) : 100;
  console.log(
    `[${elapsed}s] active=${activeMatches} settled=${settled}/${bots.length} ` +
      `found=${metrics.matchesFound} finished=${metrics.matchesFinished} ` +
      `deploys=${metrics.deploysSent} accept=${accept}% ` +
      `tickP95=+${drift.p95 ?? 0}ms errors=${metrics.errorTotal}`,
  );
}

function printSummary(report) {
  const m = report.matches;
  const d = report.deploys;
  const t = report.ticks.driftMs;
  console.log('\n=== WarLand load test report ===');
  console.log(
    `stop=${report.stopReason} elapsed=${Math.round(report.elapsedMs / 1000)}s bots=${config.bots}`,
  );
  console.log(
    `matches: found=${m.found} joined=${m.joined} finished=${m.finished} ` +
      `unfinished=${m.unfinished} peakConcurrent=${m.concurrentPeak} ` +
      `avgConcurrent=${m.concurrentAvg} perMinute=${m.finishedPerMinute}`,
  );
  console.log(`match reasons: ${JSON.stringify(m.byReason)}`);
  console.log(
    `match duration ms: p50=${m.durationMs.p50 ?? '-'} p95=${m.durationMs.p95 ?? '-'} max=${m.durationMs.max ?? '-'}`,
  );
  console.log(
    `queue wait ms: p50=${report.queue.waitMs.p50 ?? '-'} p95=${report.queue.waitMs.p95 ?? '-'}`,
  );
  console.log(
    `deploys: sent=${d.sent} accepted=${d.accepted} rejected=${d.rejected} lost=${d.lost} ` +
      `acceptRate=${d.acceptRate} latencyP95=${d.latencyMs.p95 ?? '-'}ms`,
  );
  if (Object.keys(d.rejectReasons).length > 0) {
    console.log(`reject reasons: ${JSON.stringify(d.rejectReasons)}`);
  }
  console.log(`tick drift ms: p50=${t.p50 ?? '-'} p95=${t.p95 ?? '-'} max=${t.max ?? '-'}`);
  console.log(
    `errors: total=${report.errors.total} rate=${report.errors.rate} ${JSON.stringify(report.errors.byType)}`,
  );
  for (const check of report.thresholds.checks) {
    console.log(
      `threshold ${check.name}: ${check.value} (limit ${check.limit}) -> ${check.pass ? 'PASS' : 'FAIL'}`,
    );
  }
  console.log(`result: ${report.passed ? 'PASSED' : 'FAILED'}`);
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      i += 1;
    }
  }
  return options;
}

function int(value, fallback, min) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function number(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function reservoir(capacity) {
  const values = [];
  let seen = 0;
  return {
    values,
    push(value) {
      if (!Number.isFinite(value)) return;
      seen += 1;
      if (values.length < capacity) {
        values.push(value);
        return;
      }
      const index = Math.floor(Math.random() * seen);
      if (index < capacity) values[index] = value;
    },
  };
}

function summarize(sample) {
  const values = sample.values;
  if (values.length === 0) return { count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (p) =>
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    p50: round(pick(50), 1),
    p95: round(pick(95), 1),
    max: round(sorted[sorted.length - 1], 1),
    mean: round(sum / sorted.length, 1),
  };
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function messageFrom(payload) {
  if (payload == null) return 'no details';
  if (typeof payload === 'string') return payload;
  if (typeof payload.message === 'string') return payload.message;
  if (Array.isArray(payload.message)) return payload.message.join('; ');
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
