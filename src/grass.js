import * as THREE from "three";
import { fbm, makeRandom } from "./noise.js";

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, low, high) => Math.min(Math.max(v, low), high);
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Each blade is one instance of the same tiny shape. The shader below bends
// it, sways it in the wind and colours it, so the CPU does almost no work.
const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uWindDir;
  uniform float uWindSpeed;
  uniform float uWindWaveLength;
  uniform float uWindStrength;
  uniform vec3 uDry;
  uniform vec3 uOlive;
  uniform vec3 uFresh;

  attribute vec3 aParams; // x = colour tone (0 dry .. 1 fresh), y = lean, z = random phase

  varying vec3 vColor;
  varying float vHeight;
  varying vec3 vNormal;
  varying float vFogDepth;

  void main() {
    float t = position.y; // 0 at the root, 1 at the tip

    // Curve: the blade leans forward more and more toward the tip.
    vec3 local = position;
    local.z += aParams.y * t * t;

    mat4 instanceToWorld = modelMatrix * instanceMatrix;
    vec4 world = instanceToWorld * vec4(local, 1.0);
    vec3 root = instanceToWorld[3].xyz;
    float bladeHeight = length(instanceToWorld[1].xyz);

    // Slow waves that travel across the field, plus a tiny flutter per blade.
    float phase = (dot(root.xz, uWindDir) - uTime * uWindSpeed) / uWindWaveLength;
    float wave = sin(phase * 6.2831853);
    float flutter = sin(uTime * 1.7 + aParams.z);
    float sway = (wave * 0.6 + 0.4) + flutter * 0.08;
    float bend = sway * uWindStrength * bladeHeight * t * t;
    world.xz += uWindDir * bend;
    world.y -= abs(bend) * 0.3;

    vec4 viewPosition = viewMatrix * world;
    gl_Position = projectionMatrix * viewPosition;
    vFogDepth = -viewPosition.z;

    // Colour: dry straw -> olive -> fresh green.
    float tone = aParams.x;
    vColor = tone < 0.5
      ? mix(uDry, uOlive, tone * 2.0)
      : mix(uOlive, uFresh, tone * 2.0 - 1.0);

    vHeight = t;
    vNormal = normalize(mat3(instanceToWorld) * vec3(0.0, 0.0, 1.0));
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uAmbient;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec3 vColor;
  varying float vHeight;
  varying vec3 vNormal;
  varying float vFogDepth;

  void main() {
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    // Mostly point the blade's "up" so the whole field lights evenly.
    n = normalize(mix(vec3(0.0, 1.0, 0.0), n, 0.35));

    float sunAmount = clamp(dot(n, normalize(uSunDir)) * 0.6 + 0.4, 0.0, 1.0);

    // Darker at the roots, lighter at the tips.
    float shade = mix(0.42, 1.08, vHeight);
    vec3 color = vColor * shade * (uAmbient + uSunColor * sunAmount);
    color += vColor * uSunColor * pow(vHeight, 3.0) * 0.18; // sun glowing through the tips

    float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
    gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
    #include <colorspace_fragment>
  }
`;

// One slightly tapered blade, 1 unit tall, made of a few rows of vertices.
function createBladeGeometry(segments) {
  const positions = [];
  const indices = [];

  for (let row = 0; row < segments; row++) {
    const t = row / segments;
    const halfWidth = 0.5 * Math.pow(1 - t, 0.8);
    positions.push(-halfWidth, t, 0, halfWidth, t, 0);
  }
  positions.push(0, 1, 0); // the tip

  for (let row = 0; row < segments - 1; row++) {
    const a = row * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  const last = (segments - 1) * 2;
  indices.push(last, last + 1, segments * 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function createGrass(settings, wind, terrain, seed, lighting, quality) {
  const uniforms = {
    ...lighting,
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(wind.direction[0], wind.direction[1]).normalize() },
    uWindSpeed: { value: wind.speed },
    uWindWaveLength: { value: wind.waveLength },
    uWindStrength: { value: wind.strength },
    uDry: { value: new THREE.Color() },
    uOlive: { value: new THREE.Color() },
    uFresh: { value: new THREE.Color() },
  };

  // One material for all the grass, reused whenever quality changes.
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  let blades = null;
  let bladeCount = 0;
  let trianglesPerBlade = 0;

  const bladeCountFor = (q) =>
    Math.round(Math.PI * settings.fieldRadius * settings.fieldRadius * settings.density * q.grassDensityScale);
  const trianglesPerBladeFor = (q) => 2 * (q.bladeSegments - 1) + 1;

  function setQuality(q) {
    if (blades) {
      group.remove(blades);
      blades.geometry.dispose();
      blades.dispose();
    }

    const count = bladeCountFor(q);
    const geometry = createBladeGeometry(q.bladeSegments);
    blades = new THREE.InstancedMesh(geometry, material, count);
    blades.frustumCulled = false;

    const random = makeRandom(seed + 101);
    const params = new Float32Array(count * 3);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    const radius = settings.fieldRadius;
    const [minHeight, maxHeight] = settings.bladeHeight;
    const [minLean, maxLean] = settings.lean;

    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 20) {
      attempts++;

      // Pick a random spot inside a circle around the middle.
      const r = radius * Math.sqrt(random());
      const angle = random() * TAU;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;

      // No grass on bare soil patches.
      if (random() < terrain.soilAt(x, z) * 1.15) continue;

      // Taller and shorter clumps, and blades fade to short at the field's edge.
      const clump = 0.7 + 0.6 * fbm(x / 7 + 40, z / 7 + 40, seed + 6, 2);
      const edge = 1 - smoothstep(radius * 0.8, radius, r);
      const height = lerp(minHeight, maxHeight, random()) * clump * (0.15 + 0.85 * edge);
      const width = settings.bladeWidth * q.bladeWidthScale * (0.8 + 0.5 * random());

      position.set(x, terrain.heightAt(x, z) - 0.03, z);
      rotation.setFromAxisAngle(up, random() * TAU);
      scale.set(width, height, height);
      matrix.compose(position, rotation, scale);
      blades.setMatrixAt(placed, matrix);

      // Colour tone: dry and green patches across the field, plus random variety.
      const patchTone = clamp((fbm(x / 14 + 90, z / 14 + 90, seed + 3, 2) - 0.5) * 2.4 + 0.5, 0, 1);
      params[placed * 3] = clamp(patchTone * 0.7 + random() * 0.3, 0, 1);
      params[placed * 3 + 1] = lerp(minLean, maxLean, random());
      params[placed * 3 + 2] = random() * TAU;

      placed++;
    }

    blades.count = placed;
    geometry.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 3));
    group.add(blades);

    bladeCount = placed;
    trianglesPerBlade = trianglesPerBladeFor(q);
  }

  setQuality(quality);

  return {
    group,
    uniforms,
    setQuality,
    update(time) {
      uniforms.uTime.value = time;
    },
    trianglesFor: (q) => bladeCountFor(q) * trianglesPerBladeFor(q),
    triangles: () => bladeCount * trianglesPerBlade,
  };
}