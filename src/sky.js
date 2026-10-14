import * as THREE from "three";

// A big dome that follows the camera. It paints a gradient from the horizon
// up to the top of the sky, plus a soft sun with a glow around it.

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMiddle;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunGlow;
  varying vec3 vDir;

  void main() {
    vec3 dir = normalize(vDir);
    float h = max(dir.y, 0.0);

    vec3 color = mix(uHorizon, uMiddle, smoothstep(0.0, 0.18, h));
    color = mix(color, uTop, smoothstep(0.12, 0.75, h));

    float s = max(dot(dir, normalize(uSunDir)), 0.0);
    float halo = pow(s, 6.0) * 0.35 + pow(s, 48.0) * 0.55;
    float disc = smoothstep(0.9990, 0.9996, s);

    color += uSunColor * halo * uSunGlow;
    color = mix(color, uSunColor * 1.6 + 0.2, disc * clamp(uSunGlow * 2.0, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const WIDTH_SEGMENTS = 32;
const HEIGHT_SEGMENTS = 16;

export function createSky(lighting) {
  const uniforms = {
    uTop: { value: new THREE.Color() },
    uMiddle: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunGlow: { value: 1 },
    // These two are shared with the grass, so the sun is the same everywhere.
    uSunDir: lighting.uSunDir,
    uSunColor: lighting.uSunColor,
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, WIDTH_SEGMENTS, HEIGHT_SEGMENTS), material);
  mesh.scale.setScalar(700);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;

  return {
    mesh,
    uniforms,
    triangles: WIDTH_SEGMENTS * (HEIGHT_SEGMENTS * 2 - 2),
    // Keep the dome centred on the camera so you can never walk out of it.
    update(camera) {
      mesh.position.copy(camera.position);
    },
  };
}