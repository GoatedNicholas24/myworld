import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeRandom, hashCell } from "./noise.js";

const TAU = Math.PI * 2;
const PLANT_TRIANGLES = 34;

function paint(geometry, hex) {
  geometry.deleteAttribute("uv");
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

// One sorghum plant: a thin stalk, three bending leaves and a seed head.
function createPlantGeometry() {
  const stalk = new THREE.CylinderGeometry(0.018, 0.03, 1.9, 4, 1, true);
  stalk.translate(0, 0.95, 0);

  const leaf = (height, spin) => {
    const g = new THREE.PlaneGeometry(0.1, 0.8, 1, 1);
    g.translate(0, 0.4, 0);
    g.rotateX(-0.9);
    g.rotateY(spin);
    g.translate(0, height, 0);
    return g;
  };

  const head = new THREE.CylinderGeometry(0.05, 0.08, 0.28, 5);
  head.translate(0, 2.0, 0);

  return mergeGeometries([
    paint(stalk, "#8a9a4a"),
    paint(leaf(0.5, 0), "#6f8f3a"),
    paint(leaf(0.95, 2.1), "#6f8f3a"),
    paint(leaf(1.35, 4.2), "#6f8f3a"),
    paint(head, "#9a4a2a"),
  ]);
}

export function createGarden(local, terrain, seed, quality) {
  const group = new THREE.Group();
  const fields = local.fields ?? [];
  const geometry = createPlantGeometry();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

  // Plants are planted in neat rows (further apart on LOW).
  const rowsFor = (field, q) => {
    const spacingX = q.treeDetail ? 0.9 : 1.6;
    const spacingZ = q.treeDetail ? 0.6 : 1.0;
    return {
      spacingX,
      spacingZ,
      countX: Math.floor((field.width - 3) / spacingX),
      countZ: Math.floor((field.depth - 3) / spacingZ),
    };
  };
  const plantsFor = (q) =>
    fields.reduce((sum, f) => {
      const r = rowsFor(f, q);
      return sum + r.countX * r.countZ;
    }, 0);

  function setQuality(q) {
    for (const mesh of group.children) mesh.dispose();
    group.clear();

    fields.forEach((field, index) => {
      const rows = rowsFor(field, q);
      const mesh = new THREE.InstancedMesh(geometry, material, rows.countX * rows.countZ);
      mesh.frustumCulled = false;
      const random = makeRandom(hashCell(Math.round(field.x), Math.round(field.z), seed + 700 + index));
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      const cos = Math.cos(field.rotation ?? 0);
      const sin = Math.sin(field.rotation ?? 0);

      let i = 0;
      for (let ix = 0; ix < rows.countX; ix++) {
        for (let iz = 0; iz < rows.countZ; iz++) {
          const lx = (ix - (rows.countX - 1) / 2) * rows.spacingX + (random() - 0.5) * 0.15;
          const lz = (iz - (rows.countZ - 1) / 2) * rows.spacingZ + (random() - 0.5) * 0.12;
          const x = field.x + lx * cos - lz * sin;
          const z = field.z + lx * sin + lz * cos;
          const height = 0.8 + 0.4 * random();
          position.set(x, terrain.heightAt(x, z), z);
          rotation.setFromAxisAngle(up, random() * TAU);
          scale.set(height, height, height);
          mesh.setMatrixAt(i++, matrix.compose(position, rotation, scale));
        }
      }
      group.add(mesh);
    });
  }
  setQuality(quality);

  return { group, setQuality, trianglesFor: (q) => plantsFor(q) * PLANT_TRIANGLES };
}