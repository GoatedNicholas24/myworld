import * as THREE from "three";

// Moods: reading them from world.json, blending two of them, and applying
// the result to the lights, fog, sky and grass.

const DEG = Math.PI / 180;

const COLOR_KEYS = [
  "skyTop", "skyMiddle", "skyHorizon", "fogColor",
  "sunColor", "ambientColor", "grassDry", "grassOlive", "grassFresh",
];
const NUMBER_KEYS = [
  "fogNear", "fogFar", "sunIntensity", "sunElevation",
  "sunAzimuth", "sunGlow", "ambientIntensity",
];

// Values shared by the sky, the grass and the lights (one sun, one fog).
export function createLightingUniforms() {
  return {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uAmbient: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 10 },
    uFogFar: { value: 100 },
  };
}

// Turns one mood from world.json into ready-to-use colours and numbers.
export function parseMood(mood) {
  return {
    id: mood.id,
    label: mood.label,
    skyTop: new THREE.Color(mood.sky.top),
    skyMiddle: new THREE.Color(mood.sky.middle),
    skyHorizon: new THREE.Color(mood.sky.horizon),
    fogColor: new THREE.Color(mood.fog.color),
    fogNear: mood.fog.near,
    fogFar: mood.fog.far,
    sunColor: new THREE.Color(mood.sun.color),
    sunIntensity: mood.sun.intensity,
    sunElevation: mood.sun.elevation,
    sunAzimuth: mood.sun.azimuth,
    sunGlow: mood.sun.glow,
    ambientColor: new THREE.Color(mood.ambient.color),
    ambientIntensity: mood.ambient.intensity,
    grassDry: new THREE.Color(mood.grass.dry),
    grassOlive: new THREE.Color(mood.grass.olive),
    grassFresh: new THREE.Color(mood.grass.fresh),
  };
}

export function cloneMood(mood) {
  const copy = { id: mood.id, label: mood.label };
  for (const key of COLOR_KEYS) copy[key] = mood[key].clone();
  for (const key of NUMBER_KEYS) copy[key] = mood[key];
  return copy;
}

// target = a + (b - a) * t   (t goes from 0 to 1)
export function blendMoods(target, a, b, t) {
  for (const key of COLOR_KEYS) target[key].lerpColors(a[key], b[key], t);
  for (const key of NUMBER_KEYS) target[key] = a[key] + (b[key] - a[key]) * t;
}

const sunDirection = new THREE.Vector3();

// Pushes a mood onto everything that uses it.
export function applyMood(state, targets) {
  const { scene, sunLight, ambientLight, lighting, sky, grass } = targets;

  // Sun direction from its height (elevation) and compass direction (azimuth).
  const elevation = state.sunElevation * DEG;
  const azimuth = state.sunAzimuth * DEG;
  sunDirection
    .set(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), -Math.cos(elevation) * Math.cos(azimuth))
    .normalize();

  scene.fog.color.copy(state.fogColor);
  scene.fog.near = state.fogNear;
  scene.fog.far = state.fogFar;
  scene.background.copy(state.fogColor);

  // Three.js lights need to be multiplied by PI so that "intensity 1" means
  // "show the plain colour". The grass shader uses the plain numbers directly.
  sunLight.color.copy(state.sunColor);
  sunLight.intensity = Math.PI * state.sunIntensity;
  sunLight.position.copy(sunDirection).multiplyScalar(100);
  ambientLight.color.copy(state.ambientColor);
  ambientLight.intensity = Math.PI * state.ambientIntensity;

  lighting.uSunDir.value.copy(sunDirection);
  lighting.uSunColor.value.copy(state.sunColor).multiplyScalar(state.sunIntensity);
  lighting.uAmbient.value.copy(state.ambientColor).multiplyScalar(state.ambientIntensity);
  lighting.uFogColor.value.copy(state.fogColor);
  lighting.uFogNear.value = state.fogNear;
  lighting.uFogFar.value = state.fogFar;

  if (sky) {
    sky.uTop.value.copy(state.skyTop);
    sky.uMiddle.value.copy(state.skyMiddle);
    sky.uHorizon.value.copy(state.skyHorizon);
    sky.uSunGlow.value = state.sunGlow;
  }

  if (grass) {
    grass.uDry.value.copy(state.grassDry);
    grass.uOlive.value.copy(state.grassOlive);
    grass.uFresh.value.copy(state.grassFresh);
  }
}