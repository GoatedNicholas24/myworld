import * as THREE from "three";
import { fbm } from "./noise.js";

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

// A big, gently rolling earthy ground. Colours are painted into the vertices
// (earth tones, dry patches and bare soil), so no texture files are needed.
export function createGround(settings, terrain, seed, quality) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);

  const baseColor = new THREE.Color(settings.groundColor);
  const dryColor = new THREE.Color(settings.dryGroundColor);
  const soilColor = new THREE.Color(settings.soilColor);
  const color = new THREE.Color();

  function trianglesFor(q) {
    return q.groundSegments * q.groundSegments * 2;
  }

  function setQuality(q) {
    const geometry = new THREE.PlaneGeometry(terrain.size, terrain.size, q.groundSegments, q.groundSegments);
    geometry.rotateX(-Math.PI / 2); // lay it flat

    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      position.setY(i, terrain.heightAt(x, z));

      const dryness = clamp((fbm(x / 22 + 5, z / 22 + 5, seed + 2, 3) - 0.35) * 2.2, 0, 1);
      color.copy(baseColor).lerp(dryColor, dryness);
      color.multiplyScalar(0.94 + 0.12 * fbm(x * 0.8, z * 0.8, seed + 4, 2));
      color.lerp(soilColor, terrain.soilAt(x, z));

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    mesh.geometry.dispose();
    mesh.geometry = geometry;
  }

  setQuality(quality);
  return { mesh, setQuality, trianglesFor };
}