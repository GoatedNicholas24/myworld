import * as THREE from "three";

// Toon shading: light falls into a few flat bands instead of a smooth fade.
// This is cheap, and it is the first step toward the painted, comic look.
let gradient = null;

export function getToonGradient() {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([95, 170, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

// Swaps every material in a loaded model for a toon one (keeping its colours and texture).
export function toToon(root) {
  const convert = (old) =>
    new THREE.MeshToonMaterial({
      map: old.map ?? null,
      color: old.color ?? new THREE.Color(0xffffff),
      gradientMap: getToonGradient(),
    });

  root.traverse((object) => {
    if (!object.isMesh) return;
    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    object.frustumCulled = false; // animated models can leave their resting bounds
  });
}