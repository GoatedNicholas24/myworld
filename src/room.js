import * as THREE from "three";

// These few colors are shared across the room and the boy.
export const COLORS = {
  floor: 0x9b704c,
  wall: 0xc99c70,
  roof: 0x555653,
  wood: 0x65452f,
  shirt: 0x3f796e,
  skin: 0x75472f,
  yellow: 0xe4b83f,
};

const makeMaterial = (color) =>
  new THREE.MeshLambertMaterial({ color });

function addBox(parent, material, position, size) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    material,
  );
  mesh.position.set(position[0], position[1], position[2]);
  parent.add(mesh);
  return mesh;
}

export function createRoom(scene) {
  const floorMaterial = makeMaterial(COLORS.floor);
  const wallMaterial = makeMaterial(COLORS.wall);
  const woodMaterial = makeMaterial(COLORS.wood);
  const roofMaterial = makeMaterial(COLORS.roof);
  const yellowMaterial = makeMaterial(COLORS.yellow);
  const room = new THREE.Group();

  // Floor and three walls; the front is open so the room stays visible.
  addBox(room, floorMaterial, [0, -0.12, 0], [8, 0.24, 6]);
  addBox(room, wallMaterial, [-0.8, 1.5, -3], [6.4, 3, 0.2]);
  addBox(room, wallMaterial, [3.8, 1.5, -3], [0.4, 3, 0.2]);
  addBox(room, wallMaterial, [3, 2.65, -3], [1.2, 0.7, 0.2]);
  addBox(room, wallMaterial, [-4, 1.5, 0], [0.2, 3, 6]);
  addBox(room, wallMaterial, [4, 1.5, 0], [0.2, 3, 6]);

  // A simple doorway opening and wooden frame in the back wall.
  addBox(room, woodMaterial, [2.45, 1.15, -2.86], [0.12, 2.3, 0.16]);
  addBox(room, woodMaterial, [3.55, 1.15, -2.86], [0.12, 2.3, 0.16]);
  addBox(room, woodMaterial, [3, 2.36, -2.86], [1.2, 0.12, 0.16]);

  // A shallow corrugated-iron roof edge with simple raised ribs.
  addBox(room, roofMaterial, [0, 3.08, -3.28], [8.3, 0.12, 0.78]);
  for (let x = -3.75; x <= 3.75; x += 0.5) {
    addBox(room, roofMaterial, [x, 3.16, -3.28], [0.07, 0.08, 0.78]);
  }

  // Bed and mattress.
  addBox(room, woodMaterial, [-2.1, 0.22, -1.35], [2.5, 0.35, 1.5]);
  addBox(room, wallMaterial, [-2.1, 0.48, -1.35], [2.38, 0.2, 1.38]);
  addBox(room, woodMaterial, [-2.1, 0.72, -2.03], [2.5, 0.2, 0.14]);

  // Small table with a stool.
  addBox(room, woodMaterial, [1.3, 0.86, -0.65], [1.25, 0.14, 0.82]);
  for (const x of [0.82, 1.78]) {
    for (const z of [-0.92, -0.38]) {
      addBox(room, woodMaterial, [x, 0.42, z], [0.1, 0.8, 0.1]);
    }
  }
  addBox(room, woodMaterial, [2.25, 0.35, 0.15], [0.62, 0.16, 0.62]);
  for (const x of [2.03, 2.47]) {
    for (const z of [-0.07, 0.37]) {
      addBox(room, woodMaterial, [x, 0.17, z], [0.08, 0.34, 0.08]);
    }
  }

  // School bag and yellow jerrycan, made from simple shapes.
  const bag = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.58, 0.3),
    makeMaterial(COLORS.shirt),
  );
  bag.position.set(-3.15, 0.3, 0.8);
  room.add(bag);

  const can = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.62, 8),
    yellowMaterial,
  );
  can.position.set(2.5, 0.31, 1.6);
  room.add(can);
  const canHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.025, 5, 8),
    yellowMaterial,
  );
  canHandle.position.set(2.5, 0.66, 1.6);
  room.add(canHandle);

  scene.add(room);

  // These rectangles are used by the movement code to keep the boy out of furniture.
  const obstacles = [
    { x: -2.1, z: -1.35, halfX: 1.3, halfZ: 0.8 },
    { x: 1.3, z: -0.65, halfX: 0.72, halfZ: 0.49 },
    { x: 2.25, z: 0.15, halfX: 0.38, halfZ: 0.38 },
    { x: -3.15, z: 0.8, halfX: 0.3, halfZ: 0.22 },
    { x: 2.5, z: 1.6, halfX: 0.25, halfZ: 0.25 },
  ];

  return { obstacles };
}
