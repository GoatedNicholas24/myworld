# Dev Log

## 2026-10-14: Grass only

**What was built**
- Vite + Three.js project structure: engine in `src/`, world content in `worlds/karamoja/`, notes files (`PROJECT_NOTES.md`, `ASSETS.md`, `README.md`).
- `worlds/karamoja/world.json`: location (approximate lat/long), terrain settings, grass settings, wind, camera, and 4 moods (golden hour, midday, overcast, dawn). The engine reads all of it from this file.
- Ground: gently rolling earthy ground with a few bare soil patches (colours painted into vertices, no textures).
- Sky: gradient dome with a soft sun and glow, fog matching the horizon, one warm sun light and one cool fill light, no real-time shadows.
- Grass: thousands of instanced blades (curved, tapered, random height/lean/rotation), dry straw to olive to fresh green, dark roots and light tips, slow wind waves in the vertex shader.
- Moods on keys 1-4 with a 1-second blend, free-look camera (drag to look, WASD, Shift), LOW/HIGH presets on Q.

**What works**
- To confirm on first run: update this line with what you actually see after `npm run dev`.

**Triangle counts** (worked out from the settings; the HUD shows the real number)
- HIGH: about 392,773 (grass 318,085 + ground 73,728 + sky 960)
- LOW: about 67,104 (grass 47,712 + ground 18,432 + sky 960)

**Known problems**
- Not yet run or tested on a phone or a weak laptop. Performance numbers are unknown.
- Touch devices can look around by dragging but cannot walk yet (no on-screen controls).
- Antialiasing is decided once at start (on for non-touch devices), so Q does not change it.
- Moods and look still need tuning by eye (colours, fog distances, wind strength).

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