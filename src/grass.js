import * as THREE from "three";
import { fbm, makeRandom, hashCell } from "./noise.js";
import { createChunkManager, countChunks } from "./chunks.js";

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, low, high) => Math.min(Math.max(v, low), high);

// Each blade is one instance of the same tiny shape. The shader below bends
// it, sways it in the wind, shrinks it with distance and colours it, so the
// CPU does almost no work.
const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCameraPos;
  uniform float uFadeStart;
  uniform float uFadeEnd;
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

    // Far blades shrink down to their root, so the edge of the grass
    // melts away instead of ending in a visible line.
    float distanceToCamera = distance(root.xz, uCameraPos.xz);
    float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distanceToCamera);
    world.xyz = mix(root, world.xyz, fade);

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

export function createGrass(settings, wind, terrain, seed, lighting, quality, camera) {
  const chunkSize = settings.chunkSize;
  // Chunks are built a little beyond the point where blades fade out.
  const loadRadius = settings.fieldRadius + chunkSize * 0.9;

  const uniforms = {
    ...lighting,
    uTime: { value: 0 },
    uCameraPos: { value: new THREE.Vector3() },
    uFadeStart: { value: settings.fieldRadius * 0.7 },
    uFadeEnd: { value: settings.fieldRadius },
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
  const pool = []; // chunk meshes that are not in use, kept for reuse
  let current = quality;
  let bladeGeometry = null;
  let capacity = 0;

  const bladesPerChunk = (q) =>
    Math.round(chunkSize * chunkSize * settings.density * q.grassDensityScale);
  const trianglesPerBlade = (q) => 2 * (q.bladeSegments - 1) + 1;
  const chunkCount = countChunks(chunkSize, loadRadius);

  function createChunkMesh() {
    // Each chunk needs its own copy of the tiny blade shape, because the
    // per-blade colour/lean numbers are stored on it.
    const geometry = bladeGeometry.clone();
    geometry.setAttribute(
      "aParams",
      new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
    );
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.boundingSphere = new THREE.Sphere(); // set properly when the chunk is filled
    return mesh;
  }

  // Scatter the blades of one chunk. The same chunk always gets the same blades.
  function fillChunk(mesh, ix, iz) {
    const random = makeRandom(hashCell(ix, iz, seed + 101));
    const params = mesh.geometry.attributes.aParams;
    const x0 = ix * chunkSize;
    const z0 = iz * chunkSize;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const [minHeight, maxHeight] = settings.bladeHeight;
    const [minLean, maxLean] = settings.lean;

    let placed = 0;
    for (let slot = 0; slot < capacity; slot++) {
      const x = x0 + random() * chunkSize;
      const z = z0 + random() * chunkSize;

      // Grass grows in patches, thins out, and never grows on bare soil.
      const cover = terrain.grassCoverAt(x, z) * (1 - Math.min(1, terrain.soilAt(x, z) * 1.15));
      if (random() > cover) continue;

      // Taller and shorter clumps across the land.
      const clump = 0.7 + 0.6 * fbm(x / 7 + 40, z / 7 + 40, seed + 6, 2);
      const height = lerp(minHeight, maxHeight, random()) * clump;
      const width = settings.bladeWidth * current.bladeWidthScale * (0.8 + 0.5 * random());

      position.set(x, terrain.heightAt(x, z) - 0.02, z);
      rotation.setFromAxisAngle(up, random() * TAU);
      scale.set(width, height, height);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(placed, matrix);

      // Colour tone: dry and green patches across the land, plus random variety.
      const patchTone = clamp((fbm(x / 14 + 90, z / 14 + 90, seed + 3, 2) - 0.5) * 2.4 + 0.5, 0, 1);
      params.array[placed * 3] = clamp(patchTone * 0.7 + random() * 0.3, 0, 1);
      params.array[placed * 3 + 1] = lerp(minLean, maxLean, random());
      params.array[placed * 3 + 2] = random() * TAU;

      placed++;
    }

    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    params.needsUpdate = true;

    // Tells Three.js where this chunk is, so chunks behind you are skipped.
    mesh.boundingSphere.center.set(
      x0 + chunkSize / 2,
      terrain.heightAt(x0 + chunkSize / 2, z0 + chunkSize / 2),
      z0 + chunkSize / 2,
    );
    mesh.boundingSphere.radius = chunkSize * 0.75 + 14;
  }

  function build(ix, iz) {
    const mesh = pool.pop() ?? createChunkMesh();
    fillChunk(mesh, ix, iz);
    mesh.visible = true;
    if (!mesh.parent) group.add(mesh);
    return mesh;
  }

  function release(mesh) {
    mesh.visible = false;
    pool.push(mesh);
  }

  const manager = createChunkManager({ chunkSize, loadRadius, build, release, perFrame: 2 });

  function setQuality(q) {
    current = q;

    for (const mesh of group.children) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    group.clear();
    pool.length = 0;
    manager.clear();

    if (bladeGeometry) bladeGeometry.dispose();
    bladeGeometry = createBladeGeometry(q.bladeSegments);
    capacity = bladesPerChunk(q);

    manager.rebuildAll(camera.position.x, camera.position.z);
  }

  setQuality(quality);

  return {
    group,
    uniforms,
    setQuality,
    update(time, cam) {
      uniforms.uTime.value = time;
      uniforms.uCameraPos.value.copy(cam.position);
      manager.update(cam.position.x, cam.position.z);
    },
    // The most blades there could be; the real number is lower where grass is thin.
    trianglesFor: (q) => chunkCount * bladesPerChunk(q) * trianglesPerBlade(q),
  };
}