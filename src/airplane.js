import * as THREE from "three";
import { getToonGradient } from "./toon.js";

// A small bush plane that circles overhead. It has no model file: it is built
// from a few simple shapes and drawn in the flat toon style.
export function createAirplane(config) {
  const group = new THREE.Group();
  if (!config) return { group, update() {} };

  const gradient = getToonGradient();
  const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: gradient });
  const add = (geometry, color, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, toon(color));
    mesh.position.set(x, y, z);
    plane.add(mesh);
    return mesh;
  };

  const plane = new THREE.Group(); // faces along +Z
  group.add(plane);

  const body = add(new THREE.CapsuleGeometry(0.55, 4.2, 4, 12), "#e9e2d2", 0, 0, 0);
  body.rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(10.5, 0.14, 1.5), "#e9e2d2", 0, 0.62, 0.3); // wing
  add(new THREE.BoxGeometry(10.5, 0.15, 0.4), "#b83a2d", 0, 0.63, 0.95); // red stripe on the wing
  add(new THREE.BoxGeometry(0.12, 1.3, 1.1), "#b83a2d", 0, 0.9, -2.6); // tail fin
  add(new THREE.BoxGeometry(3.6, 0.1, 0.8), "#e9e2d2", 0, 0.2, -2.8); // tail plane
  add(new THREE.BoxGeometry(0.95, 0.4, 0.95), "#2a3a48", 0, 0.5, 0.8); // cockpit window
  const propeller = add(new THREE.BoxGeometry(0.12, 2.3, 0.16), "#2b2622", 0, 0, 3.0);

  return {
    group,
    update(delta, elapsed) {
      const angle = (elapsed * config.speed) / config.radius;
      plane.position.set(
        config.center[0] + Math.cos(angle) * config.radius,
        config.altitude,
        config.center[1] + Math.sin(angle) * config.radius,
      );
      plane.rotation.order = "YXZ";
      plane.rotation.y = Math.atan2(-Math.sin(angle), Math.cos(angle)); // face the way it is flying
      plane.rotation.z = 0.35; // bank into the turn
      propeller.rotation.z += delta * 40;
    },
  };
}