import * as THREE from "three";
import { loadWorld } from "./world.js";
import { pickStartingQuality, isTouchDevice } from "./quality.js";
import { createTerrain } from "./terrain.js";
import { createGround } from "./ground.js";
import { createSky } from "./sky.js";
import { createLightingUniforms, parseMood, applyMood } from "./mood.js";
import "./style.css";

// STEP C: ground and sky, with the default mood applied. The camera is fixed
// for now (walking comes in step E). No grass yet.

const world = loadWorld("karamoja");
const quality = pickStartingQuality();

const container = document.querySelector("#game");
const hud = document.querySelector("#hud");

const renderer = new THREE.WebGLRenderer({ antialias: !isTouchDevice() });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.Fog(0xffffff, 10, 100);

// One warm sun and one cool fill light. No shadows.
const ambientLight = new THREE.AmbientLight(0xffffff, 1);
const sunLight = new THREE.DirectionalLight(0xffffff, 1);
scene.add(ambientLight, sunLight);

const camera = new THREE.PerspectiveCamera(
  world.camera.fov,
  window.innerWidth / window.innerHeight,
  0.2,
  1500,
);

const lighting = createLightingUniforms();
const terrain = createTerrain(world.terrain, world.seed);
const ground = createGround(world.terrain, terrain, world.seed, quality);
const sky = createSky(lighting);
scene.add(sky.mesh, ground.mesh);

// Apply the default mood from the manifest.
const moods = world.moods.map(parseMood);
const startMood = moods.find((m) => m.id === world.defaultMood) ?? moods[0];
applyMood(startMood, { scene, sunLight, ambientLight, lighting, sky: sky.uniforms });

// Fixed camera at the start spot, looking toward the start bearing.
const [startX, startZ] = world.camera.start;
camera.position.set(startX, terrain.heightAt(startX, startZ) + world.camera.eyeHeight, startZ);
camera.rotation.order = "YXZ";
camera.rotation.set(-0.04, -(world.camera.startBearing * Math.PI) / 180, 0);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let hudShown = false;

function frame() {
  requestAnimationFrame(frame);
  sky.update(camera);
  renderer.render(scene, camera);

  if (!hudShown) {
    hudShown = true;
    hud.textContent =
      `${world.name} · ${startMood.label}\n` +
      `Quality: ${quality.name} · ${renderer.info.render.triangles.toLocaleString()} triangles`;
  }
}

frame();