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
- Agree on the tile interface with the T003 owner.

## Files to create or change
- tools/tiler/** only.

## Interface
Input maps are in public/terrain/great_lakes/. Grid is 2001 × 2001 at 10 m, 20,000 m square. There are 80 × 80 chunks, each 250 m. Output LODs: 64, 32, 16 and 8 quads per side plus data for the cheap whole-world far mesh. Preserve row-major little-endian layout, row 0 north and column 0 west. Document shared boundary sample handling: 250 m does not divide into 10 m cells evenly as a count of intervals, so explicitly settle how adjacent chunk extents align to the master samples without cracks or silent resampling loss.

## Rules
Stream/process maps where practical. Do not edit src/**, data/** or Claude-owned folders. Fail clearly for missing files or incorrect byte lengths. No new dependencies without approval.

## Done when (Nicholas can check by hand)
- [ ] Run the documented Node command and see a tile summary.
- [ ] Confirm 80 × 80 chunk coordinates and all four LODs are produced.
- [ ] Confirm the north-west tile is first and neighbour edges match.
- [ ] Run twice and confirm deterministic output.

## Result
(Fill after testing.)
