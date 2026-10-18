import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CHUNKS_PER_SIDE, FAR_SAMPLES, LODS } from "./maps.mjs";
import { buildChunkBuffers, buildFarBuffers, buildWaterChunkBuffer } from "./sampling.mjs";

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createIndex(binaryFileCount, binaryBytes, perLod, farBytes, waterIndexBytes = 0) {
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
      fileCount: binaryFileCount + 1,
      bytes: 0,
      binaryFileCount,
      binaryBytes,
      waterIndexBytes,
      includesIndexJson: true,
    },
  };

  // The index reports its own size. Iterate until the serialized byte count is
  // stable (the total's digit count is the only value that can affect it).
  let indexBytes = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    index.totals.bytes = binaryBytes + waterIndexBytes + indexBytes;
    const nextSize = jsonBytes(index).byteLength;
    if (nextSize === indexBytes) break;
    indexBytes = nextSize;
  }
  index.totals.bytes = binaryBytes + waterIndexBytes + indexBytes;
  const serialized = jsonBytes(index);
  index.totals.bytes = binaryBytes + waterIndexBytes + serialized.byteLength;
  const finalSerialized = jsonBytes(index);
  if (finalSerialized.byteLength !== serialized.byteLength) {
    index.totals.bytes = binaryBytes + waterIndexBytes + finalSerialized.byteLength;
  }
  return { index, buffer: jsonBytes(index) };
}

export async function writeTiles(outputDir, maps) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const binary = { fileCount: 0, bytes: 0 };
  const waterIndex = { version: 1, encoding: "uint16 little-endian; 0 = no water", lods: Object.fromEntries(LODS.map((lod) => [lod, []])) };
  const perLod = {};
  for (const quads of LODS) {
    let lodFileCount = 0;
    let lodBytes = 0;
    const lodRoot = join(outputDir, `lod_${quads}`);
    await mkdir(lodRoot, { recursive: true });

    for (let j = 0; j < CHUNKS_PER_SIDE; j += 1) {
      for (let i = 0; i < CHUNKS_PER_SIDE; i += 1) {
        const { height, biome } = buildChunkBuffers(maps.heightBuffer, maps.biomeBuffer, i, j, quads);
        const water = maps.waterBuffer ? buildWaterChunkBuffer(maps.waterBuffer, i, j, quads) : null;
        const chunkDir = join(lodRoot, `chunk_${i}_${j}`);
        await mkdir(chunkDir, { recursive: true });
        await writeFile(join(chunkDir, "height_u16.bin"), height);
        await writeFile(join(chunkDir, "biome_u8.bin"), biome);
        lodFileCount += 2;
        lodBytes += height.byteLength + biome.byteLength;
        if (water) {
          await writeFile(join(chunkDir, "water_u16.bin"), water);
          waterIndex.lods[quads].push([i, j]);
          lodFileCount += 1;
          lodBytes += water.byteLength;
          binary.fileCount += 1;
          binary.bytes += water.byteLength;
        }
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

  const waterIndexBuffer = jsonBytes(waterIndex);
  await writeFile(join(outputDir, "water_index.json"), waterIndexBuffer);
  const { index, buffer: indexBuffer } = createIndex(
    binary.fileCount,
    binary.bytes,
    perLod,
    far.height.byteLength + far.biome.byteLength,
    waterIndexBuffer.byteLength,
  );
  // Reconcile totals exactly with the bytes written, including index.json.
  index.totals.fileCount = binary.fileCount + 2;
  index.totals.binaryFileCount = binary.fileCount;
  index.totals.binaryBytes = binary.bytes;
  index.totals.includesIndexJson = true;
  let indexBytes = indexBuffer.byteLength;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    index.totals.bytes = binary.bytes + waterIndexBuffer.byteLength + indexBytes;
    const next = jsonBytes(index).byteLength;
    if (next === indexBytes) break;
    indexBytes = next;
  }
  index.totals.bytes = binary.bytes + waterIndexBuffer.byteLength + indexBytes;
  const finalIndexBuffer = jsonBytes(index);
  if (finalIndexBuffer.byteLength !== indexBytes) {
    index.totals.bytes = binary.bytes + waterIndexBuffer.byteLength + finalIndexBuffer.byteLength;
  }
  const stableIndexBuffer = jsonBytes(index);
  await writeFile(join(outputDir, "index.json"), stableIndexBuffer);

  return {
    binaryFileCount: binary.fileCount,
    binaryBytes: binary.bytes,
    fileCount: binary.fileCount + 1,
    totalBytes: binary.bytes + waterIndexBuffer.byteLength + stableIndexBuffer.byteLength,
    waterChunksByLod: Object.fromEntries(LODS.map((lod) => [lod, waterIndex.lods[lod].length])),
    waterFileCount: Object.values(waterIndex.lods).reduce((sum, list) => sum + list.length, 0),
    perLod,
    farBytes: far.height.byteLength + far.biome.byteLength,
    indexBytes: stableIndexBuffer.byteLength,
  };
}
