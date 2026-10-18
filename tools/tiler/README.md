# Great Lakes terrain tiler

A deterministic Node.js tiler with no third-party dependencies. Run these commands from the repository root.

```bash
pip install -r tools/terrain/requirements.txt
python3 tools/terrain/generate.py
node tools/tiler/tile.mjs
node tools/tiler/verify.mjs
```

The map-generation step is needed only when the master `.bin` files are absent. It writes the generated maps under `public/terrain/great_lakes/`; those maps and the generated `tiles/` folder are gitignored and must not be committed.

## Inputs and validation

The tool reads `terrain.json` for grid dimensions and the height/biome filenames. It requires 2001 × 2001 samples, 10 m cells and 250 m chunks. The height map must be exactly 8,008,002 bytes (uint16 little-endian); the biome map must be exactly 4,004,001 bytes (uint8). Missing files and byte-length mismatches stop the run with the full offending path and expected/actual size.

## Output

The tiler writes 80 × 80 chunks for each LOD (64, 32, 16 and 8 quads per side). Each chunk has a `height_u16.bin` and a matching `biome_u8.bin` in:

- `tiles/lod_<quads>/chunk_<i>_<j>/height_u16.bin`
- `tiles/lod_<quads>/chunk_<i>_<j>/biome_u8.bin`

Chunk coordinates start at the north-west: `i` increases east and `j` increases south. Every chunk covers master samples `25i..25i+25` and `25j..25j+25`, inclusive. Height samples use bilinear interpolation of stored uint16 values, rounded once to the nearest integer; biome indices use nearest-neighbour sampling. Position arithmetic uses integer numerators so neighbouring chunk edges are bit-identical.

The far view uses every eighth master sample, including sample 2000, and writes a 251 × 251 grid to `tiles/far/height_u16.bin` and `tiles/far/biome_u8.bin`. `tiles/index.json` records the LODs, file-name templates and totals. Totals include `index.json` itself; binary-only totals are also provided.

Expected output: 51,203 files including `index.json` (51,202 binary files), about 109.3 million bytes (roughly 104.3 MiB). Exact totals are printed by `tile.mjs` and stored in `index.json`.

## Determinism proof

After generating the tiles, run `node tools/tiler/verify.mjs`. It checks file sizes, chunk counts, all neighbouring chunk edges, chunk corners against the master maps, and the far-view samples. It also prints a SHA-256 digest over the sorted relative file paths and each file's SHA-256 hash.

To prove a second run is byte-identical, run the tiler and verifier twice and compare the final digest lines:

```bash
node tools/tiler/tile.mjs
node tools/tiler/verify.mjs
node tools/tiler/tile.mjs
node tools/tiler/verify.mjs
```

The two `SHA256(sorted relative paths + file SHA256s)` values must match. No timestamps or random values are written into the output.

## Example missing-input error

If the height map is missing, the command stops before writing tiles and prints a message similar to:

```text
Terrain tiler failed: Missing required input file: /path/to/myworld/public/terrain/great_lakes/heightmap_u16.bin
```

If a file exists but has the wrong size, the error names the file and prints the expected and actual byte counts.
