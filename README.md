# WarLand

## Terminal matchmaking client

Start the NestJS server with its configured PostgreSQL and Redis services, then in a second terminal run:

```powershell
npm run game:terminal:online
```

Enter the server URL (defaults to `http://localhost:3000`), your username, and password. The client logs in through `POST /auth/login`, uses the returned JWT to authenticate its Socket.IO connection, and joins the `join_queue` matchmaking event. After a match is found, it joins the authenticated `/gameplay` namespace and receives server-authoritative game state. Use `leave` while searching or `quit` to disconnect.

Run the local engine demo without connecting to the server using `npm run game:terminal`. The interactive terminal view uses Chalk and Boxen to render a styled title, colored battlefield, base health and energy bars, distinct unit markers, and framed ASCII-art cards. Arrows travel between archers and targets, close-range units show sword slashes, and new units pulse onto the battlefield. Only changed screen rows are redrawn to reduce flicker. Use WASD or arrow keys to move, `1`–`4` to pick a card, `Tab` to switch sides, and `Enter` to deploy. Press `Q` to quit; the display falls back to plain text if ANSI colors are disabled with `NO_COLOR`.

The local demo and online match share their initial balance in [`src/game/balance.ts`](./src/game/balance.ts): 1,000 base HP, a 180-second time limit, and 0.5 energy regenerated per second. The starter card stats and base turret stats are defined there as well. These are prototype gameplay values, not real-world measurements.

To use a different server URL without changing the default prompt:

```powershell
$env:WARLAND_SERVER_URL = "http://localhost:3000"
npm run game:terminal:online
```

In an online match, use `deploy <card-id> <x> <y>` to ask the server to deploy one of your cards at map coordinates from 0 to 100. The server checks the card, deployment half, and available energy, then broadcasts authoritative game state and deployment results. Use `status` to print the latest state. Match results update the match status and player win/loss counters; draws do not change those counters. The engine requires both players to have the same four-card deck.

Set `WARLAND_ALLOWED_ORIGINS` to a comma-separated list of trusted browser origins in production (for example, `https://game.example.com`). If it is unset, both Socket.IO gateways allow all origins for local development.

At most three deployment requests per player are queued per game tick. Reconnect and match-cancel handling are not implemented. Active games are held in memory by one server process, so a server restart ends them and this version is not intended for multi-instance gameplay. The local engine demo remains available separately.
