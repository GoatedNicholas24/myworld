# Dev Log

## 2026-10-14 (session 3): First village

**What was built**
- Added four homesteads around a shared cattle kraal near the starting view, with low earthen huts, rounded thatch roofs, doors, and simple timber enclosures.
- Village location and household layout are set in the Karamoja `world.json`; trees and rocks leave room around the homes and kraal.
- Added the village's exact triangle count to the LOW/HIGH startup report.

**Triangle counts**
- Village: 3,720 triangles, built from shared instanced meshes and printed as `village` in the startup report.
- Adds 3,720 triangles to both LOW and HIGH.
- LOW and HIGH totals also include the village.

**Files changed**
- Changed: `src/props.js`, `src/main.js`, `worlds/karamoja/world.json`, `DEVLOG.md`

**Next step**
- Add a small herd of cattle near the village.

## 2026-10-14 (session 2): Bigger world and first enrichment

**What was built**
- The world is now about 20 times wider (you can walk 600 m from the start). The land has no edge: ground, grass, trees and rocks are only built near you and removed behind you ("chunks"), so the cost stays about the same.
- Ground: built in 60 m chunks around the camera, with big slow hills on top of the small ones, and bare soil patches placed across the whole world.
- Grass: built in 12 m chunks that follow you. Far blades shrink to nothing in the shader, so the edge of the grass melts away instead of ending in a line.
- Distant hills: three hazy layers in a ring on the horizon, each one hazier than the one before, read from `world.json`.
- Trees and rocks: flat-topped acacias in loose groves and scattered rocks (more near bare soil), all made from simple shapes in code. Nothing is kept clear near the start except a 16 m radius with no trees.
- Fog distances were lengthened in all four moods so you can see further.

**What works**
- Session 1 (grass only) was confirmed working. For this session, update this line with what you actually see after `npm run dev`.

**Triangle counts** (worked out from the settings; the HUD shows the real number)
- HIGH: about 370,000 (grass 302,400 + ground 57,600 + sky and hills 1,728 + trees and rocks about 8,500)
- LOW: about 65,000 (grass 45,360 + ground 14,400 + sky and hills 1,728 + trees and rocks about 3,700)

**Known problems**
- Not yet run on a phone or a weak laptop.
- Touch devices can look around but cannot walk yet (no on-screen controls).
- The distant hills are generic shapes, not real Karamoja mountains.
- Trees and rocks do not sway or react to the mood beyond lighting.
- Grass stops at 42 m from you (it fades out smoothly); beyond that the ground is bare.

**Files changed**
- New: `src/chunks.js`, `src/hills.js`, `src/scatter.js`, `src/props.js`
- Changed: `src/noise.js`, `src/terrain.js`, `src/quality.js`, `src/world.js`, `src/ground.js`, `src/grass.js`, `src/main.js`, `worlds/karamoja/world.json`, `DEVLOG.md`

**Commit messages**
- Step 1: chunked endless ground, bigger world, longer fog and distant hills
- Step 2: grass built in chunks that follow the player
- Step 3: acacia trees and rocks scattered across the world
- Step 4: devlog for session 2

**Next step**
- Add a simple on-screen touch joystick, so the game can be walked on a phone and tested on real cheap Android hardware.

## 2026-10-14: Grass only

**What was built**
- Vite + Three.js project structure: engine in `src/`, world content in `worlds/karamoja/`, notes files (`PROJECT_NOTES.md`, `ASSETS.md`, `README.md`).
- `worlds/karamoja/world.json`: location (approximate lat/long), terrain settings, grass settings, wind, camera, and 4 moods (golden hour, midday, overcast, dawn). The engine reads all of it from this file.
- Ground: gently rolling earthy ground with a few bare soil patches (colours painted into vertices, no textures).
- Sky: gradient dome with a soft sun and glow, fog matching the horizon, one warm sun light and one cool fill light, no real-time shadows.
- Grass: thousands of instanced blades (curved, tapered, random height/lean/rotation), dry straw to olive to fresh green, dark roots and light tips, slow wind waves in the vertex shader.
- Moods on keys 1-4 with a 1-second blend, free-look camera (drag to look, WASD, Shift), LOW/HIGH presets on Q.

**What works**
- Confirmed working on the developer's machine.

**Triangle counts** (worked out from the settings)
- HIGH: about 392,773 (grass 318,085 + ground 73,728 + sky 960)
- LOW: about 67,104 (grass 47,712 + ground 18,432 + sky 960)

**Known problems**
- Not yet tested on a phone or a weak laptop.
- Touch devices can look around by dragging but cannot walk yet (no on-screen controls).
- Antialiasing is decided once at start (on for non-touch devices), so Q does not change it.

**Files changed**
- New: `worlds/karamoja/world.json`, `src/world.js`, `src/noise.js`, `src/quality.js`, `src/terrain.js`, `src/ground.js`, `src/sky.js`, `src/grass.js`, `src/mood.js`, `src/moodController.js`, `src/controls.js`, `PROJECT_NOTES.md`, `ASSETS.md`, `DEVLOG.md`, `public/.gitkeep`
- Changed: `index.html`, `src/main.js`, `src/style.css`, `README.md`, `.gitignore`
- Removed: `src/room.js`, `src/boy.js` (the old room prototype, still in git history)

**Commit messages**
- Step A: project setup, notes files and a minimal Three.js scene
- Step B: Karamoja world manifest with four moods and a world loader
- Step C: rolling ground with soil patches and a gradient sky with sun glow
- Step D: instanced grass field with curved blades and wind sway
- Step E: mood switching with 1-4, free-look camera and LOW/HIGH quality with Q
- Step F: devlog for 2026-10-14

**Next step**
- Add layered distant hills (simple silhouettes in code) fading into the fog, to give the horizon depth and a more Firewatch-like look.