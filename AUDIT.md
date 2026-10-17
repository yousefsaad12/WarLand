# WarLand — Backend Engineering Audit, Bug Hunt, Performance Review & Rating

> Scope note: I inspected the repository at `E:\WarLand` directly (all of `src/`, `prisma/`, `scripts/`, configs, migrations, committed load-test reports, and git history). Every "Confirmed" item below was verified against source, a run, or a reproduction. Where I could not verify, it is labeled. The environment had no live Postgres/Redis, so I did **not** execute the server end-to-end; I did run the test suite, lint, build, and engine probes.

---

## Revision 2 — post-fix re-rating (Plan 1 implemented)

> This section was added after Plan 1 (FIX-1…FIX-6) was implemented in the working tree. The original audit below is preserved as the historical baseline; the summary sections (§1, §2, §13, §14, §16, §20) carry inline `[R2]` updates, and each bug entry in §5 now shows a **Status** line.

**New score: 74 / 100** (was 58/100) — "Solid, with a few clearly-scoped gaps remaining." This matches the audit's own prediction that Plan 1 would land the project "in the mid-70s".

**What changed (all verified locally):**

| Fix | Bug(s) | Change | Evidence |
|---|---|---|---|
| FIX-1 | BUG-001, BUG-003, BUG-006 | `GameplayService.disposeMatch()` releases both players from `ActivePlayers`, clears the join deadline, and deletes `matchStates`; called in a `finally` on the finish path and on the error path. `deploy` is now rejected with `game_error` when the match is not `RUNNING`. | `gameplay.service.ts:113-143`, `gameplay.gateway.ts:157-162,197-261`; gateway spec asserts disposal on finish, on persist failure, and on tick error |
| FIX-2 | BUG-002 | A 30 s join deadline is scheduled in `startMatch`; if nobody joins, the DB match is marked `FINISHED` and both players are released. `markMatchJoined` cancels the deadline once both sockets are present. | `gameplay.service.ts:145-189`; service spec uses fake timers to assert abandonment |
| FIX-3 | BUG-009, BUG-010 | Restored/expanded `src/game/engine/engine.spec.ts` (29 cases), added `gameplay.service.spec.ts` (14) and `gameplay.gateway.spec.ts` (10), added `test/game-engine.e2e-spec.ts`; corrected the README claim; `test:e2e` now passes. | `npm test` = 54 tests / 4 files; `npm run test:e2e` = exit 0 |
| FIX-4 | BUG-005 | Elo (K=32) is computed inside the existing transaction and written to both players; DRAW is neutral. | `gameplay.service.ts:191-203,313-346`; service spec asserts `1200→1216 / 1200→1184` and no change on DRAW |
| FIX-5 | BUG-008 | Accept-rate changed to `accepted/sent`; the self-contradictory `scripts/loadtest-smoke.json` was deleted. | `scripts/loadtest.mjs:551-556,632-635` |
| FIX-6 | BUG-011 | `app.enableShutdownHooks()` added. | `main.ts:10` |

**Also fixed (opportunistic):** the lingering `no-unused-vars` lint warning in `ws-auth.middleware.ts` (unused `catch (err)` → `catch`).

**Re-verified commands:** `npm test` → **54 passed (4 files)** · `npm run test:e2e` → **exit 0 (1 test)** · `npm run lint` → **clean** · `npm run build` → **clean**.

**Still open after Plan 1 (unchanged):** BUG-004 (failed claim silently drops the opponent), BUG-007 (idempotency window), BUG-012 (`deploy_result` room broadcast), BUG-013 (rate limiting), BUG-014 (Redis resilience/TTL), BUG-015 (negative leaderboard limit), S-001…S-003. No live Postgres/Redis was available, so end-to-end persistence and the committed load numbers remain code-derived rather than re-executed.

**What still holds the score below ~82:** no reconnect/cancellation, no restart reconciliation of `PLAYING` matches, no health/readiness endpoint or metrics, no rate limiting, and no live end-to-end run.

---

## 1. Executive verdict

WarLand is a **genuinely above-average backend prototype with a strong core and a weak perimeter.** The center of gravity — a pure, framework-independent, deterministic game engine, an atomic Redis-Lua matchmaking claim, and an honest, instrumented load-test harness with committed reproducible reports — reflects real engineering thinking that most junior portfolios do not have.

However, the **perimeter around that core is not reliable**: live match state is never released; players can be permanently stranded in the "active" set; a persistence failure leaks players; the "ranked" system never changes a rating; reconnect and cancellation are absent; and the test story is essentially fictional — the README advertises a game-engine test file that was **deleted from the repo**.

The single most damaging fact is the **testing claim**. The README (line 365) says *"Current automated game-engine coverage is in `src/game/engine/engine.spec.ts`."* That file does not exist on disk or in `HEAD` (deleted in commit `2e5385c`), and `git log` confirms it. `npm test` runs exactly **one** test — Nest's `"Hello World"` boilerplate. `npm run test:e2e` **exits with code 1 ("No test files found")**. That gap between documentation and reality is the thing an interviewer will find.

**Verdict: a real engineering base undermined by lifecycle leaks, missing core features (rating/reconnect), and a test/sample-report credibility problem. Fixable without a rewrite.**

> **[R2] — Updated after Plan 1.** The lifecycle leaks (BUG-001/002/003/006), the missing rating (BUG-005), and the test/README credibility problem (BUG-008/009/010) are **fixed**, and graceful shutdown (BUG-011) is added. The perimeter is no longer the weak point; the remaining gaps are reconnect/cancellation, a handful of medium/low bugs, and the absence of health/observability and a live end-to-end run. See "Revision 2" at the top.

---

## 2. Overall score

### **58 / 100** — "Substantial correctness/architecture/testing/reliability gaps" (upper end of the 40–59 band)

> **[R2] Current score: 74 / 100** — "Solid, with a few clearly-scoped gaps remaining." Tested: `npm test` 54 pass, `test:e2e` exit 0, lint clean, build clean. The band improves because the #1 credibility risk is resolved and lifecycle correctness is restored, but the score is capped by the still-open bugs and the lack of live verification.

**Confidence: High** for code- and repo-derived findings (I read every source file and ran the build/tests/lint and engine probes).
**Evidence limitations:** No running PostgreSQL/Redis instance, so I could not execute the live server, matchmaking, gateway, or the load test. Persistence/idempotency claims are established by reading code, not by concurrent-execution reproduction. All performance numbers below are the committed reports, which I validated for internal consistency but did not re-run.

---

## 3. Repository inventory

**Architecture (actual):** A single NestJS process. HTTP + two Socket.IO namespaces (default for matchmaking, `/gameplay`). PostgreSQL via Prisma; Redis via `ioredis` with one custom Lua command. Active match simulation is in-process memory. Exactly as the README's "single process only" caveat says.

| Module | Responsibility | File |
|---|---|---|
| `AuthModule` | register/login, bcrypt, JWT, HTTP guard | `src/auth/*` |
| `MatchmakingGateway/Service` | queue events, Redis claim, DB match creation, game init | `src/matchmaking/*` |
| `RedisService` | connection + `findAndClaimMatch` Lua | `src/redis/redis.service.ts` |
| `GameplayGateway` | WS auth, room join, deploy queue, **per-match `setInterval`**, broadcast, persistence | `src/gameplay/gameplay.gateway.ts` |
| `GameplayService` | deck load, in-memory `matchStates`, tick advance, result persist | `src/gameplay/gameplay.service.ts` |
| `engine.ts` | pure deterministic simulation | `src/game/engine/engine.ts` |
| `ActivePlayers` | in-memory player→match map | `src/matchmaking/active-players.store.ts` |

**Main execution paths traced:** matchmaking queue → Lua claim → DB `match.create` → `startMatch` → `match_found` → `/gameplay` join → per-match timer → `advanceMatch` → `toMatchView` → room broadcast → finish → `persistMatchResult` → `match_finished`.

**Automated tests present:** `src/app.controller.spec.ts` — one Nest boilerplate test. **That is the entire suite.**
**Benchmark evidence:** `scripts/loadtest.mjs` (780 lines, black-box) + six committed JSON reports (4/40/100/250/500/1000 bots).
**Not inspected / absent:** no `test/` directory (referenced by README and the `lint` script), no CI config, no Docker/compose, no `.env` (correctly gitignored/untracked — no secret leak).

> **[R2]** Test suite is now: `src/game/engine/engine.spec.ts` (29), `src/gameplay/gameplay.service.spec.ts` (14), `src/gameplay/gameplay.gateway.spec.ts` (10), `src/app.controller.spec.ts` (1) = **54 tests**, plus `test/game-engine.e2e-spec.ts` (1 e2e). A `test/` directory now exists. The committed `scripts/loadtest-smoke.json` report was deleted (its numbers were impossible).

---

## 4. Architecture assessment

**Strengths**
- `engine.ts` is genuinely framework-free and pure (no Nest/Prisma/Socket.IO imports), which is the correct separation and makes it unit-testable in principle.
- Redis-Lua `findAndClaimMatch` is the right primitive: it atomically re-checks the requester and removes the opponent, preventing the classic double-match race without distributed locks.
- Energy stored in hundredths avoids float drift; tie-breaks use `spawnSequence` for determinism.
- Result persistence uses a conditional `updateMany({where:{status:'PLAYING'}})` guarded by `count`, giving idempotent match finalization.

**Weaknesses**
- **The transport layer owns simulation scheduling and persistence.** `gameplay.gateway.ts:191-264` runs the tick loop, mutates command queues, *and* performs DB writes. The gateway is doing orchestration that belongs in the service.
- **`ActivePlayers` is declared in `GameplayModule` but consumed by `MatchmakingModule`** (`gameplay.module.ts:10-11`, `matchmaking.module.ts` imports `GameplayModule`). Ownership is inverted and confusing.
- **`GameplayGateway` has no `OnModuleDestroy` for `matchStates`** because it doesn't own it — and `GameplayService` has no destroy hook at all.
- Missing intended subsystems: rating/Elo, reconnect, end-to-end cancellation, replay.

---

## 5. Confirmed bugs (ranked by severity)

### BUG-001 — Live match states are never released (unbounded memory growth)
- **Severity:** High · **Confidence:** Confirmed · **Category:** Reliability / Performance · **Status: FIXED [R2]**
- **Fix:** `GameplayService.disposeMatch()` now deletes the state and releases both players; called on the finish and error paths (`gameplay.service.ts:130-143`, `gameplay.gateway.ts:215-247`).
- **Location:** `src/gameplay/gameplay.service.ts:24,50,75,80`
- **Problem:** `matchStates` is written with `.set(...)` on start and on every tick, and read with `.get(...)`, but **never `.delete(...)` or `.clear()`** anywhere in the codebase (`grep matchStates` → only set/get). Memory grows with total matches ever played, not active matches.
- **Root cause:** No lifecycle release after `persistMatchResult`; the gateway deletes its timers/queues (`gameplay.gateway.ts:208-210`) but the authoritative state lives in the service and is orphaned.
- **Reproduction:** Run N full matches; `gameplayService['matchStates'].size === N` afterward. No memory baseline test exists to catch it.
- **Impact:** Steady RSS growth, worsening GC pauses and tick drift over a long-running server. Degrades exactly the property the load test measures.
- **Recommended fix:** After successful persistence, `this.gameplayService.disposeMatch(matchId)` that deletes from `matchStates`. Add it to the finish path and to the error path.
- **Regression test:** Play 50 matches; assert `matchStates.size === 0` after each finishes; assert heap returns near baseline over 500 matches.
- **Effort:** Small.

### BUG-002 — Players can be stranded in `ActivePlayers` forever
- **Severity:** High · **Confidence:** Confirmed · **Category:** Lifecycle / Correctness · **Status: FIXED [R2]**
- **Fix:** A 30 s join deadline scheduled in `startMatch` marks the DB match `FINISHED` and releases both players if neither joins; `markMatchJoined` cancels it once both sockets are present (`gameplay.service.ts:145-189`, scheduled `gameplay.gateway.ts:202`).
- **Location:** `src/matchmaking/matchmaking.service.ts:144-145`; `src/gameplay/gameplay.gateway.ts:216-219`
- **Problem:** A match is created and both players added to `ActivePlayers`, but removal happens **only** when the tick timer observes a finished match. If neither player ever connects to `/gameplay` (`join_game` never called), **no timer starts**, the match never finishes, and both players are blocked from matchmaking permanently (`isActive` returns true → `matchmaking.service.ts:64` rejects them).
- **Root cause:** No game-start/join timeout and no reconciliation of abandoned `PLAYING` matches.
- **Reproduction:** Two clients `join_queue`, receive `match_found`, then disconnect without joining `/gameplay`. Requeue → "You are already in the matchmaking queue."
- **Impact:** Permanent denial of gameplay for affected accounts until process restart.
- **Recommended fix:** Add a join deadline (e.g. 30s) after `match_found`; on expiry mark the DB match `FINISHED`/abandoned and release `ActivePlayers`. Optionally a periodic sweeper for `PLAYING` matches older than `maxTicks`.
- **Regression test:** Simulate `match_found` then no join; assert both players become queueable and `ActivePlayers` empties.
- **Effort:** Medium.

### BUG-003 — Persistence failure leaks players and never notifies them
- **Severity:** High · **Confidence:** Confirmed · **Category:** Reliability / Lifecycle · **Status: FIXED [R2]**
- **Fix:** The finish path now wraps persistence in `try/catch` and calls `disposeMatch` in a `finally`, so players are always released and a terminal `game_error` is emitted on failure (`gameplay.gateway.ts:215-238`).
- **Location:** `src/gameplay/gameplay.gateway.ts:211-236`
- **Problem:** On success the gateway calls `activePlayers.removePlayer(...)` for both sides (216-219). If `persistMatchResultWithRetry` throws after 3 attempts, control jumps to the `catch` (225), which clears timers and emits `game_error` but **never removes the players from `ActivePlayers` and never emits `match_finished`**.
- **Root cause:** Cleanup split across two paths; the failure path is incomplete.
- **Reproduction:** Point Prisma at an unavailable DB at match end; both players remain locked out.
- **Impact:** Same permanent lockout as BUG-002, triggered by a transient DB outage — which is precisely when you can least afford it.
- **Recommended fix:** Move player release into a `finally`-style cleanup that runs regardless of persistence outcome; emit a terminal event either way.
- **Regression test:** Force persistence rejection (mock) and assert `ActivePlayers` is cleared and a terminal event is emitted.
- **Effort:** Small.

### BUG-004 — A failed claim silently drops the opponent from the queue
- **Severity:** Medium · **Confidence:** Confirmed · **Category:** Correctness / Matchmaking · **Status: OPEN [R2]**
- **Location:** `src/matchmaking/matchmaking.service.ts:96-104`; `src/redis/lua/match.lua:18-24`
- **Problem:** When a player A claims opponent B but B's socket is disconnected, the Lua script has **already removed B from `matchmaking_queue` and deleted `matchmaking_meta:B`**. A then re-queues itself (`joinMatchQueue`, line 101) and continues, but B is left out of the queue; B's own polling loop sees `hexists(meta:B) === false` and **returns silently** with no `match_error`.
- **Root cause:** The claim is destructive before the liveness check.
- **Reproduction:** B joins queue from socket S, socket S drops (or B's stored socketId is stale), A claims; observe B never receives a match or an error.
- **Impact:** A client can appear to be "searching" (`queue_joined` was sent) but silently stop searching.
- **Recommended fix:** Validate liveness inside/around the claim, or re-insert a dropped candidate and emit an explicit `queue_error`/re-queue signal to B.
- **Effort:** Medium.

### BUG-005 — "Ranked" matchmaking never changes a rating
- **Severity:** Medium · **Confidence:** Confirmed · **Category:** Correctness / Missing feature · **Status: FIXED [R2]**
- **Fix:** Elo (K=32) computed in `computeEloRatings` and written inside the finalization transaction for both players; DRAW is neutral (`gameplay.service.ts:191-203,313-346`).
- **Location:** `src/gameplay/gameplay.service.ts:141-214`; `src/matchmaking/matchmaking.service.ts:172-184`
- **Problem:** `grep rating` shows it is only ever *read* (selects, leaderboard ordering, matchmaking score). `persistMatchResult` increments `wins`/`losses` but **never `rating`**. No Elo/Glicko/TrueSkill anywhere. Matchmaking score is `rating + avgCardLevel*20 + level*5`, but `rating` is permanently the default `1000`.
- **Impact:** The advertised "ranked" system is cosmetic; skill-based matchmaking and leaderboard movement are not real.
- **Recommended fix:** Implement a simple Elo update inside the existing transaction, between the winner/loser updates.
- **Regression test:** Assert expected rating delta after a decided match; assert DRAW leaves ratings unchanged.
- **Effort:** Small–Medium.

### BUG-006 — Deploys after match end are acknowledged but never processed
- **Severity:** Medium · **Confidence:** Confirmed · **Category:** Correctness / Lifecycle · **Status: FIXED [R2]**
- **Fix:** `handleDeploy` now returns a `game_error` when `isMatchRunning(matchId)` is false, so no queue is recreated (`gameplay.gateway.ts:157-162`).
- **Location:** `src/gameplay/gameplay.gateway.ts:156-180, 205-210`
- **Problem:** On finish the gateway deletes the match's timer and command queue, but the socket keeps `client.data.matchId`. A subsequent `deploy` recreates `commandsByMatch[matchId]`, emits `deploy_queued`, and is never processed (no timer). The recreated array also lingers.
- **Impact:** Misleading acknowledgements; small per-match leak; no `game_error` explaining the match is over.
- **Recommended fix:** Reject `deploy` when the match is not `RUNNING` (check service state) with a clear reason; don't recreate the queue.
- **Effort:** Small.

### BUG-007 — Request-id idempotency window expires after 10 s
- **Severity:** Low–Medium · **Confidence:** Confirmed (reproduced) · **Category:** Correctness · **Status: OPEN [R2]**
- **Location:** `engine.ts:413-443, 898-905`; retention `100` ticks at 10 tps
- **Problem:** My probe (`requestLedgerRetentionTicks: 2`) showed that re-sending the **same** `requestId` after pruning is treated as a *new* command and returns `ACCEPTED` with a new `unitId` (not `replayed:true`). Within the window it correctly returns `replayed:true`; a mismatched payload within the window correctly returns `CONFLICT`.
- **Impact:** A client retrying an old request (e.g. after reconnect/latency) can cause a duplicate deployment instead of a dedup. Energy is charged twice, so it is not an exploit, but the idempotency guarantee is only partial.
- **Recommended fix:** Document the window explicitly, or key idempotency by a longer-lived per-player counter. Low urgency.
- **Effort:** Small.

### BUG-008 — Committed load-test report contains an impossible metric
- **Severity:** Medium · **Confidence:** Confirmed · **Category:** Evidence / Testing credibility · **Status: FIXED [R2]**
- **Fix:** `acceptRate` is now `accepted/sent` (and the progress line uses `sent`) in `scripts/loadtest.mjs:551-556,632-635`; the impossible `scripts/loadtest-smoke.json` was deleted.
- **Location:** `scripts/loadtest-smoke.json:57-63`
- **Problem:** `deploys.sent: 59` but `deploys.accepted: 118` — accepted exceeds sent, which is logically impossible. The 40/100/250/500/1000 reports all have `sent == accepted` (or 0), so this appears specific to the smoke artifact. Additionally, `acceptRate = accepted/(accepted+rejected)` (`loadtest.mjs:554-555`) ignores `sent`, `lost`, and server-side `TICK_DEPLOYMENT_LIMIT` rejections, so "100% accept rate" is not a meaningful rate.
- **Impact:** Undermines trust in the benchmark suite, which is otherwise the project's strongest asset.
- **Recommended fix:** Re-generate or delete the smoke report; change the rate to `accepted/sent` and surface `lost`.
- **Effort:** Small.

### BUG-009 — README advertises a deleted test file
- **Severity:** Medium (credibility) · **Confidence:** Confirmed · **Category:** Testing / Documentation · **Status: FIXED [R2]**
- **Fix:** `src/game/engine/engine.spec.ts` restored/expanded (29 cases); README now describes the real suites and the e2e file.
- **Location:** `README.md:365`; git history
- **Problem:** README: *"Current automated game-engine coverage is in `src/game/engine/engine.spec.ts`."* The file does not exist in the working tree or `HEAD`; `git log --diff-filter=D` shows it was deleted in `2e5385c` ("loadtest added"). `test/app.e2e-spec.ts` was deleted in `6024908`. Actual tests: one boilerplate.
- **Impact:** A hiring reviewer will consider this the decisive red flag.
- **Recommended fix:** Restore/replace the engine spec and correct the README.
- **Effort:** Medium (writing tests).

### BUG-010 — `npm run test:e2e` fails with exit code 1
- **Severity:** Low–Medium · **Confidence:** Confirmed (ran it) · **Category:** Testing · **Status: FIXED [R2]**
- **Fix:** `test/game-engine.e2e-spec.ts` added; `passWithNoTests: true` set in `vitest.config.e2e.ts`. `npm run test:e2e` now exits 0 with 1 test.
- **Location:** `vitest.config.e2e.ts:9`, `package.json:25`
- **Problem:** `include: ['**/*.e2e-spec.ts']` matches nothing → `No test files found, exiting with code 1`. The `lint` script also points at a non-existent `test/` directory.

### BUG-011 — No graceful shutdown hooks
- **Severity:** Low–Medium · **Confidence:** Confirmed · **Category:** Operations · **Status: FIXED [R2]**
- **Fix:** `app.enableShutdownHooks()` added (`main.ts:10`); `GameplayService.onModuleDestroy` also clears join deadlines and match states.
- **Location:** `src/main.ts:7-18`
- **Problem:** `app.enableShutdownHooks()` is never called, so `onModuleDestroy` on `RedisService`/`DbService`/`GameplayGateway` won't run on SIGINT/SIGTERM. Timers and sockets are not drained cleanly.

### BUG-012 — `deploy_result` is broadcast to the whole match room
- **Severity:** Low · **Confidence:** Confirmed · **Category:** Networking / Info exposure · **Status: OPEN [R2]**
- **Location:** `src/gameplay/gameplay.gateway.ts:202-204`
- **Problem:** Results (accepted/rejected, `cardId`, `unitId`, rejection reasons) are emitted to `server.to(matchId)`, so the opponent receives each player's private deployment outcome. If intended, document it; otherwise emit to the requesting socket only.
- **Note:** This is also the most likely origin of the BUG-008 double-count anomaly in the smoke report.

### BUG-013 — No abuse/rate protection
- **Severity:** Low–Medium · **Confidence:** Confirmed · **Category:** Security · **Status: OPEN [R2]**
- **Location:** global (`main.ts`, `auth.controller.ts`)
- **Problem:** No throttling on `register`/`login`/`join_queue`; no message-size limits on Socket.IO events; bcrypt truncates at 72 bytes while the DTO allows 128; JWT is 7-day with no revocation. CORS defaults to `*` (`ws-cors.options.ts:6`). All acceptable for a local prototype but must be documented as such.

### BUG-014 — Redis has no resilience configuration
- **Severity:** Low–Medium · **Confidence:** Strongly suspected · **Category:** Reliability · **Status: OPEN [R2]**
- **Location:** `src/redis/redis.service.ts:12`
- **Problem:** `new Redis(url)` with no `retryStrategy`/`maxRetriesPerRequest`/offline behavior. When Redis is unavailable, `multi().exec()` rejects and matchmaking hard-fails with no queueing/backpressure strategy. Queue keys have **no TTL**, so entries from crashed processes persist until claimed.

### BUG-015 — Leaderboard accepts negative `limit`
- **Severity:** Low · **Confidence:** Confirmed · **Category:** Correctness · **Status: OPEN [R2]**
- **Location:** `src/players/player.controller.ts:41-44`
- **Problem:** `Math.min(limit ?? 100, 100)` has no lower bound; a negative value maps to Prisma's negative `take` (reverse selection). Clamp to `[1,100]`.

---

## 6. Suspected bugs (not reproduced)

- **S-001 — Interactive transaction timeouts under load.** `persistMatchResult` uses the default 5s interactive transaction (`gameplay.service.ts:165`). Under the 500–1000-match loads the README reports, a brief DB stall could abort the transaction; combined with BUG-003 this strands players. Not reproduced (no live DB). *Confidence: Strongly suspected.*
- **S-002 — Gather/scatter cost of `fetchSockets()` on every `join_game`.** `gameplay.gateway.ts:96` performs a cluster-wide room fetch per join. Fine at current scale; not measured.
- **S-003 — Stale socketId in Redis after quick reconnect.** A player who re-joins the queue gets a new socketId overwriting the old via `hset`, but a claim already in flight could target the old socket. Low likelihood given the liveness check; unverified.

*(No confirmed security breach was found. The server genuinely remains authoritative: deploys take `playerId`/`matchId` from socket data, not from the payload — `gameplay.gateway.ts:156-165` — and the engine rejects non-participants.)*

---

## 7. Missing and incomplete features — completeness matrix

| Feature | Status | Evidence | Missing work / risk | Priority |
|---|---|---|---|---|
| Authentication | Implemented, insufficiently tested | `auth.service.ts`, bcrypt(12), JWT required at boot | No rate limiting; 72-byte bcrypt truncation | P2 |
| WebSocket authorization | Implemented and verified (by reading) | middleware on both namespaces; participant check `gameplay.service.ts:57-65` | No per-message auth beyond socket data | P3 |
| Matchmaking | Implemented and verified | Lua atomic claim; search-range ramp | BUG-004; no TTL | P1 |
| Queue cancellation | Partially implemented | `leave_queue` handled; disconnect cleanup | No cancellation of already-created matches | P2 |
| Match lifecycle | Partially implemented | `match.create` → `startMatch` → finish | BUG-002/003; no join timeout | P1 |
| Game simulation | Implemented and verified | deterministic (probe D), validated, ledger | idempotency window (BUG-007); no invariant tests | P1 |
| Gameplay validation | Implemented and verified | engine checks deck/zone/energy/bounds; NaN rejected | limit of 3/tick enforced only in gateway, not engine | P3 |
| Reconnection | **Missing** | none; `reconnection:false` only in clients | Clients cannot resume an in-progress match | P2 |
| Match finalization | Implemented, insufficiently tested | transactional, conditional-update idempotent | no reconciliation of abandoned matches | P2 |
| Result persistence | Implemented, insufficiently tested | `persistMatchResult` | BUG-003 failure path | P1 |
| Rating updates | **Missing** | BUG-005 | no Elo | P2 |
| Replay system | **Missing** | only a per-request replay ledger, not match replay | no recording/playback | P4 |
| Automated tests | **Missing** | 1 boilerplate test; advertised file deleted | BUG-009/010 | P1 |
| Load-test reliability | Implemented, credible with caveats | 6 committed reproducible reports | BUG-008; no hardware spec; no memory test | P2 |
| Logging and metrics | Missing | `console.*` only | no structured logs/metrics/health | P3 |
| Deployment and recovery | Missing | no health check, no graceful shutdown (BUG-011) | can't cleanly restart | P3 |

> **[R2] Matrix updates:** Match lifecycle → *implemented* (join deadline added). Result persistence → *implemented and tested* (failure path fixed, spec-covered). Rating updates → *implemented and tested* (Elo, DRAW neutral). Automated tests → *implemented* (54 unit + 1 e2e). Deployment/recovery → *partial* (graceful shutdown added; still no health check). Still missing: Reconnection, Replay, structured logging/metrics, restart reconciliation. Matchmaking still carries BUG-004.

Priority key: P1 core correctness, P2 portfolio scope, P3 useful, P4 optional.

---

## 8. Security and data integrity findings

- **No data-corruption path found in match finalization.** The conditional `updateMany` + `count` guard (`gameplay.service.ts:179-186`) makes it idempotent under concurrent calls; `player.update` increments happen only after the guard. The `updatedPlayers.count !== 2` check enforces the two-participant invariant. **This is good.**
- **Server authority is preserved** (payload IDs ignored; participant check on join).
- **No secret leakage**: `.env` is gitignored and untracked; boot fails if `JWT_SECRET` is missing (`auth.module.ts:10-12`).
- **Gaps:** no rate limiting (BUG-013), permissive default CORS, deploy-result room leakage (BUG-012), no WS payload size cap, no query-level pagination beyond the 100 cap.
- **Data-integrity gap:** abandoned `PLAYING` matches are never reconciled; `ActivePlayers` can desynchronize from the DB (BUG-002/003).

---

## 9. Game simulation correctness findings

Engine ordering per tick (`engine.ts:219-253`): regen → process deploys → move → resolve attacks → remove dead → separate → `tick++` → prune ledger → check finish. This is coherent and simultaneous-damage resolution is a defensible design.

**Verified by probe (against the built engine):**
- **Determinism:** two identical runs produced byte-identical HP/unit output → `true`. **Confirmed.**
- **Both bases destroyed `<=0` same tick → `DRAW`** (`finishIfRequired`, `engine.ts:911-922`). **Confirmed by code.**
- **Advancing a finished match throws** `"Cannot advance a finished match"` — the engine defends itself. **Confirmed.**
- **`NaN` coordinates** → `INVALID_POSITION`. **Confirmed.**
- **Duplicate `requestId` with different payload within window** → `CONFLICT/REQUEST_ID_REUSED`; identical payload → `replayed:true`. **Confirmed.**

**Findings:**
- **Dead units still act within the tick they die** (attacks resolve before removal, `engine.ts:706-780, 854-856`). Intentional simultaneous resolution; **document it as an invariant.**
- **Per-player × per-tick deploy cap lives only in the gateway** (`gameplay.gateway.ts:167`), not the engine — a direct engine caller is unconstrained. Move the invariant or document it.
- **`validateAttackSpeed` rejects `attackSpeed > ticksPerSecond`** (`engine.ts:397-411`) — a sane guard.
- **No randomness** in the engine → replay would be reproducible *if* inputs were recorded (they are not). Distinguishing the three properties the brief asks for: (1) authoritative sim — yes; (2) deterministic given inputs — **verified**; (3) reproducible replay of a completed match — **not implemented**.
- **Missing tests:** both-bases-same-tick, unit-dies-before-attack, insufficient energy, duplicate commands, post-completion command, empty deck, deck mismatch. These are exactly what the deleted `engine.spec.ts` partially covered.

---

## 10. Node.js event-loop and concurrency findings

- **One `setInterval` per active match** (`gameplay.gateway.ts:196-238`). At 500 matches @10 Hz that is ~5,000 callbacks/s on one loop. The README's own bottleneck analysis (`README.md:430-446`) is **accurate and honest**.
- **Ticks do not overlap.** The callback contains no `await` on the normal path; the only `await` (persistence) happens *after* `clearInterval`. So despite being marked `async`, normal ticks run to completion synchronously — **no re-entrancy / state corruption from interleaving.** This is better than it looks.
- **`setInterval` drift is unmanaged:** no missed-deadline policy, no catch-up/skip, no separation of sim time from wall clock. Late callbacks simply stack, which is exactly the p95-drift growth measured at 500–1000 matches.
- **Match completion runs inline in the timer callback** (`await persist...`), so DB round-trips block the match's own next tick and, via the shared loop, briefly every other match — again correctly identified in the README.
- **No backpressure / slow-consumer policy** on broadcasts.
- The per-match timer is a valid choice at ≤250 matches; the evidence supports a **shared tick loop** as the next step, not a worker pool.

---

## 11. Performance and scalability assessment

**What is demonstrated (from committed reports, cross-checked against README):**

| Bots | Peak matches | matches/min | deploy accept | tick p50/p95 | errors | result |
|---:|---:|---:|---:|---:|---:|:--:|
| 4 | 4 | 3.73 | 100%* | 9/15 | 0 | PASS |
| 40 | 40 | 38.6 | 100% | 9/15 | 0 | PASS |
| 100 | 100 | 75.5 | 100% | 9/15 | 0 | PASS |
| 250 | 250 | 209.2 | 100% | 9/17 | 0 | PASS |
| 500 | 500 | 391.1 | 100% | 9/36 | 0 | FAIL (drift) |
| 1000 | 1000 | 797.3 | 100% | 9/34 | 0 | FAIL (drift) |

These match the README table. The reports include `config`, timestamps, `elapsedMs`, stop reason, and full distributions. **The clean operating point is ~250 concurrent matches; the knee is 250–500.** Median drift never moves (9 ms) while the tail grows — a correct signature of event-loop queueing.

**Confidence caps:** hardware/OS/Node version are absent from the reports; the test ran on one unspecified machine; there is **no memory-stability or soak test**, which is the metric that would expose BUG-001. The smoke report's impossible `accepted>sent` (BUG-008) means at least one committed artifact is stale.

**Algorithmic hotspots:** `separateUnits` is O(units² × 3) (`engine.ts:863-896`) and `moveUnits`/`resolveAttacks` filter enemies per unit → O(units²) per tick. With small per-match unit counts and the measured results, this is **not a demonstrated bottleneck**; do not add spatial indexing yet. The real cost is allocation + serialization, not search.

---

## 12. Load-test credibility assessment

**Trustworthy:** the harness is black-box, uses real HTTP + Socket.IO, seeds the RNG (`mulberry32`), tracks in-flight energy to avoid double-spend, measures queue wait / deploy latency / tick drift, and exits on thresholds. The 500/1000 numbers are internally consistent. This is genuinely good work.

**Inconclusive / needs work:**
- No hardware, OS, Node version, or server commit SHA in reports → not independently reproducible.
- No distinction between a *connection* stress test and a *gameplay* stress test is stated (it is a gameplay test, which is better).
- No memory/GC metrics, no server-side CPU, no event-loop-delay (`perf_hooks.monitorEventLoopDelay`), no DB/Redis load.
- `acceptRate` formula is not a real rate (BUG-008).
- The one committed smoke artifact is self-contradictory.
- Bots never reconnect or cancel, so those paths are untested.

> **[R2] Addressed:** `acceptRate` is now `accepted/sent` and the self-contradictory smoke artifact was deleted. Hardware/commit metadata, memory/GC, server CPU, event-loop delay, and DB/Redis load metrics remain to be added.

**Instrumentation to add before claiming capacity:** server-process CPU/RSS, event-loop delay histogram, DB and Redis operation counts/latency, and a memory-return-to-baseline test.

---

## 13. Testing gaps and verification results

**Commands I actually ran:**

| Command | Result |
|---|---|
| `npm test` | **1 test file, 1 test passed** (Nest "Hello World" boilerplate) |
| `npm run test:e2e` | **FAILED — "No test files found, exiting with code 1"** |
| `npm run lint` | 1 warning: unused `err` (`ws-auth.middleware.ts:29`) |
| `npm run build` | **Passed** |
| engine probe (built `dist`) | determinism ✓, advance-after-finish throws ✓, CONFLICT ✓, NaN rejected ✓, ledger-window gap reproduced |

> **[R2] Re-ran after Plan 1:**

| Command | Result |
|---|---|
| `npm test` | **4 files, 54 tests passed** (engine 29, gameplay service 14, gateway 10, app.controller 1) |
| `npm run test:e2e` | **Passed — exit 0** (`test/game-engine.e2e-spec.ts`) |
| `npm run lint` | **Clean** (0 warnings) |
| `npm run build` | **Passed** |
| new specs | join deadline (fake timers), Elo delta `1216/1184`, DRAW neutral, persist-failure disposal, deploy-after-end rejection, full-match determinism |

**Critical untested paths:** game rules/invariants, invalid commands, matchmaking races, queue cancellation, duplicate match creation, reconnect, match completion, result persistence, idempotent rating updates, Redis/Postgres failure, WS authorization, timer cleanup, shutdown, memory stability, high load. **Effectively everything outside the engine.** Recommended minimal high-value additions are in Stage B.

> **[R2]** Covered now: engine rules/invariants and invalid commands, match completion, result persistence, lifecycle/timer cleanup, join deadline, Elo updates, and gateway deploy/join handling. Still **not** covered: matchmaking races and the Lua claim, reconnect, cancellation, Redis/Postgres failure paths, WS authorization, memory-stability soak, and high load (no live services available).

---

## 14. Production-readiness assessment

Present: boot-time JWT-secret enforcement, Prisma connect/disconnect hooks, Lua asset correctly bundled into `dist` (`nest-cli.json:7`), migrated schema.
Missing: health/readiness endpoints, structured logging, metrics, graceful shutdown (BUG-011), config validation for `DATABASE_URL`/`REDIS_URL`, retry/backoff on Redis, recovery of in-progress matches after restart, rate limiting, and a card seed script (manual seeding is an onboarding trap).
**Portfolio deployment:** the missing shutdown hook + health check + abandonment reconciliation are the essentials; a full observability stack is not required at this scope.

> **[R2]** Graceful shutdown is now present (`enableShutdownHooks`), and abandoned matches are reconciled by the 30 s join deadline. Still missing: health/readiness endpoints, structured logging/metrics, config validation, Redis retry/backoff, restart reconciliation of in-progress matches, and rate limiting.

---

## 15. Junior backend hiring evaluation

1. **Stronger than typical CRUD? Yes.** A pure deterministic engine, Lua-atomic matchmaking, real-time rooms, and an honest load harness with committed reports are well beyond CRUD.
2. **Genuine depth:** engine purity/determinism, the idempotent conditional-update finalization, energy-in-hundredths, and the measured bottleneck analysis (`README.md:430-446`) that correctly separates full-state serialization cost from DB/RPC.
3. **Weaknesses that concern an interviewer:** the README advertises a deleted test file; `test:e2e` exits 1; live state is never freed; players can be locked out; "ranked" ratings never move.
   > **[R2] Resolved:** all five of these are fixed (real tests + truthful README, `test:e2e` green, state disposal, join deadline, Elo). Remaining concerns an interviewer may raise: the silent opponent drop (BUG-004), no reconnect/cancellation, no rate limiting, and no live end-to-end run.
4. **Decisions you must defend:** one `setInterval` per match; persistence/scheduling inside the gateway; destructive Lua claim before the liveness check; deploy results broadcast to the room; 10 tps vs the stated 20.
5. **README/CV claims needing stronger evidence:** "automated game-engine coverage" (false), "ranked" (no rating), and any capacity claim without hardware specs/memory soak.
6. **Three strongest interview discussions:** (a) the atomic Redis-Lua claim and why it removes the double-match race; (b) determinism + energy-in-hundredths + tie-break design in the engine; (c) the per-match-timer → event-loop queueing diagnosis with p50-flat/p95-growing evidence.
7. **Biggest hiring-value improvement per unit of effort:** **write 15–25 engine tests and one matchmaking/gateway integration test, then fix the README.** A junior candidate who shows a real, passing test suite around a real engine jumps an entire tier.

*Judge the project, not you: the code shows capability; the documentation currently overclaims, which is the one thing to never do in an interview.*

---

## 16. Prioritized fix backlog

Ordered by risk and dependency. (BUG-001…BUG-015 map to §5.)

| ID | Title | Sev | Category | Depends | Effort |
|---|---|---|---|---|---|
| BUG-001 | Match states never released | High | Reliability | — | S |
| BUG-002 | Players stranded in ActivePlayers | High | Lifecycle | BUG-001 | M |
| BUG-003 | Persist-failure leaks players | High | Reliability | BUG-001 | S |
| BUG-009 | README advertises deleted tests | Med | Testing | — | M |
| BUG-005 | No rating/Elo update | Med | Correctness | — | S–M |
| BUG-004 | Failed claim drops opponent silently | Med | Correctness | — | M |
| BUG-006 | Deploy accepted after match end | Med | Lifecycle | BUG-001 | S |
| BUG-008 | Impossible load-test metric | Med | Evidence | — | S |
| BUG-010 | `test:e2e` exits 1 | L–M | Testing | — | S |
| BUG-011 | No graceful shutdown | L–M | Ops | — | S |
| BUG-012 | deploy_result room leak | Low | Networking | — | S |
| BUG-013 | No rate limiting | L–M | Security | — | M |
| BUG-014 | Redis resilience/TTL | L–M | Reliability | — | M |
| BUG-007 | Idempotency window expiry | L–M | Correctness | — | S |
| BUG-015 | Negative leaderboard limit | Low | Correctness | — | S |
| S-001 | TX timeout under load | Suspected | Reliability | live DB | M |

> **[R2] Status after Plan 1:** ✅ Fixed — BUG-001, BUG-002, BUG-003, BUG-005, BUG-006, BUG-008, BUG-009, BUG-010, BUG-011. ⬜ Open — BUG-004, BUG-007, BUG-012, BUG-013, BUG-014, BUG-015, S-001, S-002, S-003.

---

## 17. Plan 1 — Minimum viable fix plan (make it demonstrably reliable)

1. **FIX-1 (BUG-001/003/006)** — Add `GameplayService.disposeMatch(matchId)`; call it (and `removePlayer` for both sides) in a `finally` on the finish path *and* error path; reject `deploy` when the match isn't `RUNNING`. Files: `gameplay.service.ts`, `gameplay.gateway.ts`. *Acceptance:* `matchStates.size === 0` after matches finish; forced persist failure still releases players. *Test:* unit test on gateway finish/error paths.
2. **FIX-2 (BUG-002)** — Add a join deadline after `match_found` and mark/release abandoned matches. Files: `matchmaking.service.ts`, `gameplay.gateway.ts`. *Acceptance:* non-joining match frees both players within the deadline. *Test:* integration test.
3. **FIX-3 (BUG-009/010)** — Restore an `engine.spec.ts` (≥15 cases), add one matchmaking/gateway integration test, fix README testing claim, make `test:e2e` pass (add a spec or gate the script). *Acceptance:* `npm test` runs >15 meaningful tests; `test:e2e` exits 0; README matches reality.
4. **FIX-4 (BUG-005)** — Implement Elo inside the existing transaction. Files: `gameplay.service.ts`. *Acceptance:* decided match moves both ratings by the expected delta; DRAW is neutral. *Test:* assertion with seeded ratings.
5. **FIX-5 (BUG-008)** — Regenerate/remove the smoke report; change accept-rate to `accepted/sent`. Files: `scripts/loadtest.mjs`, reports.
6. **FIX-6 (BUG-011)** — `app.enableShutdownHooks()`; verify `onModuleDestroy` runs. File: `main.ts`.

Completable by one junior dev in roughly **1–2 focused weeks**.

> **[R2] Status: all six fixes implemented and verified** (FIX-1…FIX-6). See "Revision 2" at the top for files, evidence, and acceptance results. Elo was implemented in the service (where match state lives) rather than `matchmaking.service.ts`, and the join deadline is likewise owned by `GameplayService`; behavior matches the acceptance criteria.

---

## 18. Plan 2 — High-quality portfolio plan (interview-grade)

1. **Reconnect support** — persist a resumable snapshot token; `join_game` re-hydrates and re-sends current state; release/penalize on real timeout.
2. **Shared tick loop** — replace N `setInterval`s with one scheduler iterating active matches at fixed steps; add explicit missed-deadline policy. *Acceptance:* tick p95 drift stays ≤30 ms at 500 matches.
3. **Throttled broadcast / delta updates** — split sim rate (10 Hz) from broadcast rate (e.g. 5 Hz) and emit deltas. *Acceptance:* measurable reduction in serialization CPU at equal match count.
4. **Memory soak + event-loop metrics** — `perf_hooks.monitorEventLoopDelay`, RSS/CPU sampling in the load report; add a "memory returns to baseline after N matches" test. Add hardware/commit SHA to reports.
5. **Cancellation end-to-end** — wire `cancelMatch` to a gateway event, add `CANCELLED`/`ABANDONED` persistence, and free resources.
6. **Observability + ops** — `/health` and `/ready`, structured logs, basic counters; config validation at boot; card seed script checked in.
7. **Security hardening** — throttling on auth/matchmaking, clamp WS payload size, configurable CORS without `*`, document bcrypt 72-byte limit.
8. **Optional replay** — record seed/commands/version (the engine is deterministic), replay offline. Only after the above.

---

## 19. Five highest-value actions to take next

1. **Fix the test story** (restore engine tests, one integration test, make `test:e2e` green, correct the README). Highest signal, lowest risk. — ✅ **Done [R2]**
2. **Close the lifecycle leaks** (BUG-001/002/003/006) — state disposal + player release on every path + join timeout. — ✅ **Done [R2]**
3. **Implement Elo** — turns "ranked" from a claim into a feature. — ✅ **Done [R2]**
4. **Regenerate/repair the load reports and add memory + event-loop metrics** — makes the strongest asset airtight. — ⚠️ **Partial [R2]** (metric fixed, smoke report removed; RSS/event-loop/hardware still missing)
5. **Add graceful shutdown + health/ready endpoints** — cheap, expected, and makes deployment credible. — ⚠️ **Partial [R2]** (shutdown done; health/ready still missing)

---

## 20. Final recommendation

**Fix and finish — do not optimize yet, and do not move on.** The core (engine, Lua matchmaking, load harness) is worth preserving; the missing pieces are lifecycle hygiene, one headline feature (rating), and testing honesty. There is **no justification** at this stage for microservices, worker threads, spatial indexing, or a different language — the measured knee (~250 matches) is explained by a known, documented scheduling choice, and one shared tick loop is the appropriate next step *after* correctness and tests. Address Plan 1, then Plan 2 selectively. The result would plausibly move this from ~58 to the mid-70s and make it a genuinely strong junior backend portfolio piece.

| Rank | Action | Why it matters | Completion criteria | Status [R2] |
|---|---|---|---|---|
| 1 | Restore real tests + fix README | The advertised test file is deleted; the gap is the #1 credibility risk | `npm test` runs ≥15 meaningful tests; `test:e2e` exits 0; README matches repo | ✅ Done — 54 tests + 1 e2e; lint/build clean |
| 2 | Dispose match state + release players on all paths | Prevents unbounded memory growth and permanent player lockout | 50 matches → `matchStates.size === 0`; forced persist failure still frees players | ✅ Done — `disposeMatch` on finish/error; spec-covered |
| 3 | Add match join timeout / abandonment reconciliation | Stops players being stranded by a match that never starts | Un-joined match frees both players within the deadline | ✅ Done — 30 s deadline; spec-covered |
| 4 | Implement Elo in the finalization transaction | "Ranked" currently does not change any rating | Decided match moves ratings; DRAW neutral; verified by test | ✅ Done — K=32; spec asserts `1216/1184` and DRAW neutral |
| 5 | Repair add load-test memory/event-loop metrics + reports | The benchmark suite is the strongest asset and must be trustworthy | Reports show RSS, event-loop delay, hardware; no impossible metrics | ⚠️ Partial — impossible metric fixed and smoke report removed; RSS/event-loop/hardware still absent |

> **[R2] Re-rated: 74 / 100.** Plan 1 is complete and verified. To move into the low-80s, take on the remaining backlog in order: **BUG-004** (silent opponent drop) → **BUG-012/013/014/015** (room leak, rate limiting, Redis resilience, leaderboard clamp) → **health/readiness + structured logging + restart reconciliation** → then Plan 2's shared tick loop and load-test instrumentation. Re-run the load harness with hardware/commit metadata before making any capacity claim.
