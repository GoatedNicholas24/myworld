import { fbm, valueNoise, makeRandom } from "./noise.js";

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

// The shape of the land: gentle hills and a few patches of bare soil.
// Other code asks it two questions:
//   heightAt(x, z) -> how high is the ground here?
//   soilAt(x, z)   -> how much bare soil is here? (0 = none, 1 = fully bare)
export function createTerrain(settings, seed) {
  const random = makeRandom(seed);
  const [minRadius, maxRadius] = settings.soilPatchRadius;

  const patches = [];
  for (let i = 0; i < settings.soilPatchCount; i++) {
    const angle = random() * Math.PI * 2;
    // Keep patches away from the starting spot (8 metres) so you start in grass.
    const distance = 8 + (settings.soilPatchSpread - 8) * Math.sqrt(random());
    patches.push({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      radius: minRadius + (maxRadius - minRadius) * random(),
    });
  }

  function heightAt(x, z) {
    const n = fbm(x / settings.hillScale + 31.7, z / settings.hillScale + 12.3, seed, 3);
    return (n - 0.5) * 2 * settings.hillHeight;
  }

  function soilAt(x, z) {
    let best = 0;
    for (const patch of patches) {
      const dx = x - patch.x;
      const dz = z - patch.z;
      // The wobble makes each patch an uneven shape instead of a perfect circle.
      const wobble = 0.7 + 0.6 * valueNoise(x * 0.3, z * 0.3, seed + 9);
      const d = Math.sqrt(dx * dx + dz * dz) / (patch.radius * wobble);
      best = Math.max(best, 1 - smoothstep(0.6, 1.0, d));
    }
    return best;
  }

  return { size: settings.size, heightAt, soilAt, patches };
}