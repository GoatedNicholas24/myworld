import { fbm, valueNoise, makeRandom, hashCell } from "./noise.js";

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

// A wandering line (a river or a road) with a width.
function makeLine(points, half) {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const reach = half * 2 + 10;
  return {
    half,
    segments: points.slice(1).map((p, i) => [...points[i], ...p]),
    minX: Math.min(...xs) - reach,
    maxX: Math.max(...xs) + reach,
    minZ: Math.min(...zs) - reach,
    maxZ: Math.max(...zs) + reach,
  };
}

// The shape of the land. It has no edge: any (x, z) gives an answer.
//   heightAt(x, z)     -> how high is the ground here?
//   soilAt(x, z)       -> how much bare earth is here? (no grass grows on it)
//   sandAt(x, z)       -> how much pale river sand, shore or dusty road is here?
//   clearingAt(x, z)   -> homestead, garden, water or road (trees and rocks stay out)
//   grassCoverAt(x, z) -> how thickly grass grows here (0 = none, 1 = full)
//   lakes              -> the lakes, each with a water level
export function createTerrain(settings, seed, start, local = {}) {
  const [minRadius, maxRadius] = settings.soilPatchRadius;
  const cell = settings.soilPatchCellSize;
  const perCell = settings.soilPatchesPerCell;
  const cover = settings.grassCover ?? { scale: 9, minimum: 0.1 };
  const cache = new Map();

  // Bare soil patches are decided cell by cell, so they exist across the whole world.
  function patchesInCell(ci, cj) {
    const key = ci * 65536 + cj;
    let list = cache.get(key);
    if (list) return list;

    const random = makeRandom(hashCell(ci, cj, seed + 77));
    list = [];
    let count = Math.floor(perCell);
    if (random() < perCell - count) count++;

    for (let i = 0; i < count; i++) {
      const x = (ci + random()) * cell;
      const z = (cj + random()) * cell;
      const radius = lerp(minRadius, maxRadius, random());
      if (Math.hypot(x - start[0], z - start[1]) < 10 + radius) continue; // keep the start in grass
      list.push({ x, z, radius });
    }

    cache.set(key, list);
    return list;
  }

  const rivers = (local.rivers ?? []).map((r) => ({ ...makeLine(r.points, r.width / 2), depth: r.depth }));
  const roads = (local.roads ?? []).map((r) => makeLine(r.points, r.width / 2));
  const homesteads = local.homesteads ?? [];
  const fields = (local.fields ?? []).map((f) => ({
    ...f,
    cos: Math.cos(f.rotation ?? 0),
    sin: Math.sin(f.rotation ?? 0),
  }));

  function lineDistance(x, z, line, wobble) {
    if (x < line.minX || x > line.maxX || z < line.minZ || z > line.maxZ) return Infinity;
    let best = Infinity;
    for (const [ax, az, bx, bz] of line.segments) {
      best = Math.min(best, distanceToSegment(x, z, ax, az, bx, bz));
    }
    return best + (valueNoise(x * 0.03, z * 0.03, seed + 21) - 0.5) * line.half * wobble;
  }

  // The hills only, before anything is dug out of them.
  function landHeight(x, z) {
    const small = fbm(x / settings.hillScale + 31.7, z / settings.hillScale + 12.3, seed, 3);
    const large = fbm(x / settings.largeHillScale + 7.1, z / settings.largeHillScale + 63.9, seed + 11, 2);
    return (small - 0.5) * 2 * settings.hillHeight + (large - 0.5) * 2 * settings.largeHillHeight;
  }

  // Lakes: the water sits just below the lowest point of the land around the lake.
  const lakes = (local.lakes ?? []).map((lake) => {
    let level = Infinity;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      level = Math.min(level, landHeight(lake.x + Math.cos(a) * lake.radius, lake.z + Math.sin(a) * lake.radius));
    }
    return { ...lake, level: level - 0.25 };
  });

  // 1 at the lake's centre, 1.0 at its edge (the edge is slightly uneven).
  function lakeDistance(x, z, lake) {
    const wobble = 0.85 + 0.3 * valueNoise(x * 0.02 + lake.x * 0.013, z * 0.02 + lake.z * 0.017, seed + 41);
    return Math.hypot(x - lake.x, z - lake.z) / (lake.radius * wobble);
  }

  function heightAt(x, z) {
    let height = landHeight(x, z);
    for (const river of rivers) {
      const d = lineDistance(x, z, river, 0.7);
      if (d < Infinity) height -= river.depth * (1 - smoothstep(river.half * 0.5, river.half * 1.3, d));
    }
    for (const lake of lakes) {
      const d = lakeDistance(x, z, lake);
      if (d < 1) height -= lake.depth * (1 - smoothstep(0.3, 1.0, d));
    }
    return height;
  }

  function sandAt(x, z) {
    let best = 0;
    for (const river of rivers) {
      const d = lineDistance(x, z, river, 0.7);
      if (d < Infinity) best = Math.max(best, 1 - smoothstep(river.half * 0.7, river.half * 1.2, d));
    }
    for (const road of roads) {
      const d = lineDistance(x, z, road, 0.3);
      if (d < Infinity) best = Math.max(best, 0.9 * (1 - smoothstep(road.half * 0.7, road.half * 1.2, d)));
    }
    for (const lake of lakes) {
      const d = lakeDistance(x, z, lake);
      if (d < 1.4) best = Math.max(best, 1 - smoothstep(0.92, 1.3, d));
    }
    return best;
  }

  function homesteadAt(x, z) {
    let best = 0;
    for (const h of homesteads) {
      const d = Math.hypot(x - h.x, z - h.z);
      best = Math.max(best, 1 - smoothstep(h.radius * 1.15, h.radius * 1.7, d));
    }
    return best;
  }

  function fieldAt(x, z) {
    let best = 0;
    for (const f of fields) {
      const dx = x - f.x;
      const dz = z - f.z;
      const lx = dx * f.cos + dz * f.sin;
      const lz = -dx * f.sin + dz * f.cos;
      const inX = 1 - smoothstep(f.width / 2 - 1, f.width / 2 + 2, Math.abs(lx));
      const inZ = 1 - smoothstep(f.depth / 2 - 1, f.depth / 2 + 2, Math.abs(lz));
      best = Math.max(best, inX * inZ);
    }
    return best;
  }

  function lakeMask(x, z) {
    let best = 0;
    for (const lake of lakes) {
      best = Math.max(best, 1 - smoothstep(0.95, 1.5, lakeDistance(x, z, lake)));
    }
    return best;
  }

  function soilAt(x, z) {
    const ci = Math.floor(x / cell);
    const cj = Math.floor(z / cell);
    let best = 0;

    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        for (const patch of patchesInCell(ci + di, cj + dj)) {
          const dx = x - patch.x;
          const dz = z - patch.z;
          const wobble = 0.7 + 0.6 * valueNoise(x * 0.3, z * 0.3, seed + 9);
          const d = Math.sqrt(dx * dx + dz * dz) / (patch.radius * wobble);
          best = Math.max(best, 1 - smoothstep(0.6, 1.0, d));
        }
      }
    }
    return Math.max(best, homesteadAt(x, z), sandAt(x, z), fieldAt(x, z) * 0.9, lakeMask(x, z));
  }

  function clearingAt(x, z) {
    return Math.max(homesteadAt(x, z), sandAt(x, z), fieldAt(x, z), lakeMask(x, z));
  }

  // Dry-season grass grows in patches, with bare earth in between.
  function grassCoverAt(x, z) {
    const n = fbm(x / cover.scale + 71.3, z / cover.scale + 5.9, seed + 31, 3);
    return lerp(cover.minimum, 1, smoothstep(0.36, 0.64, n));
  }

  return { heightAt, soilAt, sandAt, clearingAt, grassCoverAt, lakes, sandColor: local.sandColor };
}