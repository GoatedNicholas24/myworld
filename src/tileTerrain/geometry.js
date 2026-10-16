import { decodeElevation } from "./tileCache.js";

const WORLD_HALF = 10000;
const CHUNK_METRES = 250;
const FAR_SAMPLES = 251;
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

function rawAt(tile, row, col) {
  const stride = tile.lod + 1;
  const x = clamp(col, 0, tile.lod);
  const y = clamp(row, 0, tile.lod);
  return tile.heights[y * stride + x];
}

function rawFromTileAtWorld(record, x, z) {
  const { tile, i, j, lod } = record;
  const localX = ((x - (-WORLD_HALF + i * CHUNK_METRES)) / CHUNK_METRES) * lod;
  const localY = ((z - (-WORLD_HALF + j * CHUNK_METRES)) / CHUNK_METRES) * lod;
  const px = clamp(localX, 0, lod);
  const py = clamp(localY, 0, lod);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(lod, x0 + 1);
  const y1 = Math.min(lod, y0 + 1);
  const fx = px - x0;
  const fy = py - y0;
  const top = rawAt(tile, y0, x0) * (1 - fx) + rawAt(tile, y0, x1) * fx;
  const bottom = rawAt(tile, y1, x0) * (1 - fx) + rawAt(tile, y1, x1) * fx;
  return top * (1 - fy) + bottom * fy;
}

function makeBoundary(quads) {
  const stride = quads + 1;
  const indices = [];
  for (let col = 0; col <= quads; col += 1) indices.push(col);
  for (let row = 1; row <= quads; row += 1) indices.push(row * stride + quads);
  for (let col = quads - 1; col >= 0; col -= 1) indices.push(quads * stride + col);
  for (let row = quads - 1; row >= 1; row -= 1) indices.push(row * stride);
  return indices;
}

export function updateTileNormals(THREE, record, neighbourFor, paintColors) {
  const { tile, i, j, lod, mesh } = record;
  const quads = lod;
  const stride = quads + 1;
  const spacing = CHUNK_METRES / quads;
  const positions = mesh.geometry.attributes.position;
  const normals = mesh.geometry.attributes.normal;
  const colors = mesh.geometry.attributes.color;
  const baseCount = stride * stride;
  const tempColor = new THREE.Color();

  for (let row = 0; row <= quads; row += 1) {
    for (let col = 0; col <= quads; col += 1) {
      const index = row * stride + col;
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const currentRaw = rawAt(tile, row, col);
      const currentHeight = decodeElevation(currentRaw);

      const westRecord = col === 0 ? neighbourFor(i - 1, j, lod) : null;
      const eastRecord = col === quads ? neighbourFor(i + 1, j, lod) : null;
      const northRecord = row === 0 ? neighbourFor(i, j - 1, lod) : null;
      const southRecord = row === quads ? neighbourFor(i, j + 1, lod) : null;

      // At a shared edge, sample the neighbour at the same world-space offset.
      // Using the smaller spacing on both sides gives matching central-difference
      // normals where LOD vertices coincide. Without a loaded neighbour, use a
      // one-sided difference rather than sampling unrelated far-view data.
      const westStep = westRecord ? Math.min(spacing, CHUNK_METRES / westRecord.lod) : spacing;
      const eastStep = eastRecord ? Math.min(spacing, CHUNK_METRES / eastRecord.lod) : spacing;
      const northStep = northRecord ? Math.min(spacing, CHUNK_METRES / northRecord.lod) : spacing;
      const southStep = southRecord ? Math.min(spacing, CHUNK_METRES / southRecord.lod) : spacing;

      let hWest;
      if (col > 0) hWest = decodeElevation(rawFromTileAtWorld(record, x - spacing, z));
      else if (westRecord) hWest = decodeElevation(rawFromTileAtWorld(westRecord, x - westStep, z));
      else hWest = currentHeight;

      let hEast;
      if (col < quads) hEast = decodeElevation(rawFromTileAtWorld(record, x + spacing, z));
      else if (eastRecord) hEast = decodeElevation(rawFromTileAtWorld(eastRecord, x + eastStep, z));
      else hEast = currentHeight;

      let hNorth;
      if (row > 0) hNorth = decodeElevation(rawFromTileAtWorld(record, x, z - spacing));
      else if (northRecord) hNorth = decodeElevation(rawFromTileAtWorld(northRecord, x, z - northStep));
      else hNorth = currentHeight;

      let hSouth;
      if (row < quads) hSouth = decodeElevation(rawFromTileAtWorld(record, x, z + spacing));
      else if (southRecord) hSouth = decodeElevation(rawFromTileAtWorld(southRecord, x, z + southStep));
      else hSouth = currentHeight;

      const dxDistance = (col === 0 && !westRecord) || (col === quads && !eastRecord)
        ? spacing
        : (col === 0 ? westStep + spacing : col === quads ? spacing + eastStep : spacing * 2);
      const dzDistance = (row === 0 && !northRecord) || (row === quads && !southRecord)
        ? spacing
        : (row === 0 ? northStep + spacing : row === quads ? spacing + southStep : spacing * 2);
      const dhdx = (hEast - hWest) / dxDistance;
      const dhdz = (hSouth - hNorth) / dzDistance;
      const nx = -dhdx;
      const ny = 1;
      const nz = -dhdz;
      const length = Math.hypot(nx, ny, nz) || 1;
      normals.setXYZ(index, nx / length, ny / length, nz / length);

      const biomeIndex = tile.biomes[index];
      tempColor.copy(paintColors[biomeIndex] ?? paintColors[0] ?? new THREE.Color("#8b8a68"));
      const slope = Math.hypot(dhdx, dhdz);
      tempColor.multiplyScalar(1 - clamp(slope * 0.055, 0, 0.16));
      colors.setXYZ(index, tempColor.r, tempColor.g, tempColor.b);
    }
  }

  // Skirt vertices duplicate their corresponding surface vertex. Copying the
  // surface normal avoids a dark normal discontinuity on the vertical drop.
  for (const [surfaceIndex, skirtIndex] of mesh.geometry.userData.skirtPairs) {
    normals.setXYZ(skirtIndex, normals.getX(surfaceIndex), normals.getY(surfaceIndex), normals.getZ(surfaceIndex));
    colors.setXYZ(skirtIndex, colors.getX(surfaceIndex) * 0.82, colors.getY(surfaceIndex) * 0.82, colors.getZ(surfaceIndex) * 0.82);
  }

  normals.needsUpdate = true;
  colors.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}

export function createTileMesh(THREE, tile, paintColors, material, neighbourFor) {
  const { i, j, lod: quads } = tile;
  const stride = quads + 1;
  const surfaceCount = stride * stride;
  const boundary = makeBoundary(quads);
  const skirtDepth = Math.max(3, 1.5 * (CHUNK_METRES / quads));
  const positions = new Float32Array((surfaceCount + boundary.length) * 3);
  const normals = new Float32Array((surfaceCount + boundary.length) * 3);
  const colors = new Float32Array((surfaceCount + boundary.length) * 3);
  const indices = [];

  for (let row = 0; row <= quads; row += 1) {
    for (let col = 0; col <= quads; col += 1) {
      const index = row * stride + col;
      const x = -WORLD_HALF + i * CHUNK_METRES + (col / quads) * CHUNK_METRES;
      const z = -WORLD_HALF + j * CHUNK_METRES + (row / quads) * CHUNK_METRES;
      positions[index * 3] = x;
      positions[index * 3 + 1] = decodeElevation(tile.heights[index]);
      positions[index * 3 + 2] = z;
    }
  }

  for (let row = 0; row < quads; row += 1) {
    for (let col = 0; col < quads; col += 1) {
      const a = row * stride + col;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const skirtPairs = [];
  for (let n = 0; n < boundary.length; n += 1) {
    const surfaceIndex = boundary[n];
    const skirtIndex = surfaceCount + n;
    skirtPairs.push([surfaceIndex, skirtIndex]);
    positions[skirtIndex * 3] = positions[surfaceIndex * 3];
    positions[skirtIndex * 3 + 1] = positions[surfaceIndex * 3 + 1] - skirtDepth;
    positions[skirtIndex * 3 + 2] = positions[surfaceIndex * 3 + 2];
    const nextSurface = boundary[(n + 1) % boundary.length];
    const nextSkirt = surfaceCount + ((n + 1) % boundary.length);
    indices.push(surfaceIndex, skirtIndex, nextSurface, nextSurface, skirtIndex, nextSkirt);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new Uint16Array(indices));
  geometry.userData.skirtPairs = skirtPairs;
  const mesh = new THREE.Mesh(geometry, material);
  const record = { i, j, lod: quads, tile, mesh, triangles: indices.length / 3 };
  updateTileNormals(THREE, record, neighbourFor, paintColors);
  return record;
}

export function createFarMesh(THREE, heights, biomes, paintColors, material, sampleStride = 1) {
  const samples = Math.floor((FAR_SAMPLES - 1) / sampleStride) + 1;
  const lastMasterIndex = samples - 1;
  const stepMetres = 80 * sampleStride;
  const positions = new Float32Array(samples * samples * 3);
  const colors = new Float32Array(samples * samples * 3);
  const indices = new Uint16Array((samples - 1) * (samples - 1) * 6);
  const heightAt = (row, col) => decodeElevation(heights[(row * sampleStride) * FAR_SAMPLES + col * sampleStride]);

  for (let row = 0; row < samples; row += 1) {
    for (let col = 0; col < samples; col += 1) {
      const index = row * samples + col;
      const x = -WORLD_HALF + col * stepMetres;
      const z = -WORLD_HALF + row * stepMetres;
      const y = heightAt(row, col);
      positions[index * 3] = x;
      positions[index * 3 + 1] = y - 12;
      positions[index * 3 + 2] = z;

      const west = col > 0 ? heightAt(row, col - 1) : y;
      const east = col < lastMasterIndex ? heightAt(row, col + 1) : y;
      const north = row > 0 ? heightAt(row - 1, col) : y;
      const south = row < lastMasterIndex ? heightAt(row + 1, col) : y;
      const dx = (east - west) / (col === 0 || col === lastMasterIndex ? stepMetres : stepMetres * 2);
      const dz = (south - north) / (row === 0 || row === lastMasterIndex ? stepMetres : stepMetres * 2);
      const shade = 1 - clamp(Math.hypot(dx, dz) * 0.055, 0, 0.16);
      const biomeIndex = biomes[(row * sampleStride) * FAR_SAMPLES + col * sampleStride];
      const color = (paintColors[biomeIndex] ?? paintColors[0] ?? new THREE.Color("#8b8a68")).clone();
      color.multiplyScalar(shade);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
  }

  let k = 0;
  for (let row = 0; row < samples - 1; row += 1) {
    for (let col = 0; col < samples - 1; col += 1) {
      const a = row * samples + col;
      const b = a + 1;
      const c = a + samples;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, triangles: indices.length / 3 };
}
