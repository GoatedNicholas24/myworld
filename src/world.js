// Finds every worlds/<name>/world.json and lets the engine load one by name.
// import.meta.glob is a Vite feature: it collects all matching files for us,
// so adding a new world folder later needs no engine changes.
const manifests = import.meta.glob("../worlds/*/world.json", { eager: true });

const REQUIRED_KEYS = ["name", "location", "terrain", "grass", "wind", "hills", "props", "camera", "moods"];

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

export function listWorlds() {
  return Object.keys(manifests).map((path) => path.split("/")[2]);
}