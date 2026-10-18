# Warland Frontend

React + TypeScript (strict) client for the Warland server-authoritative lane-battle backend. The browser renders state from the server and sends intents only — no gameplay simulation runs here.

## Stack

- **Vite** + **React** + **TypeScript** (strict)
- **PixiJS** for the arena renderer
- **Tailwind CSS v4** for menus and HUD
- **Zustand** for state (`session`, `matchmaking`, `game`, `ui`)
- **socket.io-client** for matchmaking and gameplay

## Scripts

Run from the repository root (npm workspaces forward to `frontend/`), or run the same scripts inside `frontend/`:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server (http://127.0.0.1:5173). |
| `npm run frontend:typecheck` | Type-check with `tsc --noEmit`. |
| `npm run frontend:test` | Run the Vitest suite once. |
| `npm run frontend:test:watch` | Run Vitest in watch mode. |
| `npm run frontend:build` | Production build into `frontend/dist/`. |
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
    game/
      GameScreen.tsx          arena + HUD + result overlay
      ResultOverlay.tsx       end-of-match result
      format.ts               display helpers (energy, clock, outcome)
      renderer/               PixiJS arena (battlefield, coordinates, art, theme, GameCanvas)
      components/             HUD (energy, hand, timer, base bars)
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

Terrain, UI, icons, and fonts are from **Kenney** (https://kenney.nl),
licensed **CC0 1.0** (public domain). Unit sprites are composited from the
**Universal LPC Spritesheet** (CC-BY-SA 3.0 / GPL 3.0) — see
`public/assets/units/License.txt` for attribution requirements.

| Folder | Source | Used for |
| --- | --- | --- |
| `kenney/medieval-rts/` | Kenney RTS Pack: Medieval | Arena terrain tiles, props, base keep |
| `kenney/ui/` | Kenney Fantasy UI Borders + UI Pack | Panel frame, button images |
| `kenney/icons/` | Kenney Game Icons | HUD / result icons |
| `units/` | Universal LPC Spritesheet (CC-BY-SA) | Unit sprites (`knight`, `archer`, `guard`, `scout`) |
| `fonts/` | Kenney Future | Display headings |

Assets are loaded by the PixiJS renderer at runtime; if a texture is missing
the renderer falls back to procedural shapes so the arena always renders.
