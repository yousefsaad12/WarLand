# Third-party asset attribution

## Kenney — Tower Defense (Top-Down)

- Source: https://kenney.nl/assets/tower-defense-top-down
- Author: Kenney Vleugels (Kenney.nl)
- License: Creative Commons Zero (CC0 1.0) — public domain.
  See `License.txt` in this folder (copied verbatim from the pack).

The following tiles were selected from the pack after inspecting the source
archive (file listing, license, and per-tile colour/alpha analysis) and are
used as subtle, tinted terrain textures in the battlefield renderer:

| File in repo        | Original tile                    | Verified average colour | Use           |
| ------------------- | -------------------------------- | ----------------------- | ------------- |
| `terrain-grass.png` | `PNG/Default size/towerDefense_tile040.png` | rgb(47, 210, 116)      | Arena ground  |
| `terrain-stone.png` | `PNG/Default size/towerDefense_tile261.png` | rgb(147, 157, 148)     | Stone accents |
| `river-water.png`   | `PNG/Default size/towerDefense_tile085.png` | rgb(142, 170, 172)     | River surface |

All other visual elements (bases, turrets, units, effects, card art) are drawn
procedurally with PixiJS/CSS so the game stays coherent and works even when the
textures above are unavailable. Replace the procedural art with sprites by
extending `src/features/game/renderer/art.ts`.
