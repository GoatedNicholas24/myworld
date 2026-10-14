import * as THREE from "three";
import { fbm } from "./noise.js";

// The real Karamoja mountains, placed where they really are (from map.json).
//
// A mountain 100 km away would be outside the camera's range, so anything
// further than VISUAL_LIMIT is drawn closer and smaller by the same amount.
// From where you stand it looks exactly the same size and direction.
const VISUAL_LIMIT = 25000;

const vertexShader = /* glsl */ `
  uniform float uPeak;
  varying float vFrac;
  varying vec3 vNormalW;

  void main() {
    vFrac = clamp(position.y / uPeak, 0.0, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uLow;
  uniform vec3 uMid;
  uniform vec3 uHigh;
  uniform float uDistance;
  uniform float uHazeDistance;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uAmbient;
  uniform vec3 uFogColor;
  varying float vFrac;
  varying vec3 vNormalW;

  void main() {
    // Dry land at the foot, forest higher up, bare rock at the top.
    vec3 base = vFrac < 0.45
      ? mix(uLow, uMid, vFrac / 0.45)
      : mix(uMid, uHigh, (vFrac - 0.45) / 0.55);

    vec3 n = normalize(vNormalW);
    float sun = clamp(dot(n, normalize(uSunDir)) * 0.8 + 0.2, 0.0, 1.0);
    vec3 lit = base * (uAmbient + uSunColor * sun);

    // Distance haze (the further away, the paler), and the foot melts into the horizon.
    float haze = 1.0 - exp(-uDistance / uHazeDistance);
    haze = mix(1.0, haze, smoothstep(0.0, 0.2, vFrac));

    gl_FragColor = vec4(mix(lit, uFogColor, haze), 1.0);
    #include <colorspace_fragment>
  }
`;

// A heightfield: a big mound shaped like an ellipse, roughened with noise.
function buildGeometry(mountain, segments, seed, index) {
  const peak = mountain.elevation - mountain.baseElevation;
  const extentX = mountain.radiusX * 1.1;
  const extentZ = mountain.radiusZ * 1.1;
  const size = segments + 1;
  const positions = new Float32Array(size * size * 3);
  const heights = new Float32Array(size * size);

  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const x = ((ix / segments) * 2 - 1) * extentX;
      const z = ((iz / segments) * 2 - 1) * extentZ;
      const d = Math.hypot(x / mountain.radiusX, z / mountain.radiusZ);
      const shape = Math.pow(Math.max(0, 1 - d), 1.15);
      const ridges = fbm(x / 2200 + index * 13, z / 2200 + index * 7, seed + 400 + index, 4);
      const height = peak * shape * (0.62 + 0.76 * ridges);

      const i = iz * size + ix;
      positions[i * 3] = x;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = z;
      heights[i] = height;
    }
  }

  // Only keep the squares that are actually part of the mountain.
  const indices = [];
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * size + ix;
      const b = a + 1;
      const c = a + size;
      const d = c + 1;
      if (Math.max(heights[a], heights[b], heights[c], heights[d]) <= 1) continue;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createMountains(map, geo, lighting, seed, quality) {
  const group = new THREE.Group();

  const items = map.mountains.map((mountain, index) => {
    const local = geo.toLocal(mountain.lat, mountain.lon);
    const colors = mountain.colors ?? {};
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPeak: { value: mountain.elevation - mountain.baseElevation },
        uLow: { value: new THREE.Color(colors.low ?? "#8a7a4a") },
        uMid: { value: new THREE.Color(colors.mid ?? "#5d6b3c") },
        uHigh: { value: new THREE.Color(colors.high ?? "#7d7364") },
        uDistance: { value: 1 },
        uHazeDistance: { value: map.mountainHaze ?? 45000 },
        uSunDir: lighting.uSunDir,
        uSunColor: lighting.uSunColor,
        uAmbient: lighting.uAmbient,
        uFogColor: lighting.uFogColor,
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      fog: false,
    });

    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    group.add(mesh);

    return {
      mountain,
      index,
      material,
      mesh,
      x: local.x,
      z: local.z,
      // Height of the foot compared with the start, sunk 8 m so the edge hides under the land.
      baseY: mountain.baseElevation - map.start.elevation - 8,
    };
  });

  function setQuality(q) {
    for (const item of items) {
      item.mesh.geometry.dispose();
      item.mesh.geometry = buildGeometry(item.mountain, q.landmarkSegments, seed, item.index);
    }
  }
  setQuality(quality);

  return {
    group,
    setQuality,
    // About 78% of the grid squares are part of a mountain.
    trianglesFor: (q) => Math.round(items.length * q.landmarkSegments * q.landmarkSegments * 2 * 0.78),
    update(camera) {
      for (const item of items) {
        const dx = item.x - camera.position.x;
        const dz = item.z - camera.position.z;
        const distance = Math.max(Math.hypot(dx, dz), 1);
        const s = Math.min(1, VISUAL_LIMIT / distance);

        item.mesh.scale.setScalar(s);
        item.mesh.position.set(
          camera.position.x + dx * s,
          camera.position.y + (item.baseY - camera.position.y) * s,
          camera.position.z + dz * s,
        );
        item.material.uniforms.uDistance.value = distance;
      }
    },
  };
}