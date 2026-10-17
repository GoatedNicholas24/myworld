import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CHUNKS_PER_SIDE, FAR_SAMPLES, LODS } from "./maps.mjs";
import { buildChunkBuffers, buildFarBuffers } from "./sampling.mjs";

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const DENSITY_SAMPLES = 401;

function buildDensity50m(source) {
  const output = Buffer.alloc(DENSITY_SAMPLES * DENSITY_SAMPLES);
  for (let row = 0; row < DENSITY_SAMPLES; row += 1) {
    for (let col = 0; col < DENSITY_SAMPLES; col += 1) {
      let total = 0;
      // Average a centred 5 x 5 window of 10 m samples. Edge coordinates
      // clamp to the master grid so the 401 x 401 output covers the full world.
      for (let dy = -2; dy <= 2; dy += 1) {
        const sourceRow = Math.max(0, Math.min(2000, row * 5 + dy));
        for (let dx = -2; dx <= 2; dx += 1) {
          const sourceCol = Math.max(0, Math.min(2000, col * 5 + dx));
          total += source[sourceRow * 2001 + sourceCol];
        }
      }
      output[row * DENSITY_SAMPLES + col] = Math.round(total / 25);
    }
  }
  return output;
}

function createDensityIndex(maps) {
  const resources = {};
  for (const [id, { definition }] of Object.entries(maps.densityMaps ?? {})) {
    resources[id] = {
      file: `density_50m_${id}_u8.bin`,
      type: "uint8",
      samples: [DENSITY_SAMPLES, DENSITY_SAMPLES],
      cell_m: 50,
      density_per_km2: definition.density_per_km2,
      min_spacing_m: definition.min_spacing_m,
      ...(definition.review ? { review: true } : {}),
    };
  }
  return {
    version: 1,
    samples: [DENSITY_SAMPLES, DENSITY_SAMPLES],
    cell_m: 50,
    orientation: "row-major; row 0 is north; column 0 is west",
    averaging: "rounded arithmetic mean of a centred 5 x 5 window from the 10 m master map",
    resources,
  };
}

function createIndex(binaryFileCount, binaryBytes, perLod, farBytes, auxiliaryFileCount = 0, auxiliaryBytes = 0) {
  const index = {
    version: 1,
    chunks: [CHUNKS_PER_SIDE, CHUNKS_PER_SIDE],
    chunkMetres: 250,
    lods: [...LODS],
    fileNames: {
      height: "lod_<quads>/chunk_<i>_<j>/height_u16.bin",
      biome: "lod_<quads>/chunk_<i>_<j>/biome_u8.bin",
      farHeight: "far/height_u16.bin",
      farBiome: "far/biome_u8.bin",
      density: "density/density_50m_<resource_id>_u8.bin",
      densityIndex: "density/index.json",
      index: "index.json",
    },
    perLod,
    far: {
      samples: FAR_SAMPLES,
      stepMasterSamples: 8,
      heightFile: "far/height_u16.bin",
      biomeFile: "far/biome_u8.bin",
      fileCount: 2,
      bytes: farBytes,
    },
    totals: {
      fileCount: binaryFileCount + 1 + auxiliaryFileCount,
      bytes: 0,
      binaryFileCount,
      binaryBytes,
      auxiliaryFileCount,
      includesIndexJson: true,
      includesAuxiliaryJson: auxiliaryFileCount > 0,
    },
  };

  // The index reports its own size. Iterate until the serialized byte count is
  // stable (the total's digit count is the only value that can affect it).
  let indexBytes = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    index.totals.bytes = binaryBytes + auxiliaryBytes + indexBytes;
    const nextSize = jsonBytes(index).byteLength;
    if (nextSize === indexBytes) break;
    indexBytes = nextSize;
  }
  index.totals.bytes = binaryBytes + auxiliaryBytes + indexBytes;
  const serialized = jsonBytes(index);
  index.totals.bytes = binaryBytes + auxiliaryBytes + serialized.byteLength;
  const finalSerialized = jsonBytes(index);
  if (finalSerialized.byteLength !== serialized.byteLength) {
    index.totals.bytes = binaryBytes + auxiliaryBytes + finalSerialized.byteLength;
  }
  return { index, buffer: jsonBytes(index) };
}

export async function writeTiles(outputDir, maps) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const binary = { fileCount: 0, bytes: 0 };
  const perLod = {};
  for (const quads of LODS) {
    let lodFileCount = 0;
    let lodBytes = 0;
    const lodRoot = join(outputDir, `lod_${quads}`);
    await mkdir(lodRoot, { recursive: true });

    for (let j = 0; j < CHUNKS_PER_SIDE; j += 1) {
      for (let i = 0; i < CHUNKS_PER_SIDE; i += 1) {
        const { height, biome } = buildChunkBuffers(maps.heightBuffer, maps.biomeBuffer, i, j, quads);
        const chunkDir = join(lodRoot, `chunk_${i}_${j}`);
        await mkdir(chunkDir, { recursive: true });
        await writeFile(join(chunkDir, "height_u16.bin"), height);
        await writeFile(join(chunkDir, "biome_u8.bin"), biome);
        lodFileCount += 2;
        lodBytes += height.byteLength + biome.byteLength;
      }
      if ((j + 1) % 10 === 0) {
        console.log(`LOD ${quads}: completed chunk row ${j + 1}/${CHUNKS_PER_SIDE}`);
      }
    }

    perLod[quads] = {
      chunks: CHUNKS_PER_SIDE * CHUNKS_PER_SIDE,
      fileCount: lodFileCount,
      bytes: lodBytes,
    };
    binary.fileCount += lodFileCount;
    binary.bytes += lodBytes;
  }

  const far = buildFarBuffers(maps.heightBuffer, maps.biomeBuffer);
  const farDir = join(outputDir, "far");
  await mkdir(farDir, { recursive: true });
  await writeFile(join(farDir, "height_u16.bin"), far.height);
  await writeFile(join(farDir, "biome_u8.bin"), far.biome);
  binary.fileCount += 2;
  binary.bytes += far.height.byteLength + far.biome.byteLength;

  // The compact 50 m density maps keep resource placement cheap on phones.
  const densityRoot = join(outputDir, "density");
  await mkdir(densityRoot, { recursive: true });
  const densityIndex = createDensityIndex(maps);
  const densityIndexBuffer = jsonBytes(densityIndex);
  let densityBytes = 0;
  let densityFileCount = 0;
  for (const [id, { buffer }] of Object.entries(maps.densityMaps ?? {})) {
    const output = buildDensity50m(buffer);
    await writeFile(join(densityRoot, `density_50m_${id}_u8.bin`), output);
    densityBytes += output.byteLength;
    densityFileCount += 1;
  }
  await writeFile(join(densityRoot, "index.json"), densityIndexBuffer);
  binary.fileCount += densityFileCount;
  binary.bytes += densityBytes;

  const { index, buffer: indexBuffer } = createIndex(
    binary.fileCount,
    binary.bytes,
    perLod,
    far.height.byteLength + far.biome.byteLength,
    1,
    densityIndexBuffer.byteLength,
  );
  // Reconcile totals exactly with the bytes written, including index.json.
  index.totals.fileCount = binary.fileCount + 2;
  index.totals.binaryFileCount = binary.fileCount;
  index.totals.binaryBytes = binary.bytes;
  index.totals.includesIndexJson = true;
  let indexBytes = indexBuffer.byteLength;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    index.totals.bytes = binary.bytes + densityIndexBuffer.byteLength + indexBytes;
    const next = jsonBytes(index).byteLength;
    if (next === indexBytes) break;
    indexBytes = next;
  }
  index.totals.bytes = binary.bytes + densityIndexBuffer.byteLength + indexBytes;
  const finalIndexBuffer = jsonBytes(index);
  if (finalIndexBuffer.byteLength !== indexBytes) {
    index.totals.bytes = binary.bytes + densityIndexBuffer.byteLength + finalIndexBuffer.byteLength;
  }
  const stableIndexBuffer = jsonBytes(index);
  await writeFile(join(outputDir, "index.json"), stableIndexBuffer);

  return {
    binaryFileCount: binary.fileCount,
    binaryBytes: binary.bytes,
    fileCount: binary.fileCount + 2,
    totalBytes: binary.bytes + densityIndexBuffer.byteLength + stableIndexBuffer.byteLength,
    perLod,
    farBytes: far.height.byteLength + far.biome.byteLength,
    indexBytes: stableIndexBuffer.byteLength,
    densityIndexBytes: densityIndexBuffer.byteLength,
  };
}
