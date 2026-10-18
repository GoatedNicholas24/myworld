const GRID_SAMPLES = 2001;

function expectedBytes(quads, kind) {
  const samples = quads + 1;
  return samples * samples * (kind === "height" ? 2 : 1);
}

const MISSING_TILES_MESSAGE = "Terrain tiles not generated. Run: python3 tools/terrain/generate.py then node tools/tiler/tile.mjs";

async function fetchArrayBuffer(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "";
  const preview = new TextDecoder().decode(buffer.slice(0, 64)).trimStart().toLowerCase();
  if (contentType.includes("text/html") || preview.startsWith("<!doctype html") || preview.startsWith("<html")) {
    throw new Error(MISSING_TILES_MESSAGE);
  }
  return buffer;
}

// Decoded tile buffers are kept in a small LRU. Active meshes keep their own
// reference, so evicting a cache entry never invalidates a visible chunk.
export class TileCache {
  constructor(limit = 24) {
    this.limit = limit;
    this.tiles = new Map();
  }

  key(i, j, lod) {
    return `${lod}/${i}/${j}`;
  }

  get(i, j, lod) {
    const key = this.key(i, j, lod);
    const tile = this.tiles.get(key);
    if (!tile) return null;
    this.tiles.delete(key);
    this.tiles.set(key, tile);
    return tile;
  }

  remember(i, j, lod, tile) {
    const key = this.key(i, j, lod);
    this.tiles.delete(key);
    this.tiles.set(key, tile);
    while (this.tiles.size > this.limit) {
      const oldest = this.tiles.keys().next().value;
      this.tiles.delete(oldest);
    }
    return tile;
  }

  async load(root, i, j, lod, signal, hasWater = false) {
    const cached = this.get(i, j, lod);
    if (cached) return cached;

    const directory = `${root}/lod_${lod}/chunk_${i}_${j}`;
    const heightUrl = `${directory}/height_u16.bin`;
    const biomeUrl = `${directory}/biome_u8.bin`;
    const [heightBuffer, biomeBuffer, waterBuffer] = await Promise.all([
      fetchArrayBuffer(heightUrl, signal),
      fetchArrayBuffer(biomeUrl, signal),
      hasWater ? fetchArrayBuffer(directory + "/water_u16.bin", signal) : Promise.resolve(null),
    ]);

    const heightExpected = expectedBytes(lod, "height");
    const biomeExpected = expectedBytes(lod, "biome");
    if (heightBuffer.byteLength !== heightExpected) {
      throw new Error(`${heightUrl}: expected ${heightExpected} bytes, received ${heightBuffer.byteLength}`);
    }
    if (biomeBuffer.byteLength !== biomeExpected) {
      throw new Error(`${biomeUrl}: expected ${biomeExpected} bytes, received ${biomeBuffer.byteLength}`);
    }
    if (waterBuffer && waterBuffer.byteLength !== heightExpected) {
      throw new Error(`water_u16.bin for chunk (${i},${j}) LOD ${lod}: expected ${heightExpected} bytes, received ${waterBuffer.byteLength}`);
    }

    // The tile format is uint16 little-endian. The target browsers use
    // little-endian typed arrays, matching the binary files written by T004.
    const tile = {
      i,
      j,
      lod,
      heights: new Uint16Array(heightBuffer),
      biomes: new Uint8Array(biomeBuffer),
      water: waterBuffer ? new Uint16Array(waterBuffer) : null,
    };
    return this.remember(i, j, lod, tile);
  }

  clear() {
    this.tiles.clear();
  }
}

export function decodeElevation(raw) {
  return 900 + (raw / 65535) * 4400;
}

export function bilinearRaw(samples, width, height, x, y) {
  const px = Math.max(0, Math.min(width - 1, x));
  const py = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = px - x0;
  const fy = py - y0;
  const top = samples[y0 * width + x0] * (1 - fx) + samples[y0 * width + x1] * fx;
  const bottom = samples[y1 * width + x0] * (1 - fx) + samples[y1 * width + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}
