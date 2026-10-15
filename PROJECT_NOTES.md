# PROJECT NOTES

Paste this file into every new chat so the assistant follows the same rules.

## About the project

A 3D story-based, choice-based game about an African kid making it out of the hood.

- First world: Karamoja, Uganda (savannah, manyattas, cattle). Then the city.
- Long term: many connected worlds based on real geographic places. Players can create their own worlds and share them as downloadable packs.
- Repository: https://github.com/GoatedNicholas24/myworld.git (branch: `master`)

## Stack

- Vite + Three.js, plain JavaScript.
- No frameworks. Nothing is added that I didn't ask for.

## About me

- I'm a complete beginner. Use simple explanations.
- Give complete files (never partial snippets) with their exact paths.
- List every command I need to run.
- Never put passwords or tokens in files.

## Performance

- Two quality settings: LOW and HIGH. Q switches between them.
- Touch devices start on LOW automatically.
- Pixel ratio is capped at 2.
- No real-time shadows.
- Reuse geometry and materials.
- Report the triangle count after every visual change.
- Target: cheap Android phones and weak laptops.

## Architecture

- Engine and world content are separate.
- Engine code lives in `/src`.
- Each world is a folder in `/worlds/<name>/` with a `world.json` manifest containing: name, real location (approximate latitude and longitude), moods, terrain settings and the asset list.
- The engine reads a world's whole look from its manifest and never hard-codes it, so player-made worlds can be added later.

## Look

- Firewatch-inspired: stylized and painterly, close to realistic but cartoonish.
- Support several moods: golden hour, midday, overcast, dawn. It must not always be orange.

## Assets

- Only free-for-commercial-use models (CC0 or CC-BY).
- Record every asset in `ASSETS.md`.
- Generate detail in code first. Use downloaded models only when they clearly add value.

## Daily workflow

- One small improvement per session that ends with something that runs and looks better.
- At the end of each session:
  1. Update `DEVLOG.md`.
  2. Give me the git commands and a commit message.
  3. Suggest ONE next step.

## Git commands (after each small step)

```bash
git add .
git commit -m "your message"
git push origin master
```

## Working with several AI tools

The repo is the shared memory. Claude, ChatGPT, Gemini and GitHub Copilot all work from the same files.

- Big picture: `docs/VISION.md`
- Who does what and how to hand over work: `docs/AI_WORKFLOW.md`
- One small task at a time: `docs/tasks/` (copy `_TEMPLATE.md`)
- Give each AI only this file, the vision, one ticket and the source files that ticket names.

## Representation

Portray Karamoja and its people with dignity and specificity, with no caricature.