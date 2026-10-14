import * as THREE from "three";
import { loadWorld } from "./world.js";
import { QUALITY, pickStartingQuality, nextQuality, isTouchDevice } from "./quality.js";
import { createTerrain } from "./terrain.js";
import { createGround } from "./ground.js";
import { createSky } from "./sky.js";
import { createHills } from "./hills.js";
import { createGrass } from "./grass.js";
import { createLightingUniforms, parseMood } from "./mood.js";
import { createMoodController } from "./moodController.js";
import { createControls } from "./controls.js";
import "./style.css";

// STEP 2: the grass is built in chunks around you, so it goes wherever you walk.

const world = loadWorld("karamoja");
let quality = pickStartingQuality();

const container = document.querySelector("#game");
const hud = document.querySelector("#hud");

const renderer = new THREE.WebGLRenderer({ antialias: !isTouchDevice() });
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.Fog(0xffffff, 10, 100);

const ambientLight = new THREE.AmbientLight(0xffffff, 1);
const sunLight = new THREE.DirectionalLight(0xffffff, 1);
scene.add(ambientLight, sunLight);

const camera = new THREE.PerspectiveCamera(world.camera.fov, 1, 0.2, 1500);

const lighting = createLightingUniforms();
const terrain = createTerrain(world.terrain, world.seed, world.camera.start);

// The controls place the camera at the start, so they come before the world parts.
const controls = createControls(camera, renderer.domElement, terrain, world.camera);

const ground = createGround(world.terrain, terrain, world.seed, quality, camera);
const sky = createSky(lighting);
const hills = createHills(world.hills, lighting, world.seed);
const grass = createGrass(world.grass, world.wind, terrain, world.seed, lighting, quality, camera);
scene.add(sky.mesh, hills.group, ground.group, grass.group);

const moods = world.moods.map(parseMood);
const startIndex = Math.max(0, moods.findIndex((m) => m.id === world.defaultMood));
const moodController = createMoodController(
  moods,
  { scene, sunLight, ambientLight, lighting, sky: sky.uniforms, grass: grass.uniforms },
  startIndex,
);

// ---- Quality and size -------------------------------------------------------

function resize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function applyQuality() {
  ground.setQuality(quality);
  grass.setQuality(quality);
  resize();
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (event.code === "KeyQ" && !event.repeat) {
    quality = nextQuality(quality);
    applyQuality();
  }
});
resize();

const totalTriangles = (q) =>
  ground.trianglesFor(q) + grass.trianglesFor(q) + sky.triangles + hills.triangles;
console.table({
  LOW: {
    ground: ground.trianglesFor(QUALITY.LOW),
    grass: grass.trianglesFor(QUALITY.LOW),
    "sky+hills": sky.triangles + hills.triangles,
    total: totalTriangles(QUALITY.LOW),
  },
  HIGH: {
    ground: ground.trianglesFor(QUALITY.HIGH),
    grass: grass.trianglesFor(QUALITY.HIGH),
    "sky+hills": sky.triangles + hills.triangles,
    total: totalTriangles(QUALITY.HIGH),
  },
});

// ---- Main loop --------------------------------------------------------------

let last = null;
let elapsed = 0;
let frames = 0;
let hudTime = 0;
let fps = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (last === null) last = now;
  const realDelta = Math.max((now - last) / 1000, 0);
  const delta = Math.min(realDelta, 0.05);
  last = now;
  elapsed += delta;

  controls.update(delta);
  moodController.update(delta);
  ground.update(camera);
  grass.update(elapsed, camera);
  hills.update(camera);
  sky.update(camera);
  renderer.render(scene, camera);

  frames++;
  hudTime += realDelta;
  if (hudTime >= 0.5) {
    fps = Math.round(frames / hudTime);
    frames = 0;
    hudTime = 0;
    hud.textContent =
      `${world.name} · ${moodController.label()}\n` +
      `Quality: ${quality.name} · ${renderer.info.render.triangles.toLocaleString()} triangles · ${fps} fps\n` +
      `Drag = look · WASD = walk · Shift = faster\n` +
      `1-4 = mood · Q = quality`;
  }
}

requestAnimationFrame(frame);