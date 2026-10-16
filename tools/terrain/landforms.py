"""Stage 2a: build the master heightfield for the Great Lakes region.

Everything is deterministic (fixed seeds). Pipeline:
  1. A coarse 501 x 501 field (40 m cells) is built from the nine design landmarks.
  2. Stream-power erosion carves valleys into it (drainage routed with priority-flood).
  3. A low-frequency correction pins every landmark back to its design elevation.
  4. The result is resampled to 2001 x 2001 (10 m cells) and fine detail is added.

Axes: x east, y north. Arrays are indexed [row, col], row 0 = north, col 0 = west.
"""
import heapq
import numpy as np
from scipy import ndimage

WORLD_M = 20000.0
N = 2001            # master samples per side (cell = 10 m)
NC = 501            # coarse samples per side (cell = 40 m)
ELEV_FLOOR = 930.0
ELEV_CEIL = 5200.0

# name, x_km (east), y_km (from north), design range (m), target mean (m), radius (km)
LANDMARKS = [
    ("Mount Rwenzori-like Range", 10, 3, (3000, 5200), 3900, 3.0),
    ("Northern Highlands", 4, 4, (1800, 2800), 2300, 4.5),
    ("Eastern Highlands", 17, 6, (1600, 2600), 2100, 4.5),
    ("Western Plateau", 3, 10, (1500, 2400), 1950, 4.5),
    ("Central Valley", 10, 10, (1000, 1500), 1250, 4.0),
    ("Rift Escarpment", 17, 11, (1200, 2200), 1700, 3.5),
    ("Savannah Plains", 5, 17, (900, 1400), 1150, 4.5),
    ("Southern Hills", 9, 16, (1000, 1800), 1400, 4.0),
    ("Forest Plateau", 15, 18, (1400, 2200), 1800, 4.5),
]


# ------------------------------------------------------------------ noise
def value_noise(shape, wavelength_m, seed, cell_m):
    """Smooth 0..1 noise with the given feature size. Stable for a given seed and shape."""
    rng = np.random.default_rng(seed)
    gh = int(np.ceil(shape[0] * cell_m / wavelength_m)) + 3
    gw = int(np.ceil(shape[1] * cell_m / wavelength_m)) + 3
    g = rng.random((gh, gw)).astype(np.float32)
    zr, zc = shape[0] / (gh - 3), shape[1] / (gw - 3)
    rr = (np.arange(shape[0], dtype=np.float32) / zr) + 1.0
    cc = (np.arange(shape[1], dtype=np.float32) / zc) + 1.0
    R, C = np.meshgrid(rr, cc, indexing="ij")
    out = ndimage.map_coordinates(g, [R, C], order=3, mode="nearest")
    return np.clip(out, 0, 1)


def fbm(shape, base_wavelength_m, octaves, seed, cell_m, ridged=False, gain=0.5):
    total = np.zeros(shape, np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        n = value_noise(shape, base_wavelength_m / (2 ** o), seed * 101 + o, cell_m)
        if ridged:
            n = 1.0 - np.abs(2.0 * n - 1.0)
            n = n * n
        total += amp * n
        norm += amp
        amp *= gain
    return total / norm


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ base field
def coarse_axes():
    v = np.linspace(0, WORLD_M / 1000.0, NC, dtype=np.float32)
    X, Y = np.meshgrid(v, v, indexing="xy")  # X east (cols), Y km from north (rows)
    return X, Y


def blended_targets(X, Y):
    """Smooth macro elevation: inverse-distance blend of the landmark targets (no circular blobs)."""
    wsum = np.zeros(X.shape, np.float32)
    acc = np.zeros(X.shape, np.float32)
    for _, x, y, _, tgt, r in LANDMARKS:
        d2 = ((X - x) ** 2 + (Y - y) ** 2) / (r * r)
        w = (1.0 / (d2 + 0.15)) ** 1.4
        acc += w * tgt
        wsum += w
    return acc / wsum


def base_field(seed=7):
    X, Y = coarse_axes()
    macro = blended_targets(X, Y)
    shape = X.shape
    cell = WORLD_M / (NC - 1)

    # warp so the map does not look like a clean blend of circles
    wx = (value_noise(shape, 5000, seed + 1, cell) - 0.5) * 2.4
    wy = (value_noise(shape, 5000, seed + 2, cell) - 0.5) * 2.4
    Xw, Yw = X + wx, Y + wy
    macro = blended_targets(Xw, Yw)

    z = macro + (fbm(shape, 6000, 4, seed + 3, cell) - 0.5) * 380.0
    # an outlet trough so the Central Valley drains to the south-west instead of ponding
    path = [(10.0, 8.5), (9.6, 10.5), (8.2, 12.6), (6.6, 14.6), (5.0, 17.0), (3.0, 19.0), (1.0, 20.5)]
    dmin = np.full(X.shape, 99.0, np.float32)
    for (x0, y0), (x1, y1) in zip(path[:-1], path[1:]):
        vx, vy = x1 - x0, y1 - y0
        t = np.clip(((X - x0) * vx + (Y - y0) * vy) / (vx * vx + vy * vy), 0, 1)
        dmin = np.minimum(dmin, np.hypot(X - (x0 + t * vx), Y - (y0 + t * vy)))
    z -= 120.0 * np.exp(-(dmin / 1.1) ** 2)
    # ridged relief so erosion has something to organise into valleys and spurs
    rel = fbm(shape, 3200, 5, seed + 6, cell, ridged=True)
    hi = smoothstep(1300, 2400, macro)
    z += (rel - 0.3) * (100.0 + 340.0 * hi)
    # the land falls gently toward the south-west (the lake side)
    z -= 250.0 * smoothstep(0.45, 1.0, (Y / 20.0) * 0.6 + (1.0 - X / 20.0) * 0.4)

    # Rift escarpment: a steep step running roughly north-south near x = 16.5 km
    line = 16.4 + (value_noise(shape, 4000, seed + 4, cell) - 0.5) * 1.8
    band = smoothstep(4.0, 6.5, Y) * (1 - smoothstep(15.5, 18.0, Y))
    step = 1.0 / (1.0 + np.exp(-(X - line) / 0.22))
    z += 540.0 * step * band

    # Rwenzori-like range: a ridged massif running NNE-SSW
    mx, my = 10.0, 3.0
    ax = (X - mx) * 0.94 + (Y - my) * 0.34
    ay = -(X - mx) * 0.34 + (Y - my) * 0.94
    d2 = (ax / 4.6) ** 2 + (ay / 1.6) ** 2
    massif = np.exp(-d2).astype(np.float32)
    ridges = fbm(shape, 1800, 5, seed + 5, cell, ridged=True)
    z += 2300.0 * massif * (0.12 + 1.15 * ridges)
    return z.astype(np.float32), macro.astype(np.float32)


# ------------------------------------------------------------------ drainage
_NB = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
_NBD = [2 ** 0.5, 1, 2 ** 0.5, 1, 1, 2 ** 0.5, 1, 2 ** 0.5]


def priority_flood(z, eps=1e-3):
    """Fill pits and route every cell to the neighbour it was first reached from.

    All edge cells are outlets. Returns (filled, parent, order, dist) where `order` lists
    cells with every parent before its children, and dist is the cell-to-parent distance
    in cells (1 or sqrt 2). parent is -1 for outlets.
    """
    H, W = z.shape
    zf = z.astype(np.float64).ravel().tolist()
    seen = bytearray(H * W)
    parent = [-1] * (H * W)
    dist = [1.0] * (H * W)
    heap = []
    for r in range(H):
        for c in (0, W - 1):
            i = r * W + c
            if not seen[i]:
                seen[i] = 1
                heap.append((zf[i], i))
    for c in range(W):
        for r in (0, H - 1):
            i = r * W + c
            if not seen[i]:
                seen[i] = 1
                heap.append((zf[i], i))
    heapq.heapify(heap)
    order = []
    nb = [(dr * W + dc, dr, dc, d) for (dr, dc), d in zip(_NB, _NBD)]
    pop, push = heapq.heappop, heapq.heappush
    while heap:
        zc, i = pop(heap)
        order.append(i)
        r, c = divmod(i, W)
        for off, dr, dc, d in nb:
            rr, cc = r + dr, c + dc
            if rr < 0 or rr >= H or cc < 0 or cc >= W:
                continue
            j = i + off
            if seen[j]:
                continue
            seen[j] = 1
            parent[j] = i
            dist[j] = d
            if zf[j] <= zc:
                zf[j] = zc + eps
            push(heap, (zf[j], j))
    return (np.array(zf).reshape(H, W), np.array(parent, dtype=np.int64),
            np.array(order, dtype=np.int64), np.array(dist))


def accumulate(parent, order, weight):
    """Flow accumulation: sum of `weight` over each cell and everything draining through it."""
    acc = weight.ravel().astype(np.float64).tolist()
    par = parent.tolist()
    for i in reversed(order.tolist()):
        p = par[i]
        if p >= 0:
            acc[p] += acc[i]
    return np.array(acc).reshape(weight.shape)


# ------------------------------------------------------------------ erosion
def stream_power_erode(z, cell_m, iterations=40, K=0.06, m=0.5, log=print):
    """Implicit stream-power incision (n = 1): dz/dt = -K * A^m * slope, processed outlet-first.

    A is drained area in km^2. No uplift is applied; valleys are carved into the base
    field and the landmark correction later restores the macro elevations.
    """
    H, W = z.shape
    rng = np.random.default_rng(99)
    z = z.astype(np.float64) + ndimage.gaussian_filter(rng.normal(0, 1, z.shape), 1.0) * 6.0
    area_cell_km2 = (cell_m / 1000.0) ** 2
    for it in range(iterations):
        zf, parent, order, dist = priority_flood(z)
        A = accumulate(parent, order, np.full(z.shape, area_cell_km2))
        F = (K * np.power(A.ravel(), m) / (dist * cell_m / 40.0)).tolist()
        zl = zf.ravel().tolist()
        par = parent.tolist()
        for i in order.tolist():
            p = par[i]
            if p < 0:
                continue
            f = F[i]
            zi = (zl[i] + f * zl[p]) / (1.0 + f)
            # never carve below the receiver
            zl[i] = zi if zi > zl[p] else zl[p] + 1e-3
        z = np.minimum(z, np.array(zl).reshape(H, W))   # only ever lower: pits are not permanently filled
        if it % 12 == 0 or it == iterations - 1:
            log(f"    erosion {it + 1}/{iterations}")
    return z.astype(np.float32)


def thermal_relax(z, cell_m, talus, iterations):
    """Move material from cells steeper than `talus` (rise/run) to their lower neighbours."""
    z = z.astype(np.float32).copy()
    H, W = z.shape
    for _ in range(iterations):
        delta = np.zeros_like(z)
        for dr, dc, d in ((0, 1, 1.0), (1, 0, 1.0), (1, 1, 2 ** 0.5), (1, -1, 2 ** 0.5)):
            if dc >= 0:
                sa = (slice(0, H - dr), slice(0, W - dc))
                sb = (slice(dr, H), slice(dc, W))
            else:
                sa = (slice(0, H - dr), slice(-dc, W))
                sb = (slice(dr, H), slice(0, W + dc))
            diff = z[sa] - z[sb]
            excess = np.clip(np.abs(diff) - talus * cell_m * d, 0, None) * 0.25 * np.sign(diff)
            delta[sa] -= excess
            delta[sb] += excess
        z += delta
    return z


# ------------------------------------------------------------------ top level
def make_heightfield(seed=7, log=print):
    """Return (z2001, info). z2001 is float32 metres, shape (2001, 2001)."""
    cell_c = WORLD_M / (NC - 1)
    log("  base field from landmarks")
    base, macro = base_field(seed)
    log("  stream-power erosion (501 grid)")
    eroded = stream_power_erode(base, cell_c, log=log)
    log("  hillslope relaxation + landmark correction")
    eroded = ndimage.gaussian_filter(eroded, 0.9, mode="nearest")
    eroded = thermal_relax(eroded, cell_c, 0.9, 6)
    # pin low frequencies back to the design: what erosion changed at >2.5 km scale is undone
    sigma = 2500.0 / cell_c
    corr = ndimage.gaussian_filter(base, sigma, mode="nearest") - ndimage.gaussian_filter(eroded, sigma, mode="nearest")
    z = eroded + corr

    log("  resample to 2001 grid and add detail")
    ax = np.linspace(0, NC - 1, N)
    R, C = np.meshgrid(ax, ax, indexing="ij")
    z = ndimage.map_coordinates(z, [R, C], order=3, mode="nearest")
    assert z.shape == (N, N), z.shape
    cell = WORLD_M / (N - 1)
    relief = smoothstep(1100, 3200, ndimage.gaussian_filter(z, 40)) * 0.8 + 0.2
    steep = smoothstep(0.1, 0.6, np.hypot(*np.gradient(ndimage.gaussian_filter(z, 4), cell)))
    d1 = (fbm(z.shape, 900, 5, seed + 11, cell, ridged=True) - 0.35) * 2.0
    d2 = (fbm(z.shape, 260, 3, seed + 12, cell) - 0.5) * 2.0
    z = z + relief * (34.0 * d1 + 9.0 * d2) * (0.45 + 0.55 * steep) + (1 - relief) * 5.0 * d2

    # domain warp: breaks up the grid-aligned (45 degree) channel scars left by D8 routing
    ww = 22.0
    dx = (value_noise(z.shape, 1500, seed + 21, cell) - 0.5) * 2 * ww
    dy = (value_noise(z.shape, 1500, seed + 22, cell) - 0.5) * 2 * ww
    ax_ = np.arange(N, dtype=np.float32)
    R, C = np.meshgrid(ax_, ax_, indexing="ij")
    z = ndimage.map_coordinates(z, [R + dy, C + dx], order=3, mode="nearest")

    # soft floor so the lowest ground bottoms out near 930 m rather than clipping flat
    t = z - ELEV_FLOOR
    z = ELEV_FLOOR + np.where(t > 40, t, 40 * np.log1p(np.exp(np.clip(t / 40, -30, 30))))
    z = np.minimum(z, ELEV_CEIL)
    z = thermal_relax(z, cell, 1.1, 2)
    return z.astype(np.float32), {"macro": macro}
