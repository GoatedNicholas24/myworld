// Small, fast, repeatable random and noise helpers.
// The same seed always gives the same world.

export function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Turns a grid cell (ix, iz) into a repeatable number.
// Used so that every chunk of the world always gets the same random layout.
export function hashCell(ix, iz, salt = 0) {
  let h = Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ Math.imul(salt, 83492791);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

// Smooth random value between 0 and 1 that changes gently from place to place.
export function valueNoise(x, z, seed = 0) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fz;
}

// Several layers of noise added together: big shapes plus finer detail.
export function fbm(x, z, seed = 0, octaves = 3) {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * frequency, z * frequency, seed + i * 17) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}