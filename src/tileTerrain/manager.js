import { TileCache, bilinearRaw, decodeElevation } from "./tileCache.js";
import { createFarMesh, createTileMesh, updateTileNormals } from "./geometry.js";
import { createWaterSystem } from "./water.js";

const WORLD_SIZE = 20000;
const WORLD_HALF = WORLD_SIZE / 2;
const CHUNK_METRES = 250;
const CHUNKS_PER_SIDE = 80;
const FAR_SAMPLES = 251;
const MAX_CONCURRENT_FETCHES = 4;
const MAX_BUILDS_PER_FRAME = 2;
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

async function fetchBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
  return response.arrayBuffer();
}

function expectSize(buffer, expected, url) {
  if (buffer.byteLength !== expected) {
    throw new Error(`${url}: expected ${expected} bytes, received ${buffer.byteLength}`);
  }
}

function formatTerrainStats(counts, farTriangles, total) {
  return `terrain: LOD64 ${counts[64]} chunks, LOD32 ${counts[32]}, LOD16 ${counts[16]}, LOD8 ${counts[8]}, far ${farTriangles.toLocaleString("en-US")} tris, total ${total.toLocaleString("en-US")} tris`;
}

export async function createTileTerrain({ THREE, world, quality }) {
  const tileRoot = String(world.terrain.tileRoot ?? "/terrain/great_lakes/tiles").replace(/\/$/, "");
  const terrainRoot = tileRoot.replace(/\/tiles$/, "");
  const metadataUrl = `${terrainRoot}/terrain.json`;
  const metadataResponse = await fetch(metadataUrl);
  if (!metadataResponse.ok) throw new Error(`HTTP ${metadataResponse.status} while fetching ${metadataUrl}`);
  const metadata = await metadataResponse.json();
  if (!Array.isArray(metadata.samples) || metadata.samples[0] !== 2001 || metadata.samples[1] !== 2001) {
    throw new Error(`${metadataUrl} must describe a 2001 x 2001 master grid`);
  }
  if (!Array.isArray(metadata.biomes) || metadata.biomes.length === 0) {
    throw new Error(`${metadataUrl} does not list biome paint colours`);
  }

  let waterIndex = { lods: {} };
  try {
    const response = await fetch(tileRoot + "/water_index.json");
    if (response.ok) waterIndex = await response.json();
  } catch (error) {
    console.warn("water: water index unavailable; water tiles skipped.", error.message);
  }
  const waterChunks = new Map([64, 32, 16, 8].map((lod) => [lod, new Set((waterIndex.lods?.[lod] ?? []).map(([i, j]) => i + "," + j))]));

  const farHeightUrl = `${tileRoot}/far/height_u16.bin`;
  const farBiomeUrl = `${tileRoot}/far/biome_u8.bin`;
  const [farHeightBuffer, farBiomeBuffer] = await Promise.all([
    fetchBuffer(farHeightUrl),
    fetchBuffer(farBiomeUrl),
  ]);
  expectSize(farHeightBuffer, FAR_SAMPLES * FAR_SAMPLES * 2, farHeightUrl);
  expectSize(farBiomeBuffer, FAR_SAMPLES * FAR_SAMPLES, farBiomeUrl);
  const farHeights = new Uint16Array(farHeightBuffer);
  const farBiomes = new Uint8Array(farBiomeBuffer);

  const paintColors = [];
  for (const biome of metadata.biomes) paintColors[biome.index] = new THREE.Color(biome.paint);

  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const cache = new TileCache(24);
  const active = new Map();
  const desired = new Map();
  const pending = new Map();
  const failed = new Set();
  let buildQueue = [];
  let currentQuality = quality;
  let lastPlanX = NaN;
  let lastPlanZ = NaN;
  let forcePlan = true;
  let statsDirty = false;
  let farMeshRecord = null;

  function activeKey(i, j) {
    return `${i},${j}`;
  }

  function cacheKey(i, j, lod) {
    return cache.key(i, j, lod);
  }

  function neighbourFor(i, j, _lod) {
    if (i < 0 || j < 0 || i >= CHUNKS_PER_SIDE || j >= CHUNKS_PER_SIDE) return null;
    // Neighbours at a different LOD still provide edge heights for normals.
    return active.get(activeKey(i, j)) ?? null;
  }

  function refreshLocalNormals(record) {
    const neighbours = [
      neighbourFor(record.i - 1, record.j, record.lod),
      neighbourFor(record.i + 1, record.j, record.lod),
      neighbourFor(record.i, record.j - 1, record.lod),
      neighbourFor(record.i, record.j + 1, record.lod),
    ];
    updateTileNormals(THREE, record, neighbourFor, paintColors);
    for (const neighbour of neighbours) {
      if (neighbour) updateTileNormals(THREE, neighbour, neighbourFor, paintColors);
    }
  }

  function disposeRecord(record) {
    group.remove(record.mesh);
    record.mesh.geometry.dispose();
    for (const waterRecord of record.waterRecords ?? []) for (const mesh of waterRecord.meshes ?? [waterRecord.mesh]) { if (mesh) { group.remove(mesh); mesh.geometry.dispose(); } }
    active.delete(activeKey(record.i, record.j));
    for (const neighbour of [
      neighbourFor(record.i - 1, record.j, record.lod),
      neighbourFor(record.i + 1, record.j, record.lod),
      neighbourFor(record.i, record.j - 1, record.lod),
      neighbourFor(record.i, record.j + 1, record.lod),
    ]) {
      if (neighbour) updateTileNormals(THREE, neighbour, neighbourFor, paintColors);
    }
    statsDirty = true;
  }

  function printStats() {
    const counts = { 64: 0, 32: 0, 16: 0, 8: 0 };
    let tileTriangles = 0;
    for (const record of active.values()) {
      counts[record.lod] += 1;
      tileTriangles += record.triangles;
    }
    const farTriangles = farMeshRecord?.triangles ?? 0;
    const waterTriangles = [...active.values()].reduce((sum, record) => sum + (record.waterRecords ?? []).reduce((n, water) => n + (water.triangles ?? 0), 0), 0);
    console.log(formatTerrainStats(counts, farTriangles, tileTriangles + farTriangles));
    console.log("water: active triangles", waterTriangles, "across terrain chunks", active.size);
  }

  function replaceFarMesh() {
    if (farMeshRecord) {
      group.remove(farMeshRecord.mesh);
      farMeshRecord.mesh.geometry.dispose();
    }
    farMeshRecord = createFarMesh(
      THREE,
      farHeights,
      farBiomes,
      paintColors,
      material,
      currentQuality.terrainFarStride,
    );
    group.add(farMeshRecord.mesh);
    statsDirty = true;
  }

  function enqueue(task) {
    if (buildQueue.some((item) => item.key === task.key && item.lod === task.lod)) return;
    buildQueue.push(task);
    buildQueue.sort((a, b) => a.distance - b.distance);
  }

  function pumpFetches() {
    if (pending.size >= MAX_CONCURRENT_FETCHES) return;
    const candidates = [...desired.values()].sort((a, b) => a.distance - b.distance);
    for (const wanted of candidates) {
      if (pending.size >= MAX_CONCURRENT_FETCHES) break;
      const key = activeKey(wanted.i, wanted.j);
      const activeRecord = active.get(key);
      if (activeRecord?.lod === wanted.lod) continue;
      if (pending.get(key)?.lod === wanted.lod) continue;
      if (buildQueue.some((item) => item.key === key && item.lod === wanted.lod)) continue;

      const cached = cache.get(wanted.i, wanted.j, wanted.lod);
      if (cached) {
        enqueue({ key, ...wanted, tile: cached });
        continue;
      }
      const failureKey = cacheKey(wanted.i, wanted.j, wanted.lod);
      if (failed.has(failureKey)) continue;

      const controller = new AbortController();
      const entry = { lod: wanted.lod, controller };
      pending.set(key, entry);
      cache.load(tileRoot, wanted.i, wanted.j, wanted.lod, controller.signal, waterChunks.get(wanted.lod).has(wanted.i + "," + wanted.j))
        .then((tile) => {
          if (pending.get(key) !== entry) return;
          pending.delete(key);
          const latest = desired.get(key);
          if (latest && latest.lod === wanted.lod) enqueue({ key, ...latest, tile });
          pumpFetches();
        })
        .catch((error) => {
          if (pending.get(key) !== entry) return;
          pending.delete(key);
          if (error?.name !== "AbortError") {
            failed.add(failureKey);
            console.error(`terrain: could not load chunk (${wanted.i},${wanted.j}) LOD ${wanted.lod}: ${error.message}`);
          }
          pumpFetches();
        });
    }
  }

  function plan(camera) {
    const rings = currentQuality.terrainRings;
    const nextDesired = new Map();
    for (let j = 0; j < CHUNKS_PER_SIDE; j += 1) {
      for (let i = 0; i < CHUNKS_PER_SIDE; i += 1) {
        const centerX = -WORLD_HALF + (i + 0.5) * CHUNK_METRES;
        const centerZ = -WORLD_HALF + (j + 0.5) * CHUNK_METRES;
        const distance = Math.hypot(centerX - camera.position.x, centerZ - camera.position.z);
        let lod = null;
        for (let ring = 0; ring < rings.length; ring += 1) {
          if (distance <= rings[ring]) {
            lod = [64, 32, 16, 8][ring];
            break;
          }
        }
        if (lod !== null) nextDesired.set(activeKey(i, j), { i, j, lod, distance });
      }
    }

    desired.clear();
    for (const [key, value] of nextDesired) desired.set(key, value);

    for (const [key, record] of [...active]) {
      const wanted = desired.get(key);
      if (!wanted || wanted.lod !== record.lod) disposeRecord(record);
    }

    for (const [key, entry] of [...pending]) {
      const wanted = desired.get(key);
      if (!wanted || wanted.lod !== entry.lod) {
        pending.delete(key);
        entry.controller.abort();
      }
    }

    buildQueue = buildQueue.filter((task) => {
      const wanted = desired.get(task.key);
      return wanted && wanted.lod === task.lod && !active.has(task.key);
    });
    for (const [key, wanted] of desired) {
      const record = active.get(key);
      if (record?.lod === wanted.lod) continue;
      if (pending.get(key)?.lod === wanted.lod) continue;
      if (buildQueue.some((task) => task.key === key && task.lod === wanted.lod)) continue;
      const cached = cache.get(wanted.i, wanted.j, wanted.lod);
      if (cached) enqueue({ key, ...wanted, tile: cached });
    }

    lastPlanX = camera.position.x;
    lastPlanZ = camera.position.z;
    forcePlan = false;
    pumpFetches();
  }

  function worldToCandidateChunks(value) {
    const grid = clamp((value + WORLD_HALF) / CHUNK_METRES, 0, CHUNKS_PER_SIDE);
    const primary = Math.min(CHUNKS_PER_SIDE - 1, Math.floor(grid));
    const candidates = [primary];
    const nearestBoundary = Math.round(grid);
    if (nearestBoundary > 0 && nearestBoundary < CHUNKS_PER_SIDE && Math.abs(grid - nearestBoundary) < 1e-7) {
      candidates.push(nearestBoundary - 1);
    }
    return candidates;
  }

  function sampleTileHeight(record, x, z) {
    const { tile, i, j, lod } = record;
    const localX = ((x - (-WORLD_HALF + i * CHUNK_METRES)) / CHUNK_METRES) * lod;
    const localZ = ((z - (-WORLD_HALF + j * CHUNK_METRES)) / CHUNK_METRES) * lod;
    return decodeElevation(bilinearRaw(tile.heights, lod + 1, lod + 1, localX, localZ));
  }

  function heightAt(x, z) {
    const xs = worldToCandidateChunks(x);
    const zs = worldToCandidateChunks(z);
    let best = null;
    for (const j of zs) {
      for (const i of xs) {
        const record = active.get(activeKey(i, j));
        if (record && (!best || record.lod > best.lod)) best = record;
      }
    }
    if (best) return sampleTileHeight(best, x, z);

    const fx = clamp((x + WORLD_HALF) / 80, 0, FAR_SAMPLES - 1);
    const fy = clamp((z + WORLD_HALF) / 80, 0, FAR_SAMPLES - 1);
    return decodeElevation(bilinearRaw(farHeights, FAR_SAMPLES, FAR_SAMPLES, fx, fy));
  }

  const terrain = {
    heightAt, soilAt: () => 0, sandAt: () => 0, clearingAt: () => 0, grassCoverAt: () => 0,
    lakes: [], sandColor: "#8b8a68",
    isWaterAt: (x, z) => waterSystem.waterDepthAt(x, z, active) > 0,
    waterSurfaceAt: (x, z) => waterSystem.waterSurfaceAt(x, z, active),
    waterDepthAt: (x, z) => waterSystem.waterDepthAt(x, z, active),
    distanceToRiverAt: (x, z) => waterSystem.distanceToRiverAt(x, z),
    rivers: [],
  };
  const waterSystem = await createWaterSystem({ THREE, terrain, terrainRoot, quality });
  terrain.rivers = waterSystem.rivers;
  terrain.lakes = waterSystem.lakes;

  function update(camera, delta = 0) {
    if (
      forcePlan ||
      !Number.isFinite(lastPlanX) ||
      Math.hypot(camera.position.x - lastPlanX, camera.position.z - lastPlanZ) >= 20
    ) {
      plan(camera);
    }

    let built = 0;
    while (built < MAX_BUILDS_PER_FRAME && buildQueue.length > 0) {
      const task = buildQueue.shift();
      const wanted = desired.get(task.key);
      if (!wanted || wanted.lod !== task.lod || active.has(task.key)) continue;
      const tile = task.tile ?? cache.get(task.i, task.j, task.lod);
      if (!tile) continue;
      const record = createTileMesh(THREE, tile, paintColors, material, neighbourFor);
      record.waterRecords = waterSystem.buildChunk(tile, camera);
      for (const waterRecord of record.waterRecords) {
        for (const mesh of waterRecord.meshes ?? [waterRecord.mesh]) if (mesh) group.add(mesh);
      }
      active.set(task.key, record);
      group.add(record.mesh);
      refreshLocalNormals(record);
      built += 1;
      statsDirty = true;
    }

    waterSystem.update(delta);
    pumpFetches();
    if (statsDirty) {
      printStats();
      statsDirty = false;
    }
  }

  function setQuality(nextQuality) {
    if (nextQuality.name === currentQuality.name) return;
    currentQuality = nextQuality;
    waterSystem.setQuality(nextQuality);
    replaceFarMesh();
    forcePlan = true;
  }

  function dispose() {
    for (const entry of pending.values()) entry.controller.abort();
    pending.clear();
    for (const record of active.values()) {
      record.mesh.geometry.dispose();
      for (const water of record.waterRecords ?? []) for (const mesh of water.meshes ?? [water.mesh]) if (mesh) mesh.geometry.dispose();
    }
    active.clear();
    if (farMeshRecord) farMeshRecord.mesh.geometry.dispose();
    cache.clear();
    waterSystem.dispose();
    material.dispose();
  }

  replaceFarMesh();
  printStats();
  statsDirty = false;

  return {
    group,
    terrain,
    update,
    setQuality,
    dispose,
    getTriangleCount() {
      let total = farMeshRecord?.triangles ?? 0;
      for (const record of active.values()) { total += record.triangles; for (const water of record.waterRecords ?? []) total += water.triangles ?? 0; }
      return total;
    },
    getWaterTriangleCount() { return [...active.values()].reduce((sum, record) => sum + (record.waterRecords ?? []).reduce((n, water) => n + (water.triangles ?? 0), 0), 0); },
  };
}
