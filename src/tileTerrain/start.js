import * as THREE from "three";
import { loadWorld } from "../world.js";
import { QUALITY, pickStartingQuality, nextQuality, isTouchDevice } from "../quality.js";
import { createSky } from "../sky.js";
import { createLightingUniforms, parseMood } from "../mood.js";
import { createMoodController } from "../moodController.js";
import { createControls } from "../controls.js";
import { createTileTerrain } from "./manager.js";
import { createResourceSystem } from "./resources.js";
import { createVegetationSystem } from "./vegetation.js";

// Game coordinates follow the existing engine: +x is east, -z is north, and
// Three.js y is elevation. Master row 0 (north) maps to z=-10000; column 0
// (west) maps to x=-10000. Thus the centre start is x=0,z=0 and faces north.
export async function startGreatLakesWorld(world = loadWorld("great_lakes")) {
  if (world.terrain?.source !== "tiles") throw new Error(`World "${world.id}" does not select the tile terrain source`);
  let quality = pickStartingQuality();
  const container = document.querySelector("#game");
  const hud = document.querySelector("#hud");
  const renderer = new THREE.WebGLRenderer({ antialias: !isTouchDevice() });
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d8d7cb");
  scene.fog = new THREE.Fog("#d8d7cb", 50, 18000);
  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  const sunLight = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(ambientLight, sunLight);

  const camera = new THREE.PerspectiveCamera(world.camera.fov, 1, 0.2, 30000);
  const lighting = createLightingUniforms();
  const tileWorld = await createTileTerrain({ THREE, world, quality });
  let resourceSystem = null;
  try {
    resourceSystem = await createResourceSystem({ THREE, tileRoot: world.terrain.tileRoot, worldSeed: world.seed, terrain: tileWorld.terrain, cacheLimit: quality.resourceChunkCacheLimit });
  } catch (error) {
    console.error("Great Lakes resource density data unavailable:", error.message);
  }
  const livingGround = createVegetationSystem({ THREE, terrain: tileWorld.terrain, metadata: tileWorld.mapData.metadata, worldSeed: world.seed, initialQuality: quality, resourceSystem });
  console.table({
    LOW: { startPoint: livingGround.estimateTriangleCountAt(0, 0, QUALITY.LOW), densestForest: livingGround.estimateTriangleCountForBiome("highland_forest", QUALITY.LOW) },
    HIGH: { startPoint: livingGround.estimateTriangleCountAt(0, 0, QUALITY.HIGH), densestForest: livingGround.estimateTriangleCountForBiome("highland_forest", QUALITY.HIGH) },
  });
  const controls = createControls(camera, renderer.domElement, tileWorld.terrain, world.camera);
  const sky = createSky(lighting);
  scene.add(sky.mesh, tileWorld.group, livingGround.group);

  const moods = world.moods.map(parseMood);
  const startIndex = Math.max(0, moods.findIndex((mood) => mood.id === world.defaultMood));
  const moodController = createMoodController(
    moods,
    { scene, sunLight, ambientLight, lighting, sky: sky.uniforms },
    startIndex,
  );

  function resize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap));
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  function applyQuality() {
    tileWorld.setQuality(quality);
    livingGround.setQuality(quality);
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
  tileWorld.update(camera);

  let last = null;
  let elapsed = 0;
  let frames = 0;
  let hudTime = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (last === null) last = now;
    const realDelta = Math.max((now - last) / 1000, 0);
    const delta = Math.min(realDelta, 0.05);
    last = now;
    elapsed += delta;

    controls.update(delta);
    moodController.update(delta);
    const terrainBuilds = tileWorld.update(camera);
    livingGround.update(camera, tileWorld.getActiveChunks(), Math.max(0, 2 - terrainBuilds));
    sky.update(camera);
    renderer.render(scene, camera);

    frames += 1;
    hudTime += realDelta;
    if (hudTime >= 0.5) {
      const fps = Math.round(frames / hudTime);
      frames = 0;
      hudTime = 0;
      hud.textContent =
        `${world.name} · ${moodController.label()}\n` +
        `Quality: ${quality.name} · ${renderer.info.render.triangles.toLocaleString("en-US")} triangles · ${fps} fps\n` +
        `Vegetation: ${livingGround.getVegetationTriangleCount().toLocaleString("en-US")} tris · gatherables loaded: ${livingGround.getResourceNodeCount()}\n` +
        `Drag = look · WASD = walk · Shift = faster\n` +
        `1-4 = mood · Q = quality`;
    }
  }

  requestAnimationFrame(frame);
  // Expose a small runtime API so later gathering/gameplay systems can query nearby nodes.
  return { camera, terrain: tileWorld.terrain, tileWorld, livingGround, controls };
}
