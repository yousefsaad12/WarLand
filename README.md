# WarLand

## Terminal matchmaking client

Start the NestJS server with its configured PostgreSQL and Redis services, then in a second terminal run:

```powershell
npm run game:terminal:online
```

Enter the server URL (defaults to `http://localhost:3000`), your username, and password. The client logs in through `POST /auth/login`, uses the returned JWT to authenticate its Socket.IO connection, and joins the `join_queue` matchmaking event. Use `leave` while searching or `quit` to disconnect.

Run the local engine demo without connecting to the server using `npm run game:terminal`.

The local demo's initial balance is in [`src/game/balance.ts`](./src/game/balance.ts): 1,000 base HP, a 180-second time limit, and 0.5 energy regenerated per second. The starter card stats and base turret stats are defined there as well. These are prototype gameplay values, not real-world measurements, and the current matchmaking server does not yet use this game configuration.

To use a different server URL without changing the default prompt:

```powershell
$env:WARLAND_SERVER_URL = "http://localhost:3000"
npm run game:terminal:online
```

The current WebSocket gateway implements matchmaking events only. It emits `match_found`, but does not yet provide game-state updates, deployment commands, or a match-cancel event, so this client can verify login and matchmaking but cannot play the match yet. The local engine demo remains available separately.
