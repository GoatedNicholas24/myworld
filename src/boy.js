import * as THREE from "three";
import { COLORS } from "./room.js";

function makePart(geometry, color, position, group) {
  const part = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ color }),
  );
  part.position.set(position[0], position[1], position[2]);
  group.add(part);
  return part;
}

export function createBoy(scene) {
  const boy = new THREE.Group();

  // The boy is one group, so his whole body can move and turn together.
  makePart(new THREE.BoxGeometry(0.62, 0.58, 0.34), COLORS.shirt, [0, 1.02, 0], boy);
  makePart(new THREE.BoxGeometry(0.58, 0.25, 0.38), COLORS.wood, [0, 0.6, 0], boy);

  const armGeometry = new THREE.CylinderGeometry(0.095, 0.12, 0.56, 8);
  makePart(armGeometry, COLORS.skin, [-0.39, 0.99, 0], boy);
  makePart(armGeometry, COLORS.skin, [0.39, 0.99, 0], boy);

  const legGeometry = new THREE.CylinderGeometry(0.12, 0.13, 0.48, 8);
  makePart(legGeometry, COLORS.wood, [-0.16, 0.25, 0], boy);
  makePart(legGeometry, COLORS.wood, [0.16, 0.25, 0], boy);

  makePart(new THREE.SphereGeometry(0.4, 12, 10), COLORS.skin, [0, 1.62, 0], boy);
  // Tiny eyes face the boy's local forward direction (+Z).
  makePart(new THREE.SphereGeometry(0.035, 6, 5), COLORS.wood, [-0.12, 1.67, 0.36], boy);
  makePart(new THREE.SphereGeometry(0.035, 6, 5), COLORS.wood, [0.12, 1.67, 0.36], boy);

  // A flat dark circle gives the boy a ground cue without real-time shadows.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, 16),
    new THREE.MeshBasicMaterial({ color: COLORS.wood, transparent: true, opacity: 0.32 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  boy.add(shadow);

  boy.position.set(0, 0, 1.6);
  boy.rotation.y = Math.atan2(9, 10);
  scene.add(boy);
  return boy;
}
