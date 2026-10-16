# T006: Runtime detail noise and settlement pads

- **Owner (AI):** GitHub Copilot
- **Branch:** t006-runtime-detail
- **Status:** todo

## Goal
Add deterministic fine-scale detail and smoothly blended flat settlement areas without modifying master maps.

## Files to read first
- PROJECT_NOTES.md, docs/VISION.md, docs/TERRAIN_PIPELINE.md
- T003 loader and T005 material interfaces
- worlds/karamoja/world.json

## Files to create or change
- Only minimum agreed src/** files.

## Interface
Keep master heights unchanged. Runtime detail must be deterministic by seed and coordinates and remain continuous at chunk boundaries. A settlement pad has a centre, footprint and target height; blend its edge smoothly into terrain. Keep detail subtle and provide a way to disable it for debugging/LOW quality.

## Rules
Plain JavaScript ES modules, no new dependencies. Do not edit data/**, tools/tiler/** or Claude-owned folders. Cache/share noise work where practical.

## Done when (Nicholas can check by hand)
- [ ] Compare detail enabled and disabled at the same location.
- [ ] Reload with the same seed and confirm the same surface.
- [ ] Test a flat pad with a smooth edge.
- [ ] Cross a chunk boundary without a visible detail seam.

## Result
(Fill after testing.)
