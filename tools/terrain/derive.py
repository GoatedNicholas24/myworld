"""Stage 3: rivers and derived maps (slope, wetness, rock, river distance) from the heightmap,
then biome and resource-density maps from data/biomes.json and data/resource_rules.json."""
import hashlib
import numpy as np
from scipy import ndimage

from landforms import N, priority_flood, accumulate, value_noise, fbm, smoothstep

CELL_M = 10.0
RIVER_MIN_KM2 = 5.0        # drained area where a stream becomes a "river" for the maps
RIVER_DIST_CAP_M = 2000.0


def slope_rise_run(z):
    gy, gx = np.gradient(z, CELL_M)
    return np.hypot(gx, gy).astype(np.float32)


def rivers(z, log=print):
    """Find the river network on a 1001 grid (20 m), carve channels into z, and return
    (z_carved, centreline_mask, half_width_m, log_area_up).  All at 2001 resolution."""
    half = z[::2, ::2]
    log("  flow routing at 20 m")
    # Route on a slightly roughened surface: on a gently tilted floor plain D8 sends every
    # cell the same way and draws ruler-straight diagonal rivers. A little cell-scale
    # roughness (smaller than the valleys are deep) makes channels wander.
    rng = np.random.default_rng(1234)
    rough = ndimage.gaussian_filter(rng.normal(0, 1, half.shape), 0.9) * 2.6
    zf, parent, order, dist = priority_flood(ndimage.gaussian_filter(half, 1.0) + rough, eps=1e-2)
    area_km2 = accumulate(parent, order, np.full(half.shape, 0.0004))   # 20 m cell = 0.0004 km2
    # bring the 1001 grid up to 2001 (same corners)
    ax = np.linspace(0, half.shape[0] - 1, N)
    R, C = np.meshgrid(ax, ax, indexing="ij")
    logA = ndimage.map_coordinates(np.log1p(area_km2 * 100.0).astype(np.float32), [R, C], order=1)
    A_up = np.expm1(logA) / 100.0
    centre = A_up >= RIVER_MIN_KM2
    # thin the line: keep cells that are local maxima of drainage across the channel
    width = np.clip(2.2 * np.power(np.maximum(A_up, 1e-6), 0.38), 1.5, 40.0).astype(np.float32)  # half-width, m

    # carve channels: depth grows with drained area, smooth shoulder either side
    d_c, idx = ndimage.distance_transform_edt(~centre, return_distances=True, return_indices=True)
    d_c = (d_c * CELL_M).astype(np.float32)
    w_near = width[idx[0], idx[1]]
    depth = np.clip(1.2 * np.power(np.maximum(A_up[idx[0], idx[1]], 1e-6), 0.35), 0.8, 9.0)
    shoulder = np.exp(-np.square(np.maximum(d_c - w_near, 0) / (w_near * 1.6 + 20.0)))
    z2 = z - (depth * shoulder * (A_up[idx[0], idx[1]] >= RIVER_MIN_KM2)).astype(np.float32)
    z2 = np.maximum(z2, 930.0)
    river_dist = np.clip(np.maximum(d_c - w_near, 0), 0, RIVER_DIST_CAP_M).astype(np.float32)
    # meander: bend the straight D8 lines. The same displacement is applied to the height and to
    # the river maps, so channels, banks and distances stay consistent with each other.
    big = (value_noise(z.shape, 900, 41, CELL_M) - 0.5) * 2 * 95.0 / CELL_M
    small = (value_noise(z.shape, 260, 42, CELL_M) - 0.5) * 2 * 22.0 / CELL_M
    big2 = (value_noise(z.shape, 900, 43, CELL_M) - 0.5) * 2 * 95.0 / CELL_M
    small2 = (value_noise(z.shape, 260, 44, CELL_M) - 0.5) * 2 * 22.0 / CELL_M
    ar = np.arange(N, dtype=np.float32)
    R2, C2 = np.meshgrid(ar, ar, indexing="ij")
    coords = [R2 + big + small, C2 + big2 + small2]
    z2 = ndimage.map_coordinates(z2, coords, order=3, mode="nearest")
    river_dist = ndimage.map_coordinates(river_dist, coords, order=1, mode="nearest")
    logA = ndimage.map_coordinates(logA, coords, order=1, mode="nearest")
    A_up = ndimage.map_coordinates(A_up, coords, order=1, mode="nearest")
    return z2.astype(np.float32), river_dist, logA, A_up


def derive_maps(z, river_dist, logA, A_up, seed=7):
    cell = CELL_M
    s = slope_rise_run(z)
    # wetness: near water, in drainage convergence, and where the mountains catch rain
    twi = logA - np.log(s + 0.03)
    twi_n = np.clip((twi - np.percentile(twi, 5)) / (np.percentile(twi, 99.5) - np.percentile(twi, 5)), 0, 1)
    prox = np.exp(-river_dist / 260.0)
    orog = smoothstep(1100, 2300, z) * (1.0 - 0.55 * smoothstep(3300, 4800, z))
    moist = fbm(z.shape, 3500, 4, seed + 31, cell)
    # a drier south-west (the savannah side) and a wetter north-east
    yy, xx = np.meshgrid(np.linspace(0, 1, z.shape[0], dtype=np.float32),
                         np.linspace(0, 1, z.shape[1], dtype=np.float32), indexing="ij")
    dry_sw = smoothstep(0.35, 1.0, yy * 0.65 + (1.0 - xx) * 0.35)
    wet = (0.36 * prox + 0.20 * twi_n + 0.34 * orog + 0.75 * (moist - 0.5) - 0.20 * dry_sw + 0.06)
    wet = np.clip(wet, 0, 1).astype(np.float32)
    wet = ndimage.gaussian_filter(wet, 1.5)

    # rock: steep ground, high ground and some noisy outcrops on old surfaces
    outcrop = fbm(z.shape, 700, 3, seed + 32, cell, ridged=True)
    rock = (0.85 * smoothstep(0.35, 1.0, s) + 0.65 * smoothstep(3700, 4500, z)
            + 0.30 * outcrop * smoothstep(0.1, 0.4, s) + 0.18 * (outcrop - 0.35) * smoothstep(0.0, 0.3, 0.3 - s))
    rock = np.clip(rock, 0, 1).astype(np.float32)
    return s, wet, rock


# ------------------------------------------------------------------ rule engine
def noise_map(name, shape, seed=7):
    """Stable 0..1 noise for `noise:<name>`; the name picks the seed and the feature size."""
    h = int(hashlib.sha256(name.encode()).hexdigest()[:8], 16)
    wl = 700 + (h % 7) * 250
    return fbm(shape, wl, 4, (h % 9973) + seed, CELL_M).astype(np.float32)


def condition_weight(value, cond):
    lo, hi, fade = cond["min"], cond["max"], max(cond["fade"], 1e-9)
    below = np.clip((value - (lo - fade)) / fade, 0, 1)
    above = np.clip(((hi + fade) - value) / fade, 0, 1)
    w = np.minimum(below, above)
    return w * w * (3 - 2 * w)


class RuleMaps:
    def __init__(self, z, slope_rr, wet, rock, river_dist, seed=7):
        self.maps = {"elevation_m": z, "slope": slope_rr, "wetness": wet, "rock": rock,
                     "river_dist_m": river_dist}
        self.seed = seed
        self.shape = z.shape

    def get(self, name):
        if name not in self.maps:
            assert name.startswith("noise:"), f"unknown map {name}"
            self.maps[name] = noise_map(name, self.shape, self.seed)
        return self.maps[name]

    def rule_weight(self, conditions):
        w = np.ones(self.shape, np.float32)
        for c in conditions:
            w *= condition_weight(self.get(c["map"]), c)
        return w


def biome_map(rm, biomes):
    best = np.full(rm.shape, -1.0, np.float32)
    out = np.zeros(rm.shape, np.uint8)
    shares = {}
    for idx, b in enumerate(biomes):
        score = rm.rule_weight(b["conditions"]) * float(b["priority"])
        win = score > best            # strict: ties go to the earlier biome in the file
        best = np.where(win, score, best)
        out = np.where(win, idx, out).astype(np.uint8)
    for idx, b in enumerate(biomes):
        shares[b["id"]] = float((out == idx).mean())
    return out, best, shares


def density_maps(rm, rules):
    maps = {}
    for r in rules:
        maps[r["id"]] = np.round(rm.rule_weight(r["conditions"]) * 255).astype(np.uint8)
    return maps
