# Warland Frontend

React + TypeScript (strict) client for the Warland server-authoritative lane-battle backend. The browser renders state from the server and sends intents only — no gameplay simulation runs here.

## Stack

- **Vite** + **React** + **TypeScript** (strict)
- **PixiJS** for the arena renderer
- **Tailwind CSS v4** for menus and HUD
- **Zustand** for state (`session`, `matchmaking`, `game`, `ui`)
- **socket.io-client** for matchmaking and gameplay

## Scripts

Run from the repository root:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server (http://127.0.0.1:5173). |
| `npm run frontend:typecheck` | Type-check with `tsc --noEmit`. |
| `npm run frontend:test` | Run the Vitest suite once. |
| `npm run frontend:test:watch` | Run Vitest in watch mode. |
| `npm run frontend:build` | Production build into `frontend-dist/`. |
| `npm run frontend:preview` | Preview the production build. |

## Configuration

Copy `.env.example` to `.env` and set the backend base URL (HTTP + Socket.IO):

```
VITE_SERVER_URL=http://localhost:3000
```

When unset it defaults to `http://localhost:3000`.

## Architecture

```
src/
  app/App.tsx                 screen switch (auth → lobby → game)
  features/
    auth/AuthScreen.tsx       register / login
    lobby/LobbyScreen.tsx     profile, leaderboard, matchmaking
    game/GameScreen.tsx       arena + HUD + result overlay
  game/
    renderer/                 PixiJS arena (battlefield, coordinates, art, theme)
    components/               HUD (energy, hand, timer, base bars)
  network/                    REST clients, socket client, protocol types
  store/                      Zustand stores
  components/                 shared UI (Panel, Button, Icon, CardArt, Toasts)
```

### Coordinate system

Coordinates travel in map space (`0..100` on both axes). The arena uses a
viewer-relative transform so the local player's base and deployment zone are
always on the left; the board is mirrored when the player is on the `RIGHT`
side. Local units are always blue, the enemy always red.

## Assets

All art is from **Kenney** (https://kenney.nl) and is licensed **CC0 1.0**
(public domain). License files are kept beside the assets under
`public/assets/kenney/`.

| Folder | Kenney pack | Used for |
| --- | --- | --- |
| `medieval-rts/` | RTS Pack: Medieval | Arena terrain tiles, props, base keep |
| `units/` | RTS Pack: Medieval | Unit sprites (`knight`, `archer`, `guard`, `scout`) |
| `ui/` | Fantasy UI Borders + UI Pack | Panel frame, button images |
| `icons/` | Game Icons | HUD / result icons |
| `public/assets/fonts/` | Kenney Future | Display headings |

Assets are loaded by the PixiJS renderer at runtime; if a texture is missing
the renderer falls back to procedural shapes so the arena always renders.
