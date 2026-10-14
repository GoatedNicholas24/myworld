import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fbm } from "./noise.js";
import { createScatter } from "./scatter.js";

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

// Gives every vertex of a shape one colour.
function paint(geometry, hex) {
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

// The classic flat-topped savannah acacia: a thin trunk and two flat, wide
// layers of leaves, all built from simple shapes. One shape, one draw call.
function createAcaciaGeometry(detail) {
  const trunk = new THREE.CylinderGeometry(0.13, 0.26, 3.2, 6, 1, true);
  trunk.translate(0, 1.6, 0);

  const lowerCanopy = new THREE.IcosahedronGeometry(1, detail);
  lowerCanopy.scale(3.3, 0.7, 3.0);
  lowerCanopy.translate(0, 3.35, 0);

  const upperCanopy = new THREE.IcosahedronGeometry(1, detail);
  upperCanopy.scale(2.2, 0.55, 2.0);
  upperCanopy.translate(0.5, 3.9, 0.3);

  return mergeGeometries([
    paint(trunk.toNonIndexed(), "#5b4631"),
    paint(lowerCanopy, "#6c7c3b"),
    paint(upperCanopy, "#7f8a41"),
  ]);
}

// Triangles in one tree: 12 for the trunk + 2 canopies of 20 x (detail + 1)^2.
const acaciaTriangles = (detail) => 12 + 40 * (detail + 1) ** 2;
const ROCK_TRIANGLES = 20;

function createVillage(settings, terrain) {
  if (!settings) return { group: new THREE.Group(), triangles: 0, households: [] };

  const group = new THREE.Group();
  const households = [];
  const batches = {
    yard: { geometry: new THREE.CircleGeometry(1, 16), material: new THREE.MeshLambertMaterial({ color: "#98734f" }), items: [] },
    wall: { geometry: new THREE.CylinderGeometry(1, 1.06, 1.5, 9), material: new THREE.MeshLambertMaterial({ color: "#a17a52" }), items: [] },
    roof: { geometry: new THREE.SphereGeometry(1, 9, 5, 0, TAU, 0, Math.PI / 2), material: new THREE.MeshLambertMaterial({ color: "#806841" }), items: [] },
    door: { geometry: new THREE.BoxGeometry(0.46, 0.9, 0.08), material: new THREE.MeshLambertMaterial({ color: "#493526" }), items: [] },
    post: { geometry: new THREE.CylinderGeometry(0.065, 0.09, 0.95, 5), material: new THREE.MeshLambertMaterial({ color: "#665039" }), items: [] },
    rail: { geometry: new THREE.BoxGeometry(1, 0.11, 0.12), material: new THREE.MeshLambertMaterial({ color: "#765b3d" }), items: [] },
  };

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const along = new THREE.Vector3(1, 0, 0);
  const direction = new THREE.Vector3();

  function add(batch, x, y, z, sx, sy, sz, yaw = 0, color = 1, pitch = 0) {
    euler.set(pitch, yaw, 0);
    rotation.setFromEuler(euler);
    position.set(x, y, z);
    scale.set(sx, sy, sz);
    matrix.compose(position, rotation, scale);
    batches[batch].items.push({ matrix: matrix.clone(), color: new THREE.Color().setScalar(color) });
  }

  function addFence(x, z, radius, segments, openingAngle) {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * TAU;
      const a1 = ((i + 1) / segments) * TAU;
      const mid = (a0 + a1) * 0.5;
      const x0 = x + Math.cos(a0) * radius;
      const z0 = z + Math.sin(a0) * radius;
      const x1 = x + Math.cos(a1) * radius;
      const z1 = z + Math.sin(a1) * radius;
      const y0 = terrain.heightAt(x0, z0);
      const y1 = terrain.heightAt(x1, z1);

      add("post", x0, y0 + 0.475, z0, 1, 1, 1, 0, 0.88 + (i % 3) * 0.08);
      if (Math.abs(Math.atan2(Math.sin(mid - openingAngle), Math.cos(mid - openingAngle))) < Math.PI / segments * 0.8) continue;

      direction.set(x1 - x0, y1 - y0, z1 - z0);
      const length = direction.length();
      direction.normalize();
      rotation.setFromUnitVectors(along, direction);
      for (const height of [0.28, 0.68]) {
        position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5 + height, (z0 + z1) * 0.5);
        scale.set(length, 1, 1);
        matrix.compose(position, rotation, scale);
        batches.rail.items.push({ matrix: matrix.clone(), color: new THREE.Color().setScalar(0.9 + (i % 2) * 0.08) });
      }
    }
  }

  const [centerX, centerZ] = settings.center;
  const householdCount = settings.homesteads;
  const householdRadius = settings.householdRadius;
  const fenceRadius = 5.6;
  const hutOffset = 1.4;

  for (let i = 0; i < householdCount; i++) {
    const angle = (i / householdCount) * TAU + Math.PI / 4;
    const x = centerX + Math.cos(angle) * householdRadius;
    const z = centerZ + Math.sin(angle) * householdRadius;
    const towardCenter = Math.atan2(centerZ - z, centerX - x);
    households.push({ x, z, radius: 7.5 });
    add("yard", x, terrain.heightAt(x, z) + 0.025, z, fenceRadius, 1, fenceRadius, 0, 0.9 + (i % 2) * 0.08, -Math.PI / 2);
    addFence(x, z, fenceRadius, 12, towardCenter);

    const tangent = angle + Math.PI / 2;
    for (const side of [-1, 1]) {
      const hutX = x + Math.cos(tangent) * hutOffset * side;
      const hutZ = z + Math.sin(tangent) * hutOffset * side;
      const groundY = terrain.heightAt(hutX, hutZ);
      const doorYaw = Math.atan2(centerX - hutX, centerZ - hutZ);
      const variation = 0.94 + (i % 3) * 0.06;
      add("wall", hutX, groundY + 0.75, hutZ, 1.18, 1, 1.18, doorYaw, variation);
      add("roof", hutX, groundY + 1.5, hutZ, 1.48, 0.88, 1.48, doorYaw, 0.9 + (i % 3) * 0.07);
      add(
        "door",
        hutX + Math.sin(doorYaw) * 1.05,
        groundY + 0.46,
        hutZ + Math.cos(doorYaw) * 1.05,
        1,
        1,
        1,
        doorYaw,
      );
    }
  }

  add("yard", centerX, terrain.heightAt(centerX, centerZ) + 0.025, centerZ, 4.2, 1, 4.2, 0, 0.96, -Math.PI / 2);
  addFence(
    centerX,
    centerZ,
    4.2,
    14,
    Math.atan2(-centerZ, -centerX),
  );

  for (const batch of Object.values(batches)) {
    if (batch.items.length === 0) continue;
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.items.length);
    mesh.count = batch.items.length;
    for (let i = 0; i < batch.items.length; i++) {
      mesh.setMatrixAt(i, batch.items[i].matrix);
      mesh.setColorAt(i, batch.items[i].color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  const triangles = Object.values(batches).reduce(
    (total, batch) => total + batch.items.length * (batch.geometry.index?.count ?? batch.geometry.attributes.position.count) / 3,
    0,
  );
  return { group, triangles, households };
}

export function createProps(settings, terrain, seed, quality, start) {
  const group = new THREE.Group();
  const a = settings.acacia;
  const r = settings.rocks;
  const village = createVillage(settings.village, terrain);

  function nearVillage(x, z) {
    return village.households.some((household) => Math.hypot(x - household.x, z - household.z) < household.radius) ||
      (settings.village && Math.hypot(x - settings.village.center[0], z - settings.village.center[1]) < 6.5);
  }

  const treeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const rockMaterial = new THREE.MeshLambertMaterial(); // colour comes from each rock

  const trees = createScatter({
    geometry: createAcaciaGeometry(quality.treeDetail),
    material: treeMaterial,
    terrain,
    seed: seed + 201,
    cellSize: a.cellSize,
    viewRadius: a.viewRadius,
    perCell: (a.density * a.cellSize * a.cellSize) / 10000,
    maxCount: 600,
    // Trees stand in loose groves with open land in between.
    clump: (x, z) =>
      0.2 + 1.6 * smoothstep(0.35, 0.65, fbm(x / a.clumpScale + 12, z / a.clumpScale + 12, seed + 5, 2)),
    describe(random, x, z) {
      // Keep the starting view clear.
      if (Math.hypot(x - start[0], z - start[1]) < settings.keepClearRadius || nearVillage(x, z)) return null;
      const size = lerp(a.scale[0], a.scale[1], Math.pow(random(), 1.4));
      return {
        scale: [size * (0.9 + 0.3 * random()), size, size * (0.9 + 0.3 * random())],
        spin: random() * TAU,
        tiltX: (random() - 0.5) * 0.1,
        tiltZ: (random() - 0.5) * 0.1,
        lift: -0.05,
        color: new THREE.Color().setScalar(0.8 + 0.35 * random()),
      };
    },
  });

  const rockDark = new THREE.Color(r.colors[0]);
  const rockLight = new THREE.Color(r.colors[1]);

  const rocks = createScatter({
    geometry: new THREE.IcosahedronGeometry(1, 0),
    material: rockMaterial,
    terrain,
    seed: seed + 301,
    cellSize: r.cellSize,
    viewRadius: r.viewRadius,
    perCell: (r.density * r.cellSize * r.cellSize) / 10000,
    maxCount: 600,
    describe(random, x, z) {
      // More rocks on and around bare soil, fewer in the grass.
      if (nearVillage(x, z) || random() > 0.35 + 0.65 * terrain.soilAt(x, z)) return null;
      const size = lerp(r.size[0], r.size[1], Math.pow(random(), 2));
      return {
        scale: [size * (1 + 0.5 * random()), size * (0.6 + 0.4 * random()), size * (1 + 0.5 * random())],
        spin: random() * TAU,
        tiltX: (random() - 0.5) * 0.4,
        tiltZ: (random() - 0.5) * 0.4,
        lift: -size * 0.25,
        color: new THREE.Color().copy(rockDark).lerp(rockLight, random()),
      };
    },
  });

  group.add(trees.mesh, rocks.mesh, village.group);

  return {
    group,
    villageTriangles: village.triangles,
    naturalTrianglesFor: (q) => trees.count() * acaciaTriangles(q.treeDetail) + rocks.count() * ROCK_TRIANGLES,
    update(camera) {
      trees.update(camera);
      rocks.update(camera);
    },
    setQuality(q) {
      trees.setGeometry(createAcaciaGeometry(q.treeDetail));
    },
    // Based on how many are standing around the camera right now.
    trianglesFor: (q) =>
      trees.count() * acaciaTriangles(q.treeDetail) + rocks.count() * ROCK_TRIANGLES + village.triangles,
  };
}