# T008: Terrain performance budget and phone checklist

- **Owner (AI):** GitHub Copilot
- **Branch:** t008-terrain-budget
- **Status:** todo

## Goal
Measure terrain triangle counts and streaming performance on LOW/HIGH and document a repeatable cheap-phone test.

## Files to read first
- PROJECT_NOTES.md, docs/VISION.md, docs/TERRAIN_PIPELINE.md
- Completed T003/T004/T005 interfaces and existing quality settings

## Files to create or change
- A short report/checklist in docs/** and only minimal agreed src/** instrumentation if needed.

## Interface
LOW quality target: about **100,000 to 200,000 terrain triangles on screen**. Report terrain triangles separately from grass/props, and total triangles if available. Check chunk loading/removal, far mesh, memory and draw-call trends. Touch devices start LOW; retain the existing pixel-ratio cap and no-real-time-shadows rule. Do not claim desktop performance proves phone performance.

## Phone checklist
- [ ] Start on a real Android phone at LOW quality.
- [ ] Walk across at least five chunk boundaries.
- [ ] Look at the horizon and turn quickly; note stalls/missing terrain.
- [ ] Stand still for two minutes and watch for memory growth/rebuilding.
- [ ] Try HIGH quality if available.
- [ ] Test a wet valley, steep slope and high-elevation area.
- [ ] Record device model, Android version, quality, approximate FPS if available, triangle counts, seams and stalls.
- [ ] Repeat after a fresh reload.

## Rules
No monitoring dependency without approval. Do not change the stated triangle target; record evidence if it is missed.

## Done when (Nicholas can check by hand)
- [ ] Complete the checklist on a real Android phone.
- [ ] Save observations and triangle counts in the report.
- [ ] Identify one measured bottleneck and suggest one small follow-up ticket if needed.

## Result
(Fill after testing.)
