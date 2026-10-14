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

export function createProps(settings, terrain, seed, quality, start) {
  const group = new THREE.Group();
  const a = settings.acacia;
  const r = settings.rocks;

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
      if (Math.hypot(x - start[0], z - start[1]) < settings.keepClearRadius) return null;
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
      if (random() > 0.35 + 0.65 * terrain.soilAt(x, z)) return null;
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

  group.add(trees.mesh, rocks.mesh);

  return {
    group,
    update(camera) {
      trees.update(camera);
      rocks.update(camera);
    },
    setQuality(q) {
      trees.setGeometry(createAcaciaGeometry(q.treeDetail));
    },
    // Based on how many are standing around the camera right now.
    trianglesFor: (q) => trees.count() * acaciaTriangles(q.treeDetail) + rocks.count() * ROCK_TRIANGLES,
  };
}