# T003: Data-backed terrain loader

- **Owner (AI):** GitHub Copilot
- **Branch:** t003-terrain-loader
- **Status:** todo

## Goal
Connect generated Great Lakes maps to Three.js terrain while keeping Karamoja working.

## Files to read first
- PROJECT_NOTES.md, docs/VISION.md, docs/TERRAIN_PIPELINE.md
- src/terrain.js, src/chunks.js, src/ground.js, src/world.js, worlds/karamoja/world.json

## Files to create or change
- Only the minimum agreed src/** files needed for the loader.

## Existing code: what can be reused
- src/terrain.js exports createTerrain(settings, seed, start, local) with heightAt, soilAt, sandAt, clearingAt, grassCoverAt and lakes. It is procedural, not a binary-map reader. Keep its API/path for Karamoja and add a separate data-backed path or adapter.
- src/chunks.js exports createChunkManager and countChunks. Reuse its chunk lifecycle and build queue if compatible with LOD.
- src/ground.js builds Three.js BufferGeometry chunks, normals, vertex colours, quality rebuilds and releases geometry. Reuse these patterns; source Great Lakes heights from maps. Check index limits and identical edge samples.
- src/world.js loads world.json manifests through Vite import.meta.glob. Reuse manifest-driven world selection rather than hard-coding a world.
- worlds/karamoja/world.json is the existing manifest and must continue working.

## Interface
20,000 m square; 2001 × 2001 samples at 10 m; 80 × 80 chunks of 250 m. Axes x east, y north, z up. Row-major, little-endian, row 0 north and column 0 west. Height = 900 + uint16 / 65535 × 4400 m. LODs: 64, 32, 16, 8 quads per side and a cheap whole-world far mesh. Coordinate output format with T004; do not invent a competing format. Do not install Rapier in this ticket.

## Rules
Plain JavaScript ES modules. Keep Karamoja working. Do not edit files outside the agreed list. Report terrain triangle counts.

## Done when (Nicholas can check by hand)
- [ ] npm run dev still loads Karamoja.
- [ ] Great Lakes test world displays with north/west orientation correct.
- [ ] Walk across a chunk edge without a visible height seam.
- [ ] Nearby chunks load and distant chunks are released; full-resolution terrain is not all rendered at once.

## Result
(Fill after testing.)
