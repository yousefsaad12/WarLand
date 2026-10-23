# WarLand — Visual Overhaul Spec

A concrete, file-by-file plan for making the WarLand web client look and feel
substantially better than it does today.

Status: **spec only — nothing implemented.**
Scope: **visuals / UI / feel.** Gameplay mechanics are out of scope except where
a visual change is blocked by a mechanical one (flagged inline).

---

## 0. TL;DR

Five things make the game look worse than it is:

1. The arena is drawn as a 100x100 square but only `y=30..70` is playable — 60%
   of the drawn terrain is illegal ground that *looks* legal.
2. Terrain tiles dwarf the units (`GRID = 13`, so a tile is 7.7 map units while
   a Guard is 3.2). Units read as ants on a cluttered board.
3. The scene is flat: top-down sprites, flat grid, flat vignette. No light, no
   depth, no focal hierarchy.
4. The fight has no visual language. Units lerp toward each other and HP bars
   shrink — attacks visually pass *through* enemies.
5. The HUD is actively misleading (`BaseBars.tsx:18` normalises against the live
   max HP, so your own bar reads 100% whenever you are ahead).

Fixing 1, 2, 4 and 5 is roughly a day of work and needs **no engine changes, no
schema changes, and no protocol changes beyond one field.**

---

## 1. Target look: "the war table"

Not a top-down grid. A **painted diorama on a table** — warm, tactile, lit.

Three rules that drive every decision below:

- **Light is the composition.** Two pools of warm light, one per base. Everything
  between them falls into cool shadow. The eye goes to the two things that matter.
- **The forbidden is visibly forbidden.** Off-limits ground is desaturated,
  darkened and hatched. The legal band is lit.
- **Everything moves a little.** Banners sway, water ripples. Stillness reads as
  "unfinished".

### Colour tokens (extend `src/styles/index.css` `@theme`)

Existing: `ink-950 #070a10`, `ink-900 #0b0e14`, `ink-850 #10151f`,
`ink-800 #151b26`, `ink-700 #1e2634`, `line #26303f`, `gold #d8b56a`,
`gold-soft #8a733f`, `team-left #3b82f6`, `team-right #ef4444`.

| New token | Value | Use |
|---|---|---|
| `--color-sand` | `#c8b48a` | Lane paths, river banks |
| `--color-stone` | `#5a6377` | Kerbs, platforms, bridges |
| `--color-warm` | `#e8c88a` | Base light pools, key light |
| `--color-cool` | `#5f7fa8` | Enemy-side tint, cool shadow |
| `--color-danger` | `#ff4d4d` | Base-under-attack pulse, invalid deploy |
| `--color-hp` | `#53e08a` | Health fills |
| `--color-hp-low` | `#f87171` | Health fills below 33% |

---

## 2. Arena overhaul — `src/features/game/renderer/battlefield.ts`

### 2.1 Reframe the board (highest impact, no engine change)

The renderer draws a 100x100 square (`buildTerrain`, `buildStatic`) but the
engine only allows deploys in `y=30..70` and units walk toward `y=50`. The top
and bottom 30% of the drawn terrain is pure decoration that reads as playable.

- Render the visible viewport as a **landscape band**: `x` fills the full screen
  width, `y` is cropped to the playable band plus margin.
- The freed vertical space becomes **table surround** (dark felt + vignette),
  not fake grass.
- Result: ~2.4x more horizontal pixels on a 16:9 display.

Files/functions: `computeTransform()` (line ~206), `buildStatic()` (line ~253),
`buildTerrain()` (line ~297), `buildDecor()` (line ~336).

### 2.2 Make the playable band obvious

- Legal ground: warm-lit grass/dirt mix, full saturation.
- Illegal ground: desaturate to ~25%, darken to ~35% brightness.
- Overlay a diagonal hatch (2px, 8px spacing, ~6% white) on illegal zones.
- Band edges: a 2-3px warm stone kerb instead of the current 1px `goldSoft`
  at 18% alpha (`drawDynamic`, line ~677).

### 2.3 Fix the terrain scale

`GRID = 13` -> **26** for the terrain layer (decouple from any logical grid).
At 26 a cell is 3.8 map units, so a Guard (3.2) is ~85% of a tile. Tiles read
as ground texture; units read as characters.

Add a **large-scale layer** on top: broad dirt blobs, grass patches and a road
from each base to the bridge, painted procedurally at low alpha. Today every
tile is uniformly busy, so there is zero visual hierarchy.

### 2.4 River, lanes, bridges

- The river at `x=50` is currently one column of Kenney water tiles. Make it
  **3 map units wide**, with animated water (alternate two textures on a timer
  or offset UVs) and sand banks either side.
- Two **stone bridges** at `y=38` and `y=62`.
- Two visible **lane paths** (dirt, ~8 units wide) from each base to each bridge.
- A subtle centre line down `y=50`.

> If pathing is not changed to route units over bridges, paint them anyway so
> the design intent reads — but flag the mismatch so it is not a lie.

### 2.5 Lighting

Procedural in Pixi `Graphics`. No new assets.

- **Base light pools**: radial gradient (white -> transparent, ~12% alpha),
  radius ~28, in that team's colour, centred on each base.
- **Key light**: one soft directional gradient from the top-left across the
  whole board, ~5% white.
- **Vignette**: bump `drawVignette()` alpha from 0.14 -> ~0.28, widen the band.
- **Enemy-side cool tint**: desaturating blue overlay over the far half at ~8%,
  so your side reads warm and theirs reads cold.

### 2.6 Bases become fortresses

Replace the single `keep.png` + circle ring (`drawBases`, line ~417) with:

- A stone platform (octagonal, 3 shades) under the keep, scaled ~1.6x current
  `baseSize`.
- The keep sprite at ~1.35x with a ground shadow and a **rim light** on the
  top-left edge.
- Two **flanking turrets** (Kenney `medieval-rts` pieces, or procedural).
- A **banner** that sways (sin rotation, +/-3 degrees, 2.4s period) in team
  colour showing your/their initial.
- **Damage states**: <66% HP -> procedural cracks; <33% HP -> smoke wisps,
  flickering orange glow, sprite jitter +/-0.5px.
- **Under attack**: a red pulse ring expanding from the base every 1.2s while
  HP is dropping.

> Coupling: showing two turrets implies a 3-tower model. If the engine keeps a
> single `baseTurret` stat, either ship the mechanical change or show one.

### 2.7 Units

Current: shadow + ring + sprite + HP bar. Upgrade (`upsertUnit`, line ~544):

- Soft shadow ellipse (keep) + contact darkening under the sprite.
- **Rim light**: 1px light arc on the sprite's top-left, `blendMode: 'add'`.
- **Attack lunge**: on the tick a unit's HP drops, tween the sprite 3px toward
  the attacker and back over ~120ms. Single biggest feel win.
- **Hit flash**: tint the sprite white for ~70ms when its HP decreases.
- **Death**: do not destroy instantly. 300ms fall (rotate ~70 degrees, drop 4px,
  fade to 0.35) + existing death ring + dust puff (6 small grey circles drifting
  outward).
- **Health bar**: widen to ~7 units wide / 5px tall, and **only render when
  damaged** (`hp < maxHp`) so the board is not a grid of bars. Add a 1px dark
  outline for legibility over bright grass.

### 2.8 FX — wire up the dead `impact` branch

`Effect['kind']` already includes `'impact'` and `update()` renders it
(line ~806), but `addEffect()` is only ever called with `'spawn'` and `'death'`
(lines ~608, ~640). The impact effect is unreachable. Fix it and upgrade all three:

- **Spawn**: gold **rune circle** (arc + tick marks) that rotates 90 degrees and
  scales 0 -> 1.4 while fading. Reads as "summoned", not "popped".
- **Impact**: white radial flash (~60ms) + 4-6 **spark lines** (thin
  white-to-transparent strokes radiating from the contact point) + a small
  expanding ring.
- **Death**: existing ring + dust puff + the falling sprite from 2.7.
- **Base hit**: full-screen **red edge vignette pulse** (~200ms) + base sprite
  shakes +/-3px.

### 2.9 Damage numbers — inferred client-side, NO engine change

The server sends `hp` per unit per tick. **Diff against the previous snapshot**
and you know exactly how much damage landed.

- Float a number above the target: white for damage you dealt, red for damage
  you took.
- Merge repeated hits on the same target within 0.6s into one ticking number.
- Whole numbers, ~12px, 1px dark outline, pop 35% larger then settle, rise
  ~18px, gone in ~600ms.
- Same treatment for base damage: larger, gold-outlined number on the base.

~40 lines in `battlefield.ts`. Cheapest high-impact juice in the whole list.

### 2.10 Mouse feedback

- **Ghost preview**: currently a plain circle (`update()`, line ~764). Add the
  unit sprite at 45% alpha + a **facing arrow** showing which way it will walk
  + a **dashed range circle** in team colour so you can see if it will reach.
- **Invalid position**: red ghost + a red X on the offending cell.
- **Hover over illegal ground**: brighten the illegal overlay.

---

## 3. HUD overhaul

### 3.1 Header -> tower tally

Replace `src/features/game/components/BaseBars.tsx`:

```
[YOUR NAME#TAG]  [D D X]     2:14     [X D D]  [ENEMY#TAG]
```

- **Tower chips** (diamond icons) instead of HP bars: filled = alive, cracked =
  destroyed. Far more readable than two bars.
- Keep a thin HP bar under each chip cluster for the base itself.
- **BUG FIX**: `maxHp` must be the rule value `baseHp` (1000), not
  `Math.max(LEFT.baseHp, RIGHT.baseHp, 1)`.
- **BUG FIX**: show `displayName#tag` for both sides. The server already knows
  both; add them to the match view. Today the local player shows
  `playerId.slice(0, 6)`.

### 3.2 Energy bar -> 10 gold segments

`src/features/game/components/EnergyBar.tsx` currently shows "4.7 / 10" plus a
smooth bar, which forces the player to do arithmetic.

- **10 discrete segments** in a gold pill bar, filling left -> right.
- Bright leading edge on the segment currently filling, so the player can see
  how close the next one is.
- Small numeric readout "5 / 10" in the display font.
- Pulse + glow when it hits 10 (max energy is worth celebrating).
- During a future double-energy phase, switch to a red-hot gradient.

### 3.3 Card hand -> real cards

`src/features/game/components/CardHand.tsx` is the weakest UI in the project.

```
 +----------+
 | 3  (glyph)  |   cost in a gold hex badge (top-left), glyph (top-right)
 |    ART      |   96x120 rounded window, inner shadow, warm rim light
 +----------+
 |  KNIGHT    |   name on a banner, display font
 | 180 HP 14 ATK |   REAL stat row -- currently missing entirely
 +----------+
```

- Replace the literal string "Ready to deploy" (`CardHand.tsx:45`) with the
  **actual stats**. Every card showing the same string is pure noise.
- **Affordability ring**: radial progress arc around the cost badge filling
  toward affordability (the Clash Royale pattern). This removes the dead
  `opacity-45 saturate-50` state.
- **Selected**: lift 8px, scale 1.06, gold border, cost badge glows, and the
  arena deploy zone highlights at the same time.
- **Unaffordable**: keep full opacity, dim only the cost badge. Greying the
  whole card hides the stats you need in order to plan.
- **Hover**: scale 1.12 and show a tooltip with full stats + ability text.

### 3.4 Match feed

The player currently gets **zero narrative** about what happened.

Add a small feed (top-left under the header, or bottom-left):

```
12:04  Your Knight destroyed Enemy Guard
12:31  Enemy Scout reached your base
```

All derivable **client-side from HP diffs**, same trick as 2.9: unit HP -> 0,
base HP drops, a new unit appears, an enemy unit crosses `x=50`. No server
change required.

### 3.5 Contextual hint bar

Replace the current two-line text block (`GameScreen.tsx:99-107`) with one slim
bar under the board: icon + one line.

- "Select a card"
- "Tap inside your zone"
- "Not enough energy - need 2 more"

---

## 4. Lobby overhaul — `src/features/lobby/LobbyScreen.tsx`

Current state: three stacked panels on a grid. Functional but flat.

- **Left - Commander card.** Large medallion panel, `#tag` in the display font
  at size, rating/level/record as three stat chips, and a **5-result form
  strip** (e.g. `O O X O O`). There is currently no recent-form display at all.
- **Centre - Your deck as real card frames** (the same component as the hand).
  Fanned slightly (CSS `rotate` per card, -4deg -> +4deg) so it reads as a hand
  rather than a grid. Show **average deck cost** underneath (Clash Royale does
  this and it is genuinely strategic).
- **Right - Leaderboard.** Scrollable list; top 3 get gold/silver/bronze rank
  chips; your own row is highlighted; each row shows a W-L delta.
- **Bottom centre - the action.** A large gold **"Find Match"** button (the most
  important element on the screen), plus a **"Practice vs Bot"** ghost button
  (the mode does not exist yet, but this is the right hook for it).
- **"Edit Deck"** button on the deck panel -> deck builder.

### 4.1 Screen transitions

`src/app/App.tsx` swaps screens with zero animation.

- Lobby -> Arena: 260ms fade + 0.98 -> 1 scale on the canvas.
- Arena -> Result: 400ms fade.
- Cards **deal in** at match start: staggered 60ms per card, 300ms each,
  rising from below.

---

## 5. Result overlay — `src/features/game/ResultOverlay.tsx`

This is already the best UI moment in the project (rating count-up, staged
level-up animation). Keep it, and add:

- **Battle stats block**: damage dealt, damage taken, units deployed, units
  lost, base HP remaining, match duration.
- A **blurred freeze-frame of the battlefield** behind the panel instead of a
  flat `bg-ink-950` wash.
- **Rematch** button (the #1 retention lever in a PvP game).
- Show the Elo delta as an actual **number** next to the bar.

---

## 6. Motion spec

| Moment | Motion | Duration |
|---|---|---|
| Deploy accepted | Card in hand dips + energy segment flashes | 120ms |
| Unit spawns | Rune circle + sprite scales 0.6 -> 1.0 with overshoot | 280ms |
| Unit attacks | 3px lunge toward target + 70ms white flash on target | 120ms |
| Unit dies | Falls + rotates 70deg + fades + dust puff | 300ms |
| Base takes damage | Red screen-edge pulse + base sprite shake | 200ms |
| Energy reaches max | Bar glow + pulse | 400ms |
| Last 30s | Timer pulses red + screen border breathes | 1s loop |
| Base destroyed | Slow-motion + white flash | 600ms |

All of the above needs a **reduce-motion toggle in-game** (required for
accessibility, and it also lets you cut shake/bloom).

---

## 7. Assets

Almost everything new can be **procedural in Pixi `Graphics`** — cheaper than
sourcing art and resolution-independent:

- Light pools, rune circles, hatch patterns, sparks, dust, cracks, stone
  platforms, banners -> all Graphics.
- Worth sourcing: a **banner/flag sprite** and a **cannon/turret sprite**.
  There is an unused `frontend/public/assets/kenney/tower-defense-top-down/`
  pack already in the repo.

Licensing note: `frontend/public/assets/units/` is LPC **CC-BY-SA 3.0 / GPL 3.0**
and requires attribution (wulax, Redshrike + LPC contributors). Kenney packs are
CC0. Worth a credits line in the README.

---

## 8. Sequenced implementation plan

| # | Work | Files | Effort | Impact |
|---|---|---|---|---|
| 1 | Fix HP-bar normalisation + real player names | `BaseBars.tsx`, `protocol.ts`, engine `toMatchView` | S | AAAAA |
| 2 | Damage numbers from HP diffs | `battlefield.ts` | S | AAAAA |
| 3 | Impact FX + hit flash + attack lunge + death fall | `battlefield.ts` | M | AAAAA |
| 4 | Card hand rebuild (real cards, stats, affordability ring) | `CardHand.tsx` | M | AAAAA |
| 5 | Landscape reframe + illegal-zone treatment | `battlefield.ts` | M | AAAAA |
| 6 | Energy segments + base light pools + vignette pass | `EnergyBar.tsx`, `battlefield.ts` | S-M | AAAA |
| 7 | Terrain scale fix (GRID 13 -> 26) + large-scale path layer | `battlefield.ts` | M | AAAA |
| 8 | Tower-tally header | `BaseBars.tsx` | M | AAAA |
| 9 | Base fortress + banner + damage states | `battlefield.ts` | M | AAA |
| 10 | Match feed (client-side events) | new component | M | AAAA |
| 11 | Lobby redesign (medallion, fanned deck, form strip) | `LobbyScreen.tsx` | M | AAA |
| 12 | Screen transitions + card deal-in | `App.tsx`, `GameScreen.tsx` | S | AAA |
| 13 | River + lanes + bridges (visual) | `battlefield.ts` | M | AAA |
| 14 | Result stats + freeze-frame + rematch | `ResultOverlay.tsx` | M | AAA |
| 15 | Audio (WebAudio-synthesised, no assets) | new | M | AAAAA |

**Items 1-4 are about a day of work and change the impression of the game more
than everything else combined.** They need no engine changes, no schema changes,
and no protocol changes beyond one added field.

---

## 9. Known issues this spec also covers

Found while auditing the renderer and HUD:

| Issue | Location |
|---|---|
| `queue_left` is returned as an ack, never emitted as an event | `backend/src/matchmaking/matchmaking.gateway.ts` — client listens for the event, so "Cancel search" leaves the UI stuck |
| `impact` FX branch is unreachable dead code | `battlefield.ts` ~806 |
| Unused theme tokens (`grid`, `river`, `riverGlow`, `riverBank`, `stoneShadow`) | `renderer/theme.ts` |
| `drawBase()` (52 lines) dead since `keep.png` replaced it | `renderer/art.ts` |
| `drawEdgeGradient` renders a full-height band per side (should be a wash) | `battlefield.ts` ~372 |
| `teamColor` / `teamColorDark` / `clampToMap` / `BASE_POSITION` / `oppositeSide` unused | `renderer/theme.ts`, `renderer/coordinates.ts` |
| `setPlayer()` never called | `store/sessionStore.ts` |
| Base HP bars normalise against live max HP (misleading) | `components/BaseBars.tsx:18` |
| Local player shown as `playerId.slice(0,6)` | `components/BaseBars.tsx:28` |
| Leaderboard/profile fetch errors silently swallowed | `LobbyScreen.tsx:56-61` |
| README claims projectiles exist; no projectile rendering | `README.md` |

---

## 10. Optional: gameplay-coupled visuals

These need engine work first, but the visuals unlock real depth:

- **Two lanes + river + bridges** (CR) — pathing must route over bridges.
- **Three towers per side** (CR) — King Tower activates only after being damaged.
- **Double energy in the final 60s** (CR) — plus a red breathing screen border.
- **Spells cast anywhere** (CR) — needs a spell card type and an "aim" mode in
  the client.
- **Unit cap per side** (TFT) — needs a board-capacity indicator in the HUD.
- **Tower-chip header** (2.1) implies this; it degrades gracefully to a single
  base chip if the 3-tower model is not adopted.
