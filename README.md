# WarLand

WarLand is a server-authoritative, real-time multiplayer lane-battle prototype. The backend is built with NestJS, Socket.IO, Prisma, PostgreSQL, and Redis. Players can register and log in, enter matchmaking, join a live match, deploy cards, and receive authoritative game updates.

The project includes ranked matchmaking, live online matches, a local practice arena, interactive terminal clients, and a React web client in `frontend/`.

> **Project status:** Prototype. Active gameplay state and matchmaking presence are held in process memory. This version is intended for local development and single-server testing, not resilient multi-instance production hosting.

For a full engineering inventory covering architecture, data flow, contracts, tests, performance, security, and roadmap, see [`PROJECT_REPORT.txt`](./PROJECT_REPORT.txt).

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture at a glance](#architecture-at-a-glance)
- [Match lifecycle](#match-lifecycle)
- [Gameplay and balance](#gameplay-and-balance)
- [Data model](#data-model)
- [Run locally](#run-locally)
- [Terminal clients](#terminal-clients)
- [Web client](#web-client)
- [API and Socket.IO contracts](#api-and-socketio-contracts)
- [Configuration](#configuration)
- [Development commands](#development-commands)
- [Testing](#testing)
- [Load testing](#load-testing)
  - [How it works](#how-it-works)
  - [Results](#results)
  - [Why the 500+ bot runs fail the threshold](#why-the-500-bot-runs-fail-the-threshold)
  - [Bottleneck analysis](#bottleneck-analysis)
- [Known limitations and review areas](#known-limitations-and-review-areas)
- [Repository map](#repository-map)

## Features

### Gameplay

- **Server-authoritative combat.** The game engine is pure TypeScript, framework-independent, and deterministic. Every unit position, attack, and death is decided server-side; clients only render and send intent.
- **Card-based unit deployment.** Each card spawns a unique unit with its own cost, HP, damage, attack speed, movement speed, and range. Deployments are validated against ownership, energy, position bounds, and the player's own half of the board.
- **Energy economy.** Starting energy 5, max 10, regenerating 0.5 per second. Energy is tracked in hundredths internally to avoid floating-point drift.
- **Tick-based simulation.** The match advances at 10 ticks/second (100 ms). Deployment requests are queued per player (max 3 per tick) and processed atomically within each tick.
- **Two victory paths.** Destroy the enemy base (1000 HP) to win instantly, or survive the 180-second (1800-tick) match clock.

### Multiplayer and progression

- **Rating-based matchmaking.** Players queue into a Redis sorted set; an atomic Lua script (`findAndClaimMatch`) pairs the two closest-rated players and claims them race-condition-free.
- **JWT authentication everywhere.** HTTP endpoints use a Bearer guard; both Socket.IO namespaces (`/` and `/gameplay`) authenticate via a shared WS middleware that verifies the JWT on connect.
- **Persistent rankings.** Match results, winner flags, and per-player win/loss counters are written to PostgreSQL through Prisma. The leaderboard endpoint returns players ranked by rating.
- **Active-player guard.** An in-memory store prevents a player who is already in a match from queueing again.

### Developer experience

- **Interactive terminal clients.** An online multiplayer client (connects to the real server) and a fully local simulation (no DB/Redis required) for rapid balance iteration.
- **Bot load-test harness.** A black-box client that registers real accounts, matches them through Redis, plays full games via the public contracts, and reports latency/throughput/accept-rate metrics.
- **Comprehensive tests.** Engine unit tests (rules + determinism), gameplay service tests (lifecycle, join deadline, Elo persistence), gateway tests (socket handling, timer cleanup), and a full-match e2e simulation.
- **npm workspaces.** One root install wires both `backend/` and `frontend/` with forwarded scripts.

### Current product strengths

- **Clear server authority.** Clients send intent; the engine decides movement, attacks, energy, damage, and outcomes.
- **Deterministic rules boundary.** The pure engine can be tested and simulated without NestJS, Prisma, Redis, or a browser.
- **Readable card identity.** Knight, Archer, Guard, and Scout have different costs, stats, roles, art accents, deployment effects, and sound pitches.
- **Responsive command lobby.** The lobby adapts across desktop, tablet, mobile, and short screens, with commander stats, deck inspection, a right-side leaderboard, and a prominent match action.
- **Battle feedback.** Deployments use rune rings, particles, card-colored accents, and sound; hits flash and shake units; deaths collapse with dust and particles; bases crack, smoke, pulse, and shatter.
- **Accessibility controls.** Reduced motion and sound preferences are persisted and respected by the Phaser scene and UI.
- **Operational visibility.** Unit tests, end-to-end simulation, terminal clients, and a black-box load test expose both correctness and scaling behavior.

### Current implementation boundary

The product currently ships four starter cards, one lane, one base per side, ranked matchmaking, player-card XP, Elo-style rating updates, and a live battle renderer. Unlockable units, deck editing, quests, achievements, seasonal rewards, leagues, rematches, and practice-vs-bot mode are not implemented yet; they are natural next product slices rather than hidden assumptions in the current UI.

## Tech stack

| Layer               | Technology                                              |
| ------------------- | ------------------------------------------------------- |
| Backend framework   | NestJS (modular, DI, decorators)                        |
| Real-time transport | Socket.IO (namespaced, JWT-authenticated)               |
| Database            | PostgreSQL via Prisma (schema + migrations)             |
| Matchmaking store   | Redis (sorted set + Lua atomic claim)                   |
| Auth                | JWT access tokens + bcrypt password hashing             |
| Game engine         | Pure TypeScript, zero framework dependencies            |
| Web client          | React 19 + Vite 8 + Phaser 4 (2D WebGL/canvas renderer) |
| State management    | Zustand 5                                               |
| Styling             | Tailwind CSS 4                                          |
| Language            | TypeScript 6 throughout                                 |
| Testing             | Vitest (backend + frontend), Testing Library, jsdom     |
| Linting             | Oxlint (backend), tsc --noEmit (frontend typecheck)     |
| Terminal clients    | Node.js readline + Socket.IO client                     |

## Architecture at a glance

```mermaid
flowchart LR
    P1["Player 1<br/>Web or terminal"] <-->|"Socket.IO /"| MM["MatchmakingGateway<br/>MatchmakingService"]
    P2["Player 2<br/>Web or terminal"] <-->|"Socket.IO /"| MM
    P1 <-->|"Socket.IO /gameplay"| GW["GameplayGateway"]
    P2 <-->|"Socket.IO /gameplay"| GW
    HTTP["HTTP client"] --> REST["Auth / Players / Cards<br/>REST controllers"]
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

| Component                                   | Responsibility                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `AuthModule`                                | Registration, password verification, JWT creation, and HTTP auth guard.                                                         |
| `MatchmakingGateway` / `MatchmakingService` | Queue events, matchmaking search, database match creation, and gameplay initialization.                                         |
| `RedisService`                              | Redis connection and the atomic `findAndClaimMatch` Lua command.                                                                |
| `GameplayGateway`                           | WebSocket authentication, participant room joins, deployment queueing, per-match tick timers, and room broadcasts.              |
| `GameplayService`                           | Load player decks, create/store match state, provide participant-checked views, advance the engine, and persist match outcomes. |
| `backend/src/game/engine/engine.ts`         | Game rules and state transitions. It does not depend on NestJS, Socket.IO, or Prisma.                                           |
| `DbService`                                 | Prisma client lifecycle and PostgreSQL access.                                                                                  |
| `ActivePlayers`                             | In-memory mapping of player IDs to active match IDs, used to prevent active players from queueing again.                        |

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

Default rules are defined in [`backend/src/game/balance.ts`](./backend/src/game/balance.ts):

| Rule                        |                           Default |
| --------------------------- | --------------------------------: |
| Simulation rate             |                   10 ticks/second |
| Match duration              |         180 seconds (1,800 ticks) |
| Starting energy             |                                 5 |
| Maximum energy              |                                10 |
| Energy regeneration         |                    0.5 per second |
| Base health                 |                             1,000 |
| Maximum deployment requests |             3 per player per tick |
| Board axes                  | `x` and `y` in inclusive `0..100` |
| Lane half-width             |         20 (valid `y` band 30–70) |
| Midline                     |        `x = 50` is not deployable |

Energy is represented internally in hundredths to avoid floating-point drift. The engine checks the selected card, position bounds, the player's deployment zone, and available energy. A deployment must be inside the player's own half — `LEFT` at `x < 50` and `RIGHT` at `x > 50`, with the `x = 50` midline off limits — and within the lane band `y = 50 ± laneHalfWidth`.

The online service loads card stats from the database. Card level is included in the in-match snapshot and **does** scale HP and damage: every level above 1 adds 5% to both, rounded to an integer (capped at level 10). The local terminal demo uses the hard-coded `STARTER_CARDS` in `balance.ts`.

The engine requires both players to have matching four-card decks. Registration assigns every card currently present in the `Card` table to a new player. Consequently, the database should contain the intended four matching card definitions before creating test accounts.

### Card attributes

Every card row in the database carries:

| Column          | Meaning                                         |
| --------------- | ----------------------------------------------- |
| `cost`          | Energy required to deploy this unit.            |
| `baseHp`        | Unit hit points at level 1.                     |
| `baseDamage`    | Damage dealt per attack.                        |
| `attackSpeed`   | Attacks per second.                             |
| `movementSpeed` | World units traveled per second.                |
| `range`         | Attack range in world units (melee vs. ranged). |

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

The current Prisma schema is [`backend/prisma/schema.prisma`](./backend/prisma/schema.prisma). The database records match participation and final winner flags; the detailed live simulation state remains in memory and is not serialized to PostgreSQL.

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

Create or update `backend/.env` with the required settings (use your own local values; do not commit secrets):

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/warland?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="replace-with-a-long-random-secret"
PORT=3000
# Optional. Comma-separated trusted origins for HTTP CORS and Socket.IO.
WARLAND_ALLOWED_ORIGINS="http://localhost:5173"
```

Generate the Prisma client and apply migrations (run these from the `backend/` directory, where `prisma.config.ts` and `prisma/` live):

```powershell
cd backend
npx prisma generate
npx prisma migrate deploy
```

There is a checked-in card seed script. Before registering players, insert the four intended card definitions into the `Card` table — either with the seed script or with Prisma Studio for local development:

```powershell
cd backend
npm run seed:cards
```

```powershell
cd backend
npx prisma studio
```

Start the API and Socket.IO server:

```powershell
npm run start:dev
```

The server listens on port `3000` by default. Set `PORT` to change it.

### Start the web client

The React client lives in `frontend/`. With the API running, start Vite in a second terminal (from the repository root):

```powershell
npm run dev
```

The dev server runs on `http://localhost:5173` and reads `VITE_SERVER_URL` (default `http://localhost:3000`; see `frontend/.env.example`).

### Create test players

Register two separate accounts through `POST /auth/register`; the online terminal client only logs in and does not create accounts. Registration fields are `username`, `displayName`, and `password`; usernames are 3–30 letters, digits, or underscores, display names are 1–80 characters, and passwords are 8–128 characters.

Because registration grants all card records that exist at registration time, load the intended card set first. Create two accounts with the same available four-card deck for engine validation.

## Web client

The browser client in `frontend/` is the primary way to experience WarLand.

| Feature      | Implementation                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Auth screen  | `frontend/src/features/auth/AuthScreen.tsx` — login/register with live validation.                                     |
| Lobby        | `frontend/src/features/lobby/LobbyScreen.tsx` — profile, deck, leaderboard, queue button, connection badge.            |
| Game screen  | `frontend/src/features/game/GameScreen.tsx` — Phaser canvas, HUD, connection states, and result overlay.               |
| Renderer     | `frontend/src/phaser/` — Phaser 4 scenes for bases, units, terrain, HUD, input, particles, audio, and combat feedback. |
| State stores | `frontend/src/store/` — Zustand stores for session, matchmaking, game view, and UI toasts.                             |
| Networking   | `frontend/src/network/` — typed HTTP client + Socket.IO clients mirroring the backend contracts.                       |
| Art assets   | `frontend/public/assets/kenney/` — Kenney medieval-RTS sprite pack.                                                    |

The client mirrors the exact Socket.IO contract documented below, so it is also a reference implementation for building other clients (mobile, desktop, bots).

## Terminal clients

### Online multiplayer

Start one client per player, in separate terminals:

```powershell
npm run game:terminal:online
```

Each client prompts for server URL, username, and password. The default URL is `http://localhost:3000`; it can also be supplied through `WARLAND_SERVER_URL`.

When both clients find each other, each joins `/gameplay`. The game timer starts after both participants have joined.

Commands:

| Command                    | Behavior                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `deploy <card-id> <x> <y>` | Request deployment at coordinates from 0 to 100. The engine enforces ownership of the card, deployment zone, and energy. |
| `status`                   | Print the latest state received by the client.                                                                           |
| `leave`                    | Leave matchmaking while still searching. It does not cancel an active match.                                             |
| `help`                     | Show available commands.                                                                                                 |
| `quit`                     | Disconnect the terminal client.                                                                                          |

The server acknowledges a queued request with `deploy_queued`, then reports its authoritative outcome as `deploy_result` after a tick. The client’s display is refreshed from `game_state`; the online server, not the terminal, decides game state.

### Local simulation demo

Run the game engine in a local interactive terminal without connecting to PostgreSQL, Redis, or the server:

```powershell
npm run game:terminal
```

The local demo supports WASD/arrow-key movement, `1`–`4` card selection, `Tab` side switching, `Enter` deployment, and `Q` to quit. It uses the same default rules and starter-card balance module but does not participate in online matchmaking.

## API and Socket.IO contracts

### HTTP endpoints

| Method | Path                               | Authentication | Purpose                                                         |
| ------ | ---------------------------------- | -------------- | --------------------------------------------------------------- |
| `POST` | `/auth/register`                   | No             | Create an account and return a JWT with public player data.     |
| `POST` | `/auth/login`                      | No             | Verify credentials and return a JWT with public player data.    |
| `GET`  | `/auth/me`                         | Bearer JWT     | Return the authenticated public player.                         |
| `GET`  | `/players/me`                      | Bearer JWT     | Return the authenticated player profile and owned deck.         |
| `GET`  | `/players/:displayName/:tag`       | No             | Look up a public player profile.                                |
| `GET`  | `/players/:displayName/:tag/stats` | No             | Look up public player statistics.                               |
| `GET`  | `/leaderboard?limit=100`           | No             | Return ranked public player statistics; limit is capped at 100. |
| `GET`  | `/cards`                           | No             | List card definitions.                                          |
| `GET`  | `/me/cards`                        | Bearer JWT     | List cards owned by the authenticated player.                   |

The application uses a global validation pipe with transformation, unknown-field rejection, and whitelisting.

### Matchmaking Socket.IO namespace

Connect to the default namespace with `auth: { token: accessToken }`.

| Direction       | Event                        | Payload / behavior                                    |
| --------------- | ---------------------------- | ----------------------------------------------------- |
| Client → server | `join_queue`                 | Begin searching as the authenticated player.          |
| Server → client | `queue_joined`               | Queue entry acknowledged.                             |
| Server → client | `match_found`                | `{ matchId, opponentId, opponentName, opponentTag }`. |
| Client → server | `leave_queue`                | Remove the player from the queue.                     |
| Server → client | `queue_left`                 | Queue leave acknowledgement.                          |
| Server → client | `match_timeout`              | Search expired without a match.                       |
| Server → client | `queue_error`, `match_error` | Queue or match setup error.                           |

### Gameplay Socket.IO namespace

Connect to `/gameplay` with the same JWT in Socket.IO auth.

| Direction            | Event            | Payload / behavior                                                                            |
| -------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| Client → server      | `join_game`      | `{ matchId }`; verifies match participation, joins the room, returns initial state.           |
| Server → client      | `game_started`   | `{ matchId, side, state }` where `state` is a client-safe `MatchView`.                        |
| Client → server      | `deploy`         | `{ requestId, cardId, x, y }`; player and match IDs are taken from authenticated socket data. |
| Server → client      | `deploy_queued`  | `{ requestId }`; request accepted into the tick queue.                                        |
| Server → room        | `game_state`     | Updated `MatchView` after each tick.                                                          |
| Server → room        | `deploy_result`  | Accepted/rejected result for each processed request.                                          |
| Server → room        | `match_finished` | `{ result }` after the result is persisted.                                                   |
| Server → client/room | `game_error`     | Gameplay validation, join, tick, or persistence error.                                        |

The server accepts no more than three queued deployment requests per player per tick. Deploy results include engine-level rejection reasons such as `CARD_NOT_IN_DECK`, `OUTSIDE_DEPLOYMENT_ZONE`, and `INSUFFICIENT_ENERGY`.

### Attack events

Every `MatchView` carries an optional `events` array with the attacks that landed during the most recent tick. It is purely presentational — the engine's damage resolution is unchanged, and clients may ignore it entirely.

| Field          | Meaning                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `attackerId`   | Attacking unit id (`<matchId>:<spawnSequence>`), or `"BASE"` for a base turret.                                   |
| `attackerSide` | Owning side of a base turret attack; absent for unit attacks.                                                     |
| `targetId`     | Damaged unit id, or `"BASE"` when a base was hit.                                                                 |
| `targetSide`   | Which base was hit; absent when a unit was hit.                                                                   |
| `damage`       | Damage of a single attack.                                                                                        |
| `range`        | Attack range of the attacker in world units. Clients use it to tell ranged attacks (`range > 6`) from melee ones. |
| `tick`         | The tick the attack landed on.                                                                                    |

Damage is clamped by the engine at zero HP, so the sum of an event's damage can exceed the HP a target actually lost.

## Security and operational model

Authentication and authorization are applied at both transport layers:

- HTTP routes use Bearer JWT authentication where required.
- The root Socket.IO namespace and `/gameplay` use shared JWT middleware.
- Gameplay views are returned only to verified match participants.
- Deployment payloads are validated by the gateway and then validated again by
  the authoritative engine.
- Passwords are stored as bcrypt hashes and excluded from public projections.
- Global HTTP validation transforms DTOs, whitelists expected fields, and
  rejects unknown fields.
- Request IDs provide replay handling and conflict detection for deployments.

Before exposing the server beyond local development, configure a strong
`JWT_SECRET`, restrict `WARLAND_ALLOWED_ORIGINS`, and secure PostgreSQL and
Redis connections. Rate limiting, token revocation, stale queue cleanup, and
multi-instance presence are still production hardening work.

## Configuration

| Variable                  |                              Required | Default                  | Purpose                                                                           |
| ------------------------- | ------------------------------------: | ------------------------ | --------------------------------------------------------------------------------- |
| `DATABASE_URL`            |                                   Yes | —                        | PostgreSQL connection string used by Prisma.                                      |
| `JWT_SECRET`              |                                   Yes | —                        | Secret used to sign and verify access tokens. Application startup fails if unset. |
| `REDIS_URL`               |                                    No | `redis://localhost:6379` | Redis connection string for matchmaking.                                          |
| `PORT`                    |                                    No | `3000`                   | HTTP and Socket.IO server port.                                                   |
| `WARLAND_ALLOWED_ORIGINS` | Recommended outside local development | `*`                      | Comma-separated allowed origins for HTTP CORS and Socket.IO.                      |
| `WARLAND_SERVER_URL`      |                                    No | `http://localhost:3000`  | Default server URL prompted by the online terminal client.                        |
| `NO_COLOR`                |                                    No | —                        | Disable ANSI color output in the local terminal demo when set.                    |

HTTP CORS and the Socket.IO gateways allow all origins when `WARLAND_ALLOWED_ORIGINS` is unset. Configure trusted origins before exposing the server to clients on another host.

## Development commands

| Command                        | Purpose                                                                     |
| ------------------------------ | --------------------------------------------------------------------------- |
| `npm run start:dev`            | Start the NestJS backend in watch mode.                                     |
| `npm run build`                | Compile the NestJS backend.                                                 |
| `npm test`                     | Run backend Vitest unit tests.                                              |
| `npm run test:e2e`             | Run configured backend end-to-end tests.                                    |
| `npm run lint`                 | Run Oxlint on `backend/src/`, `backend/test/`, and `backend/scripts/`.      |
| `npm run loadtest`             | Run the Socket.IO load test that plays bot-vs-bot matches to completion.    |
| `npm run game:terminal`        | Build and run the local terminal simulation.                                |
| `npm run game:terminal:online` | Build and run the online terminal client.                                   |
| `npm run seed:cards`           | Seed card definitions via `prisma db execute`.                              |
| `npm run frontend:dev`         | Start the Vite dev server for the web client.                               |
| `npm run frontend:build`       | Build the web client for production.                                        |
| `npm run frontend:typecheck`   | Type-check the web client.                                                  |
| `npm run frontend:test`        | Run the web client Vitest tests.                                            |
| `npx prisma migrate deploy`    | Apply committed migrations (run from `backend/`).                           |
| `npx prisma studio`            | Open Prisma Studio for local data inspection/editing (run from `backend/`). |

## Testing

Automated coverage lives in four unit-test files and one e2e spec:

| File                                                                                                           | What it covers                                                                                |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`backend/src/game/engine/engine.spec.ts`](./backend/src/game/engine/engine.spec.ts)                           | Engine rules, deployment validation, energy math, and determinism (same input → same output). |
| [`backend/src/gameplay/gameplay.service.spec.ts`](./backend/src/gameplay/gameplay.service.spec.ts)             | Match lifecycle, join deadline handling, and Elo/stat persistence on finish.                  |
| [`backend/src/gameplay/gameplay.gateway.spec.ts`](./backend/src/gameplay/gameplay.gateway.spec.ts)             | Socket handling, room joins, and per-match tick-timer cleanup on disconnect/finish.           |
| [`backend/src/matchmaking/matchmaking.gateway.spec.ts`](./backend/src/matchmaking/matchmaking.gateway.spec.ts) | Queue join/leave events, including the `queue_left` acknowledgement.                          |
| [`backend/test/game-engine.e2e-spec.ts`](./backend/test/game-engine.e2e-spec.ts)                               | Full-match simulation driven through the real service stack (`npm run test:e2e`).             |

Run everything:

```powershell
npm test              # backend unit tests
npm run test:e2e      # backend e2e
npm run frontend:test # web client tests
npm run lint          # backend lint
npm run frontend:typecheck
```

## Load testing

[`backend/scripts/loadtest.mjs`](./backend/scripts/loadtest.mjs) drives the real HTTP and Socket.IO contracts with bot accounts, matches them through Redis, plays full games, and reports timing and throughput. It is a black-box client: it uses no internal server APIs, so its numbers include network, auth, matchmaking, engine, and broadcast costs exactly as a real client would see them.

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

| Option                     |                 Default | Purpose                                         |
| -------------------------- | ----------------------: | ----------------------------------------------- |
| `--url <url>`              | `http://localhost:3000` | Server URL.                                     |
| `--bots <n>`               |                    `40` | Bot accounts, paired into matches.              |
| `--ramp-ms <n>`            |                 `10000` | Stagger bot starts over this window.            |
| `--duration-ms <n>`        |                 `60000` | Keep starting matches this long after the ramp. |
| `--grace-ms <n>`           |                `200000` | Wait for in-flight matches after the deadline.  |
| `--think-ms <n>`           |                   `250` | Minimum delay between deploy attempts.          |
| `--seed <n>`               |                     `1` | Bot username seed; reuse accounts across runs.  |
| `--out <file>`             |  `loadtest-report.json` | JSON report path.                               |
| `--min-accept-rate <n>`    |                   `0.9` | Minimum deploy accept rate.                     |
| `--max-tick-p95-drift <n>` |                    `30` | Maximum `game_state` p95 drift in ms.           |
| `--max-error-rate <n>`     |                  `0.05` | Maximum error rate.                             |
| `--min-matches <n>`        |                     `0` | Minimum finished matches.                       |

### Results

All runs below used the default thresholds (`acceptRate ≥ 0.9`, tick p95 drift ≤ 30 ms, error rate ≤ 5%) on a single local server process. Every match in every run ended by `BASE_DESTROYED` — no timeouts, aborts, or unfinished matches.

| Bots | Concurrent matches (peak) | Matches/min | Deploy accept rate | Tick drift p50 / p95 | Errors |      Result       |
| ---: | ------------------------: | ----------: | -----------------: | -------------------: | -----: | :---------------: |
|    4 |                         4 |         3.7 |               100% |            9 / 15 ms |      0 |       PASS        |
|   40 |                        40 |        38.6 |               100% |            9 / 15 ms |      0 |       PASS        |
|  100 |                       100 |        75.5 |               100% |            9 / 15 ms |      0 |       PASS        |
|  250 |                       250 |       209.2 |               100% |            9 / 17 ms |      0 |       PASS        |
|  500 |                       500 |       391.1 |               100% |            9 / 36 ms |      0 | FAIL (tick drift) |
| 1000 |                      1000 |       797.3 |               100% |            9 / 34 ms |      0 | FAIL (tick drift) |

Observations:

- **Throughput scales linearly to 1000 bots** (~800 matches/minute, ~72k deploys) with zero errors, zero rejected deploys, and no lost deploys.
- **Matchmaking stays fast under load:** queue wait p95 stayed under 300 ms even at 1000 bots.
- **The clean zone is up to ~250 concurrent matches** (drift p95 ~17 ms). The knee is around 250–500 concurrent matches, where drift climbs past the 30 ms threshold.
- **The median never moves (9 ms); only the tail grows.** That is the signature of event-loop queueing: typical ticks are still on time, but under load an increasing fraction fire late.

### Why the 500+ bot runs fail the threshold

The 500 and 1000 bot runs are not server errors — the failure is the load test's own tick-drift assertion. Tick drift measures the gap between consecutive `game_state` broadcasts against the 100 ms tick rate. At 500 concurrent matches the p95 gap reached 36 ms (threshold 30 ms), even though every deploy was accepted and every match finished correctly.

The cause is the per-match tick timer in [`backend/src/gameplay/gameplay.gateway.ts`](./backend/src/gameplay/gameplay.gateway.ts) (`startMatchTickTimer`, `setInterval` per match). At 500 matches the server runs 5,000 independent timer callbacks per second on a single Node.js event loop. Each callback runs the engine step, serializes the full `MatchView`, and broadcasts `game_state` to the match room. Once the total per-second work approaches the loop's capacity, timers queue behind each other and fire late. The drift threshold detects this graceful degradation and fails the run so the regression is visible instead of silent.

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
- **Card seed data is scripted:** `backend/scripts/seed-cards.sql` inserts the four starter cards (`npm run seed:cards`). Registration still grants every card present in the `Card` table at registration time.
- **Deck rules are strict:** each player must have exactly four cards, and both players must have matching card IDs.
- **Card upgrades are applied:** card level is stored, passed into snapshots, and scales HP and damage by 5% per level above 1 (capped at level 10).
- **The bundled web client is thin:** the React client in `frontend/` covers auth, lobby, and live board rendering, but no mobile client ships. The documented HTTP and Socket.IO contracts are client-agnostic, so additional clients can be built against the same interfaces.
- **Persistence failure needs operational follow-up:** final result saves are retried three times. If all attempts fail, the timer has stopped and an error is emitted; there is no durable background retry/reconciliation job.
- **Browser-level coverage is limited:** backend engine, gateway, and service tests plus frontend store/format tests exist, but full responsive screen and Phaser visual regression coverage is still needed.
- **CORS defaults to permissive for development:** explicitly configure `WARLAND_ALLOWED_ORIGINS` for client deployments on another host.

## Roadmap

The current prototype is a strong foundation for the following product and
engineering slices:

### Product progression

- Unlockable units and a real deck builder.
- Quests, achievements, seasonal rewards, and competitive leagues.
- Rematch flow and practice-vs-bot mode.
- Match history, battle statistics, and richer result summaries.

### Production readiness

- Startup reconciliation for abandoned `PLAYING` matches.
- Periodic cleanup for stale Redis matchmaking entries.
- A shared match-state/timer strategy or an explicit single-instance limit.
- Generated or shared REST and Socket.IO contract types.
- Rate limiting, session revocation, and stricter deployment CORS defaults.

### Scale and client quality

- One shared server tick loop instead of one interval per match.
- Delta or compressed game-state broadcasts.
- Lazy-load Phaser so auth and lobby load faster.
- Browser responsive tests and visual regression screenshots.

## Repository map

npm workspaces split the repo into `backend/` and `frontend/`, each with its own `package.json`; the root `package.json` wires them together and forwards the shared scripts.

```text
backend/
  src/
    main.ts        Bootstrap
    app.module.ts  Root module and application wiring
    common/        Cross-cutting WebSocket auth middleware, socket CORS options, decorators
      decorators/    current-user decorator
      ws/            ws-auth middleware, ws-cors options
    auth/          Registration, login, JWT guard
    cards/         Card catalog and owned-card endpoints
    game/
      engine/      Framework-independent authoritative game simulation
      balance.ts   Default rules and starter cards
    gameplay/      Gameplay service, Socket.IO gateway, tick handling
    matchmaking/   Redis matchmaking, gateway, and active-player store
    players/       Player profile, statistics, leaderboard endpoints
    prisma/        Prisma client lifecycle
    redis/         Redis connection and Lua matchmaking command
    dev/           Local demo and online terminal client
  scripts/
    loadtest.mjs   Socket.IO load test that plays bot-vs-bot matches
  prisma/
    schema.prisma  PostgreSQL data model
    migrations/    Database schema migrations
frontend/
  src/
    app/           App shell and providers
    components/    Reusable UI components (Button, Panel, Icon, CardArt, …)
    features/
      auth/        Auth screen
      lobby/       Lobby screen
      game/        Game screen, HUD controls, result overlay, and game formatting
    phaser/        Phaser 4 battlefield, HUD, units, VFX, audio, and scenes
    network/       Typed HTTP + Socket.IO clients
    store/         Zustand stores (session, matchmaking, game, ui)
    styles/        Global styles
    test/          Test setup
  public/
    assets/kenney/ Medieval RTS sprite pack and icons
  index.html       Vite entry HTML
docs/
  VISUAL-OVERHAUL.md  Visual redesign specification and backlog
```

## Troubleshooting

| Symptom                                         | Likely cause                   | Fix                                                                     |
| ----------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| `JWT_SECRET` startup failure                    | Env var unset                  | Add `JWT_SECRET` to `backend/.env` and restart.                         |
| Registration rejects every request              | No card rows exist             | Insert the four intended cards (via Prisma Studio) before registering.  |
| `match_found` never fires                       | Only one player queued         | Queue a second account, or run a second terminal/online client.         |
| `join_game` returns `game_error`                | Socket not a match participant | Ensure the same JWT used for matchmaking is sent to `/gameplay`.        |
| Deploys rejected with `INSUFFICIENT_ENERGY`     | Energy too low for card cost   | Wait for regeneration or pick a cheaper card.                           |
| Deploys rejected with `OUTSIDE_DEPLOYMENT_ZONE` | Wrong half or `y` out of band  | Deploy only in your half (`x<50` LEFT, `x>50` RIGHT) with `y` in 30–70. |
| CORS/Socket.IO blocked in browser               | Origin not allowed             | Set `WARLAND_ALLOWED_ORIGINS` to your frontend origin.                  |
| Prisma client errors after pull                 | Generated client out of date   | Run `npx prisma generate` in `backend/`.                                |

## License

This project is a prototype. No license has been published; treat all code as private unless the repository owner states otherwise.
