# WarLand

WarLand is a server-authoritative, real-time multiplayer lane-battle prototype. The backend is built with NestJS, Socket.IO, Prisma, PostgreSQL, and Redis. Players can register and log in, enter matchmaking, join a live match, deploy cards, and receive authoritative game updates.

The project includes ranked matchmaking, live online matches, a local practice arena, interactive terminal clients, and a React web client in `frontend/`.

![WarLand Banner](docs/screenshots/game_battle.png)

> **Project status:** Prototype. Active gameplay state and matchmaking presence are held in process memory. This version is intended for local development and single-server testing, not resilient multi-instance production hosting.

## Screenshots

| Screen | Preview | Description |
|---|---|---|
| **Authentication** | ![Auth Screen](docs/screenshots/auth_screen.png) | Secure login and registration with username/display name validation |
| **Lobby** | ![Lobby Screen](docs/screenshots/lobby_screen.png) | Commander dashboard showing stats, deck, leaderboard, and matchmaking controls |
| **Game Arena** | ![Game Screen](docs/screenshots/game_screen.png) | Live battle arena with base health bars, energy, timer, and card hand |

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture at a glance](#architecture-at-a-glance)
- [Match lifecycle](#match-lifecycle)
- [Gameplay and balance](#gameplay-and-balance)
- [Data model](#data-model)
- [Quick Start](#quick-start)
- [Installation & Setup](#installation--setup)
- [Terminal clients](#terminal-clients)
- [API and Socket.IO contracts](#api-and-socketio-contracts)
- [Configuration](#configuration)
- [Development commands](#development-commands)
- [Load testing](#load-testing)
- [Known limitations](#known-limitations)
- [Repository map](#repository-map)
- [License](#license)

## Features

- **Authentication**: Username/password registration and login with bcrypt password hashing and JWT access tokens.
- **Real-time Multiplayer**: Server-authoritative gameplay using Socket.IO with tick-based simulation.
- **Matchmaking**: Rating-based matchmaking backed by Redis sorted set with atomic Lua claim script.
- **Card-based Combat**: Deploy units with unique stats (cost, HP, damage, attack speed, movement speed, range).
- **Authoritative Game Engine**: Deterministic simulation handling movement, attacks, energy management, and win conditions.
- **Persistent Rankings**: Player ratings, wins/losses tracked in PostgreSQL with Prisma ORM.
- **Multiple Clients**: React web client, online terminal client, and local simulation mode.
- **Leaderboard**: Global ranked player statistics.

## Tech Stack

### Backend
- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [Socket.IO](https://socket.io/) - Real-time bidirectional communication
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [PostgreSQL](https://www.postgresql.org/) - Relational database
- [Redis](https://redis.io/) - In-memory data store for matchmaking
- [JWT](https://jwt.io/) - Authentication tokens
- [bcrypt](https://github.com/kelektiv/node.bcrypt.js) - Password hashing

### Frontend
- [React 19](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool and dev server
- [PixiJS](https://pixijs.com/) - 2D WebGL renderer for game graphics
- [Zustand](https://zustand-demo.pmnd.rs/) - State management
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Socket.IO Client](https://socket.io/docs/v4/client-api/) - Real-time client

### Development
- [Vitest](https://vitest.dev/) - Unit testing
- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) - Fast linter
- [TypeScript](https://www.typescriptlang.org/) - Static type checking

## Architecture at a glance

```mermaid
flowchart LR
    P1["Player 1<br/>Web/Terminal"] <-->|"Socket.IO"| MM["MatchmakingGateway<br/>MatchmakingService"]
    P2["Player 2<br/>Web/Terminal"] <-->|"Socket.IO"| MM
    P1 <-->|"Socket.IO /gameplay"| GW["GameplayGateway"]
    P2 <-->|"Socket.IO /gameplay"| GW
    MM -->|"Find/claim"| R["Redis<br/>Queue"]
    MM -->|"Create match"| DB[("PostgreSQL<br/>Prisma")]
    MM -->|"Init state"| GS["GameplayService"]
    GW -->|"Commands/ticks"| GS
    GS --> ENG["Game Engine<br/>(Pure logic)"]
    GS -->|"Persist results"| DB
    GW -->|"Broadcast updates"| P1
    GW -->|"Broadcast updates"| P2
```

## Match lifecycle

1. Players authenticate via JWT and connect to matchmaking namespace
2. Redis atomic Lua script pairs players based on rating
3. Match records created in PostgreSQL, game state initialized in memory
4. Both players join `/gameplay` namespace with match ID
5. Game ticks at configured rate (10 Hz), processing queued deployments
6. Authoritative state broadcast after each tick
7. Match ends on base destruction or time limit; results persisted

## Gameplay and balance

| Rule | Default |
|---|---:|
| Simulation rate | 10 ticks/second |
| Match duration | 180 seconds (1,800 ticks) |
| Starting energy | 5 |
| Max energy | 10 |
| Energy regeneration | 0.5 per second |
| Base health | 1,000 |
| Max deployments per player/tick | 3 |

- **Deployment zones**: LEFT side x < 50, RIGHT side x > 50 (midline x=50 forbidden)
- **Lane bounds**: y in [30, 70] (laneHalfWidth = 20)
- **Energy precision**: Stored in hundredths to avoid floating point drift
- **Authoritative**: All validations (card ownership, energy, position, zone) done server-side

## Data model

Key entities: `Player`, `Card`, `PlayerCard`, `Match`, `MatchPlayer`. The live simulation state is held in-memory; only match results and stats are persisted.

See [backend/prisma/schema.prisma](backend/prisma/schema.prisma) for full schema.

## Quick Start

Assuming you have PostgreSQL and Redis running locally:

```powershell
# Install dependencies
npm ci

# Backend setup
cd backend
npx prisma generate
npx prisma migrate deploy
cd ..

# Start backend (Terminal 1)
npm run start:dev

# Start frontend (Terminal 2)
npm run dev
```

Open http://localhost:5173 in your browser.

## Installation & Setup

### Prerequisites

- Node.js (compatible with project deps)
- PostgreSQL (running locally)
- Redis (running locally)

### 1. Install dependencies

```powershell
npm ci
```

### 2. Configure backend environment

Create `backend/.env`:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/warland?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="replace-with-a-long-random-secret"
PORT=3000
WARLAND_ALLOWED_ORIGINS="http://localhost:5173"
```

### 3. Setup database

```powershell
cd backend
npx prisma generate
npx prisma migrate deploy
npx prisma studio  # Optional: inspect/edit data
cd ..
```

### 4. Seed card data

There is no checked-in seed script. Before registering players, insert at least 4 card definitions into the `Card` table (via Prisma Studio or SQL). Registration grants all existing cards to new players.

### 5. Start servers

```powershell
# Backend (watch mode)
npm run start:dev

# Frontend (Vite dev server)
npm run dev
```

- Backend: http://localhost:3000
- Frontend: http://localhost:5173

### 6. Create test accounts

Register two accounts via the web client (Auth screen) or `POST /auth/register`. Both need the same 4-card deck for matches to work.

## Terminal clients

### Online multiplayer (connects to server)

```powershell
npm run game:terminal:online
```

Prompts for server URL, username, password. Commands:
- `deploy <card-id> <x> <y>` - Deploy a card
- `status` - Show latest game state
- `leave` - Leave matchmaking
- `help` - Show commands
- `quit` - Disconnect

### Local simulation (no server required)

```powershell
npm run game:terminal
```

Interactive local demo with WASD/arrows, 1-4 card selection, Tab side switch, Enter to deploy, Q to quit.

## API and Socket.IO contracts

### HTTP Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | No | Create account, return JWT |
| POST | `/auth/login` | No | Verify credentials, return JWT |
| GET | `/auth/me` | Bearer JWT | Get authenticated player |
| GET | `/players/me` | Bearer JWT | Get profile with deck |
| GET | `/players/:displayName/:tag` | No | Public profile lookup |
| GET | `/players/:displayName/:tag/stats` | No | Public stats |
| GET | `/leaderboard?limit=100` | No | Ranked leaderboard (limit capped) |
| GET | `/cards` | No | List card definitions |
| GET | `/me/cards` | Bearer JWT | List owned cards |

### Matchmaking Namespace (default)

Connect with `auth: { token }`. Events: `join_queue`, `queue_joined`, `match_found`, `leave_queue`, `queue_left`, `match_timeout`, `queue_error`, `match_error`.

### Gameplay Namespace (`/gameplay`)

Events: `join_game`, `game_started`, `deploy`, `deploy_queued`, `game_state`, `deploy_result`, `match_finished`, `game_error`.

## Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | JWT signing secret |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection |
| `PORT` | No | `3000` | Server port |
| `WARLAND_ALLOWED_ORIGINS` | Recommended | `*` | Comma-separated CORS origins |
| `WARLAND_SERVER_URL` | No | `http://localhost:3000` | Default for terminal client |

## Development commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | Start NestJS backend in watch mode |
| `npm run build` | Build backend |
| `npm test` | Run backend unit tests (Vitest) |
| `npm run test:e2e` | Run backend e2e tests |
| `npm run lint` | Run Oxlint on backend |
| `npm run loadtest` | Run Socket.IO load test |
| `npm run game:terminal` | Run local terminal simulation |
| `npm run game:terminal:online` | Run online terminal client |
| `npm run seed:cards` | Seed cards via prisma db execute |
| `npm run frontend:dev` | Start Vite frontend dev server |
| `npm run frontend:build` | Build frontend for production |
| `npm run frontend:typecheck` | Type-check frontend |
| `npm run frontend:test` | Run frontend tests (Vitest) |

**Test coverage:** Engine rules ([engine.spec.ts](backend/src/game/engine/engine.spec.ts)), gameplay lifecycle ([gameplay.service.spec.ts](backend/src/gameplay/gameplay.service.spec.ts)), socket handling ([gameplay.gateway.spec.ts](backend/src/gameplay/gameplay.gateway.spec.ts)), and full-match e2e ([game-engine.e2e-spec.ts](backend/test/game-engine.e2e-spec.ts)).

## Load testing

The load test ([backend/scripts/loadtest.mjs](backend/scripts/loadtest.mjs)) simulates bot-vs-bot matches using real HTTP/Socket.IO contracts.

```powershell
# Smoke test
npm run loadtest -- --bots 4 --ramp-ms 2000 --duration-ms 15000 --grace-ms 240000

# Capacity test
npm run loadtest -- --bots 500 --ramp-ms 30000 --duration-ms 180000 --grace-ms 300000
```

**Key findings (single process):**
- Clean performance up to ~250 concurrent matches (tick drift p95 ~17ms)
- Linear throughput to 1000 bots (~800 matches/min)
- Beyond 500 concurrent matches, per-match `setInterval` timers cause event loop queuing (drift exceeds threshold)
- All matches complete correctly with 100% deploy acceptance under tested loads

See full load test analysis in the [detailed README section](README.md#load-testing).

## Known limitations

- **Single process only**: In-memory state; restart ends live games; no multi-instance support
- **No reconnects**: Players disconnecting mid-match cannot resume
- **Manual card seeding**: Must insert card definitions before registration
- **Deck rules**: Exactly 4 cards per player; both players must have matching card IDs
- **Card levels**: Stored but not applied to stats yet
- **Permissive CORS by default**: Configure `WARLAND_ALLOWED_ORIGINS` in production

## Repository map

```text
backend/
  src/
    auth/           Auth module (JWT, guards)
    cards/          Card catalog endpoints
    game/engine/    Authoritative game simulation (framework-agnostic)
    gameplay/       Gateway, service, tick handling
    matchmaking/    Redis matchmaking + active players
    players/        Profiles, stats, leaderboard
    prisma/         Prisma client
    redis/          Redis service + Lua scripts
    dev/            Terminal clients
  prisma/
    schema.prisma   Data model
    migrations/     DB migrations
  scripts/
    loadtest.mjs    Load testing harness

frontend/
  src/
    app/            App layout/routing
    components/     Reusable UI components
    features/       Feature modules (auth, lobby, game)
    network/        API clients, Socket.IO
    store/          Zustand state stores
    styles/         Global styles
    renderer/       PixiJS game renderer
  public/           Static assets
```

## License

This project is a prototype for educational/development purposes. See [package.json](package.json) for details.

---

*Built with ❤️ using NestJS, React, Socket.IO, Prisma, Redis, and PixiJS.*
