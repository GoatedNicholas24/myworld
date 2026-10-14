import * as THREE from "three";
import { fbm } from "./noise.js";

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

// Layers of faraway hills in a ring around you. They are not hit by the fog;
// each layer fades into the haze by itself (the further, the hazier), which is
// what gives the horizon its depth. They follow the camera, so you never reach them.

const vertexShader = /* glsl */ `
  attribute float aLevel; // 0 at the bottom of the hill, 1 at the top
  varying float vLevel;
  void main() {
    vLevel = aLevel;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uTint;
  uniform float uHaze;
  uniform vec3 uAmbient;
  uniform vec3 uSunColor;
  uniform vec3 uFogColor;
  varying float vLevel;

  void main() {
    vec3 lit = uTint * (uAmbient + uSunColor * 0.4);
    // The bottom is fully hazy so it melts into the horizon.
    float haze = mix(1.0, uHaze, smoothstep(0.0, 0.7, vLevel));
    gl_FragColor = vec4(mix(lit, uFogColor, haze), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createHills(settings, lighting, seed) {
  const group = new THREE.Group();
  const segments = settings.segments;

  settings.layers.forEach((layer, index) => {
    const positions = new Float32Array((segments + 1) * 2 * 3);
    const levels = new Float32Array((segments + 1) * 2);
    const indices = [];

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * TAU;
      const dirX = Math.sin(angle);
      const dirZ = -Math.cos(angle);

      // Sampling the noise around a circle makes the ring join up with no seam.
      const n = fbm(
        Math.cos(angle) * layer.frequency + index * 50,
        Math.sin(angle) * layer.frequency + index * 50,
        seed + index * 31,
        3,
      );
      const top = layer.baseHeight + layer.amplitude * clamp((n - 0.35) / 0.35, 0, 1);

      const at = i * 6;
      positions[at] = dirX * layer.distance;
      positions[at + 1] = -40;
      positions[at + 2] = dirZ * layer.distance;
      positions[at + 3] = dirX * layer.distance;
      positions[at + 4] = top;
      positions[at + 5] = dirZ * layer.distance;
      levels[i * 2] = 0;
      levels[i * 2 + 1] = 1;
    }

    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aLevel", new THREE.BufferAttribute(levels, 1));
    geometry.setIndex(indices);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTint: { value: new THREE.Color(layer.tint) },
        uHaze: { value: layer.haze },
        uAmbient: lighting.uAmbient,
        uSunColor: lighting.uSunColor,
        uFogColor: lighting.uFogColor,
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      fog: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    group.add(mesh);
  });

  return {
    group,
    triangles: settings.layers.length * segments * 2,
    update(camera) {
      group.position.set(camera.position.x, 0, camera.position.z);
    },
  };
}