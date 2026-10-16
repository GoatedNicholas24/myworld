# Great Lakes terrain pipeline

## Fixed data contract

This is a data-first world: maps describe the whole landscape, while the game builds detailed terrain only near the player. Target: cheap Android phones.

- World: 20,000 m square; master grid 2001 × 2001 samples; cell size exactly 10 m.
- Chunks: 250 m; 80 × 80 chunks.
- Runtime LODs: 64, 32, 16 and 8 quads per side, plus one cheap whole-world far-view mesh.
- Axes: x east, y north, z up. Maps are row-major, little-endian for multi-byte values; row 0 is north, column 0 is west.
- Height uint16 decoding: elevation_m = 900 + value / 65535 * 4400.
- Design target: approximately 930–5200 m. The encoding formula represents 900–5300 m; neither value is changed here.

### Generated maps

Claude creates these under public/terrain/great_lakes/; do not hand-create generated outputs.

| File | Format and meaning |
|---|---|
| heightmap_u16.bin | uint16 little-endian; 2001 × 2001 height samples |
| slope_u8.bin | uint8; slope angle in degrees × 255/90 |
| wetness_u8.bin | uint8; 0–255 maps to wetness 0–1 |
| rock_u8.bin | uint8; rock exposure 0–255 maps to 0–1 |
| river_dist_u16.bin | uint16 little-endian; metres to nearest river, capped at 2000 |
| terrain.json | dimensions, units, encodings, filenames and metadata |

Each map has exactly 2001 × 2001 samples. Raw binary files have no header unless a future explicitly versioned format says otherwise. Claude's script also creates biome_u8.bin and one density_<resource_id>_u8.bin per resource.

### Rule JSON contract

Claude reads data/biomes.json and data/resource_rules.json. Each condition has exactly map, min, max and fade. Allowed maps: elevation_m, slope, wetness, rock, river_dist_m and noise:<name>. Seeded noise maps are stable values from 0 to 1. Rule slope is normalized so 0 is flat and 1 is 45 degrees; raw slope storage remains degrees × 255/90.

A condition has weight 1 inside min..max, fading smoothly to 0 over fade distance outside the interval. A rule's weight is the product of its condition weights. For biomes, highest weight × priority wins; use a deterministic tie-break. Resource density is guided by rule weight and density_per_km2; enforce min_spacing_m. Every resource ID must exist in data/resources.json.

Required biome categories: snow and rock peaks, alpine moorland, highland forest, forest plateau, woodland, savannah grassland, farmland valley, wetland and river bank, rift escarpment cliffs. Use only resources supported as present in Uganda/the Great Lakes region. If uncertain, mark review: true for local-expert review. Do not make cultural claims.

## Eight stages

1. Lock the spec (ChatGPT/project owner). Treat this document and the JSON as the contract. Raise conflicts as questions; never quietly change fixed numbers.
2. Generate the master heightmap with erosion in plain Python outside Blender (Claude). Use deterministic seeds and respect the nine design landmarks.
3. Derive slope, wetness, rock and river-distance maps, then biome and resource density maps using these rules (Claude). Describe all files in terrain.json.
4. Blender look-development (Claude): inspect terrain and develop golden hour, midday, overcast and dawn moods. Blender is for look-development, not the authoritative high-resolution map generator. Start without vegetation.
5. Node.js tiler (Copilot): tools/tiler/ cuts maps into 250 m chunks at the specified LODs, preserving orientation and matching boundaries.
6. Three.js chunk-streaming loader and painterly shader (Copilot): load nearby chunks, select LOD by distance/quality, and keep the far view cheap.
7. Runtime detail noise and settlement pads (Copilot): add deterministic fine detail and locally level settlement areas without rewriting master maps.
8. Rapier collision near the player, then rivers/lakes as a separate layer (Copilot). Rapier is installed only in T007. Do not create full-world collision.

## Folder ownership and workflow

- ChatGPT: docs/** and data/**.
- Claude: tools/terrain/**, tools/blender/** and generated public/terrain/**.
- Copilot later: src/** and tools/tiler/**.
- Do not edit another owner's files, package.json or dependencies unless a ticket explicitly authorizes it.
- One AI per ticket. Give each AI project notes, vision, one ticket and only the source files named by that ticket.
- Keep generation reproducible; report map dimensions, ranges, file sizes and elapsed time. Cheap-phone performance is a requirement. Cultural material needs appropriate local review.
