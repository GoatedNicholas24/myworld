# My World

A 3D story-based, choice-based game about an African kid making it out of the hood. The first world is Karamoja, Uganda (savannah, manyattas, cattle), then the city. Built with Vite and Three.js in plain JavaScript. It is designed to run on cheap Android phones and weak laptops.

The engine (in `src/`) is separate from the world content (in `worlds/<name>/`). Each world describes its whole look in a `world.json` file, so more worlds can be added later.

## How to run

You need Node.js and Git installed.

```bash
npm install
npm run dev
```

Open the address that Vite prints (usually http://localhost:5173).

To try it on your phone (same Wi-Fi as your computer):

```bash
npm run dev -- --host
```

Then open the "Network" address on your phone.

## Controls

- Drag with the mouse (or finger) to look around
- W A S D (or the arrow keys) to walk, hold Shift to go faster
- 1, 2, 3, 4 to switch mood (golden hour, midday, overcast, dawn)
- Q to switch between LOW and HIGH quality

## Project rules

See `PROJECT_NOTES.md`. Daily progress is in `DEVLOG.md`. Downloaded assets are listed in `ASSETS.md`.