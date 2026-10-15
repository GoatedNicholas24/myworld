# T001: Architecture proposal

- **Owner (AI):** Claude
- **Branch:** `t001-architecture`
- **Status:** todo

## Goal

Read the existing `src/` and propose the module layout for the first milestone, so Copilot can build one module per ticket without clashes.

## Files to read first

- `PROJECT_NOTES.md`, `docs/VISION.md`
- `src/main.js`, `src/world.js`, `src/controls.js`, `src/actors.js`, `src/props.js`, `src/chunks.js`, `src/quality.js`, `src/toon.js`

## Files to create

- `docs/ARCHITECTURE.md`

## Must cover

- What the repo already has and what is reused.
- Proposed directory structure for these modules: rendering and scene, player movement, camera, terrain and world generation, asset loading and caching, resource gathering, inventory and crafting, modular construction, building placement, persistence, UI, audio and effects.
- Stack decisions and trade-offs. Planned stack: Three.js, Vite, Blender (Python only inside Blender), GLB, Rapier, JSON data, IndexedDB. Later only: Node.js, Colyseus, PostgreSQL. Say what is NOT installed yet and when it will be.
- The painterly look plan (toon bands, gradient lighting, light post-processing) and what is affordable on cheap phones.
- A list of follow-up tickets in build order, each small enough for one Copilot session.

## Done when

- [ ] `docs/ARCHITECTURE.md` exists and Nicholas has agreed to it.
- [ ] Follow-up tickets exist in `docs/tasks/`.

## Result

