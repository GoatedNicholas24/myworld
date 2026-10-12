import * as THREE from "three";
import { COLORS, createRoom } from "./room.js";
import { createBoy } from "./boy.js";
import "./style.css";

const game = document.querySelector("#game");
const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.floor);

// Soft lighting keeps the room readable without expensive shadows.
scene.add(new THREE.AmbientLight(0xffffff, 1.5));
const sunlight = new THREE.DirectionalLight(0xffe6c5, 2);
sunlight.position.set(-4, 8, 5);
scene.add(sunlight);

const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
camera.position.set(9, 8, 10);
camera.lookAt(0, 1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(game.clientWidth, game.clientHeight);
game.appendChild(renderer.domElement);

const { obstacles } = createRoom(scene);
const boy = createBoy(scene);
const heldKeys = new Set();
const boyRadius = 0.34;
const roomBounds = { minX: -3.55, maxX: 3.55, minZ: -2.55, maxZ: 2.55 };
let previousFrameTime = performance.now();
let elapsedTime = 0;

const keyDirections = {
  ArrowUp: [0, -1],
  w: [0, -1],
  W: [0, -1],
  ArrowDown: [0, 1],
  s: [0, 1],
  S: [0, 1],
  ArrowLeft: [-1, 0],
  a: [-1, 0],
  A: [-1, 0],
  ArrowRight: [1, 0],
  d: [1, 0],
  D: [1, 0],
};

window.addEventListener("keydown", (event) => {
  if (keyDirections[event.key]) {
    event.preventDefault();
    heldKeys.add(event.key);
  }
});

window.addEventListener("keyup", (event) => heldKeys.delete(event.key));
window.addEventListener("blur", () => heldKeys.clear());

function canMoveTo(x, z) {
  if (
    x < roomBounds.minX ||
    x > roomBounds.maxX ||
    z < roomBounds.minZ ||
    z > roomBounds.maxZ
  ) {
    return false;
  }

  return !obstacles.some(
    (item) =>
      Math.abs(x - item.x) < item.halfX + boyRadius &&
      Math.abs(z - item.z) < item.halfZ + boyRadius,
  );
}

function resize() {
  const width = game.clientWidth;
  const height = game.clientHeight;
  const aspect = width / height;
  const viewHeight = Math.max(8.5, 11 / aspect);

  camera.left = (-viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
}

window.addEventListener("resize", resize);
resize();

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - previousFrameTime) / 1000, 0.05);
  previousFrameTime = now;
  elapsedTime += delta;
  let moveX = 0;
  let moveZ = 0;

  for (const key of heldKeys) {
    const direction = keyDirections[key];
    moveX += direction[0];
    moveZ += direction[1];
  }

  const length = Math.hypot(moveX, moveZ);
  if (length > 0) {
    moveX /= length;
    moveZ /= length;
    const step = 2.5 * delta;
    const nextX = boy.position.x + moveX * step;
    const nextZ = boy.position.z + moveZ * step;

    // Check each axis separately so the boy can slide along furniture.
    if (canMoveTo(nextX, boy.position.z)) boy.position.x = nextX;
    if (canMoveTo(boy.position.x, nextZ)) boy.position.z = nextZ;
    boy.rotation.y = Math.atan2(moveX, moveZ);
  }

  boy.position.y = Math.sin(elapsedTime * 3) * 0.035;
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
