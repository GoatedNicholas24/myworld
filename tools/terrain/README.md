# tools/terrain: master map generator (Great Lakes region)

Creates every master map described in `docs/TERRAIN_PIPELINE.md` (stages 2 and 3).

```bash
pip install -r tools/terrain/requirements.txt      # numpy, scipy (matplotlib only for --preview)
python3 tools/terrain/generate.py                  # about 70 seconds, writes public/terrain/great_lakes/
python3 tools/terrain/generate.py --preview        # also writes preview/hillshade.png, biomes.png, rivers.png
python3 tools/terrain/generate.py --out DIR --seed 7
```

Same seed gives byte-identical files (checked). The big `.bin` maps (76 MB) are **not** in git; `terrain.json`
is, and it lists every file with a short hash. The tiler (T004) reads the `.bin` files; the game ships only tiles.

## How the land is made

1. `landforms.py`: a 501 x 501 base field (40 m cells) from the nine design landmarks (inverse-distance blend,
   a stepped rift escarpment, a ridged Rwenzori-like massif, a gentle fall to the south-west, an outlet trough
   so the Central Valley drains). Stream-power erosion (priority-flood routing, 40 iterations) carves valleys.
   A low-frequency correction then pins every landmark back to its design elevation. The result is resampled
   to 2001 x 2001 (10 m) with fine ridged detail, clamped to 930-5200 m.
2. `water.py`: four lakes (one large, three smaller) are placed on flat ground, their basins carved and banks
   shaped; then rivers are traced from flow routing (streams from 0.6 km2 drained area up to a Nile-class
   trunk), smoothed, given a width, depth and a falling water surface, and carved into the height.
   Writes `rivers.json` and `water_level_u16.bin`. Full format: `docs/WATER_DATA.md`.
3. `derive.py`: slope, wetness and rock; the rule engine applies `data/biomes.json` and
   `data/resource_rules.json` exactly as the contract describes (nothing is placed under water).
4. `generate.py`: writes everything and `terrain.json` (encodings, biome palette and shares, resource
   density metadata, water summary, landmark report, file hashes).
5. `verify_water.py`: reads the files back and checks water against the heightmap (run it after generate).

## Output notes

- `biome_u8.bin`: index into `biomes[]` in `terrain.json` (same order as `data/biomes.json`).
- `density_<id>_u8.bin`: rule weight 0..1 as value/255. Expected objects per km2 = weight x `density_per_km2`;
  the runtime spawner must keep `min_spacing_m` apart. Values for every resource are in `terrain.json`.
- `river_dist_u16.bin`: metres to the nearest lake or river water (rivers from 3 km2 drained area up), 0 in the water, capped at 2000.
- `water_level_u16.bin` and `rivers.json`: see `docs/WATER_DATA.md`.
- Tuning knobs live at the top of each module (K and iterations in `stream_power_erode`, `AMIN_KM2`, `W_MAX`, `LAKES` in `water.py`,
  the wetness formula in `derive_maps`). Change them, rerun, and read the landmark report it prints.

## Known limits

- Streams are 2-5 m wide but the heightmap has 10 m cells, so their carved bed is only a shallow dip; the
  ribbon in `rivers.json` is the true channel.
- The trunk is flat for a long reach in the Central Valley and then drops into the lake basin as rapids.
- Forest plateau and rift cliffs are modest in share (3% and 4%); the rules, not the terrain, decide that.
- A faint straight scarp near x = 6.5 km (Western Plateau edge) comes from the landmark blend; easy to soften.
