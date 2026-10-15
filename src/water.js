import * as THREE from "three";
import { valueNoise } from "./noise.js";

// ---- Lake: a flat disc with a painted, rippling surface -----------------------
const lakeVertex = /* glsl */ `
  varying vec3 vWorld;
  varying float vFogDepth;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 view = viewMatrix * world;
    vFogDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;

const lakeFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uAmbient;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vWorld;
  varying float vFogDepth;

  void main() {
    vec2 p = vWorld.xz;
    // Gentle ripples: the slope of a few moving waves.
    float dx = 0.41 * cos(p.x * 0.9 + uTime * 1.1) + 0.2 * cos(p.x * 2.1 + p.y * 1.3 - uTime * 1.7);
    float dz = 0.65 * cos(p.y * 1.3 - uTime * 0.9) + 0.2 * cos(p.y * 2.4 - p.x * 0.8 + uTime * 1.3);
    vec3 n = normalize(vec3(-dx * 0.12, 1.0, -dz * 0.12));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);

    vec3 body = mix(uDeep, uShallow, 0.4 + 0.2 * sin(p.x * 0.15 + p.y * 0.11));
    vec3 color = mix(body * (uAmbient + uSunColor * 0.35), uFogColor, fresnel * 0.6 + 0.15);

    // A glint where the sun reflects.
    vec3 r = reflect(-normalize(uSunDir), n);
    color += uSunColor * pow(max(dot(r, viewDir), 0.0), 60.0) * 0.6;

    float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
    gl_FragColor = vec4(mix(color, uFogColor, fog), 0.92);
    #include <colorspace_fragment>
  }
`;

// ---- Waterfall: a tall sheet with falling streaks and foam at the bottom --------
const fallVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vFogDepth;
  void main() {
    vUv = uv;
    vec4 view = viewMatrix * modelMatrix * vec4(position, 1.0);
    vFogDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;

const fallFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunColor;
  uniform vec3 uAmbient;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec2 vUv;
  varying float vFogDepth;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    float y = vUv.y; // 0 at the bottom, 1 at the top
    float streaks = 0.55 * noise(vec2(vUv.x * 22.0, y * 3.0 + uTime * 2.2))
                  + 0.45 * noise(vec2(vUv.x * 55.0 + 4.0, y * 5.0 + uTime * 3.4));
    float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    float foam = smoothstep(0.22, 0.0, y);

    vec3 water = mix(vec3(0.62, 0.80, 0.88), vec3(1.0), streaks * 0.7 + foam);
    vec3 lit = water * (uAmbient + uSunColor * 0.5);
    float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
    gl_FragColor = vec4(mix(lit, uFogColor, fog), edge * mix(0.55, 0.9, streaks));
    #include <colorspace_fragment>
  }
`;

// A soft white puff, drawn once and reused for the mist.
function mistTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A rocky cliff wall for the waterfall: a bumpy box with banded rock colours.
function createCliff(width, height, depth) {
  const geometry = new THREE.BoxGeometry(width, height, depth, 6, 8, 3);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const dark = new THREE.Color("#6e5f4e");
  const light = new THREE.Color("#9a8a74");
  const color = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    // The bumps depend only on position, so neighbouring faces stay joined.
    const n1 = valueNoise(x * 0.4 + z * 0.3, y * 0.4 + z * 0.2, 61);
    const n2 = valueNoise(x * 0.5 + 9, y * 0.3 + z * 0.4, 62);
    position.setX(i, x + (n2 - 0.5) * 1.2);
    position.setZ(i, z + (n1 - 0.5) * 1.4);
    color.copy(dark).lerp(light, 0.5 + 0.5 * Math.sin(y * 2.7 + n1 * 3));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createWater(local, terrain, lighting) {
  const group = new THREE.Group();
  const clocks = [];
  const puffs = [];
  const shared = {
    uSunDir: lighting.uSunDir,
    uSunColor: lighting.uSunColor,
    uAmbient: lighting.uAmbient,
    uFogColor: lighting.uFogColor,
    uFogNear: lighting.uFogNear,
    uFogFar: lighting.uFogFar,
  };

  for (const lake of terrain.lakes) {
    const uniforms = {
      ...shared,
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color("#5fa6a0") },
      uDeep: { value: new THREE.Color("#1f5f73") },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: lakeVertex,
      fragmentShader: lakeFragment,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(lake.radius * 1.3, 48).rotateX(-Math.PI / 2), material);
    mesh.position.set(lake.x, lake.level, lake.z);
    mesh.renderOrder = 2;
    group.add(mesh);
    clocks.push(uniforms.uTime);
  }

  const puffTexture = mistTexture();

  for (const fall of local.waterfalls ?? []) {
    const lake = terrain.lakes[fall.lake];
    if (!lake) continue;

    // The waterfall stands on the lake's edge and faces the middle of the lake.
    const anchorX = lake.x + Math.cos(fall.angle) * lake.radius;
    const anchorZ = lake.z + Math.sin(fall.angle) * lake.radius;
    const towardX = -Math.cos(fall.angle);
    const towardZ = -Math.sin(fall.angle);
    const facing = Math.atan2(towardX, towardZ);
    const depth = 6.5;
    const base = lake.level - 1.5;

    const cliff = new THREE.Mesh(
      createCliff(fall.width * 3.2, fall.height + 1.5, depth),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    cliff.position.set(
      anchorX - towardX * (depth / 2 - 0.3),
      base + (fall.height + 1.5) / 2,
      anchorZ - towardZ * (depth / 2 - 0.3),
    );
    cliff.rotation.y = facing;
    group.add(cliff);

    const uniforms = {
      uTime: { value: 0 },
      uSunColor: shared.uSunColor,
      uAmbient: shared.uAmbient,
      uFogColor: shared.uFogColor,
      uFogNear: shared.uFogNear,
      uFogFar: shared.uFogFar,
    };
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(fall.width, fall.height),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: fallVertex,
        fragmentShader: fallFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    sheet.position.set(anchorX + towardX * 0.45, lake.level + fall.height / 2, anchorZ + towardZ * 0.45);
    sheet.rotation.y = facing;
    sheet.renderOrder = 3;
    group.add(sheet);
    clocks.push(uniforms.uTime);

    // Mist rising where the water lands.
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: puffTexture, transparent: true, depthWrite: false, opacity: 0.4 }),
      );
      const sideways = (i - 2.5) * (fall.width / 7);
      puff.position.set(
        anchorX + towardX * 2.5 + towardZ * sideways,
        lake.level + 0.5,
        anchorZ + towardZ * 2.5 - towardX * sideways,
      );
      puff.scale.setScalar(4 + (i % 3));
      puffs.push({ puff, baseY: lake.level + 0.5, phase: i * 0.17 });
      group.add(puff);
    }
  }

  return {
    group,
    update(time) {
      for (const clock of clocks) clock.value = time;
      for (const item of puffs) {
        const t = (time * 0.3 + item.phase) % 1; // each puff rises, fades and starts again
        item.puff.position.y = item.baseY + t * 3;
        item.puff.material.opacity = 0.45 * Math.sin(t * Math.PI);
      }
    },
  };
}