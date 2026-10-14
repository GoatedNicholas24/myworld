import * as THREE from "three";
import { makeRandom, hashCell } from "./noise.js";

// Scatters copies of one shape (trees, rocks...) across the world.
// The world is cut into cells; each cell always gets the same objects.
// When you move to a new cell, the list of nearby objects is rebuilt.
//
// describe(random, x, z) decides what stands at (x, z). It returns
//   { scale: [x, y, z], spin, tiltX, tiltZ, lift, color }
// or null to leave that spot empty.
export function createScatter({
  geometry,
  material,
  terrain,
  seed,
  cellSize,
  viewRadius,
  perCell,
  maxCount,
  clump,
  describe,
}) {
  const mesh = new THREE.InstancedMesh(geometry, material, maxCount);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // makes sure the colour buffer exists

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();

  let lastCx = null;
  let lastCz = null;

  function rebuild(camX, camZ) {
    const cx = Math.floor(camX / cellSize);
    const cz = Math.floor(camZ / cellSize);
    const span = Math.ceil(viewRadius / cellSize) + 1;
    let placed = 0;

    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        const ix = cx + dx;
        const iz = cz + dz;
        const centerX = (ix + 0.5) * cellSize;
        const centerZ = (iz + 0.5) * cellSize;
        if (Math.hypot(centerX - camX, centerZ - camZ) > viewRadius + cellSize * 0.5) continue;

        const random = makeRandom(hashCell(ix, iz, seed));
        const expected = perCell * (clump ? clump(centerX, centerZ) : 1);
        let count = Math.floor(expected);
        if (random() < expected - count) count++;

        for (let k = 0; k < count && placed < maxCount; k++) {
          const x = (ix + random()) * cellSize;
          const z = (iz + random()) * cellSize;
          const item = describe(random, x, z);
          if (!item) continue;

          position.set(x, terrain.heightAt(x, z) + item.lift, z);
          euler.set(item.tiltX, item.spin, item.tiltZ, "YXZ");
          rotation.setFromEuler(euler);
          scale.set(item.scale[0], item.scale[1], item.scale[2]);
          matrix.compose(position, rotation, scale);
          mesh.setMatrixAt(placed, matrix);
          mesh.setColorAt(placed, item.color);
          placed++;
        }
      }
    }

    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  return {
    mesh,
    count: () => mesh.count,
    update(camera) {
      const cx = Math.floor(camera.position.x / cellSize);
      const cz = Math.floor(camera.position.z / cellSize);
      if (cx !== lastCx || cz !== lastCz) {
        lastCx = cx;
        lastCz = cz;
        rebuild(camera.position.x, camera.position.z);
      }
    },
    setGeometry(newGeometry) {
      mesh.geometry.dispose();
      mesh.geometry = newGeometry;
    },
  };
}