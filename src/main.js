import * as THREE from "three";
import { loadWorld, loadMap, loadOutline } from "./world.js";
import { loadLocal } from "./local.js";
import { QUALITY, pickStartingQuality, nextQuality, isTouchDevice } from "./quality.js";
import { createGeo } from "./geo.js";
import { createTerrain } from "./terrain.js";
import { createGround } from "./ground.js";
import { createSky } from "./sky.js";
import { createMountains } from "./mountains.js";
import { createGrass } from "./grass.js";
import { createProps } from "./props.js";
import { createHomesteads } from "./homesteads.js";
import { createGarden } from "./garden.js";
import { createWater } from "./water.js";
import { createActors } from "./actors.js";
import { createAirplane } from "./airplane.js";
import { createLightingUniforms, parseMood } from "./mood.js";
import { createMoodController } from "./moodController.js";
import { createControls } from "./controls.js";
import { createMapView } from "./map.js";
import "./style.css";
import { startGreatLakesWorld } from "./tileTerrain/start.js";

// The engine's entry point. Everything about how the world looks comes from
// worlds/karamoja/ (world.json, map.json, local.json). This file only wires
// the pieces together.

const requestedWorld = new URLSearchParams(window.location.search).get("world") || "karamoja";
if (requestedWorld === "great_lakes") {
  startGreatLakesWorld(loadWorld(requestedWorld)).catch((error) => {
    console.error("Great Lakes terrain failed to start:", error);
    const hud = document.querySelector("#hud");
    if (hud) hud.textContent = "Great Lakes terrain failed to load: " + error.message;
  });
} else {
const world = loadWorld("karamoja");
const map = loadMap("karamoja");
const local = loadLocal("karamoja");
let quality = pickStartingQuality();

const container = document.querySelector("#game");
const hud = document.querySelector("#hud");

// Antialiasing can only be chosen once, so it is on for non-touch devices.
const renderer = new THREE.WebGLRenderer({ antialias: !isTouchDevice() });
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.Fog(0xffffff, 10, 100);

// One warm sun and one cool fill light. No real-time shadows.
const ambientLight = new THREE.AmbientLight(0xffffff, 1);
const sunLight = new THREE.DirectionalLight(0xffffff, 1);
scene.add(ambientLight, sunLight);

// The far limit is large because the real mountains are kilometres away.
const camera = new THREE.PerspectiveCamera(world.camera.fov, 1, 0.2, 30000);

const lighting = createLightingUniforms();
const terrain = createTerrain(world.terrain, world.seed, world.camera.start, local);
const geo = createGeo(map.start);

// The controls place the camera at the start, so they come before the world parts.
const controls = createControls(camera, renderer.domElement, terrain, world.camera);

const ground = createGround(world.terrain, terrain, world.seed, quality, camera);
const sky = createSky(lighting);
const mountains = createMountains(map, geo, lighting, world.seed, quality);
const grass = createGrass(world.grass, world.wind, terrain, world.seed, lighting, quality, camera);
const props = createProps(world.props, terrain, world.seed, quality, world.camera.start);
const homesteads = createHomesteads(local, terrain, world.seed, quality);
const garden = createGarden(local, terrain, world.seed, quality);
const water = createWater(local, terrain, lighting);
const actors = createActors(local.actors, terrain);
const airplane = createAirplane(local.airplane);
scene.add(
  sky.mesh,
  mountains.group,
  ground.group,
  grass.group,
  props.group,
  homesteads.group,
  garden.group,
  water.group,
  actors.group,
  airplane.group,
);

const moods = world.moods.map(parseMood);
const startIndex = Math.max(0, moods.findIndex((m) => m.id === world.defaultMood));
const moodController = createMoodController(
  moods,
  { scene, sunLight, ambientLight, lighting, sky: sky.uniforms, grass: grass.uniforms },
  startIndex,
);

// The map icon and screen. Game (0, 0) is the real start point from map.json.
createMapView({ map, outline: loadOutline("karamoja"), geo, camera, title: world.name });

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
  props.setQuality(quality);
  mountains.setQuality(quality);
  homesteads.setQuality(quality);
  garden.setQuality(quality);
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

// Triangle counts for both presets, worked out from the settings.
// (Grass is the most it could be; trees and rocks are counted around the start.
// The animated models are not included here, the HUD count includes everything.)
props.update(camera);
const row = (q) => {
  const parts = {
    ground: ground.trianglesFor(q),
    grass: grass.trianglesFor(q),
    sky: sky.triangles,
    "mountains (est.)": mountains.trianglesFor(q),
    "trees+rocks": props.trianglesFor(q),
    homesteads: homesteads.trianglesFor(q),
    garden: garden.trianglesFor(q),
  };
  return { ...parts, total: Object.values(parts).reduce((sum, n) => sum + n, 0) };
};
console.table({ LOW: row(QUALITY.LOW), HIGH: row(QUALITY.HIGH) });

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
  props.update(camera);
  mountains.update(camera);
  water.update(elapsed);
  actors.update(delta);
  airplane.update(delta, elapsed);
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
      `1-4 = mood · Q = quality · M = map`;
  }
}

requestAnimationFrame(frame);
}
