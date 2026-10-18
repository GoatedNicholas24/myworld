import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHUNKS_PER_SIDE, FAR_SAMPLES, GRID_SAMPLES, LODS, loadMasterMaps } from "./maps.mjs";
import { buildWaterChunkBuffer } from "./sampling.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inputDir = join(repoRoot, "public", "terrain", "great_lakes");
const tileRoot = join(inputDir, "tiles");
const errors = [];
const checks = { chunkFiles: 0, neighbourEdges: 0, corners: 0, densityFiles: 0, densitySamples: 0 };

function fail(message) {
  errors.push(message);
}

function equalBytes(a, b) {
  return a.length === b.length && a.equals(b);
}

function heightEdge(buffer, quads, side) {
  const samples = quads + 1;
  const edge = Buffer.alloc(samples * 2);
  for (let n = 0; n < samples; n += 1) {
    let sampleIndex;
    if (side === "north") sampleIndex = n;
    else if (side === "south") sampleIndex = quads * samples + n;
    else if (side === "west") sampleIndex = n * samples;
    else sampleIndex = n * samples + quads;
    buffer.copy(edge, n * 2, sampleIndex * 2, sampleIndex * 2 + 2);
  }
  return edge;
}

function biomeEdge(buffer, quads, side) {
  const samples = quads + 1;
  const edge = Buffer.alloc(samples);
  for (let n = 0; n < samples; n += 1) {
    let sampleIndex;
    if (side === "north") sampleIndex = n;
    else if (side === "south") sampleIndex = quads * samples + n;
    else if (side === "west") sampleIndex = n * samples;
    else sampleIndex = n * samples + quads;
    edge[n] = buffer[sampleIndex];
  }
  return edge;
}

function masterHeight(maps, x, y) {
  return maps.heightBuffer.readUInt16LE((y * GRID_SAMPLES + x) * 2);
}
function masterBiome(maps, x, y) {
  return maps.biomeBuffer[y * GRID_SAMPLES + x];
}

function expectedDensity50m(source, row, col) {
  let total = 0;
  for (let dy = -2; dy <= 2; dy += 1) {
    const sourceRow = Math.max(0, Math.min(2000, row * 5 + dy));
    for (let dx = -2; dx <= 2; dx += 1) {
      const sourceCol = Math.max(0, Math.min(2000, col * 5 + dx));
      total += source[sourceRow * GRID_SAMPLES + sourceCol];
    }
  }
  return Math.round(total / 25);
}

async function checkLod(maps, quads) {
  const samples = quads + 1;
  const expectedHeightBytes = samples * samples * 2;
  const expectedBiomeBytes = samples * samples;
  let previousRowBottoms = new Map();

  for (let j = 0; j < CHUNKS_PER_SIDE; j += 1) {
    const currentRowBottoms = new Map();
    let previousRight = null;
    for (let i = 0; i < CHUNKS_PER_SIDE; i += 1) {
      const chunkDir = join(tileRoot, `lod_${quads}`, `chunk_${i}_${j}`);
      const heightPath = join(chunkDir, "height_u16.bin");
      const biomePath = join(chunkDir, "biome_u8.bin");
      let height;
      let biome;
      try {
        [height, biome] = await Promise.all([readFile(heightPath), readFile(biomePath)]);
      } catch (error) {
        fail(`LOD ${quads} chunk (${i},${j}) missing/unreadable: ${error.message}`);
        continue;
      }
      if (height.byteLength !== expectedHeightBytes) {
        fail(`${heightPath}: expected ${expectedHeightBytes} bytes, got ${height.byteLength}`);
        continue;
      }
      if (biome.byteLength !== expectedBiomeBytes) {
        fail(`${biomePath}: expected ${expectedBiomeBytes} bytes, got ${biome.byteLength}`);
        continue;
      }
      checks.chunkFiles += 2;

      const edges = {
        northH: heightEdge(height, quads, "north"),
        southH: heightEdge(height, quads, "south"),
        westH: heightEdge(height, quads, "west"),
        eastH: heightEdge(height, quads, "east"),
        northB: biomeEdge(biome, quads, "north"),
        southB: biomeEdge(biome, quads, "south"),
        westB: biomeEdge(biome, quads, "west"),
        eastB: biomeEdge(biome, quads, "east"),
      };

      if (previousRight) {
        if (!equalBytes(previousRight.height, edges.westH) || !equalBytes(previousRight.biome, edges.westB)) {
          fail(`LOD ${quads}: horizontal edge mismatch between chunks (${i - 1},${j}) and (${i},${j})`);
        }
        checks.neighbourEdges += 1;
      }
      previousRight = { height: edges.eastH, biome: edges.eastB };

      const above = previousRowBottoms.get(i);
      if (above) {
        if (!equalBytes(above.height, edges.northH) || !equalBytes(above.biome, edges.northB)) {
          fail(`LOD ${quads}: vertical edge mismatch between chunks (${i},${j - 1}) and (${i},${j})`);
        }
        checks.neighbourEdges += 1;
      }
      currentRowBottoms.set(i, { height: edges.southH, biome: edges.southB });

      const x0 = i * 25;
      const y0 = j * 25;
      const x1 = x0 + 25;
      const y1 = y0 + 25;
      const corners = [
        [0, 0, x0, y0],
        [quads, 0, x1, y0],
        [0, quads, x0, y1],
        [quads, quads, x1, y1],
      ];
      for (const [cx, cy, mx, my] of corners) {
        const tileIndex = cy * samples + cx;
        const tileHeight = height.readUInt16LE(tileIndex * 2);
        const tileBiome = biome[tileIndex];
        if (tileHeight !== masterHeight(maps, mx, my) || tileBiome !== masterBiome(maps, mx, my)) {
          fail(`LOD ${quads} chunk (${i},${j}) corner (${cx},${cy}) does not match master sample (${mx},${my})`);
        }
        checks.corners += 1;
      }

      if (i === 0 && j === 0) {
        if (height.readUInt16LE(0) !== masterHeight(maps, 0, 0) || biome[0] !== masterBiome(maps, 0, 0)) {
          fail(`LOD ${quads} north-west chunk does not start at master sample (0,0)`);
        }
      }
      if (i === CHUNKS_PER_SIDE - 1 && j === CHUNKS_PER_SIDE - 1) {
        const last = samples * samples - 1;
        if (height.readUInt16LE(last * 2) !== masterHeight(maps, 2000, 2000) || biome[last] !== masterBiome(maps, 2000, 2000)) {
          fail(`LOD ${quads} south-east chunk does not end at master sample (2000,2000)`);
        }
      }
    }
    previousRowBottoms = currentRowBottoms;
  }
}

async function listFiles(dir) {
  const results = [];
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...await listFiles(fullPath));
    else if (entry.isFile()) results.push(fullPath);
  }
  return results;
}

async function hashSortedFileList(files) {
  const hash = createHash("sha256");
  const sorted = [...files].sort((a, b) => { const left = relative(tileRoot, a); const right = relative(tileRoot, b); return left < right ? -1 : left > right ? 1 : 0; });
  for (const file of sorted) {
    const rel = relative(tileRoot, file).split("\\").join("/");
    const contents = await readFile(file);
    const fileHash = createHash("sha256").update(contents).digest("hex");
    hash.update(rel).update("\0").update(fileHash).update("\n");
  }
  return hash.digest("hex");
}

async function checkWaterTiles(maps) {
  const indexPath = join(tileRoot, "water_index.json");
  let index;
  try { index = JSON.parse(await readFile(indexPath, "utf8")); }
  catch (error) { fail("Missing or invalid water_index.json: " + error.message); return; }
  const expectedLods = {};
  for (const quads of LODS) {
    const listed = new Set((index.lods?.[quads] ?? []).map(([i, j]) => i + "," + j));
    const expected = new Set();
    if (maps.waterBuffer) {
      for (let j = 0; j < CHUNKS_PER_SIDE; j++) for (let i = 0; i < CHUNKS_PER_SIDE; i++) {
        const buffer = buildWaterChunkBuffer(maps.waterBuffer, i, j, quads);
        const path = join(tileRoot, "lod_" + quads, "chunk_" + i + "_" + j, "water_u16.bin");
        const key = i + "," + j;
        if (buffer) {
          expected.add(key);
          const actual = await readFile(path).catch(() => null);
          if (!actual) fail("Missing water tile " + path);
          else if (!actual.equals(buffer)) fail("Water tile samples mismatch: " + path);
        } else if (await readFile(path).then(() => true).catch(() => false)) fail("Dry chunk should not have a water file: " + path);
      }
    }
    if (expected.size !== listed.size || [...expected].some((key) => !listed.has(key))) fail("water_index.json wet chunk list does not match LOD " + quads);
    expectedLods[quads] = expected.size;
  }
  console.log("Checked water chunks by LOD:", expectedLods);
}

async function main() {
  const maps = await loadMasterMaps(inputDir);
  const indexPath = join(tileRoot, "index.json");
  let index;
  try {
    index = JSON.parse(await readFile(indexPath, "utf8"));
  } catch (error) {
    throw new Error(`Missing or invalid tiles/index.json: ${error.message}`);
  }

  for (const quads of LODS) await checkLod(maps, quads);
  await checkWaterTiles(maps);

  const densityRoot = join(tileRoot, "density");
  let densityIndex;
  try {
    densityIndex = JSON.parse(await readFile(join(densityRoot, "index.json"), "utf8"));
  } catch (error) {
    fail(`Missing or invalid tiles/density/index.json: ${error.message}`);
  }
  if (densityIndex) {
    if (densityIndex.samples?.[0] !== 401 || densityIndex.samples?.[1] !== 401) {
      fail("tiles/density/index.json samples must be [401,401]");
    }
    if (densityIndex.cell_m !== 50) fail("tiles/density/index.json cell_m must be 50");
    for (const [id, { definition, buffer: source }] of Object.entries(maps.densityMaps ?? {})) {
      const fileName = `density_50m_${id}_u8.bin`;
      const filePath = join(densityRoot, fileName);
      const output = await readFile(filePath).catch(() => null);
      if (!output || output.byteLength !== 401 * 401) {
        fail(`tiles/density/${fileName}: expected ${401 * 401} bytes`);
        continue;
      }
      checks.densityFiles += 1;
      const entry = densityIndex.resources?.[id];
      if (!entry) fail(`tiles/density/index.json is missing resource ${id}`);
      else {
        if (entry.file !== fileName) fail(`density index file mismatch for ${id}`);
        if (entry.density_per_km2 !== definition.density_per_km2) fail(`density_per_km2 mismatch for ${id}`);
        if (entry.min_spacing_m !== definition.min_spacing_m) fail(`min_spacing_m mismatch for ${id}`);
        if (entry.samples?.[0] !== 401 || entry.samples?.[1] !== 401) fail(`sample dimensions mismatch for ${id}`);
      }
      for (let row = 0; row < 401; row += 1) {
        for (let col = 0; col < 401; col += 1) {
          const expected = expectedDensity50m(source, row, col);
          if (output[row * 401 + col] !== expected) {
            fail(`density map ${id} sample (${col},${row}) differs from expected 5 x 5 average`);
            row = 401;
            break;
          }
          checks.densitySamples += 1;
        }
      }
    }
  }

  const farHeightPath = join(tileRoot, "far", "height_u16.bin");
  const farBiomePath = join(tileRoot, "far", "biome_u8.bin");
  const farHeight = await readFile(farHeightPath).catch(() => null);
  const farBiome = await readFile(farBiomePath).catch(() => null);
  const farHeightExpected = FAR_SAMPLES * FAR_SAMPLES * 2;
  const farBiomeExpected = FAR_SAMPLES * FAR_SAMPLES;
  if (!farHeight || farHeight.byteLength !== farHeightExpected) {
    fail(`far/height_u16.bin: expected ${farHeightExpected} bytes`);
  }
  if (!farBiome || farBiome.byteLength !== farBiomeExpected) {
    fail(`far/biome_u8.bin: expected ${farBiomeExpected} bytes`);
  }
  if (farHeight && farBiome && farHeight.byteLength === farHeightExpected && farBiome.byteLength === farBiomeExpected) {
    for (let row = 0; row < FAR_SAMPLES; row += 1) {
      for (let col = 0; col < FAR_SAMPLES; col += 1) {
        const tileIndex = row * FAR_SAMPLES + col;
        const masterIndex = (row * 8) * GRID_SAMPLES + col * 8;
        if (farHeight.readUInt16LE(tileIndex * 2) !== maps.heightBuffer.readUInt16LE(masterIndex * 2)) {
          fail(`far height sample (${col},${row}) differs from master sample (${col * 8},${row * 8})`);
          row = FAR_SAMPLES;
          break;
        }
        if (farBiome[tileIndex] !== maps.biomeBuffer[masterIndex]) {
          fail(`far biome sample (${col},${row}) differs from master sample (${col * 8},${row * 8})`);
          row = FAR_SAMPLES;
          break;
        }
      }
    }
  }

  const allFiles = await listFiles(tileRoot);
  let actualBytes = 0;
  for (const file of allFiles) actualBytes += (await stat(file)).size;
  if (index.chunks?.[0] !== CHUNKS_PER_SIDE || index.chunks?.[1] !== CHUNKS_PER_SIDE) fail("index.json chunks must be [80,80]");
  if (JSON.stringify(index.lods) !== JSON.stringify(LODS)) fail("index.json lods do not match [64,32,16,8]");
  if (index.far?.samples !== FAR_SAMPLES) fail("index.json far.samples must be 251");
  if (index.totals?.fileCount !== allFiles.length) fail(`index.json fileCount says ${index.totals?.fileCount}, found ${allFiles.length}`);
  if (index.totals?.bytes !== actualBytes) fail(`index.json bytes says ${index.totals?.bytes}, found ${actualBytes}`);

  if (errors.length) {
    console.error(`FAIL: ${errors.length} problem(s)`);
    for (const error of errors.slice(0, 50)) console.error(`- ${error}`);
    if (errors.length > 50) console.error(`... and ${errors.length - 50} more`);
    process.exitCode = 1;
    return;
  }

  const digest = await hashSortedFileList(allFiles);
  console.log("PASS");
  console.log(`Checked ${checks.chunkFiles.toLocaleString("en-US")} chunk files across all LODs.`);
  console.log(`Checked ${checks.neighbourEdges.toLocaleString("en-US")} horizontal/vertical neighbour edges.`);
  console.log(`Checked ${checks.corners.toLocaleString("en-US")} chunk corners against the master maps.`);
  console.log(`Checked ${checks.densityFiles.toLocaleString("en-US")} compact density maps and ${checks.densitySamples.toLocaleString("en-US")} box-average samples.`);
  console.log(`Checked far-view sample grid and all ${allFiles.length.toLocaleString("en-US")} output files (${actualBytes.toLocaleString("en-US")} bytes).`);
  console.log(`SHA256(sorted relative paths + file SHA256s): ${digest}`);
}

main().catch((error) => {
  console.error(`Terrain tile verification failed: ${error.message}`);
  process.exitCode = 1;
});
