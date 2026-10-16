import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const GRID_SAMPLES = 2001;
export const GRID_CELLS = GRID_SAMPLES - 1;
export const CELL_METRES = 10;
export const CHUNK_METRES = 250;
export const CHUNK_CELLS = CHUNK_METRES / CELL_METRES;
export const CHUNKS_PER_SIDE = GRID_CELLS / CHUNK_CELLS;
export const LODS = [64, 32, 16, 8];
export const FAR_STEP = 8;
export const FAR_SAMPLES = (GRID_CELLS / FAR_STEP) + 1;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readRequiredFile(filePath, expectedBytes = null) {
  let buffer;
  try {
    buffer = await readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Missing required input file: ${filePath}`);
    }
    throw error;
  }

  if (expectedBytes !== null && buffer.byteLength !== expectedBytes) {
    throw new Error(
      `Invalid input file size for ${filePath}: expected ${expectedBytes} bytes, got ${buffer.byteLength} bytes.`,
    );
  }
  return buffer;
}

export async function loadMasterMaps(inputDir) {
  const terrainPath = join(inputDir, "terrain.json");
  const terrainBuffer = await readRequiredFile(terrainPath);
  let terrain;
  try {
    terrain = JSON.parse(terrainBuffer.toString("utf8"));
  } catch (error) {
    throw new Error(`Could not parse ${terrainPath}: ${error.message}`);
  }

  assert(
    Array.isArray(terrain.samples) &&
      terrain.samples.length === 2 &&
      terrain.samples[0] === GRID_SAMPLES &&
      terrain.samples[1] === GRID_SAMPLES,
    `${terrainPath} must declare samples [${GRID_SAMPLES}, ${GRID_SAMPLES}].`,
  );
  assert(terrain.cell_m === CELL_METRES, `${terrainPath} must declare cell_m = ${CELL_METRES}.`);
  assert(terrain.chunk_m === CHUNK_METRES, `${terrainPath} must declare chunk_m = ${CHUNK_METRES}.`);
  assert(
    Array.isArray(terrain.chunks) &&
      terrain.chunks[0] === CHUNKS_PER_SIDE &&
      terrain.chunks[1] === CHUNKS_PER_SIDE,
    `${terrainPath} must declare chunks [${CHUNKS_PER_SIDE}, ${CHUNKS_PER_SIDE}].`,
  );

  const heightName = terrain.elevation?.file;
  const biomeName = terrain.maps?.biome?.file;
  assert(typeof heightName === "string" && heightName.length > 0, `${terrainPath} is missing elevation.file.`);
  assert(typeof biomeName === "string" && biomeName.length > 0, `${terrainPath} is missing maps.biome.file.`);

  const sampleCount = GRID_SAMPLES * GRID_SAMPLES;
  const heightPath = join(inputDir, heightName);
  const biomePath = join(inputDir, biomeName);
  const [heightBuffer, biomeBuffer] = await Promise.all([
    readRequiredFile(heightPath, sampleCount * 2),
    readRequiredFile(biomePath, sampleCount),
  ]);

  let minElevationM = Infinity;
  let maxElevationM = -Infinity;
  for (let offset = 0; offset < heightBuffer.length; offset += 2) {
    const raw = heightBuffer.readUInt16LE(offset);
    const elevationM = 900 + (raw / 65535) * 4400;
    if (elevationM < minElevationM) minElevationM = elevationM;
    if (elevationM > maxElevationM) maxElevationM = elevationM;
  }

  return {
    terrain,
    heightBuffer,
    biomeBuffer,
    heightPath,
    biomePath,
    minElevationM,
    maxElevationM,
  };
}
