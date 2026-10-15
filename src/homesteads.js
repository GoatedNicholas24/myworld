import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeRandom, hashCell } from "./noise.js";

const TAU = Math.PI * 2;

const COLORS = {
  fenceDark: "#4a3a2a", // dry thorn brush
  fenceLight: "#6e583f",
  wall: "#8d6b4a", // mud and wattle
  thatch: "#b9985a",
  thatchDark: "#8f7340",
  door: "#2a1d14",
  granary: "#7a5c3c",
  stilt: "#5b4631",
};

const matrix = new THREE.Matrix4();
const quaternion = new THREE.Quaternion();
const euler = new THREE.Euler();

function put(geometry, x, y, z, sx, sy, sz, spin = 0) {
  quaternion.setFromEuler(euler.set(0, spin, 0));
  geometry.applyMatrix4(matrix.compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(sx, sy, sz)));
  return geometry;
}

function paintFlat(geometry, hex) {
  const color = new THREE.Color(hex);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A round hut as ONE shape: a mud wall, a thatched roof that overhangs the
// wall (with a thick eave), and a curved roof rising to a point.
function createHutGeometry(radialSegments) {
  const profile = [
    [1.0, 0.0], [1.0, 1.3], // wall
    [1.5, 1.18], [1.52, 1.3], // the eave sticks out past the wall
    [1.3, 1.72], [0.95, 2.2], [0.6, 2.65], [0.25, 3.05], [0.0, 3.3], // curved roof
  ].map(([r, y]) => new THREE.Vector2(r, y));

  const geometry = new THREE.LatheGeometry(profile, radialSegments);
  geometry.deleteAttribute("uv");

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const wall = new THREE.Color(COLORS.wall);
  const thatch = new THREE.Color(COLORS.thatch);
  const thatchDark = new THREE.Color(COLORS.thatchDark);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    if (i % profile.length <= 1) color.copy(wall);
    else color.copy(thatch).lerp(thatchDark, 0.5 + 0.5 * Math.sin(position.getY(i) * 14)); // thatch bands
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A granary: a woven basket with a thatched cap (it stands on stilts).
function createGranaryGeometry(radialSegments) {
  const profile = [
    [0.0, 0.0], [0.8, 0.0], [0.95, 0.45], [0.95, 1.15],
    [1.2, 1.25], [0.8, 1.7], [0.4, 2.05], [0.0, 2.25],
  ].map(([r, y]) => new THREE.Vector2(r, y));

  const geometry = new THREE.LatheGeometry(profile, radialSegments);
  geometry.deleteAttribute("uv");

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const basket = new THREE.Color(COLORS.granary);
  const cap = new THREE.Color(COLORS.thatch);
  for (let i = 0; i < position.count; i++) {
    const color = i % profile.length <= 3 ? basket : cap;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A fence of piled thorn brush: a low, lumpy hump swept around a circle.
// An entrance gap is left open when gapAngle is given.
function createFence(h, radius, steps, gapAngle, random, ground) {
  const profile = [[-0.4, 0], [-0.32, 0.65], [-0.1, 1.15], [0.12, 1.2], [0.33, 0.7], [0.42, 0]];
  const ring = profile.length;
  const positions = [];
  const colors = [];
  const inGap = [];
  const dark = new THREE.Color(COLORS.fenceDark);
  const light = new THREE.Color(COLORS.fenceLight);
  const color = new THREE.Color();

  for (let s = 0; s < steps; s++) {
    const angle = (s / steps) * TAU;
    inGap.push(
      gapAngle !== null &&
        Math.abs(Math.atan2(Math.sin(angle - gapAngle), Math.cos(angle - gapAngle))) < 0.22,
    );
    const r = radius + (random() - 0.5) * 0.5;
    const lump = 0.8 + 0.5 * random();
    for (const [width, height] of profile) {
      const x = h.x + Math.cos(angle) * (r + width);
      const z = h.z + Math.sin(angle) * (r + width);
      positions.push(x, ground(x, z) + height * lump, z);
      color.copy(dark).lerp(light, random());
      colors.push(color.r, color.g, color.b);
    }
  }

  const indices = [];
  for (let s = 0; s < steps; s++) {
    const n = (s + 1) % steps;
    if (inGap[s] || inGap[n]) continue;
    for (let k = 0; k < ring - 1; k++) {
      const a = s * ring + k;
      const c = n * ring + k;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// One homestead: a thorn fence with an entrance, a small cattle kraal in the
// middle, and round huts and raised granaries in a ring.
function buildHomestead(h, detail, terrain, seed) {
  const random = makeRandom(hashCell(Math.round(h.x), Math.round(h.z), seed + 900));
  const ground = (x, z) => terrain.heightAt(x, z);
  const parts = [];

  parts.push(createFence(h, h.radius, detail ? 72 : 40, random() * TAU, random, ground));
  if (h.kraal) parts.push(createFence(h, h.radius * 0.3, detail ? 36 : 22, null, random, ground));

  const hutShape = createHutGeometry(detail ? 14 : 8);
  const granaryShape = createGranaryGeometry(detail ? 12 : 8);

  const slots = h.huts + h.granaries;
  const granarySlots = new Set(
    Array.from({ length: h.granaries }, (_, j) => Math.floor(((j + 0.5) * slots) / h.granaries)),
  );
  const ringRadius = h.radius * 0.66;
  const offset = random() * TAU;

  for (let i = 0; i < slots; i++) {
    const angle = offset + (i / slots) * TAU;
    const x = h.x + Math.cos(angle) * ringRadius;
    const z = h.z + Math.sin(angle) * ringRadius;
    const y = ground(x, z);

    if (granarySlots.has(i)) {
      parts.push(put(granaryShape.clone(), x, y + 0.6, z, 1, 1, 1, random() * TAU));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.8;
        parts.push(
          paintFlat(
            put(new THREE.BoxGeometry(0.1, 0.7, 0.1), x + Math.cos(a) * 0.55, y + 0.35, z + Math.sin(a) * 0.55, 1, 1, 1),
            COLORS.stilt,
          ),
        );
      }
    } else {
      const r = 1.45 + 0.25 * random();
      parts.push(put(hutShape.clone(), x, y, z, r, 1, r, random() * TAU));

      // A dark doorway in the wall, facing the middle of the homestead.
      const facing = angle + Math.PI;
      parts.push(
        paintFlat(
          put(
            new THREE.BoxGeometry(0.55, 0.95, 0.12),
            x + Math.cos(facing) * r,
            y + 0.48,
            z + Math.sin(facing) * r,
            1, 1, 1,
            Math.PI / 2 - facing,
          ),
          COLORS.door,
        ),
      );
    }
  }

  // Every part must have exactly the same kinds of data before they can be joined.
  const flat = parts.map((part) => {
    const g = part.index ? part.toNonIndexed() : part;
    g.deleteAttribute("uv");
    return g;
  });
  const merged = mergeGeometries(flat);
  flat.forEach((g) => g.dispose());
  parts.forEach((g) => g.dispose());
  hutShape.dispose();
  granaryShape.dispose();
  return merged;
}

export function createHomesteads(local, terrain, seed, quality) {
  const group = new THREE.Group();
  // Both sides are drawn, so the thin roofs and fences never disappear from behind.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const list = local.homesteads ?? [];

  const buildAll = (q) => list.map((h) => buildHomestead(h, q.treeDetail, terrain, seed));

  function setQuality(q) {
    for (const mesh of group.children) mesh.geometry.dispose();
    group.clear();
    for (const geometry of buildAll(q)) group.add(new THREE.Mesh(geometry, material));
  }
  setQuality(quality);

  return {
    group,
    setQuality,
    trianglesFor(q) {
      const geometries = buildAll(q);
      const total = geometries.reduce((sum, g) => sum + g.attributes.position.count / 3, 0);
      geometries.forEach((g) => g.dispose());
      return Math.round(total);
    },
  };
}