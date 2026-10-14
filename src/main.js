import * as THREE from "three";
import { loadWorld } from "./world.js";
import "./style.css";

// STEP B: load the world manifest and use its default mood's horizon colour.
// You should see the colour change and the HUD show the world's name.

const world = loadWorld("karamoja");
const mood = world.moods.find((m) => m.id === world.defaultMood) ?? world.moods[0];

const container = document.querySelector("#game");
const hud = document.querySelector("#hud");

const scene = new THREE.Scene();
scene.background = new THREE.Color(mood.sky.horizon);

const camera = new THREE.PerspectiveCamera(
  world.camera.fov,
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

hud.textContent = `${world.name}\nLoaded from worlds/karamoja/world.json\nMood: ${mood.label}`;

function frame() {
  requestAnimationFrame(frame);
  renderer.render(scene, camera);
}

frame();