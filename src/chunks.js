// The world is cut into square "chunks". Only the chunks near the camera
// exist; when you walk, chunks behind you are removed and new ones are built
// ahead of you. This is what lets the world be huge while staying fast.

// How many chunks are alive when the camera stands at (0, 0).
// Used to work out triangle counts without running the game.
export function countChunks(chunkSize, loadRadius) {
  const span = Math.ceil(loadRadius / chunkSize) + 1;
  let count = 0;
  for (let iz = -span; iz <= span; iz++) {
    for (let ix = -span; ix <= span; ix++) {
      if (Math.hypot((ix + 0.5) * chunkSize, (iz + 0.5) * chunkSize) <= loadRadius) count++;
    }
  }
  return count;
}

// build(ix, iz)  -> creates a chunk and returns something to remember it by
// release(data)  -> removes that chunk again
// perFrame       -> how many new chunks may be built per frame (keeps walking smooth)
export function createChunkManager({ chunkSize, loadRadius, build, release, perFrame = 1 }) {
  const active = new Map();
  let queue = [];
  let lastCx = null;
  let lastCz = null;

  function plan(x, z) {
    const cx = Math.floor(x / chunkSize);
    const cz = Math.floor(z / chunkSize);
    lastCx = cx;
    lastCz = cz;

    const span = Math.ceil(loadRadius / chunkSize) + 1;
    const wanted = new Map();
    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        const ix = cx + dx;
        const iz = cz + dz;
        const distance = Math.hypot((ix + 0.5) * chunkSize - x, (iz + 0.5) * chunkSize - z);
        if (distance <= loadRadius) wanted.set(`${ix},${iz}`, { ix, iz, distance });
      }
    }

    // Remove chunks that are now too far away.
    for (const [key, data] of active) {
      if (!wanted.has(key)) {
        release(data);
        active.delete(key);
      }
    }

    // Build the nearest missing chunks first.
    queue = [];
    for (const [key, chunk] of wanted) {
      if (!active.has(key)) queue.push({ key, ...chunk });
    }
    queue.sort((a, b) => a.distance - b.distance);
  }

  function buildNext() {
    const next = queue.shift();
    if (next && !active.has(next.key)) {
      active.set(next.key, build(next.ix, next.iz));
    }
  }

  return {
    // Call every frame with the camera position.
    update(x, z) {
      if (Math.floor(x / chunkSize) !== lastCx || Math.floor(z / chunkSize) !== lastCz) {
        plan(x, z);
      }
      for (let i = 0; i < perFrame && queue.length > 0; i++) buildNext();
    },
    // Throw everything away and build every chunk right now.
    rebuildAll(x, z) {
      for (const data of active.values()) release(data);
      active.clear();
      plan(x, z);
      while (queue.length > 0) buildNext();
    },
    // Forget everything without releasing (the caller already cleaned up).
    clear() {
      active.clear();
      queue = [];
      lastCx = null;
      lastCz = null;
    },
  };
}