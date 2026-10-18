# Water data (Great Lakes region)

Made by `tools/terrain/water.py`, written by `python3 tools/terrain/generate.py`, checked by
`python3 tools/terrain/verify_water.py`. Owner: Claude (tools/terrain, public/terrain). Consumers (T011 and map code) only read.

The heightmap already contains the lakes and river channels (beds carved, banks shaped), so the
terrain tiles show the right shapes with no extra work. Water is a surface drawn on top of them.

## Files (in `public/terrain/great_lakes/`)

| File | In git | What |
|---|---|---|
| `rivers.json` | yes (0.6 MB) | Every river as a polyline with width, depth and water surface, plus the four lakes with outlines |
| `water_level_u16.bin` | no (regenerate) | 2001 x 2001 map, same grid and encoding as the heightmap: `0` = no water, otherwise water surface elevation = `900 + value / 65535 * 4400` m. Covers lakes and rivers of class medium and up |
| `river_dist_u16.bin` | no | metres to the nearest lake or river water (rivers from 3 km2 up), 0 in the water, capped at 2000 |
| `terrain.json` -> `water` | yes | Summary: lakes, class table, totals per class |

Also: biome under water is `wetland_river_bank` (so the bed reads as mud under clear water), and every
`density_*_u8.bin` is 0 under water.

## rivers.json

Game coordinates: **x east of the world centre, z south of the world centre, y = elevation**, metres. A world
position (x, z) is master cell column `(x + 10000) / 10`, row `(z + 10000) / 10`.

```json
{ "version": 1, "world_size_m": 20000, "classes": [...], "class_totals": {...},
  "lakes":  [ { "id", "name", "level_m", "area_km2", "max_depth_m", "centre": [x, z], "bbox": [x0, z0, x1, z1],
                "outline": [[x, z], ...], "inflows": ["river_..."], "outflow": "river_001" } ],
  "rivers": [ { "id": "river_001", "class": "great", "length_m", "drained_km2": [first, last],
                "source":     {"type": "spring"} | {"type": "lake", "id": "lake_great"},
                "flows_into": {"type": "edge"} | {"type": "lake", "id"} | {"type": "river", "id", "node": 12},
                "nodes": [[x, z, surface_y, width, depth], ...] } ] }
```

- Nodes run **source to mouth**, about 20 m apart. `width` is the full water width, `depth` the depth at the centre.
- `surface_y` is the water surface; it falls on every step (by at least 2 mm), so a ribbon never runs uphill.
- The cross-section carved into the terrain is a parabola: deepest in the middle, zero at the banks.
- A tributary's last node sits exactly on a node of the river it joins (`flows_into.node`) and has the same
  surface. A river that enters a lake ends on the shoreline at the lake level. A lake outlet starts at the lake level.
  A river that leaves the map ends exactly on the edge (|x| or |z| = 10000).
- `class` is the class at the mouth (a river grows through the classes on its way down). Classes by drained area:

| Class | Drained area | Width | Depth | Total length |
|---|---|---|---|---|
| stream (wadable) | < 1.5 km2 | 2.4 - 5 m | 0.5 - 0.8 m | 154 km |
| small | 1.5 - 6 | 5 - 15 m | 0.8 - 1.5 m | 104 km |
| medium | 6 - 30 | 15 - 55 m | 1.5 - 3.1 m | 74 km |
| large | 30 - 120 | 55 - 167 m | 3.1 - 5.8 m | 12 km |
| great (Nile-class) | > 120 | 167 - 300 m | 5.8 - 8 m | 8 km |

Only `river_001` reaches 300 m x 8 m: the trunk that drains the Central Valley into the Great Lake and
leaves it to the south-west edge. 201 rivers, 15,258 nodes.

## Lakes

| Id | Level | Area | Deepest | Where |
|---|---|---|---|---|
| lake_great (Victoria-like) | 948.6 m | 12.3 km2 | 34 m | south-west lowlands |
| lake_rift | 1709.9 m | 4.0 km2 | 20 m | rift foot, east of the valley |
| lake_plateau | 1672.5 m | 1.1 km2 | 11 m | western plateau |
| lake_tarn | 2405.6 m | 0.5 km2 | 7 m | northern highlands |

Each lake has one outlet river. Banks are held at least 0.5 m above the surface all round (`verify_water.py` checks this).
Names are placeholders.

## Rendering hints for T011

- Lakes: a flat plane at `level_m` clipped to `outline` (or sample `water_level_u16.bin`).
- Rivers: a ribbon along `nodes` at `surface_y`, `width` wide; fade the ends into the parent river or lake. Streams (< 6 m) can be a thin ribbon or a decal.
- Shallow water is where `surface_y - ground` is small; use `depth` for colour (clear and light for streams, darker for the trunk).

## Known limits

- The long reach of the trunk in the Central Valley is almost flat, then it drops about 250 m into the lake basin as rapids (that is what the terrain does).
- A few percent of river sides have ground a little below the surface (mostly under 0.4 m, measured by `verify_water.py`).
- Re-run the tiler after regenerating: the heightmap changed (channels and lakes are carved in).
