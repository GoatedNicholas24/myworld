# T005: Painterly terrain shader and material

- **Owner (AI):** GitHub Copilot
- **Branch:** t005-painterly-shader
- **Status:** todo

## Goal
Make a lightweight painterly terrain material driven by biome/terrain data, suitable for cheap phones.

## Files to read first
- PROJECT_NOTES.md, docs/VISION.md, docs/TERRAIN_PIPELINE.md
- T003 loader/material files
- worlds/karamoja/world.json for existing moods

## Files to create or change
- Only minimum agreed src/** material/shader files.

## Interface
Use biome IDs/colours from data/biomes.json. Support golden hour, midday, overcast and dawn; midday and overcast must not look orange. Prefer a few colour bands and gentle variation. Avoid real-time shadows, large per-chunk texture allocations and expensive post-processing. Reuse materials and preserve LOW/HIGH settings.

## Rules
Plain JavaScript ES modules. No new dependencies. Do not edit data/** or Claude-owned files. Keep Karamoja working and report terrain triangles.

## Done when (Nicholas can check by hand)
- [ ] npm run dev displays terrain in all four moods.
- [ ] Midday and overcast visibly differ from golden hour.
- [ ] LOW/HIGH switching works and remains responsive.
- [ ] Record terrain triangle counts for each quality level.

## Result
(Fill after testing.)
