import { performance } from "node:perf_hooks";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMasterMaps } from "./maps.mjs";
import { writeTiles } from "./writer.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inputDir = join(repoRoot, "public", "terrain", "great_lakes");
const outputDir = join(inputDir, "tiles");

async function main() {
  const started = performance.now();
  const maps = await loadMasterMaps(inputDir);
  console.log(`Loaded height map: ${maps.heightPath}`);
  console.log(`Loaded biome map: ${maps.biomePath}`);
  console.log("Writing deterministic terrain tiles...");

  const result = await writeTiles(outputDir, maps);
  const elapsedSeconds = ((performance.now() - started) / 1000).toFixed(2);
  console.log("");
  console.log("Terrain tiler summary");
  console.log("---------------------");
  console.log(`Chunks: ${80 * 80} per LOD; ${80 * 80 * 4} chunk-LOD tiles total`);
  for (const [lod, stats] of Object.entries(result.perLod)) {
    console.log(`LOD ${lod}: ${stats.chunks} chunks, ${stats.fileCount} files, ${stats.bytes.toLocaleString("en-US")} bytes`);
  }
  console.log(`Far view: 251 x 251 samples, 2 files, ${result.farBytes.toLocaleString("en-US")} bytes`);
  console.log(`Resource density: 401 x 401 samples at 50 m, ${result.densityIndexBytes.toLocaleString("en-US")} byte index`);
  console.log(`Files: ${result.fileCount.toLocaleString("en-US")} total including both index.json files (${result.binaryFileCount.toLocaleString("en-US")} binary files)`);
  console.log(`Bytes: ${result.totalBytes.toLocaleString("en-US")} total including index.json (${result.binaryBytes.toLocaleString("en-US")} binary bytes)`);
  console.log(`Master elevation range: ${maps.minElevationM.toFixed(2)}–${maps.maxElevationM.toFixed(2)} m`);
  console.log(`Elapsed: ${elapsedSeconds} seconds`);
}

main().catch((error) => {
  console.error(`Terrain tiler failed: ${error.message}`);
  process.exitCode = 1;
});
