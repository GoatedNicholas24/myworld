# T004: Node.js terrain tiler

- **Owner (AI):** GitHub Copilot
- **Branch:** t004-node-tiler
- **Status:** todo

## Goal
Create a deterministic Node.js tool that cuts Claude's master maps into 250 m chunk tiles at all planned LODs.

## Files to read first
- PROJECT_NOTES.md, docs/VISION.md, docs/TERRAIN_PIPELINE.md
- data/biomes.json, data/resource_rules.json
- Generated public/terrain/great_lakes/terrain.json
- Follow the Tile format section of docs/TERRAIN_PIPELINE.md.

## Files to create or change
- tools/tiler/** only.

## Interface
Input maps are in public/terrain/great_lakes/. Grid is 2001 × 2001 at 10 m, 20,000 m square. There are 80 × 80 chunks, each 250 m. Output LODs: 64, 32, 16 and 8 quads per side plus data for the cheap whole-world far mesh. Preserve row-major little-endian layout, row 0 north and column 0 west. Chunk alignment is exact: 250 m = 25 cells of 10 m, so each chunk covers master samples 25i through 25i + 25 inclusive (26 samples per edge). The actual issue is that 64, 32, 16 and 8 quads per chunk do not land on the 10 m master grid, so bilinearly interpolate heights from the master map. Neighbouring chunks share edge samples, and LOD borders need skirts handled by the loader. Follow the Tile format section of docs/TERRAIN_PIPELINE.md.

## Rules
Stream/process maps where practical. Do not edit src/**, data/** or Claude-owned folders. Fail clearly for missing files or incorrect byte lengths. No new dependencies without approval.

## Done when (Nicholas can check by hand)
- [ ] Run the documented Node command and see a tile summary.
- [ ] Confirm 80 × 80 chunk coordinates and all four LODs are produced.
- [ ] Confirm the north-west tile is first and neighbour edges match.
- [ ] Run twice and confirm deterministic output.

## Result
(Fill after testing.)
