# WarLand

WarLand is a server-authoritative, real-time multiplayer lane-battle prototype. The backend is built with NestJS, Socket.IO, Prisma, PostgreSQL, and Redis. Players can register and log in, enter matchmaking, join a live match, deploy cards, and receive authoritative game updates.

The project includes ranked matchmaking, live online matches, a local practice arena, and interactive terminal clients.

> **Project status:** Prototype. Active gameplay state and matchmaking presence are held in process memory. This version is intended for local development and single-server testing, not resilient multi-instance production hosting.

## Contents

- [What is implemented](#what-is-implemented)
- [Architecture at a glance](#architecture-at-a-glance)
- [Match lifecycle](#match-lifecycle)
- [Gameplay and balance](#gameplay-and-balance)
- [Data model](#data-model)
- [Run locally](#run-locally)
- [Terminal clients](#terminal-clients)
- [API and Socket.IO contracts](#api-and-socketio-contracts)
- [Configuration](#configuration)
- [Development commands](#development-commands)
- [Load testing](#load-testing)
  - [How it works](#how-it-works)
  - [Results](#results)
  - [Why the 500+ bot runs fail the threshold](#why-the-500-bot-runs-fail-the-threshold)
  - [Bottleneck analysis](#bottleneck-analysis)
- [Known limitations and review areas](#known-limitations-and-review-areas)
- [Repository map](#repository-map)

## What is implemented

- Username/password registration and login with bcrypt password hashing and JWT access tokens.
- Authenticated HTTP player endpoints and authenticated Socket.IO namespaces.
- Rating-based matchmaking backed by a Redis sorted set and an atomic Lua claim script.
- Match and player records stored in PostgreSQL through Prisma.
- A deterministic game engine with energy regeneration, unit movement, attacks, base damage, deployments, and match-end conditions.
- Server-side Socket.IO gameplay rooms with queued deployments and timed simulation ticks.
- Database persistence of finished match status, winner flags, and player win/loss counters.
- A local terminal simulation and an online terminal client.

The HTTP and Socket.IO contracts below are client-agnostic, so a browser or mobile client can be built against the same interfaces later.

## Architecture at a glance

```mermaid
flowchart LR
    P1["Player 1<br/>Online terminal"] <-->|"Socket.IO events"| MM["MatchmakingGateway<br/>MatchmakingService"]
    P2["Player 2<br/>Online terminal"] <-->|"Socket.IO events"| MM
    P1 <-->|"Socket.IO events<br/>/gameplay"| GW["GameplayGateway"]
    P2 <-->|"Socket.IO events<br/>/gameplay"| GW
    MM -->|"Find / claim opponent"| R["Redis<br/>matchmaking queue"]
    MM -->|"Create match + participants"| DB[("PostgreSQL<br/>Prisma")]
    MM -->|"Initialize in-memory state"| GS["GameplayService"]
    GW -->|"Queue commands / advance ticks"| GS
    GS --> ENG["Game engine<br/>pure simulation functions"]
    GS -->|"Persist final result"| DB
    GW -->|"game_state / deploy_result / match_finished"| P1
    GW -->|"game_state / deploy_result / match_finished"| P2
```

### Responsibilities

| Component | Responsibility |
|---|---|
| `AuthModule` | Registration, password verification, JWT creation, and HTTP auth guard. |
| `MatchmakingGateway` / `MatchmakingService` | Queue events, matchmaking search, database match creation, and gameplay initialization. |
| `RedisService` | Redis connection and the atomic `findAndClaimMatch` Lua command. |
| `GameplayGateway` | WebSocket authentication, participant room joins, deployment queueing, per-match tick timers, and room broadcasts. |
| `GameplayService` | Load player decks, create/store match state, provide participant-checked views, advance the engine, and persist match outcomes. |
| `src/game/engine/engine.ts` | Game rules and state transitions. It does not depend on NestJS, Socket.IO, or Prisma. |
| `DbService` | Prisma client lifecycle and PostgreSQL access. |
| `ActivePlayers` | In-memory mapping of player IDs to active match IDs, used to prevent active players from queueing again. |

## Match lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant C1 as Player 1 client
    participant C2 as Player 2 client
    participant M as Matchmaking gateway/service
    participant R as Redis
    participant DB as PostgreSQL
    participant G as Gameplay gateway
    participant S as Gameplay service / engine

    C1->>M: join_queue (JWT-authenticated)
    M->>R: Add player to matchmaking queue
    C2->>M: join_queue (JWT-authenticated)
    M->>R: Atomically find and claim opponent
    M->>DB: Create Match and MatchPlayer records
    M->>S: startMatch(matchId, player1Id, player2Id)
    S->>DB: Load each player's card deck
    S-->>M: Store in-memory engine state
    M-->>C1: match_found
    M-->>C2: match_found

    C1->>G: Connect /gameplay (JWT + join_game)
    G-->>C1: game_started with authorized MatchView
    C2->>G: Connect /gameplay (JWT + join_game)
    G-->>C2: game_started with authorized MatchView
    Note over G: Start a timer after both participants join

    C1->>G: deploy {requestId, cardId, x, y}
    G-->>C1: deploy_queued
    C2->>G: deploy {requestId, cardId, x, y}
    G-->>C2: deploy_queued
    loop Each game tick
        G->>S: advanceMatchTick(matchId, queuedCommands)
        S->>S: Advance authoritative engine state
        S-->>G: New state and deployment results
        G-->>C1: game_state / deploy_result
        G-->>C2: game_state / deploy_result
    end
    G->>DB: Persist finished status, winner, and player stats
    G-->>C1: match_finished
    G-->>C2: match_finished
```

1. Each connected player joins matchmaking using their JWT-authenticated root Socket.IO connection.
2. Matchmaking stores/searches queue entries in Redis. Once it finds an opponent, it creates the relational match records and asks `GameplayService` to initialize the game.
3. The gameplay service loads both decks from PostgreSQL and creates a validated engine state in an in-memory map keyed by match ID.
4. Each client connects to the `/gameplay` namespace, authenticates again with its JWT, and sends `join_game`.
5. The gateway verifies that the authenticated player belongs to the requested match, joins the Socket.IO room, and sends `game_started`.
6. After both participants are in the room, one timer advances the match at the configured tick rate.
7. Deployment events are queued until a tick. The game engine validates and processes those commands, then the gateway broadcasts `game_state` and `deploy_result`.
8. On completion, the gateway stops the timer, persists the result, releases both players from the active-player store, and emits `match_finished`.

## Gameplay and balance

Default rules are defined in [`src/game/balance.ts`](./src/game/balance.ts):

| Rule | Default |
|---|---:|
| Simulation rate | 10 ticks/second |
| Match duration | 180 seconds (1,800 ticks) |
| Starting energy | 5 |
| Maximum energy | 10 |
| Energy regeneration | 0.5 per second |
| Base health | 1,000 |
| Maximum deployment requests | 3 per player per tick |

Energy is represented internally in hundredths to avoid floating-point drift. The engine checks the selected card, position bounds, the player's deployment zone, and available energy. Both axes are in the inclusive `0..100` range. A deployment must be inside the player's own half — `LEFT` at `x < 50` and `RIGHT` at `x > 50`, with the `x = 50` midline off limits — and within the lane band `y = 50 ± laneHalfWidth` (default 42–58).

The online service loads card stats from the database. Card level is included in the in-match snapshot, but currently does **not** scale HP or damage. The local terminal demo uses the hard-coded `STARTER_CARDS` in `balance.ts`.

The engine requires both players to have matching four-card decks. Registration assigns every card currently present in the `Card` table to a new player. Consequently, the database should contain the intended four matching card definitions before creating test accounts.

## Data model

```mermaid
erDiagram
    PLAYER ||--o{ PLAYER_CARD : owns
    CARD ||--o{ PLAYER_CARD : assigned
    PLAYER ||--o{ MATCH_PLAYER : participates
    MATCH ||--|{ MATCH_PLAYER : contains

    PLAYER {
        string id PK
        string username UK
        string displayName
        string tag
        int rating
        int level
        int wins
        int losses
    }
    CARD {
        string id PK
        string name UK
        int cost
        int baseHp
        int baseDamage
        float attackSpeed
        float movementSpeed
        float range
    }
    PLAYER_CARD {
        string id PK
        string playerId FK
        string cardId FK
        int level
    }
    MATCH {
        string id PK
        enum status
        datetime startedAt
        datetime endedAt
    }
    MATCH_PLAYER {
        string matchId PK, FK
        string playerId PK, FK
        boolean isWinner
    }
```

The current Prisma schema is [`prisma/schema.prisma`](./prisma/schema.prisma). The database records match participation and final winner flags; the detailed live simulation state remains in memory and is not serialized to PostgreSQL.

## Run locally

### Prerequisites

- Node.js compatible with the project dependencies.
- PostgreSQL.
- Redis.
- The intended four card records loaded into PostgreSQL before registering gameplay test accounts.

### Install and configure

```powershell
npm ci
```

Create or update the local `.env` file with the required settings (use your own local values; do not commit secrets):

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/warland?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="replace-with-a-long-random-secret"
PORT=3000
# Optional. Comma-separated trusted origins for HTTP CORS and Socket.IO.
WARLAND_ALLOWED_ORIGINS="http://localhost:5173"
```

Generate the Prisma client and apply migrations:

```powershell
npx prisma generate
npx prisma migrate deploy
```

There is currently no checked-in card seed script. Before registering players, insert the four intended card definitions into the `Card` table. You can use Prisma Studio for local development:

```powershell
npx prisma studio
```

Start the API and Socket.IO server:

```powershell
npm run start:dev
```

The server listens on port `3000` by default. Set `PORT` to change it.

### Create test players

Register two separate accounts through `POST /auth/register`; the online terminal client only logs in and does not create accounts. Registration fields are `username`, `displayName`, and `password`; usernames are 3–30 letters, digits, or underscores, display names are 1–80 characters, and passwords are 8–128 characters.

Because registration grants all card records that exist at registration time, load the intended card set first. Create two accounts with the same available four-card deck for engine validation.

## Terminal clients

### Online multiplayer

Start one client per player, in separate terminals:

```powershell
npm run game:terminal:online
```

Each client prompts for server URL, username, and password. The default URL is `http://localhost:3000`; it can also be supplied through `WARLAND_SERVER_URL`.

When both clients find each other, each joins `/gameplay`. The game timer starts after both participants have joined.

Commands:

| Command | Behavior |
|---|---|
| `deploy <card-id> <x> <y>` | Request deployment at coordinates from 0 to 100. The engine enforces ownership of the card, deployment zone, and energy. |
| `status` | Print the latest state received by the client. |
| `leave` | Leave matchmaking while still searching. It does not cancel an active match. |
| `help` | Show available commands. |
| `quit` | Disconnect the terminal client. |

The server acknowledges a queued request with `deploy_queued`, then reports its authoritative outcome as `deploy_result` after a tick. The client’s display is refreshed from `game_state`; the online server, not the terminal, decides game state.

### Local simulation demo

Run the game engine in a local interactive terminal without connecting to PostgreSQL, Redis, or the server:

```powershell
npm run game:terminal
```

The local demo supports WASD/arrow-key movement, `1`–`4` card selection, `Tab` side switching, `Enter` deployment, and `Q` to quit. It uses the same default rules and starter-card balance module but does not participate in online matchmaking.

## API and Socket.IO contracts

### HTTP endpoints

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| `POST` | `/auth/register` | No | Create an account and return a JWT with public player data. |
| `POST` | `/auth/login` | No | Verify credentials and return a JWT with public player data. |
| `GET` | `/auth/me` | Bearer JWT | Return the authenticated public player. |
| `GET` | `/players/me` | Bearer JWT | Return the authenticated player profile and owned deck. |
| `GET` | `/players/:displayName/:tag` | No | Look up a public player profile. |
| `GET` | `/players/:displayName/:tag/stats` | No | Look up public player statistics. |
| `GET` | `/leaderboard?limit=100` | No | Return ranked public player statistics; limit is capped at 100. |
| `GET` | `/cards` | No | List card definitions. |
| `GET` | `/me/cards` | Bearer JWT | List cards owned by the authenticated player. |

The application uses a global validation pipe with transformation, unknown-field rejection, and whitelisting.

### Matchmaking Socket.IO namespace

Connect to the default namespace with `auth: { token: accessToken }`.

| Direction | Event | Payload / behavior |
|---|---|---|
| Client → server | `join_queue` | Begin searching as the authenticated player. |
| Server → client | `queue_joined` | Queue entry acknowledged. |
| Server → client | `match_found` | `{ matchId, opponentId, opponentName, opponentTag }`. |
| Client → server | `leave_queue` | Remove the player from the queue. |
| Server → client | `queue_left` | Queue leave acknowledgement. |
| Server → client | `match_timeout` | Search expired without a match. |
| Server → client | `queue_error`, `match_error` | Queue or match setup error. |

### Gameplay Socket.IO namespace

Connect to `/gameplay` with the same JWT in Socket.IO auth.

| Direction | Event | Payload / behavior |
|---|---|---|
| Client → server | `join_game` | `{ matchId }`; verifies match participation, joins the room, returns initial state. |
| Server → client | `game_started` | `{ matchId, side, state }` where `state` is a client-safe `MatchView`. |
| Client → server | `deploy` | `{ requestId, cardId, x, y }`; player and match IDs are taken from authenticated socket data. |
| Server → client | `deploy_queued` | `{ requestId }`; request accepted into the tick queue. |
| Server → room | `game_state` | Updated `MatchView` after each tick. |
| Server → room | `deploy_result` | Accepted/rejected result for each processed request. |
| Server → room | `match_finished` | `{ result }` after the result is persisted. |
| Server → client/room | `game_error` | Gameplay validation, join, tick, or persistence error. |

The server accepts no more than three queued deployment requests per player per tick. Deploy results include engine-level rejection reasons such as `CARD_NOT_IN_DECK`, `OUTSIDE_DEPLOYMENT_ZONE`, and `INSUFFICIENT_ENERGY`.

## Configuration

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string used by Prisma. |
| `JWT_SECRET` | Yes | — | Secret used to sign and verify access tokens. Application startup fails if unset. |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string for matchmaking. |
| `PORT` | No | `3000` | HTTP and Socket.IO server port. |
| `WARLAND_ALLOWED_ORIGINS` | Recommended outside local development | `*` | Comma-separated allowed origins for HTTP CORS and Socket.IO. |
| `WARLAND_SERVER_URL` | No | `http://localhost:3000` | Default server URL prompted by the online terminal client. |
| `NO_COLOR` | No | — | Disable ANSI color output in the local terminal demo when set. |

HTTP CORS and the Socket.IO gateways allow all origins when `WARLAND_ALLOWED_ORIGINS` is unset. Configure trusted origins before exposing the server to clients on another host.

## Development commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | Start NestJS in watch mode. |
| `npm run build` | Compile the NestJS application. |
| `npm test` | Run Vitest tests. |
| `npm run test:e2e` | Run configured end-to-end tests. |
| `npm run lint` | Run Oxlint on `src/`, `test/`, and `scripts/`. |
| `npm run loadtest` | Run the Socket.IO load test that plays bot-vs-bot matches to completion. |
| `npm run game:terminal` | Build and run the local terminal simulation. |
| `npm run game:terminal:online` | Build and run the online terminal client. |
| `npx prisma migrate deploy` | Apply committed migrations. |
| `npx prisma studio` | Open Prisma Studio for local data inspection/editing. |

Current automated game-engine coverage is in [`src/game/engine/engine.spec.ts`](./src/game/engine/engine.spec.ts). Gameplay service, gateway, and matchmaking integration do not yet have dedicated test files.

## Load testing

[`scripts/loadtest.mjs`](./scripts/loadtest.mjs) drives the real HTTP and Socket.IO contracts with bot accounts, matches them through Redis, plays full games, and reports timing and throughput. It is a black-box client: it uses no internal server APIs, so its numbers include network, auth, matchmaking, engine, and broadcast costs exactly as a real client would see them.

```powershell
# Short smoke test: 4 bots, one wave of matches.
npm run loadtest -- --bots 4 --ramp-ms 2000 --duration-ms 15000 --grace-ms 240000

# Capacity run: 500 bots (250 concurrent matches).
npm run loadtest -- --bots 500 --ramp-ms 30000 --duration-ms 180000 --grace-ms 300000
```

Run the server (`npm run start:dev`) and ensure the four intended card records exist first, because each bot registers through `POST /auth/register` and receives every card. Bots log in when the account already exists, so repeated runs with the same `--seed` reuse accounts instead of creating new ones.

### How it works

- Each bot logs in or registers as `lt<seed>_<index>`, connects to the default namespace, and emits `join_queue`.
- On `match_found` the bot connects to `/gameplay`, sends `join_game`, and plays until `match_finished`.
- Deployment strategy: pick a random affordable card and deploy it at the frontline of its own half (`x` around 42–48 for `LEFT`, 52–58 for `RIGHT`), throttled to one attempt per `--think-ms`. Energy in flight is tracked so accepted deploys are never double-spent against the tick budget.
- Metrics collected: queue wait, match duration and end reason, peak/mean concurrent matches, deploy accept rate and latency, `game_state` tick drift (p50/p95/max) measured against the 100 ms tick, and error counts.
- A JSON report is written to `--out` (default `loadtest-report.json`) and command-line thresholds decide the exit code. `--no-thresholds` always exits successfully.

| Option | Default | Purpose |
|---|---:|---|
| `--url <url>` | `http://localhost:3000` | Server URL. |
| `--bots <n>` | `40` | Bot accounts, paired into matches. |
| `--ramp-ms <n>` | `10000` | Stagger bot starts over this window. |
| `--duration-ms <n>` | `60000` | Keep starting matches this long after the ramp. |
| `--grace-ms <n>` | `200000` | Wait for in-flight matches after the deadline. |
| `--think-ms <n>` | `250` | Minimum delay between deploy attempts. |
| `--seed <n>` | `1` | Bot username seed; reuse accounts across runs. |
| `--out <file>` | `loadtest-report.json` | JSON report path. |
| `--min-accept-rate <n>` | `0.9` | Minimum deploy accept rate. |
| `--max-tick-p95-drift <n>` | `30` | Maximum `game_state` p95 drift in ms. |
| `--max-error-rate <n>` | `0.05` | Maximum error rate. |
| `--min-matches <n>` | `0` | Minimum finished matches. |

### Results

All runs below used the default thresholds (`acceptRate ≥ 0.9`, tick p95 drift ≤ 30 ms, error rate ≤ 5%) on a single local server process. Every match in every run ended by `BASE_DESTROYED` — no timeouts, aborts, or unfinished matches.

| Bots | Concurrent matches (peak) | Matches/min | Deploy accept rate | Tick drift p50 / p95 | Errors | Result |
|---:|---:|---:|---:|---:|---:|:--:|
| 4 | 4 | 3.7 | 100% | 9 / 15 ms | 0 | PASS |
| 40 | 40 | 38.6 | 100% | 9 / 15 ms | 0 | PASS |
| 100 | 100 | 75.5 | 100% | 9 / 15 ms | 0 | PASS |
| 250 | 250 | 209.2 | 100% | 9 / 17 ms | 0 | PASS |
| 500 | 500 | 391.1 | 100% | 9 / 36 ms | 0 | FAIL (tick drift) |
| 1000 | 1000 | 797.3 | 100% | 9 / 34 ms | 0 | FAIL (tick drift) |

Observations:

- **Throughput scales linearly to 1000 bots** (~800 matches/minute, ~72k deploys) with zero errors, zero rejected deploys, and no lost deploys.
- **Matchmaking stays fast under load:** queue wait p95 stayed under 300 ms even at 1000 bots.
- **The clean zone is up to ~250 concurrent matches** (drift p95 ~17 ms). The knee is around 250–500 concurrent matches, where drift climbs past the 30 ms threshold.
- **The median never moves (9 ms); only the tail grows.** That is the signature of event-loop queueing: typical ticks are still on time, but under load an increasing fraction fire late.

### Why the 500+ bot runs fail the threshold

The 500 and 1000 bot runs are not server errors — the failure is the load test's own tick-drift assertion. Tick drift measures the gap between consecutive `game_state` broadcasts against the 100 ms tick rate. At 500 concurrent matches the p95 gap reached 36 ms (threshold 30 ms), even though every deploy was accepted and every match finished correctly.

The cause is the per-match tick timer in [`src/gameplay/gameplay.gateway.ts`](./src/gameplay/gameplay.gateway.ts) (`startMatchTickTimer`, `setInterval` per match). At 500 matches the server runs 5,000 independent timer callbacks per second on a single Node.js event loop. Each callback runs the engine step, serializes the full `MatchView`, and broadcasts `game_state` to the match room. Once the total per-second work approaches the loop's capacity, timers queue behind each other and fire late. The drift threshold detects this graceful degradation and fails the run so the regression is visible instead of silent.

### Bottleneck analysis

The bottleneck is the **single-threaded event loop broadcasting full state per tick**, not RPC, not the database, and not matchmaking.

Per tick, per match, the gateway does:

1. `gameplayService.advanceMatchTick(matchId, commands)` — advance the engine simulation.
2. `toMatchView(result.state)` — build a fresh client-safe snapshot (allocates new objects/arrays).
3. `server.to(matchId).emit('game_state', ...)` — JSON-serialize the snapshot and write it to each participant socket.

At 500 concurrent matches at 10 Hz that is ~5,000 full-state serializations and ~10,000 socket writes per second, all on the main thread. Contributing factors:

- **One timer per match.** 500 `setInterval` callbacks per 100 ms window compete on one loop; there is no batching, so late timers push later timers further behind.
- **Allocation and GC pressure.** Every tick allocates a new view and JSON string, so garbage collection steals event-loop time in bursts. This is why drift is spiky (p50 ~9 ms but max spikes to 265–490 ms) rather than uniformly high.
- **Match end runs inline in the tick callback.** `persistMatchResultWithRetry` performs Prisma/Postgres round-trips and emits `match_finished` inside the timer callback, so every match completion briefly delays every other match's next tick. At 500 concurrent matches that is roughly 1.5 completions per second.

This is expected for the current single-process in-memory design. If higher concurrency is needed, the natural next steps are: drive all matches from **one shared tick loop** instead of N intervals, **throttle `game_state`** broadcasting below the simulation rate (for example simulate at 10 Hz, broadcast at 5 Hz), and **move result persistence off the tick callback** onto a queue or worker. Beyond a single process, authoritative match state would need to be partitioned across instances.

## Known limitations and review areas

- **Single process only:** active game states, deployment queues, timers, and active-player presence are in memory. A server restart ends live games; multiple server instances will not share authoritative state.
- **Reconnects are not implemented:** a player who disconnects during a match cannot resume through a supported reconnect flow.
- **Match cancellation is not implemented end to end:** the engine has a cancellation operation, but there is no gameplay cancellation event or persisted cancellation lifecycle. The database match enum currently contains `PLAYING` and `FINISHED`.
- **Card seed data is manual:** there is no checked-in seed script. Card definitions must exist before account registration, and every new account receives all available cards.
- **Deck rules are strict:** each player must have exactly four cards, and both players must have matching card IDs.
- **Card upgrades are not applied:** card level is stored and passed into snapshots, but card stats currently use the database base values at every level.
- **No browser or mobile client ships with this repository:** only the backend and the terminal clients are included. The documented HTTP and Socket.IO contracts are client-agnostic, so a web client can be added later against the same interfaces.
- **Persistence failure needs operational follow-up:** final result saves are retried three times. If all attempts fail, the timer has stopped and an error is emitted; there is no durable background retry/reconciliation job.
- **No dedicated gameplay integration tests yet:** build success and manual terminal play do not replace test coverage for matchmaking, disconnects, tick timing, and result persistence.
- **CORS defaults to permissive for development:** explicitly configure `WARLAND_ALLOWED_ORIGINS` for client deployments on another host.

## Repository map

```text
src/
  auth/          Registration, login, JWT guard, socket CORS options
  cards/         Card catalog and owned-card endpoints
  game/
    engine/      Framework-independent authoritative game simulation
    balance.ts   Default rules and local demo starter cards
    terminal-*   Local demo and online terminal client
  gameplay/      Gameplay service, Socket.IO gateway, tick handling
  matchmaking/   Redis matchmaking, gateway, and active-player store
  players/       Player profile, statistics, leaderboard endpoints
  prisma/        Prisma client lifecycle
  redis/         Redis connection and Lua matchmaking command
scripts/
  loadtest.mjs   Socket.IO load test that plays bot-vs-bot matches
prisma/
  schema.prisma  PostgreSQL data model
  migrations/    Database schema migrations
```
