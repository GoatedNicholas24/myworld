import * as THREE from "three";
import "./style.css";

// STEP A: a tiny scene that only proves Vite + Three.js are working.
// You should see a warm sand-coloured screen and a message in the corner.

const container = document.querySelector("#game");
const hud = document.querySelector("#hud");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#e8b987");

const camera = new THREE.PerspectiveCamera(
  65,
  window.innerWidth / window.innerHeight,
  0.2,
  1500,
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.textContent = "Setup works: Vite + Three.js are running.";

function frame() {
  requestAnimationFrame(frame);
  renderer.render(scene, camera);
}

frame();