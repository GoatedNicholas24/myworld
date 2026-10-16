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
2. `derive.py`: rivers are found with flow routing on a 20 m grid (drained area >= 5 km2), carved into the
   height (depth and width grow with drained area) and bent with a small meander warp. Then slope, wetness,
   rock and river distance. The rule engine applies `data/biomes.json` and `data/resource_rules.json`
   exactly as the contract describes.
3. `generate.py`: writes everything and `terrain.json` (encodings, biome palette and shares, resource
   density metadata, landmark report, file hashes).

## Output notes

- `biome_u8.bin`: index into `biomes[]` in `terrain.json` (same order as `data/biomes.json`).
- `density_<id>_u8.bin`: rule weight 0..1 as value/255. Expected objects per km2 = weight x `density_per_km2`;
  the runtime spawner must keep `min_spacing_m` apart. Values for every resource are in `terrain.json`.
- `river_dist_u16.bin`: metres from the river bank (0 inside the channel), capped at 2000.
- Tuning knobs live at the top of each module (K and iterations in `stream_power_erode`, `RIVER_MIN_KM2`,
  the wetness formula in `derive_maps`). Change them, rerun, and read the landmark report it prints.

## Known limits

- Lakes are not modelled yet (rivers/lakes are a separate later layer). The Central Valley is a drained valley.
- Rivers are on a 20 m routing grid, so the smallest streams are missing; the water layer can add more.
- Forest plateau and rift cliffs are modest in share (3% and 4%); the rules, not the terrain, decide that.
- A faint straight scarp near x = 6.5 km (Western Plateau edge) comes from the landmark blend; easy to soften.
