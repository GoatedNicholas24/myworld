import * as THREE from "three";

// Change these colors to give the whole scene a different look.
export const COLORS = {
  floor: 0x9b704c,
  wall: 0xc99c70,
  roof: 0x555653,
  wood: 0x65452f,
  shirt: 0x3f796e,
  skin: 0x75472f,
  yellow: 0xe4b83f,
  grass: 0x6f8051,
  road: 0x484541,
};

const material = (color, options = {}) =>
  new THREE.MeshLambertMaterial({ color, ...options });

function addBox(parent, color, position, size) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    typeof color === "number" ? material(color) : color,
  );
  mesh.position.set(position[0], position[1], position[2]);
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, color, position, radiusTop, radiusBottom, height, sides = 8) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides),
    material(color),
  );
  mesh.position.set(position[0], position[1], position[2]);
  parent.add(mesh);
  return mesh;
}

function addRoofPanel(parent, z, angle) {
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(8.8, 3.3),
    material(COLORS.roof, { side: THREE.DoubleSide }),
  );
  panel.rotation.x = angle;
  panel.position.set(0, 3.35, z);
  parent.add(panel);
  return panel;
}

function addSmallHouse(parent, x, z) {
  const house = new THREE.Group();
  addBox(house, COLORS.wall, [0, 0.85, 0], [3, 1.7, 2.8]);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.25, 1.2, 4),
    material(COLORS.roof),
  );
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.9;
  roof.position.y = 2.3;
  house.add(roof);

  addBox(house, COLORS.wood, [0, 0.7, 1.41], [0.72, 1.4, 0.08]);
  house.position.set(x, 0, z);
  parent.add(house);
}

export function createRoom(scene) {
  const yard = new THREE.Group();
  const house = new THREE.Group();
  const obstacles = [];

  // The shared ground, small yard, and road outside the front door.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    material(COLORS.grass),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  yard.add(ground);

  addBox(yard, COLORS.floor, [0, -0.12, 0], [8, 0.24, 6]);
  addBox(yard, COLORS.road, [0, -0.015, 13], [80, 0.05, 5]);
  for (let x = -36; x <= 36; x += 8) {
    addBox(yard, 0xd8c799, [x, 0.012, 13], [3.5, 0.015, 0.12]);
  }

  // Four walls with a real doorway in the front wall. The roof and walls
  // disappear together while the boy is indoors, making a simple cutaway.
  const shell = new THREE.Group();
  addBox(shell, COLORS.wall, [-0.8, 1.5, -3], [6.4, 3, 0.2]);
  addBox(shell, COLORS.wall, [3.8, 1.5, -3], [0.4, 3, 0.2]);
  addBox(shell, COLORS.wall, [3, 2.65, -3], [1.2, 0.7, 0.2]);
  addBox(shell, COLORS.wall, [-4, 1.5, 0], [0.2, 3, 6]);
  addBox(shell, COLORS.wall, [4, 1.5, 0], [0.2, 3, 6]);

  // Front wall sections leave a doorway in the middle of the house.
  addBox(shell, COLORS.wall, [-2.3, 1.5, 3], [3.4, 3, 0.2]);
  addBox(shell, COLORS.wall, [2.3, 1.5, 3], [3.4, 3, 0.2]);
  addBox(shell, COLORS.wall, [0, 2.65, 3], [1.2, 0.7, 0.2]);
  for (const x of [-0.6, 0.6]) {
    addBox(shell, COLORS.wood, [x, 1.15, 2.88], [0.12, 2.3, 0.16]);
  }
  addBox(shell, COLORS.wood, [0, 2.36, 2.88], [1.2, 0.12, 0.16]);
  addBox(shell, COLORS.wood, [0.42, 0.08, 2.86], [0.07, 0.07, 0.08]);

  addRoofPanel(shell, -1.45, Math.PI / 2 - 0.18);
  addRoofPanel(shell, 1.45, -Math.PI / 2 + 0.18);
  addBox(shell, COLORS.roof, [0, 3.17, 3.1], [9, 0.14, 0.25]);
  for (let x = -4.2; x <= 4.2; x += 0.6) {
    addBox(shell, COLORS.roof, [x, 3.2, 3.12], [0.06, 0.1, 0.28]);
  }

  // Bed, table, stool, school bag, and yellow water jerrycan.
  addBox(house, COLORS.wood, [-2.1, 0.22, -1.35], [2.5, 0.35, 1.5]);
  addBox(house, COLORS.wall, [-2.1, 0.48, -1.35], [2.38, 0.2, 1.38]);
  addBox(house, COLORS.wood, [-2.1, 0.72, -2.03], [2.5, 0.2, 0.14]);

  addBox(house, COLORS.wood, [1.3, 0.86, -0.65], [1.25, 0.14, 0.82]);
  for (const x of [0.82, 1.78]) {
    for (const z of [-0.92, -0.38]) {
      addBox(house, COLORS.wood, [x, 0.42, z], [0.1, 0.8, 0.1]);
    }
  }
  addBox(house, COLORS.wood, [2.25, 0.35, 0.15], [0.62, 0.16, 0.62]);
  for (const x of [2.03, 2.47]) {
    for (const z of [-0.07, 0.37]) {
      addBox(house, COLORS.wood, [x, 0.17, z], [0.08, 0.34, 0.08]);
    }
  }

  addBox(house, COLORS.shirt, [-3.15, 0.3, 0.8], [0.48, 0.58, 0.3]);
  addCylinder(house, COLORS.yellow, [2.5, 0.31, 1.6], 0.22, 0.22, 0.62);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.025, 5, 8),
    material(COLORS.yellow),
  );
  handle.position.set(2.5, 0.66, 1.6);
  house.add(handle);

  // A few fence sections mark out a small compound, with a gap for the gate.
  for (const x of [-8, -6, -4, 4, 6, 8]) {
    addBox(yard, COLORS.wood, [x, 0.6, 7], [0.12, 1.2, 0.12]);
    obstacles.push({ x, z: 7, halfX: 0.2, halfZ: 0.2 });
  }
  addBox(yard, COLORS.wood, [-8, 0.65, 6], [0.12, 0.12, 2]);
  addBox(yard, COLORS.wood, [8, 0.65, 6], [0.12, 0.12, 2]);
  addBox(yard, COLORS.wood, [-5, 0.65, 7], [6, 0.12, 0.1]);
  addBox(yard, COLORS.wood, [5, 0.65, 7], [6, 0.12, 0.1]);
  obstacles.push(
    { x: -8, z: 6, halfX: 0.2, halfZ: 1.1 },
    { x: 8, z: 6, halfX: 0.2, halfZ: 1.1 },
    { x: -5, z: 7, halfX: 3.1, halfZ: 0.2 },
    { x: 5, z: 7, halfX: 3.1, halfZ: 0.2 },
  );

  // Trees, a water drum, and nearby homes give the yard a simple homestead feel.
  addCylinder(yard, COLORS.wood, [-6.6, 0.8, 2.5], 0.18, 0.24, 1.6);
  const treeTop = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.15, 1),
    material(0x63744b),
  );
  treeTop.position.set(-6.6, 2.2, 2.5);
  yard.add(treeTop);
  obstacles.push({ x: -6.6, z: 2.5, halfX: 0.65, halfZ: 0.65 });

  addCylinder(yard, COLORS.yellow, [6.2, 0.62, 2.2], 0.55, 0.55, 1.24, 10);
  obstacles.push({ x: 6.2, z: 2.2, halfX: 0.65, halfZ: 0.65 });
  addSmallHouse(yard, -11, -1.5);
  addSmallHouse(yard, 11, -1.5);
  obstacles.push({ x: -11, z: -1.5, halfX: 1.8, halfZ: 1.7 });
  obstacles.push({ x: 11, z: -1.5, halfX: 1.8, halfZ: 1.7 });

  yard.add(shell, house);
  scene.add(yard);

  // Collision boxes keep the boy in the yard and away from furniture.
  obstacles.push(
    { x: -4, z: 0, halfX: 0.25, halfZ: 3.1 },
    { x: 4, z: 0, halfX: 0.25, halfZ: 3.1 },
    { x: -2.6, z: -3, halfX: 1.5, halfZ: 0.25 },
    { x: 2.6, z: -3, halfX: 1.5, halfZ: 0.25 },
    { x: -2.3, z: 3, halfX: 1.8, halfZ: 0.25 },
    { x: 2.3, z: 3, halfX: 1.8, halfZ: 0.25 },
    { x: -2.1, z: -1.35, halfX: 1.3, halfZ: 0.8 },
    { x: 1.3, z: -0.65, halfX: 0.72, halfZ: 0.49 },
    { x: 2.25, z: 0.15, halfX: 0.38, halfZ: 0.38 },
    { x: -3.15, z: 0.8, halfX: 0.3, halfZ: 0.22 },
    { x: 2.5, z: 1.6, halfX: 0.25, halfZ: 0.25 },
  );

  return { obstacles, shell };
}
