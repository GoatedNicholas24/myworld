import * as THREE from "three";
import { fbm } from "./noise.js";
import { createChunkManager, countChunks } from "./chunks.js";

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

// The ground is cut into square chunks. Only the chunks near the camera
// exist, so the world can be as big as you like. Colours (earth tones, dry
// patches, bare soil, river sand) are painted into the vertices, so no
// textures are needed.
export function createGround(settings, terrain, seed, quality, camera) {
  const chunkSize = settings.groundChunkSize;
  const loadRadius = settings.groundLoadRadius;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const group = new THREE.Group();

  const baseColor = new THREE.Color(settings.groundColor);
  const dryColor = new THREE.Color(settings.dryGroundColor);
  const soilColor = new THREE.Color(settings.soilColor);
  const sandColor = new THREE.Color(terrain.sandColor ?? "#cdb98a");
  const color = new THREE.Color();

  let segments = quality.groundSegments;

  function build(ix, iz) {
    const stride = segments + 1;
    const vertexCount = stride * stride;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);

    let i = 0;
    for (let row = 0; row <= segments; row++) {
      for (let col = 0; col <= segments; col++) {
        const x = (ix + col / segments) * chunkSize;
        const z = (iz + row / segments) * chunkSize;
        const y = terrain.heightAt(x, z);

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        // Work the slope out from the terrain itself, so neighbouring chunks
        // share the same normals and no seams show.
        const e = 1;
        const nx = terrain.heightAt(x - e, z) - terrain.heightAt(x + e, z);
        const nz = terrain.heightAt(x, z - e) - terrain.heightAt(x, z + e);
        const length = Math.hypot(nx, 2 * e, nz);
        normals[i * 3] = nx / length;
        normals[i * 3 + 1] = (2 * e) / length;
        normals[i * 3 + 2] = nz / length;

        const dryness = clamp((fbm(x / 22 + 5, z / 22 + 5, seed + 2, 3) - 0.35) * 2.2, 0, 1);
        color.copy(baseColor).lerp(dryColor, dryness);
        color.multiplyScalar(0.94 + 0.12 * fbm(x * 0.8, z * 0.8, seed + 4, 2));
        color.lerp(soilColor, terrain.soilAt(x, z));
        color.lerp(sandColor, terrain.sandAt(x, z));
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        i++;
      }
    }

    const indices = new Uint16Array(segments * segments * 6);
    let k = 0;
    for (let row = 0; row < segments; row++) {
      for (let col = 0; col < segments; col++) {
        const a = row * stride + col;
        const b = a + 1;
        const c = a + stride;
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
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    return mesh;
  }

  function release(mesh) {
    group.remove(mesh);
    mesh.geometry.dispose();
  }

  const manager = createChunkManager({ chunkSize, loadRadius, build, release, perFrame: 1 });
  manager.rebuildAll(camera.position.x, camera.position.z);

  const chunkCount = countChunks(chunkSize, loadRadius);

  return {
    group,
    update(cam) {
      manager.update(cam.position.x, cam.position.z);
    },
    setQuality(q) {
      segments = q.groundSegments;
      manager.rebuildAll(camera.position.x, camera.position.z);
    },
    trianglesFor: (q) => chunkCount * q.groundSegments * q.groundSegments * 2,
  };
}