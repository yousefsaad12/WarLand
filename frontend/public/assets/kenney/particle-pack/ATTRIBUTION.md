# Third-party asset attribution

## Kenney — Particle Pack

- Source: https://kenney.nl/assets/particle-pack
- Author: Kenney Vleugels (Kenney.nl)
- License: Creative Commons Zero (CC0 1.0) — public domain.
  See `License.txt` in this folder (copied verbatim from the pack).

The pack ships 512×512 particle sprites in a transparent and a black-background
variant. Only the transparent variant is used, and each sprite was cropped to
its own alpha bounds (so anchoring and scaling are exact) and downscaled to
128×128 to keep the download small.

| File in repo        | Original sprite                       | Use                                  |
| ------------------- | ------------------------------------- | ------------------------------------ |
| `slash_01..04`     | `PNG (Transparent)/slash_01..04.png`  | Melee swing crescents                |
| `spark_01..07`     | `PNG (Transparent)/spark_01..07.png`  | Hit sparks                           |
| `star_01..04`      | `PNG (Transparent)/star_01..04.png`   | Impact star accents                  |
| `light_01..03`     | `PNG (Transparent)/light_01..03.png`  | Hit flash glow                       |
| `circle_01..05`    | `PNG (Transparent)/circle_01..05.png` | Impact / spawn / death rings         |
| `muzzle_01..05`    | `PNG (Transparent)/muzzle_01..05.png` | Ranged muzzle blast                  |
| `twirl_01..02`     | `PNG (Transparent)/twirl_01..02.png`  | Swirling impact accents              |

The sprites are white/greyscale so the renderer can tint them to the team
colour. If the files are unavailable the renderer falls back to procedural
vector shapes, so combat stays readable without the art.
