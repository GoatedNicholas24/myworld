import { decodeElevation } from "./tileCache.js";

const HALF = 10000;
const CHUNK = 250;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const WATER_VERTEX = `
varying vec3 vColor;
varying vec3 vWorld;
varying float vFlow;
void main() {
  vColor = color;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorld = worldPos.xyz;
  vFlow = uv.x;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}`;
const WATER_FRAGMENT = `
uniform float uTime;
uniform float uOpacity;
varying vec3 vColor;
varying vec3 vWorld;
varying float vFlow;
void main() {
  float ripple = sin(vWorld.x * 0.035 + vWorld.z * 0.021 - uTime * 1.8 + vFlow * 8.0) * 0.035;
  float fleck = sin(vWorld.x * 0.11 + vWorld.z * 0.08 - uTime * 2.6) * 0.012;
  gl_FragColor = vec4(clamp(vColor + vec3(ripple + fleck), 0.0, 1.0), uOpacity);
}`;

function makeMaterial(THREE, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: opacity } },
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function riverColor(THREE, depth) {
  return new THREE.Color().setRGB(
    0.12 + clamp(depth / 8, 0, 1) * 0.04,
    0.65 - clamp(depth / 8, 0, 1) * 0.34,
    0.73 - clamp(depth / 8, 0, 1) * 0.12,
  );
}

function buildWideWater(THREE, tile, terrain, material) {
  if (!tile.water) return null;
  const q = tile.lod > 32 ? 32 : tile.lod;
  const sourceStride = tile.lod + 1;
  const sourceStep = tile.lod / q;
  const stride = q + 1;
  const count = stride * stride;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const valid = new Uint8Array(count);
  const temp = new THREE.Color();
  for (let row = 0; row <= q; row += 1) {
    for (let col = 0; col <= q; col += 1) {
      const n = row * stride + col;
      const x = -HALF + tile.i * CHUNK + col / q * CHUNK;
      const z = -HALF + tile.j * CHUNK + row / q * CHUNK;
      const sourceIndex = Math.round(row * sourceStep) * sourceStride + Math.round(col * sourceStep);
      const raw = tile.water[sourceIndex];
      const ground = decodeElevation(tile.heights[sourceIndex]);
      const surface = raw ? decodeElevation(raw) : 0;
      const depth = surface - ground;
      positions[n * 3] = x;
      positions[n * 3 + 1] = surface + 0.12;
      positions[n * 3 + 2] = z;
      uv[n * 2] = col / q;
      uv[n * 2 + 1] = row / q;
      if (raw && depth > 0.02) {
        valid[n] = 1;
        temp.copy(riverColor(THREE, depth));
        if (depth < 0.7) temp.lerp(new THREE.Color("#c5e5d7"), 1 - depth / 0.7);
        colors[n * 3] = temp.r;
        colors[n * 3 + 1] = temp.g;
        colors[n * 3 + 2] = temp.b;
      } else {
        colors[n * 3] = 0;
        colors[n * 3 + 1] = 0;
        colors[n * 3 + 2] = 0;
      }
    }
  }
  const indices = [];
  for (let row = 0; row < q; row += 1) {
    for (let col = 0; col < q; col += 1) {
      const a = row * stride + col, b = a + 1, c = a + stride, d = c + 1;
      if (valid[a] && valid[c] && valid[b]) indices.push(a, c, b);
      if (valid[b] && valid[c] && valid[d]) indices.push(b, c, d);
    }
  }
  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, triangles: indices.length / 3, kind: "lake" };
}

function buildRibbon(THREE, reach, tile, terrain, material, bankMaterial, radius, camera) {
  if (reach.class === "great" || reach.class === "large" || reach.class === "medium") return null;
  const left = [], right = [], bankLeft = [], bankRight = [], colors = [], uv = [], indices = [], bankIndices = [];
  const x0 = -HALF + tile.i * CHUNK, z0 = -HALF + tile.j * CHUNK;
  const x1 = x0 + CHUNK, z1 = z0 + CHUNK;
  const nodes = reach.nodes;
  let lastAlong = 0;
  for (let n = 0; n < nodes.length; n += 1) {
    const p = nodes[n];
    if (Math.hypot(p[0] - camera.position.x, p[1] - camera.position.z) > radius + p[3]) continue;
    if (p[0] < x0 - p[3] || p[0] > x1 + p[3] || p[1] < z0 - p[3] || p[1] > z1 + p[3]) continue;
    const prev = nodes[Math.max(0, n - 1)], next = nodes[Math.min(nodes.length - 1, n + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1], len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const nx = -dz, nz = dx, half = Math.max(0.75, p[3] / 2), bank = half + Math.max(1.2, p[3] * 0.2);
    const y = terrain.heightAt(p[0], p[1]) - 0.06;
    left.push([p[0] + nx * half, y, p[1] + nz * half]);
    right.push([p[0] - nx * half, y, p[1] - nz * half]);
    bankLeft.push([p[0] + nx * bank, y + 0.025, p[1] + nz * bank]);
    bankRight.push([p[0] - nx * bank, y + 0.025, p[1] - nz * bank]);
    const color = riverColor(THREE, p[4]);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    uv.push(lastAlong, 0, lastAlong, 1);
    lastAlong += Math.hypot(next[0] - p[0], next[1] - p[1]) / 20;
  }
  if (left.length < 2) return null;
  const pos = [], bankPos = [], col = [], tex = [];
  for (let n = 0; n < left.length; n += 1) {
    pos.push(...left[n], ...right[n]);
    bankPos.push(...bankLeft[n], ...left[n], ...right[n], ...bankRight[n]);
    col.push(...colors.slice(n * 6, n * 6 + 6));
    tex.push(...uv.slice(n * 4, n * 4 + 4));
    if (n < left.length - 1) {
      const a = n * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, c, b, b, c, d);
      const k = n * 4;
      bankIndices.push(k, k + 4, k + 1, k + 1, k + 4, k + 5);
      bankIndices.push(k + 2, k + 6, k + 3, k + 3, k + 6, k + 7);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(tex, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  const bankGeometry = new THREE.BufferGeometry();
  bankGeometry.setAttribute("position", new THREE.Float32BufferAttribute(bankPos, 3));
  bankGeometry.setIndex(bankIndices);
  bankGeometry.computeVertexNormals();
  const bankMesh = new THREE.Mesh(bankGeometry, bankMaterial);
  return { meshes: [bankMesh, mesh], triangles: indices.length / 3 + bankIndices.length / 3, kind: "river" };
}

export async function createWaterSystem({ THREE, terrain, terrainRoot, quality }) {
  const material = makeMaterial(THREE, 0.82);
  const bankMaterial = new THREE.MeshBasicMaterial({ color: "#514a3b", side: THREE.DoubleSide });
  let rivers = [];
  let currentQuality = quality;
  let elapsed = 0;
  try {
    const response = await fetch(`${terrainRoot}/rivers.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    rivers = (await response.json()).rivers ?? [];
  } catch (error) {
    console.warn("water: rivers.json is unavailable; wide water tiles can still render.", error.message);
  }
  const riverNodes = rivers.flatMap((reach) => reach.nodes.map((node) => ({ x: node[0], z: node[1], y: node[2], width: node[3], depth: node[4], id: reach.id, class: reach.class })));
  const riverBuckets = new Map();
  for (const node of riverNodes) {
    const key = Math.floor((node.x + HALF) / CHUNK) + "," + Math.floor((node.z + HALF) / CHUNK);
    if (!riverBuckets.has(key)) riverBuckets.set(key, []);
    riverBuckets.get(key).push(node);
  }
  function nearestRiver(x, z) {
    let best = null, distance = Infinity;
    const ci = Math.floor((x + HALF) / CHUNK), cj = Math.floor((z + HALF) / CHUNK);
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      for (const node of riverBuckets.get(i + "," + j) ?? []) {
        const d = Math.hypot(node.x - x, node.z - z);
        if (d < distance) { distance = d; best = node; }
      }
    }
    return best ? { node: best, distance: Math.max(0, distance - best.width / 2) } : null;
  }
  function buildChunk(tile, camera) {
    const built = [];
    const wide = buildWideWater(THREE, tile, terrain, material);
    if (wide) built.push(wide);
    for (const reach of rivers) {
      const record = buildRibbon(THREE, reach, tile, terrain, material, bankMaterial, currentQuality.waterRiverRadius, camera);
      if (record) built.push(record);
    }
    return built;
  }
  function surfaceFromActiveTiles(x, z, activeTiles) {
    const i = clamp(Math.floor((x + HALF) / CHUNK), 0, 79), j = clamp(Math.floor((z + HALF) / CHUNK), 0, 79);
    const tile = activeTiles.get(`${i},${j}`)?.tile;
    if (!tile?.water) return null;
    const q = tile.lod, fx = clamp(((x + HALF - i * CHUNK) / CHUNK) * q, 0, q), fz = clamp(((z + HALF - j * CHUNK) / CHUNK) * q, 0, q);
    const col = Math.round(fx), row = Math.round(fz), raw = tile.water[row * (q + 1) + col];
    return raw ? decodeElevation(raw) : null;
  }
  return {
    rivers,
    riverNodes,
    buildChunk,
    update(delta) { elapsed += delta; material.uniforms.uTime.value = elapsed; },
    setQuality(next) { currentQuality = next; },
    waterSurfaceAt(x, z, activeTiles) { return surfaceFromActiveTiles(x, z, activeTiles); },
    waterDepthAt(x, z, activeTiles) {
      const surface = surfaceFromActiveTiles(x, z, activeTiles);
      const wideDepth = surface === null ? 0 : Math.max(0, surface - terrain.heightAt(x, z));
      if (wideDepth > 0) return wideDepth;
      const nearest = nearestRiver(x, z);
      return nearest && nearest.distance === 0 ? nearest.node.depth : 0;
    },
    distanceToRiverAt(x, z) { const nearest = nearestRiver(x, z); return nearest ? nearest.distance : null; },
    dispose() { material.dispose(); bankMaterial.dispose(); },
  };
}
