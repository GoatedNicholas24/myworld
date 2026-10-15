import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { fbm, valueNoise } from "./noise.js";
import { createScatter } from "./scatter.js";

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

// A rounded, lumpy blob: a sphere whose corners are shared (so it shades
// smoothly instead of looking faceted) and pushed in and out by noise.
function createBlob(detail, lumpiness, seed) {
  let geometry = new THREE.IcosahedronGeometry(1, detail);
  geometry.deleteAttribute("normal");
  geometry.deleteAttribute("uv");
  geometry = mergeVertices(geometry);

  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const n = valueNoise(v.x * 1.8 + v.z * 1.1 + seed, v.y * 1.8 + v.z * 0.7 + seed * 0.5, seed);
    v.multiplyScalar(1 - lumpiness + 2 * lumpiness * n);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  return geometry;
}

// Gives a shape one colour, a little darker underneath and lighter on top.
function paint(geometry, hex, underside = 0.7) {
  geometry.computeVertexNormals();
  const color = new THREE.Color(hex);
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const light = underside + (1 - underside) * (0.5 + 0.5 * normal.getY(i));
    colors[i * 3] = color.r * light;
    colors[i * 3 + 1] = color.g * light;
    colors[i * 3 + 2] = color.b * light;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A flat-topped savannah acacia: a gently curved trunk, three branches and two
// rounded, lumpy layers of leaves. One shape, one draw call.
function createAcaciaGeometry(detail) {
  const trunk = new THREE.CylinderGeometry(0.12, 0.28, 3.3, 8, 3, true);
  trunk.deleteAttribute("uv");
  const trunkPosition = trunk.attributes.position;
  for (let i = 0; i < trunkPosition.count; i++) {
    trunkPosition.setX(i, trunkPosition.getX(i) + 0.22 * Math.sin((trunkPosition.getY(i) + 1.65) * 0.9));
  }
  trunk.translate(0, 1.65, 0);

  const branch = (lean, spin) => {
    const g = new THREE.CylinderGeometry(0.045, 0.1, 1.9, 5, 1, true);
    g.deleteAttribute("uv");
    g.translate(0, 0.95, 0);
    g.rotateZ(lean);
    g.rotateY(spin);
    g.translate(0, 2.8, 0);
    return g;
  };

  const lowerCanopy = createBlob(detail, 0.18, 11);
  lowerCanopy.scale(3.3, 0.72, 3.0);
  lowerCanopy.translate(0, 3.55, 0);

  const upperCanopy = createBlob(detail, 0.18, 23);
  upperCanopy.scale(2.2, 0.55, 2.0);
  upperCanopy.translate(0.5, 4.05, 0.3);

  return mergeGeometries([
    paint(trunk, "#5b4631"),
    paint(branch(0.9, 0), "#5b4631"),
    paint(branch(-0.8, 2.1), "#5b4631"),
    paint(branch(0.7, 4.2), "#5b4631"),
    paint(lowerCanopy, "#6c7c3b", 0.6),
    paint(upperCanopy, "#7f8a41", 0.6),
  ]);
}

// A rounded boulder with a flat bottom so it sits on the ground.
function createRockGeometry(detail) {
  const geometry = createBlob(detail, 0.2, 37);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y < -0.4) position.setY(i, -0.4 + (y + 0.4) * 0.25);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Triangles: trunk 48 + three branches 30 + two canopies of 20 x (detail + 1)^2.
const acaciaTriangles = (detail) => 78 + 40 * (detail + 1) ** 2;
const rockTriangles = (detail) => 20 * (detail + 1) ** 2;

export function createProps(settings, terrain, seed, quality, start) {
  const group = new THREE.Group();
  const a = settings.acacia;
  const r = settings.rocks;

  // LOW uses rounder-than-before shapes too, just with fewer facets.
  const detailFor = (q) => q.treeDetail + 1;

  const treeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const rockMaterial = new THREE.MeshLambertMaterial(); // colour comes from each rock

  const trees = createScatter({
    geometry: createAcaciaGeometry(detailFor(quality)),
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
      // Keep the starting view, the homesteads, gardens, roads and water clear.
      if (Math.hypot(x - start[0], z - start[1]) < settings.keepClearRadius) return null;
      if (terrain.clearingAt(x, z) > 0.05) return null;
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
    geometry: createRockGeometry(detailFor(quality)),
    material: rockMaterial,
    terrain,
    seed: seed + 301,
    cellSize: r.cellSize,
    viewRadius: r.viewRadius,
    perCell: (r.density * r.cellSize * r.cellSize) / 10000,
    maxCount: 600,
    describe(random, x, z) {
      if (terrain.clearingAt(x, z) > 0.05) return null;
      // More rocks on and around bare soil, fewer in the grass.
      if (random() > 0.35 + 0.65 * terrain.soilAt(x, z)) return null;
      const size = lerp(r.size[0], r.size[1], Math.pow(random(), 2));
      return {
        scale: [size * (1 + 0.5 * random()), size * (0.6 + 0.4 * random()), size * (1 + 0.5 * random())],
        spin: random() * TAU,
        tiltX: (random() - 0.5) * 0.3,
        tiltZ: (random() - 0.5) * 0.3,
        lift: -size * 0.15,
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
      trees.setGeometry(createAcaciaGeometry(detailFor(q)));
      rocks.setGeometry(createRockGeometry(detailFor(q)));
    },
    // Based on how many are standing around the camera right now.
    trianglesFor: (q) =>
      trees.count() * acaciaTriangles(detailFor(q)) + rocks.count() * rockTriangles(detailFor(q)),
  };
}