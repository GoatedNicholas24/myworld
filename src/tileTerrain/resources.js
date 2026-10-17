import { decodeElevation } from "./tileCache.js";

const WORLD_HALF = 10000;
const CHUNK_METRES = 250;
const CELLS_PER_CHUNK = 5;
const DENSITY_SAMPLES = 401;
const MAX_CACHED_CHUNKS = 96;
const RESOURCE_COLORS = {
  stone: "#777a77",
  clay: "#a96f53",
  red_earth: "#a45137",
  sand: "#c9b783",
  hardwood_timber: "#79553b",
  thatch_grass: "#b6a65f",
  papyrus: "#638f76",
  bamboo: "#718d48",
  fibre_plants: "#7e9a63",
  firewood: "#6e4d35",
  ironstone: "#514d4a",
};

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seedText) {
  let state = hashString(seedText) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function averageCellWeight(map, col, row) {
  const a = map[row * DENSITY_SAMPLES + col];
  const b = map[row * DENSITY_SAMPLES + col + 1];
  const c = map[(row + 1) * DENSITY_SAMPLES + col];
  const d = map[(row + 1) * DENSITY_SAMPLES + col + 1];
  return (a + b + c + d) / (4 * 255);
}

function makeResourceGeometry(THREE, id) {
  switch (id) {
    case "stone":
    case "ironstone":
      return new THREE.IcosahedronGeometry(id === "stone" ? 0.45 : 0.38, 0);
    case "clay":
      return new THREE.ConeGeometry(0.55, 0.16, 6);
    case "red_earth":
      return new THREE.CylinderGeometry(0.48, 0.52, 0.12, 7);
    case "sand":
      return new THREE.CircleGeometry(0.5, 7);
    case "hardwood_timber":
      return new THREE.CylinderGeometry(0.12, 0.15, 1.1, 5);
    case "thatch_grass":
      return new THREE.ConeGeometry(0.32, 0.65, 5);
    case "papyrus":
      return new THREE.CylinderGeometry(0.055, 0.07, 1.2, 4);
    case "bamboo":
      return new THREE.CylinderGeometry(0.07, 0.09, 1.35, 5);
    case "fibre_plants":
      return new THREE.ConeGeometry(0.24, 0.75, 5);
    case "firewood":
      return new THREE.CylinderGeometry(0.12, 0.13, 0.75, 5);
    default:
      return new THREE.IcosahedronGeometry(0.35, 0);
  }
}

export async function createResourceSystem({ THREE, tileRoot, worldSeed, terrain }) {
  const indexUrl = `${tileRoot.replace(/\/$/, "")}/density/index.json`;
  const indexResponse = await fetch(indexUrl);
  if (!indexResponse.ok) throw new Error(`Missing compact resource maps. Run the terrain generator and tiler first (${indexUrl}).`);
  const indexType = indexResponse.headers.get("content-type") ?? "";
  if (indexType.includes("text/html")) throw new Error("Compact resource maps are missing. Re-run node tools/tiler/tile.mjs.");
  const index = await indexResponse.json();
  if (index.samples?.[0] !== DENSITY_SAMPLES || index.samples?.[1] !== DENSITY_SAMPLES || index.cell_m !== 50) {
    throw new Error("Resource density index must describe a 401 x 401 grid at 50 m.");
  }

  const definitions = new Map();
  const geometries = new Map();
  const materials = new Map();
  const maps = new Map();
  await Promise.all(Object.entries(index.resources ?? {}).map(async ([id, definition]) => {
    if (!definition.file || !Number.isFinite(definition.density_per_km2) || !Number.isFinite(definition.min_spacing_m)) {
      throw new Error(`Invalid resource density metadata for ${id}.`);
    }
    const response = await fetch(`${tileRoot.replace(/\/$/, "")}/density/${definition.file}`);
    if (!response.ok) throw new Error(`Missing resource density map: ${definition.file}`);
    const contentType = response.headers.get("content-type") ?? "";
    const buffer = await response.arrayBuffer();
    const preview = new TextDecoder().decode(buffer.slice(0, 32)).trimStart().toLowerCase();
    if (contentType.includes("text/html") || preview.startsWith("<!doctype html") || preview.startsWith("<html")) {
      throw new Error(`Missing resource density map: ${definition.file}. Re-run node tools/tiler/tile.mjs.`);
    }
    if (buffer.byteLength !== DENSITY_SAMPLES * DENSITY_SAMPLES) {
      throw new Error(`${definition.file}: expected ${DENSITY_SAMPLES * DENSITY_SAMPLES} bytes, got ${buffer.byteLength}.`);
    }
    definitions.set(id, definition);
    maps.set(id, new Uint8Array(buffer));
    geometries.set(id, makeResourceGeometry(THREE, id));
    materials.set(id, new THREE.MeshLambertMaterial({ color: RESOURCE_COLORS[id] ?? "#8b806b" }));
  }));

  const nodeCache = new Map();
  const dummy = new THREE.Object3D();

  function rawCandidatesForChunk(i, j, id) {
    const map = maps.get(id);
    const definition = definitions.get(id);
    if (!map || !definition || i < 0 || j < 0 || i >= 80 || j >= 80) return [];
    const random = seededRandom(`${worldSeed}|resource|${i}|${j}|${id}`);
    const result = [];
    for (let localRow = 0; localRow < CELLS_PER_CHUNK; localRow += 1) {
      const cellRow = j * CELLS_PER_CHUNK + localRow;
      for (let localCol = 0; localCol < CELLS_PER_CHUNK; localCol += 1) {
        const cellCol = i * CELLS_PER_CHUNK + localCol;
        const weight = averageCellWeight(map, cellCol, cellRow);
        const probability = Math.min(1, definition.density_per_km2 * weight * 0.0025);
        if (random() >= probability) continue;
        const x = -WORLD_HALF + cellCol * 50 + random() * 50;
        const z = -WORLD_HALF + cellRow * 50 + random() * 50;
        result.push({
          id,
          i,
          j,
          x,
          z,
          priority: random(),
          scale: 0.75 + random() * 0.65,
          rotation: random() * Math.PI * 2,
        });
      }
    }
    return result;
  }

  function getChunkNodes(i, j) {
    const key = `${i},${j}`;
    const cached = nodeCache.get(key);
    if (cached) {
      nodeCache.delete(key);
      nodeCache.set(key, cached);
      return cached;
    }
    const nodes = [];
    for (const id of definitions.keys()) {
      const candidates = [];
      for (let nj = j - 1; nj <= j + 1; nj += 1) {
        for (let ni = i - 1; ni <= i + 1; ni += 1) {
          candidates.push(...rawCandidatesForChunk(ni, nj, id));
        }
      }
      const accepted = candidates.filter((candidate) => {
        const minSpacing = definitions.get(id).min_spacing_m;
        for (const other of candidates) {
          if (other === candidate || other.priority >= candidate.priority) continue;
          const dx = other.x - candidate.x;
          const dz = other.z - candidate.z;
          if (dx * dx + dz * dz < minSpacing * minSpacing) return false;
        }
        return true;
      });
      for (const node of accepted) {
        if (node.i === i && node.j === j) {
          node.y = terrain.heightAt(node.x, node.z);
          nodes.push(node);
        }
      }
    }
    nodeCache.set(key, nodes);
    while (nodeCache.size > MAX_CACHED_CHUNKS) nodeCache.delete(nodeCache.keys().next().value);
    return nodes;
  }

  function createChunkMeshes(i, j) {
    const nodes = getChunkNodes(i, j);
    const group = new THREE.Group();
    let triangles = 0;
    for (const id of definitions.keys()) {
      const list = nodes.filter((node) => node.id === id);
      if (list.length === 0) continue;
      const geometry = geometries.get(id);
      const mesh = new THREE.InstancedMesh(geometry, materials.get(id), list.length);
      mesh.frustumCulled = false;
      for (let index = 0; index < list.length; index += 1) {
        const node = list[index];
        dummy.position.set(node.x, node.y + 0.08, node.z);
        dummy.rotation.set(id === "sand" ? -Math.PI / 2 : 0, node.rotation, id === "hardwood_timber" ? Math.PI / 2 : 0);
        const scale = node.scale;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      triangles += geometry.index ? geometry.index.count / 3 * list.length : geometry.attributes.position.count / 3 * list.length;
    }
    return { group, triangles, nodes };
  }

  function resourcesNear(x, z, radius = 100) {
    const minI = Math.max(0, Math.floor((x - radius + WORLD_HALF) / CHUNK_METRES));
    const maxI = Math.min(79, Math.floor((x + radius + WORLD_HALF) / CHUNK_METRES));
    const minJ = Math.max(0, Math.floor((z - radius + WORLD_HALF) / CHUNK_METRES));
    const maxJ = Math.min(79, Math.floor((z + radius + WORLD_HALF) / CHUNK_METRES));
    const radiusSq = radius * radius;
    const result = [];
    for (let j = minJ; j <= maxJ; j += 1) {
      for (let i = minI; i <= maxI; i += 1) {
        for (const node of getChunkNodes(i, j)) {
          const dx = node.x - x;
          const dz = node.z - z;
          if (dx * dx + dz * dz <= radiusSq) result.push(node);
        }
      }
    }
    return result;
  }

  return {
    createChunkMeshes,
    getChunkNodes,
    resourcesNear,
    dispose() {
      for (const geometry of geometries.values()) geometry.dispose();
      for (const material of materials.values()) material.dispose();
      nodeCache.clear();
    },
  };
}
