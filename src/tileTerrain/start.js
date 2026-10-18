import * as THREE from "three";
import { loadWorld } from "../world.js";
import { QUALITY, pickStartingQuality, nextQuality, isTouchDevice } from "../quality.js";
import { createSky } from "../sky.js";
import { createLightingUniforms, parseMood } from "../mood.js";
import { createMoodController } from "../moodController.js";
import { createControls } from "../controls.js";
import { createTileTerrain } from "./manager.js";
import { createGreatLakesMapView } from "./map.js";
import { createScaleMarkers } from "./markers.js";
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
  const markers = createScaleMarkers(THREE, scene, tileWorld.terrain);
  const landmarks = [
    ["Rwenzori-like Range", 10, 3], ["Northern Highlands", 4, 4], ["Eastern Highlands", 17, 6],
    ["Western Plateau", 3, 10], ["Central Valley", 10, 10], ["Rift Escarpment", 17, 11],
    ["Savannah Plains", 5, 17], ["Southern Hills", 9, 16], ["Forest Plateau", 15, 18],
  ].map(([name, eastKm, southKm]) => ({
    name, x: eastKm * 1000 - 10000, z: southKm * 1000 - 10000,
  }));
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
  let flightStatus = "walking";
  const controls = createControls(camera, renderer.domElement, tileWorld.terrain, world.camera, {
    landmarks,
    allowFlight: true,
    onFlightChange: (flying) => { flightStatus = flying ? "FLIGHT" : "walking"; },
    onPlaceMarker: () => markers.place(camera),
    onRemoveMarkers: () => markers.clear(),
  });
  const mapView = createGreatLakesMapView({ camera, ...tileWorld.mapData });
  const sky = createSky(lighting);
  scene.add(sky.mesh, tileWorld.group, livingGround.group);

  const moods = world.moods.map(parseMood);
  const startIndex = Math.max(0, moods.findIndex((mood) => mood.id === world.defaultMood));
  const moodController = createMoodController(
    moods,
    { scene, sunLight, ambientLight, lighting, sky: sky.uniforms },
    startIndex,
    ["F1", "F2", "F3", "F4"],
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
    mapView.update();
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
        `Drag = look · WASD = move · Shift = faster · F = flight (Space/Ctrl up/down)\n` +
        `1-9 = landmarks · F1-F4 = mood · Q = quality · N = minimap · M = full map\n` +
        `Position: ${((camera.position.x + 10000) / 1000).toFixed(2)} km from west edge / ${((camera.position.z + 10000) / 1000).toFixed(2)} km from north edge · ${tileWorld.terrain.heightAt(camera.position.x, camera.position.z).toFixed(0)} m · ${tileWorld.terrain.biomeAt(camera.position.x, camera.position.z)}\n` +
        `Distance to nearest river: n/a · ${flightStatus} · scale poles: ${markers.count()} · P place / O remove`;
    }
  }

  requestAnimationFrame(frame);
  // Expose a small runtime API so later gathering/gameplay systems can query nearby nodes.
  return { camera, terrain: tileWorld.terrain, tileWorld, livingGround, controls };
}
