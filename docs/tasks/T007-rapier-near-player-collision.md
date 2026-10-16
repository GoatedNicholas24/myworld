# T007: Rapier heightfield collision near the player

- **Owner (AI):** GitHub Copilot
- **Branch:** t007-rapier-collision
- **Status:** blocked until T003 is done

## Goal
Add collision matching visible terrain only near the player, not across the whole world.

## Files to read first
- PROJECT_NOTES.md, docs/VISION.md, docs/TERRAIN_PIPELINE.md
- Completed T003 loader interface and player movement/physics files identified by its owner

## Files to create or change
- Minimum agreed src/** files and dependency manifest/lockfile changes required to install Rapier.

## Interface
**Blocked until T003 is done.** Do not implement against guessed APIs. Match the visible height samples, axes and orientation. Create and release colliders with the moving nearby chunk region; avoid duplicate colliders or gaps at edges. Rivers and lakes are out of scope and remain a separate later layer.

## Rules
Rapier may be installed only in this ticket; do not install it in T003–T006. No other dependency without approval. Do not build full-world collision. Preserve Karamoja behaviour and report collider count/performance.

## Done when (Nicholas can check by hand)
- [ ] After T003, walk on flat ground, slopes and across a chunk edge without falling through.
- [ ] Move far enough to confirm old colliders release and new ones work.
- [ ] Confirm only nearby terrain has colliders and water is not included.
- [ ] Confirm Rapier was first installed in this ticket.

## Result
(Fill after testing.)
