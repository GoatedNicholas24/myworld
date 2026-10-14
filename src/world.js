// Finds every worlds/<name>/world.json (and its map.json / outline.json) and
// lets the engine load them by name. import.meta.glob is a Vite feature: it
// collects all matching files, so a new world folder needs no engine changes.
const manifests = import.meta.glob("../worlds/*/world.json", { eager: true });
const maps = import.meta.glob("../worlds/*/map.json", { eager: true });
const outlines = import.meta.glob("../worlds/*/outline.json", { eager: true });

const REQUIRED_KEYS = ["name", "location", "terrain", "grass", "wind", "props", "camera", "moods"];

export function loadWorld(id) {
  const file = manifests[`../worlds/${id}/world.json`];
  if (!file) {
    throw new Error(`World "${id}" was not found. Expected the file worlds/${id}/world.json`);
  }

  const world = file.default;
  for (const key of REQUIRED_KEYS) {
    if (!(key in world)) {
      throw new Error(`worlds/${id}/world.json is missing "${key}"`);
    }
  }
  if (!Array.isArray(world.moods) || world.moods.length === 0) {
    throw new Error(`worlds/${id}/world.json needs at least one mood`);
  }
  return world;
}

// The real-world map data for a world (towns, mountains, roads...).
export function loadMap(id) {
  const file = maps[`../worlds/${id}/map.json`];
  if (!file) {
    throw new Error(`World "${id}" has no map. Expected the file worlds/${id}/map.json`);
  }
  return file.default;
}

// The region outline is optional. It is made by tools/make-outline.mjs.
export function loadOutline(id) {
  const file = outlines[`../worlds/${id}/outline.json`];
  return file ? file.default : null;
}

export function listWorlds() {
  return Object.keys(manifests).map((path) => path.split("/")[2]);
}