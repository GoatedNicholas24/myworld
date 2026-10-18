import vegetationData from "../../data/vegetation.json";
import { decodeElevation } from "./tileCache.js";

const WORLD_HALF = 10000;
const WORLD_SIZE = 20000;
const CHUNK_METRES = 250;
const CHUNK_AREA_HECTARES = 6.25;
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
const TREE_KINDS = new Set(["acacia", "broadleaf", "tall_forest_tree"]);

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

function addTriangle(vertices, a, b, c) {
  vertices.push(...a, ...b, ...c);
}

function addCylinder(vertices, y0, y1, r0, r1, segments = 4, caps = true) {
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const b0 = [Math.cos(a0) * r0, y0, Math.sin(a0) * r0];
    const b1 = [Math.cos(a1) * r0, y0, Math.sin(a1) * r0];
    const t0 = [Math.cos(a0) * r1, y1, Math.sin(a0) * r1];
    const t1 = [Math.cos(a1) * r1, y1, Math.sin(a1) * r1];
    addTriangle(vertices, b0, b1, t0);
    addTriangle(vertices, t0, b1, t1);
    if (caps) {
      addTriangle(vertices, [0, y0, 0], b1, b0);
      addTriangle(vertices, [0, y1, 0], t0, t1);
    }
  }
}

function addCone(vertices, y0, y1, radius, segments = 5, caps = true) {
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const b0 = [Math.cos(a0) * radius, y0, Math.sin(a0) * radius];
    const b1 = [Math.cos(a1) * radius, y0, Math.sin(a1) * radius];
    addTriangle(vertices, b0, b1, [0, y1, 0]);
    if (caps) addTriangle(vertices, [0, y0, 0], b1, b0);
  }
}

function addBlade(vertices, angle, height, width) {
  const dx = Math.cos(angle) * width;
  const dz = Math.sin(angle) * width;
  addTriangle(vertices, [-dx, 0, -dz], [dx, 0, dz], [0, height, 0]);
  addTriangle(vertices, [dx, 0, dz], [dx * 0.45, height * 0.58, dz * 0.45], [0, height, 0]);
}

function makeGeometry(THREE, kind, level) {
  const vertices = [];
  if (level === "card") {
    addTriangle(vertices, [-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0]);
    addTriangle(vertices, [-0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0]);
  } else if (level === "simple") {
    if (TREE_KINDS.has(kind)) {
      // A six-triangle silhouette: trunk and four-sided crown.
      addTriangle(vertices, [-0.035, 0, 0], [0.035, 0, 0], [0.035, 0.58, 0]);
      addTriangle(vertices, [-0.035, 0, 0], [0.035, 0.58, 0], [-0.035, 0.58, 0]);
      addTriangle(vertices, [-0.38, 0.42, 0], [0.38, 0.42, 0], [0, 1, 0]);
      addTriangle(vertices, [0.38, 0.42, 0], [0, 0.42, 0.38], [0, 1, 0]);
      addTriangle(vertices, [0, 0.42, 0.38], [-0.38, 0.42, 0], [0, 1, 0]);
      addTriangle(vertices, [-0.38, 0.42, 0], [0, 0.42, -0.38], [0, 1, 0]);
    } else if (kind === "grass_tuft" || kind === "moorland_tussock") {
      addBlade(vertices, 0, 0.8, 0.15);
      addBlade(vertices, Math.PI / 2, 0.65, 0.13);
    } else if (kind === "papyrus_reed" || kind === "bamboo_clump" || kind === "giant_lobelia") {
      addBlade(vertices, 0, 1, 0.08);
      addBlade(vertices, Math.PI * 2 / 3, 0.85, 0.08);
    } else {
      addCone(vertices, 0, 1, 0.38, 4, false);
    }
  } else if (TREE_KINDS.has(kind)) {
    addCylinder(vertices, 0, 0.62, 0.06, 0.035, 4, true);
    if (kind === "acacia") {
      addCylinder(vertices, 0.48, 0.78, 0.34, 0.3, 5, true);
      addCylinder(vertices, 0.74, 0.9, 0.3, 0.22, 5, true);
    } else {
      addCone(vertices, 0.38, 1, kind === "tall_forest_tree" ? 0.42 : 0.38, 5, true);
      if (kind === "tall_forest_tree") addCone(vertices, 0.58, 1, 0.3, 5, true);
    }
  } else if (kind === "shrub") {
    addCone(vertices, 0.02, 0.92, 0.42, 5, true);
    addCone(vertices, 0.18, 1, 0.3, 4, true);
  } else if (kind === "grass_tuft" || kind === "moorland_tussock") {
    addBlade(vertices, 0, 0.9, 0.18);
    addBlade(vertices, Math.PI / 3, 0.72, 0.16);
    addBlade(vertices, Math.PI * 2 / 3, 0.8, 0.17);
    addBlade(vertices, Math.PI, 0.62, 0.14);
  } else if (kind === "papyrus_reed" || kind === "bamboo_clump") {
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2;
      const x = Math.cos(angle) * 0.16;
      const z = Math.sin(angle) * 0.16;
      // Slim, faceted stalks keep reeds/bamboo readable without textures.
      const stalk = [];
      addCylinder(stalk, 0, 1, 0.035, 0.025, 3, false);
      for (let k = 0; k < stalk.length; k += 3) {
        vertices.push(stalk[k] + x, stalk[k + 1], stalk[k + 2] + z);
      }
    }
  } else if (kind === "giant_lobelia") {
    addCylinder(vertices, 0, 1, 0.09, 0.045, 4, false);
    addCone(vertices, 0.2, 0.72, 0.35, 5, false);
  } else {
    addCone(vertices, 0, 1, 0.38, 5, true);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function makeFadeMaterial(THREE, level, preset) {
  const radius = preset.vegetationRadius;
  const nearStart = preset.vegetationNearFadeStart;
  const nearEnd = preset.vegetationNearEnd;
  const midEnd = preset.vegetationMidEnd;
  const midFadeEnd = preset.vegetationMidFadeEnd;
  const fadeIn = level === "near" ? [-1000000, -999999] : level === "simple" ? [nearStart, nearEnd] : [midEnd, midFadeEnd];
  const fadeOut = level === "near" ? [nearStart, nearEnd] : level === "simple" ? [midEnd, midFadeEnd] : [Math.max(midFadeEnd, radius - preset.vegetationFadeWidth), radius];
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: false,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFadeInStart = { value: fadeIn[0] };
    shader.uniforms.uFadeInEnd = { value: fadeIn[1] };
    shader.uniforms.uFadeOutStart = { value: fadeOut[0] };
    shader.uniforms.uFadeOutEnd = { value: fadeOut[1] };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying float vDetailFade;\nuniform float uFadeInStart;\nuniform float uFadeInEnd;\nuniform float uFadeOutStart;\nuniform float uFadeOutEnd;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\nfloat detailDistance = length(mvPosition.xyz);\nfloat fadeInAmount = smoothstep(uFadeInStart, uFadeInEnd, detailDistance);\nfloat fadeOutAmount = 1.0 - smoothstep(uFadeOutStart, uFadeOutEnd, detailDistance);\nvDetailFade = fadeInAmount * fadeOutAmount;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying float vDetailFade;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\ndiffuseColor.a *= vDetailFade;",
    );
  };
  material.customProgramCacheKey = () => `living-ground-${level}-fade-v1`;
  return material;
}

export function createVegetationSystem({ THREE, terrain, metadata, worldSeed, initialQuality, resourceSystem }) {
  let quality = initialQuality;
  const biomesByIndex = metadata.biomes;
  const biomeConfig = vegetationData.biomes;
  const geometries = new Map();
  const materials = new Map();
  const records = new Map();
  let queue = [];
  let lastRebuildX = NaN;
  let lastRebuildZ = NaN;
  let vegetationTriangles = 0;
  let resourceTriangles = 0;
  let statsDirty = true;
  const dummy = new THREE.Object3D();
  const tempColor = new THREE.Color();

  function sharedGeometry(kind, level) {
    const key = `${kind}:${level}`;
    if (!geometries.has(key)) geometries.set(key, makeGeometry(THREE, kind, level));
    return geometries.get(key);
  }

  function sharedMaterial(kind, level) {
    const key = `${kind}:${level}:${quality.vegetationRadius}`;
    if (!materials.has(key)) materials.set(key, makeFadeMaterial(THREE, level, quality));
    return materials.get(key);
  }

  function disposeRecord(record) {
    record.group.parent?.remove(record.group);
    vegetationTriangles -= record.vegetationTriangles;
    resourceTriangles -= record.resourceTriangles;
    records.delete(record.key);
    statsDirty = true;
  }

  function getSample(tile, x, z) {
    const { i, j, lod } = tile;
    const col = Math.round(clamp((x - (-WORLD_HALF + i * CHUNK_METRES)) / CHUNK_METRES, 0, 1) * lod);
    const row = Math.round(clamp((z - (-WORLD_HALF + j * CHUNK_METRES)) / CHUNK_METRES, 0, 1) * lod);
    const stride = lod + 1;
    const index = row * stride + col;
    const height = decodeElevation(tile.heights[index]);
    const left = decodeElevation(tile.heights[row * stride + Math.max(0, col - 1)]);
    const right = decodeElevation(tile.heights[row * stride + Math.min(lod, col + 1)]);
    const north = decodeElevation(tile.heights[Math.max(0, row - 1) * stride + col]);
    const south = decodeElevation(tile.heights[Math.min(lod, row + 1) * stride + col]);
    const step = CHUNK_METRES / lod;
    const dx = (right - left) / (col === 0 || col === lod ? step : step * 2);
    const dz = (south - north) / (row === 0 || row === lod ? step : step * 2);
    const slopeDeg = Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI;
    const biomeIndex = tile.biomes[index];
    return { height, slopeDeg, biomeIndex, biome: biomesByIndex.find((item) => item.index === biomeIndex)?.id };
  }

  function collectVegetation(tile, camera) {
    const { i, j } = tile;
    const biomeCounts = new Map();
    for (const index of tile.biomes) biomeCounts.set(index, (biomeCounts.get(index) ?? 0) + 1);
    const totalSamples = tile.biomes.length;
    const candidates = [];
    const west = -WORLD_HALF + i * CHUNK_METRES;
    const north = -WORLD_HALF + j * CHUNK_METRES;

    for (const biome of biomesByIndex) {
      const share = (biomeCounts.get(biome.index) ?? 0) / totalSamples;
      if (share <= 0) continue;
      const rules = biomeConfig[biome.id]?.vegetation ?? [];
      for (const rule of rules) {
        const expected = rule.per_hectare * CHUNK_AREA_HECTARES * share * (quality.vegetationDensityScale ?? 1);
        const random = seededRandom(`${worldSeed}|vegetation|${i}|${j}|${biome.id}|${rule.kind}`);
        const count = Math.floor(expected) + (random() < expected % 1 ? 1 : 0);
        let accepted = 0;
        let attempts = 0;
        const maxAttempts = Math.max(50, count * Math.max(8, Math.ceil(1 / Math.max(share, 0.05))) * 3);
        while (accepted < count && attempts < maxAttempts) {
          attempts += 1;
          const x = west + random() * CHUNK_METRES;
          const z = north + random() * CHUNK_METRES;
          const sample = getSample(tile, x, z);
          if (sample.biome !== biome.id) continue;
          if (sample.slopeDeg > 35 && rule.kind !== "shrub") continue;
          if (terrain.isWaterAt?.(x, z)) continue;
          if (random() > (rule.coverage ?? 1)) continue;
          const distance = Math.hypot(x - camera.position.x, z - camera.position.z);
          if (distance > quality.vegetationRadius) continue;
          const height = rule.min_height + random() * (rule.max_height - rule.min_height);
          const scale = rule.min_scale + random() * (rule.max_scale - rule.min_scale);
          const colors = rule.colors ?? ["#7c8a4d"];
          candidates.push({
            kind: rule.kind,
            biome: biome.id,
            x,
            z,
            y: terrain.heightAt(x, z),
            height,
            scale,
            rotation: random() * Math.PI * 2,
            color: colors[Math.floor(random() * colors.length)],
            distance,
            priority: random(),
          });
          accepted += 1;
        }
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.priority - b.priority);
    return candidates;
  }

  function buildChunk(tile, camera, availableBudget) {
    const candidates = collectVegetation(tile, camera);
    const radius = quality.vegetationRadius;
    const byKindLevel = new Map();
    let triangleCount = 0;

    for (const plant of candidates) {
      let levels;
      if (plant.distance < quality.vegetationNearFadeStart) levels = ["near"];
      else if (plant.distance < quality.vegetationNearEnd) levels = ["near", "simple"];
      else if (plant.distance < quality.vegetationMidEnd) levels = ["simple"];
      else if (plant.distance < quality.vegetationMidFadeEnd) levels = ["simple", "card"];
      else levels = ["card"];

      const cost = levels.reduce((sum, level) => {
        const geometry = sharedGeometry(plant.kind, level);
        return sum + (geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3);
      }, 0);
      if (cost > availableBudget - triangleCount) {
        const fallback = plant.distance < quality.vegetationNearEnd ? ["near"] : plant.distance < quality.vegetationMidFadeEnd ? ["simple"] : ["card"];
        const fallbackCost = fallback.reduce((sum, level) => {
          const geometry = sharedGeometry(plant.kind, level);
          return sum + (geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3);
        }, 0);
        if (fallbackCost > availableBudget - triangleCount) continue;
        levels = fallback;
      }

      for (const level of levels) {
        const key = `${plant.kind}:${level}`;
        if (!byKindLevel.has(key)) byKindLevel.set(key, []);
        byKindLevel.get(key).push(plant);
        const geometry = sharedGeometry(plant.kind, level);
        triangleCount += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
      }
    }

    const group = new THREE.Group();
    for (const [key, instances] of byKindLevel) {
      const [kind, level] = key.split(":");
      const geometry = sharedGeometry(kind, level);
      const mesh = new THREE.InstancedMesh(geometry, sharedMaterial(kind, level), instances.length);
      mesh.frustumCulled = false;
      for (let index = 0; index < instances.length; index += 1) {
        const plant = instances[index];
        const isTree = TREE_KINDS.has(kind);
        const width = isTree ? plant.height * 0.12 : plant.height * 0.42;
        const height = level === "card" ? plant.height * 0.9 : plant.height;
        dummy.position.set(plant.x, plant.y, plant.z);
        dummy.rotation.set(0, plant.rotation, 0);
        dummy.scale.set(width * plant.scale, height * plant.scale, width * plant.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        tempColor.set(plant.color).multiplyScalar(0.9 + plant.priority * 0.2);
        mesh.setColorAt(index, tempColor);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }

    const resourceResult = resourceSystem?.createChunkMeshes(tile.i, tile.j, camera, quality.resourceRadius) ?? { group: new THREE.Group(), triangles: 0, nodes: [] };
    group.add(resourceResult.group);
    return {
      key: `${tile.i},${tile.j}`,
      i: tile.i,
      j: tile.j,
      tile,
      group,
      vegetationTriangles: triangleCount,
      resourceTriangles: resourceResult.triangles,
      nodes: resourceResult.nodes,
    };
  }

  function enqueue(tile, distance) {
    const key = `${tile.i},${tile.j}`;
    if (queue.some((item) => item.key === key)) return;
    queue.push({ key, tile, distance });
    queue.sort((a, b) => a.distance - b.distance);
  }

  function update(camera, activeChunks, buildBudget = 2) {
    const radius = quality.vegetationRadius;
    const availableTiles = new Map(activeChunks.map((tile) => [`${tile.i},${tile.j}`, tile]));
    const desired = new Map();
    const minI = Math.max(0, Math.floor((camera.position.x - radius + WORLD_HALF) / CHUNK_METRES));
    const maxI = Math.min(79, Math.floor((camera.position.x + radius + WORLD_HALF) / CHUNK_METRES));
    const minJ = Math.max(0, Math.floor((camera.position.z - radius + WORLD_HALF) / CHUNK_METRES));
    const maxJ = Math.min(79, Math.floor((camera.position.z + radius + WORLD_HALF) / CHUNK_METRES));
    for (let j = minJ; j <= maxJ; j += 1) {
      for (let i = minI; i <= maxI; i += 1) {
        const x = -WORLD_HALF + (i + 0.5) * CHUNK_METRES;
        const z = -WORLD_HALF + (j + 0.5) * CHUNK_METRES;
        const distance = Math.hypot(x - camera.position.x, z - camera.position.z);
        if (distance <= radius + CHUNK_METRES * 0.72) {
          const activeRecord = availableTiles.get(`${i},${j}`);
          if (activeRecord?.tile) desired.set(`${i},${j}`, { tile: activeRecord.tile, distance });
        }
      }
    }

    for (const [key, record] of [...records]) {
      const wanted = desired.get(key);
      if (!wanted) disposeRecord(record);
      else if (record.tile !== wanted.tile) enqueue(wanted.tile, wanted.distance);
    }

    const moved = !Number.isFinite(lastRebuildX) ||
      Math.hypot(camera.position.x - lastRebuildX, camera.position.z - lastRebuildZ) >= 150;
    if (moved) {
      queue = [];
      for (const [key, wanted] of desired) enqueue(wanted.tile, wanted.distance);
      lastRebuildX = camera.position.x;
      lastRebuildZ = camera.position.z;
    } else {
      for (const [key, wanted] of desired) {
        const record = records.get(key);
        if (!record) enqueue(wanted.tile, wanted.distance);
      }
    }

    let built = 0;
    while (built < buildBudget && queue.length > 0) {
      const task = queue.shift();
      const wanted = desired.get(task.key);
      if (!wanted || wanted.tile !== task.tile) continue;
      const old = records.get(task.key);
      const available = Math.max(0, quality.vegetationTriangleBudget - vegetationTriangles + (old?.vegetationTriangles ?? 0));
      const next = buildChunk(task.tile, camera, available);
      if (old) disposeRecord(old);
      records.set(task.key, next);
      // group is attached to the scene by the caller's shared detail group.
      detailGroup.add(next.group);
      vegetationTriangles += next.vegetationTriangles;
      resourceTriangles += next.resourceTriangles;
      statsDirty = true;
      built += 1;
    }
    if (statsDirty) {
      console.log(`living ground: ${records.size} chunks, ${vegetationTriangles.toLocaleString("en-US")} vegetation tris, ${resourceTriangles.toLocaleString("en-US")} resource tris`);
      statsDirty = false;
    }
    return built;
  }

  const detailGroup = new THREE.Group();

  function estimateTriangleCountForBiome(biomeId, preset) {
    const rules = biomeConfig[biomeId]?.vegetation ?? [];
    const radius = preset.vegetationRadius;
    const area = (r0, r1) => Math.PI * Math.max(0, Math.min(radius, r1) ** 2 - Math.min(radius, r0) ** 2) / 10000;
    const nearStart = preset.vegetationNearFadeStart;
    const nearEnd = preset.vegetationNearEnd;
    const midEnd = preset.vegetationMidEnd;
    const midFadeEnd = preset.vegetationMidFadeEnd;
    const bands = [
      { area: area(0, nearStart), levels: ["near"] },
      { area: area(nearStart, nearEnd), levels: ["near", "simple"] },
      { area: area(nearEnd, midEnd), levels: ["simple"] },
      { area: area(midEnd, midFadeEnd), levels: ["simple", "card"] },
      { area: area(midFadeEnd, radius), levels: ["card"] },
    ];
    let triangles = 0;
    for (const rule of rules) {
      for (const band of bands) {
        const count = rule.per_hectare * band.area * (rule.coverage ?? 1) * (preset.vegetationDensityScale ?? 1);
        for (const level of band.levels) {
          const geometry = makeGeometry(THREE, rule.kind, level);
          triangles += count * (geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3);
          geometry.dispose();
        }
      }
    }
    return Math.round(Math.min(triangles, preset.vegetationTriangleBudget));
  }

  function estimateTriangleCountAt(x, z, preset) {
    const biomeName = terrain.biomeAt?.(x, z);
    const biomeId = biomesByIndex.find((biome) => biome.name === biomeName)?.id ?? "savannah_grassland";
    return estimateTriangleCountForBiome(biomeId, preset);
  }

  function setQuality(nextQuality) {
    quality = nextQuality;
    resourceSystem?.setCacheLimit(nextQuality.resourceChunkCacheLimit);
    for (const record of [...records.values()]) disposeRecord(record);
    queue = [];
    lastRebuildX = NaN;
    lastRebuildZ = NaN;
  }

  return {
    group: detailGroup,
    update,
    setQuality,
    resourcesNear: (x, z, radius) => resourceSystem?.resourcesNear(x, z, radius) ?? [],
    getTriangleCount: () => vegetationTriangles + resourceTriangles,
    getVegetationTriangleCount: () => vegetationTriangles,
    getResourceTriangleCount: () => resourceTriangles,
    getResourceNodeCount: () => [...records.values()].reduce((sum, record) => sum + record.nodes.length, 0),
    estimateTriangleCountAt,
    estimateTriangleCountForBiome,
    dispose() {
      for (const record of [...records.values()]) disposeRecord(record);
      for (const geometry of geometries.values()) geometry.dispose();
      for (const material of materials.values()) material.dispose();
      resourceSystem?.dispose();
    },
  };
}
