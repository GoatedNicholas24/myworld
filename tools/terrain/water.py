"""Stage 3a: water. Four lakes, then a river network from wadable streams up to a Nile-class trunk.

Order matters and is the whole design:
  1. Lakes are placed on the heightfield (flat spots), their basins carved and their shores shaped,
     so the lake level sits below every bank.
  2. Flow is routed over that surface (lakes act as pits that spill at the rim) and the channel
     network is read from drained area.
  3. Every river becomes a smooth polyline with a width, depth and a water surface that only ever
     falls downstream. The heightfield is carved from those polylines, so the channel the player
     sees in the mesh is exactly the channel in rivers.json.

Everything is deterministic. Units: metres. Grid: 2001 x 2001, cell 10 m, row 0 north, col 0 west.
Game coordinates in the output files: x east of the world centre, z south of the world centre.
"""
import numpy as np
from scipy import ndimage

from landforms import N, priority_flood, accumulate, value_noise, smoothstep

CELL = 10.0
WORLD = 20000.0

# ------------------------------------------------------------------ river dimensions
AMIN_KM2 = 0.6          # smallest drained area that gets a channel (a wadable stream, ~2.4 m wide)
A_REF_KM2 = 250.0       # drained area at which a river reaches the full Nile-class size
W_MAX, D_MAX = 300.0, 8.0     # full width and depth of the widest river
W_EXP, D_EXP = 0.8, 0.45
CLASSES = [("stream", 0.0), ("small", 1.5), ("medium", 6.0), ("large", 30.0), ("great", 120.0)]
MAP_MIN_KM2 = 6.0       # rivers from this drained area up (class medium and above) are in water_level
DIST_MIN_KM2 = 3.0      # rivers from this size up count for river_dist (and so for wetness and biomes)


def river_width(a_km2):
    return np.clip(W_MAX * np.power(np.maximum(a_km2, 1e-9) / A_REF_KM2, W_EXP), 2.0, W_MAX)


def river_depth(a_km2):
    return np.clip(D_MAX * np.power(np.maximum(a_km2, 1e-9) / A_REF_KM2, D_EXP), 0.3, D_MAX)


def river_class(a_km2):
    name = CLASSES[0][0]
    for n, lo in CLASSES:
        if a_km2 >= lo:
            name = n
    return name


# ------------------------------------------------------------------ lakes
# box_km = (x0, x1, y0, y1) with y measured from the north edge. The site search puts each lake on
# the flattest ground inside its box. a/b are semi-axes in km, rot in degrees, depth = deepest point.
LAKES = [
    dict(id="lake_great", name="Great Lake", box_km=(3.2, 6.8, 14.8, 17.0), a=2.6, b=1.5, rot=25, depth=34.0),
    dict(id="lake_rift", name="Rift Lake", box_km=(11.8, 15.4, 11.2, 14.6), a=1.55, b=0.85, rot=-35, depth=20.0),
    dict(id="lake_plateau", name="Plateau Lake", box_km=(1.6, 4.6, 8.4, 12.0), a=0.85, b=0.5, rot=60, depth=11.0),
    dict(id="lake_tarn", name="Highland Tarn", box_km=(2.6, 6.2, 2.6, 6.2), a=0.45, b=0.3, rot=15, depth=7.0),
]
SHORE_BAND_M = 160.0     # banks are held above the lake over this distance
HILL_EASE_M = 900.0      # hills fall away gently to the shore over this distance


def _ellipse_mask(shape, cx_m, cy_m, a_m, b_m, rot_deg, warp=None):
    r = np.arange(shape[0], dtype=np.float32) * CELL
    c = np.arange(shape[1], dtype=np.float32) * CELL
    yy, xx = np.meshgrid(r, c, indexing="ij")
    u, v = xx - cx_m, yy - cy_m
    t = np.radians(rot_deg)
    ur, vr = u * np.cos(t) + v * np.sin(t), -u * np.sin(t) + v * np.cos(t)
    d = np.sqrt((ur / a_m) ** 2 + (vr / b_m) ** 2)
    return d if warp is None else d - warp


def _site(zs, spec):
    """Candidate centres on a 200 m grid; pick the one whose footprint has the smallest elevation spread."""
    x0, x1, y0, y1 = spec["box_km"]
    a_m, b_m, rot = spec["a"] * 1000, spec["b"] * 1000, spec["rot"]
    best = None
    t = np.radians(rot)
    reach = int(max(a_m, b_m) / CELL) + 2
    for cy in np.arange(y0, y1 + 1e-6, 0.2):
        for cx in np.arange(x0, x1 + 1e-6, 0.2):
            r0, c0 = int(cy * 100), int(cx * 100)
            sub = zs[max(0, r0 - reach):r0 + reach + 1, max(0, c0 - reach):c0 + reach + 1]
            rr, cc = np.mgrid[max(0, r0 - reach) - r0:max(0, r0 - reach) - r0 + sub.shape[0],
                              max(0, c0 - reach) - c0:max(0, c0 - reach) - c0 + sub.shape[1]]
            u, v = cc * CELL, rr * CELL
            ur, vr = u * np.cos(t) + v * np.sin(t), -u * np.sin(t) + v * np.cos(t)
            inside = (ur / a_m) ** 2 + (vr / b_m) ** 2 < 1.0
            vals = sub[inside]
            score = float(np.percentile(vals, 90) - np.percentile(vals, 10))
            if best is None or score < best[0]:
                best = (score, cx, cy, float(np.percentile(vals, 15)))
    return best


def make_lakes(z, seed=7, log=print):
    """Shape lakes into z. Returns (z, lakes) where each lake is a dict with a boolean mask."""
    z = z.astype(np.float32).copy()
    zs = ndimage.gaussian_filter(z, 3.0)
    lakes = []
    for k, spec in enumerate(LAKES):
        score, cx, cy, level = _site(zs, spec)
        # irregular shoreline: a distorted ellipse, bays and headlands from two noise scales
        n = (0.65 * value_noise(z.shape, 1900, seed + 61 + k, CELL) + 0.35 * value_noise(z.shape, 650, seed + 71 + k, CELL))
        d = _ellipse_mask(z.shape, cx * 1000, cy * 1000, spec["a"] * 1000, spec["b"] * 1000, spec["rot"],
                          warp=0.30 * (2 * n - 1))
        mask = ndimage.gaussian_filter((d < 1.0).astype(np.float32), 1.4) > 0.5
        lab, cnt = ndimage.label(mask)
        if cnt > 1:
            sizes = ndimage.sum(mask, lab, range(1, cnt + 1))
            mask = lab == (1 + int(np.argmax(sizes)))
        mask = ndimage.binary_fill_holes(mask)
        level = float(np.round(level, 1))
        d_in = ndimage.distance_transform_edt(mask).astype(np.float32) * CELL
        d_out = ndimage.distance_transform_edt(~mask).astype(np.float32) * CELL
        # bowl: shelving gently from the shore, deepest in the middle
        r_in = max(250.0, 0.7 * float(d_in.max()))
        t = smoothstep(0.0, r_in, d_in)
        bed = level - 0.5 - (spec["depth"] - 0.5) * np.power(t, 0.85)
        # banks: low ground is lifted just above the water; hills ease down to the shore
        top = level + 0.5
        fade = 1.0 - smoothstep(SHORE_BAND_M, SHORE_BAND_M * 3.5, d_out)
        floor = top + 0.012 * d_out
        z1 = z + np.clip(floor - z, 0, None) * fade
        hi = smoothstep(0.0, HILL_EASE_M, d_out)
        z2 = np.where(z1 > top, top + (z1 - top) * hi, z1)
        z = np.where(mask, bed, z2).astype(np.float32)
        out_info = _outlet_notch(z, zs, mask, d_out, level)
        area = float(mask.sum()) * CELL * CELL / 1e6
        log(f"  {spec['id']}: centre ({cx:.1f}, {cy:.1f}) km, level {level:.1f} m, area {area:.1f} km2, "
            f"spread {score:.0f} m")
        lakes.append(dict(spec=spec, mask=mask, level=level, centre_km=(cx, cy), area_km2=area,
                          max_depth=float(level - z[mask].min()), outlet=out_info))
    return z, lakes


def _outlet_notch(z, zs, mask, d_out, level):
    """Give the lake exactly one place to spill: a shallow notch in the bank that leads downhill.

    The notch sits where the original ground 600-800 m from the shore is lowest, so the river
    that leaves the lake follows the land's own fall. Edits z in place. Returns where it is.
    """
    ring = (d_out > 600) & (d_out < 800)
    cand = np.where(ring, zs, np.inf)
    tr, tc = np.unravel_index(int(np.argmin(cand)), cand.shape)
    _, idx = ndimage.distance_transform_edt(~mask, return_indices=True)
    sr, sc = int(idx[0][tr, tc]), int(idx[1][tr, tc])        # nearest shore cell
    p0 = np.array([sr, sc], np.float64)
    p1 = np.array([tr, tc], np.float64)
    seg = p1 - p0
    L = float(np.hypot(*seg)) or 1.0
    ud = seg / L
    r0, r1 = max(0, int(min(sr, tr) - 40)), min(z.shape[0], int(max(sr, tr) + 41))
    c0, c1 = max(0, int(min(sc, tc) - 40)), min(z.shape[1], int(max(sc, tc) + 41))
    rr, cc = np.mgrid[r0:r1, c0:c1]
    dr, dc = rr - p0[0], cc - p0[1]
    u = (dr * ud[0] + dc * ud[1]) * CELL                      # metres along the notch from the shore
    v = np.abs(dr * ud[1] - dc * ud[0]) * CELL                # metres across
    corr = level + 0.15 - 0.012 * np.maximum(u, 0.0)
    wl = (1.0 - smoothstep(15.0, 45.0, v)) * (u > -30.0) * (u < L * CELL + 400.0)
    sub = z[r0:r1, c0:c1]
    z[r0:r1, c0:c1] = np.where(mask[r0:r1, c0:c1], sub, sub - (sub - np.minimum(sub, corr)) * wl)
    return dict(shore_cell=(sr, sc), target_cell=(int(tr), int(tc)))


def lake_outline(mask, step_m=60.0):
    """Closed outline of the largest region in mask, as (x, y) metres (y from north), roughly step_m apart."""
    inside = np.pad(mask, 1)
    # directed unit edges with the lake on the left
    edges = {}
    rr, cc = np.nonzero(inside[1:-1, 1:-1])
    for r, c in zip(rr.tolist(), cc.tolist()):
        R, C = r + 1, c + 1
        if not inside[R - 1, C]:
            edges[(c, r)] = (c + 1, r)           # top edge, going east
        if not inside[R, C + 1]:
            edges[(c + 1, r)] = (c + 1, r + 1)   # right edge, going south
        if not inside[R + 1, C]:
            edges[(c + 1, r + 1)] = (c, r + 1)   # bottom edge, going west
        if not inside[R, C - 1]:
            edges[(c, r + 1)] = (c, r)           # left edge, going north
    start = min(edges)
    pts, cur = [], start
    while True:
        pts.append(cur)
        cur = edges[cur]
        if cur == start or len(pts) > len(edges):
            break
    pts = (np.array(pts, dtype=np.float64) - 0.5) * CELL
    k = max(1, int(round(step_m / CELL / 2)))
    # moving average removes the stair steps, then thin out
    ker = np.ones(2 * k + 1) / (2 * k + 1)
    ext = np.concatenate([pts[-k:], pts, pts[:k]])
    sm = np.stack([np.convolve(ext[:, 0], ker, "valid"), np.convolve(ext[:, 1], ker, "valid")], 1)
    take = max(1, int(round(step_m / CELL)))
    return sm[::take]


# ------------------------------------------------------------------ rivers
def _chain_noise(n_nodes, spacing_m, wavelength_m, seed):
    """Smooth 1-D noise in -1..1 sampled along a river."""
    rng = np.random.default_rng(seed)
    length = n_nodes * spacing_m
    k = int(length / wavelength_m) + 4
    ctrl = rng.random(k) * 2 - 1
    xs = np.arange(n_nodes) * spacing_m / wavelength_m
    # cubic-ish interpolation through the control points
    i = np.floor(xs).astype(int)
    f = xs - i
    f = f * f * (3 - 2 * f)
    return ctrl[i] * (1 - f) + ctrl[i + 1] * f


def route(z, lake_mask, log=print):
    """Flow routing on a 20 m grid. Returns dict of arrays on the 1001 grid."""
    half = z[::2, ::2]
    # a little cell-scale roughness stops plain D8 from drawing ruler-straight diagonal rivers
    rng = np.random.default_rng(1234)
    rough = ndimage.gaussian_filter(rng.normal(0, 1, half.shape), 0.9) * 2.6
    lake = lake_mask[::2, ::2]
    near = ndimage.distance_transform_edt(~lake) * 2 * CELL                # metres to the nearest lake
    rough = rough * smoothstep(300.0, 1200.0, near)                         # banks are not roughened
    # random eps: flooded flats then drain along a wandering tree, not ruler-straight diagonals
    eps = np.where(lake, 1e-7, rng.uniform(2e-3, 2e-2, half.shape))         # a lake is one flat surface
    zf, parent, order, dist = priority_flood(ndimage.gaussian_filter(half, 1.0) + rough, eps=eps)
    area = accumulate(parent, order, np.full(half.shape, 0.0004))   # 20 m cell = 0.0004 km2
    return dict(parent=parent, area=area, shape=half.shape, lake=lake)


def trace_rivers(rt, log=print):
    """Walk the channel network source -> mouth. Returns a list of raw reaches (cell paths)."""
    H, W = rt["shape"]
    parent = rt["parent"]
    area = rt["area"].ravel()
    lake = rt["lake"].ravel()
    is_ch = (area >= AMIN_KM2) & ~lake
    ch = np.nonzero(is_ch)[0]
    best = {}                     # parent cell -> its largest channel child
    nchild = {}
    for c in ch.tolist():
        p = int(parent[c])
        if p >= 0 and is_ch[p]:
            nchild[p] = nchild.get(p, 0) + 1
            if p not in best or area[c] > area[best[p]] or (area[c] == area[best[p]] and c < best[p]):
                best[p] = c
    # lakes: which lake does a lake cell belong to (label), and where does each lake drain out?
    lab, _ = ndimage.label(rt["lake"])
    labf = lab.ravel()
    sources = [c for c in ch.tolist() if c not in nchild]
    reaches = []
    for src in sources:
        path, cur = [src], src
        end = ("edge", None)
        while True:
            p = int(parent[cur])
            if p < 0:
                break
            path.append(p)
            if lake[p]:
                end = ("lake", int(labf[p]))
                break
            if best.get(p) != cur:
                end = ("river", p)
                break
            cur = p
        # does this source sit just below a lake (the lake's outlet)?
        reaches.append(dict(cells=path, end=end, lake_src=None))
    # lake outlets: a source cell whose upstream neighbour is a lake cell
    lake_out = {}
    for q in np.nonzero(lake)[0].tolist():
        p = int(parent[q])
        if p >= 0 and not lake[p]:
            lake_out[p] = int(labf[q])
    for r in reaches:
        r["lake_src"] = lake_out.get(r["cells"][0])
    return reaches, labf.reshape(H, W)


def _grid_xy(cells, W):
    r, c = np.divmod(np.asarray(cells), W)
    return np.stack([c * 2.0 * CELL, r * 2.0 * CELL], 1)    # x east, y south, metres


def build_rivers(z, lakes, seed=7, log=print):
    """Returns (z_carved, info). info holds rivers (polylines), masks and the maps the generator needs."""
    lake_mask = np.zeros((N, N), bool)
    lake_level = np.zeros((N, N), np.float32)
    for lk in lakes:
        lake_mask |= lk["mask"]
        lake_level[lk["mask"]] = lk["level"]
    log("  flow routing at 20 m")
    rt = route(z, lake_mask, log)
    H, W = rt["shape"]
    area = rt["area"]
    reaches, lake_lab = trace_rivers(rt, log)
    log(f"  {len(reaches)} river reaches from {AMIN_KM2} km2 drained area")
    lake_sel = {}                 # label in the 1001 grid -> lake index
    for i, lk in enumerate(lakes):
        sub = lk["mask"][::2, ::2]
        lab_ids = np.unique(lake_lab[sub])
        for l in lab_ids[lab_ids > 0]:
            lake_sel[int(l)] = i
    for rc in reaches:
        if rc["end"][0] == "lake":
            rc["end"] = ("lake", lake_sel[rc["end"][1]])
        if rc["lake_src"] is not None:
            rc["lake_src"] = lake_sel[rc["lake_src"]]
    for rc in reaches:        # own drained area per node (the join / lake cell at the end belongs to the next reach)
        a = area.ravel()[rc["cells"]].copy()
        if rc["end"][0] in ("river", "lake") and len(a) > 1:
            a[-1] = a[-2]
        rc["a"] = a

    zs_carve = ndimage.minimum_filter(z, size=5)      # local valley floor (the lowest ground within 20 m)
    floor_at = lambda x, y: ndimage.map_coordinates(zs_carve, [np.clip(y / CELL, 0, N - 1), np.clip(x / CELL, 0, N - 1)], order=1)
    order_idx = sorted(range(len(reaches)), key=lambda i: (-reaches[i]["a"][-1], reaches[i]["cells"][0]))
    owner = {}                    # raw cell -> (reach index, node index)
    rivers = [None] * len(reaches)

    # pass 1: raw geometry, smoothing, meander, widths
    for rank, i in enumerate(order_idx):
        rc = reaches[i]
        cells = rc["cells"]
        xy = _grid_xy(cells, W)
        a = rc["a"]
        n = len(cells)
        sig = 1.6
        if n > 4:
            xs = ndimage.gaussian_filter1d(xy[:, 0], sig, mode="nearest")
            ys = ndimage.gaussian_filter1d(xy[:, 1], sig, mode="nearest")
            xs[0], ys[0] = xy[0]
            xs[-1], ys[-1] = xy[-1]
            xy = np.stack([xs, ys], 1)
        wid = river_width(a)
        if n > 8:
            wid = ndimage.gaussian_filter1d(wid, 3.0, mode="nearest")
        # meander: lateral offset along the local normal, tapered to zero at both ends
        if n > 12:
            tan = np.gradient(xy, axis=0)
            tan /= np.maximum(np.hypot(tan[:, 0], tan[:, 1]), 1e-6)[:, None]
            nor = np.stack([-tan[:, 1], tan[:, 0]], 1)
            wl = float(np.clip(8.0 * wid.mean(), 260.0, 2400.0))
            off = _chain_noise(n, 22.0, wl, seed * 1000 + rank) + 0.5 * _chain_noise(n, 22.0, wl / 2.7, seed * 2000 + rank)
            amp = np.minimum(0.5 * wid + 6.0, 150.0)
            taper = np.minimum(1.0, np.minimum(np.arange(n), np.arange(n)[::-1]) / 6.0)
            move = nor * (off * amp * taper)[:, None]
            # a meander may only wander where the ground is as low as the line it left: in a narrow
            # valley the river stays on the valley floor
            dep = river_depth(a)
            tol = 0.25 + 0.5 * dep
            z0 = floor_at(xy[:, 0], xy[:, 1])
            scale = np.zeros(n)
            todo = np.ones(n, bool)
            for sc in (1.0, 0.7, 0.45, 0.25):
                zz = floor_at(xy[:, 0] + move[:, 0] * sc, xy[:, 1] + move[:, 1] * sc)
                ok = todo & (zz <= z0 + tol)
                scale[ok] = sc
                todo &= ~ok
            scale = ndimage.gaussian_filter1d(ndimage.minimum_filter1d(scale, 7, mode="nearest"), 2.0, mode="nearest")
            xy = xy + move * scale[:, None]
        rivers[i] = dict(cells=cells, xy=xy, area=a, width=wid, end=rc["end"], lake_src=rc["lake_src"], rank=rank)
        for j, c in enumerate(cells):
            if j < n - 1 or rc["end"][0] != "river":
                owner.setdefault(c, (i, j))

    # pass 2: snap tributary mouths to the river they join, cut lake inflows at the shore,
    # then the water surface profile (only ever falls downstream)
    zs_fn = floor_at
    inside_lake = lambda x, y: lake_mask[np.clip(np.round(y / CELL).astype(int), 0, N - 1),
                                         np.clip(np.round(x / CELL).astype(int), 0, N - 1)]
    for i in order_idx:               # big rivers first, so a parent is final before its tributaries
        rv = rivers[i]
        xy, kind = rv["xy"], rv["end"][0]
        if kind == "river":
            pi, pj = owner[rv["end"][1]]
            xy[-1] = rivers[pi]["xy"][pj]
            rv["join"] = (pi, pj)
        if kind == "edge":
            xy[-1] = np.clip(xy[-1], 0, WORLD)
        # lake inflow: stop at the shoreline
        if kind == "lake":
            ins = inside_lake(xy[:, 0], xy[:, 1])
            if ins.any() and not ins[0]:
                k = int(np.argmax(ins))
                p0, p1 = xy[k - 1], xy[k]
                for _ in range(10):
                    m = 0.5 * (p0 + p1)
                    if inside_lake(np.array([m[0]]), np.array([m[1]]))[0]:
                        p1 = m
                    else:
                        p0 = m
                xy = np.vstack([xy[:k], p1[None, :]])
                for key in ("area", "width"):
                    rv[key] = rv[key][:k + 1]
                rv["xy"] = xy
        # lake outlet: start at the shoreline too (the first node can sit a little way out)
        n = len(xy)
        zt = zs_fn(xy[:, 0], xy[:, 1])
        if n > 6:
            zt = ndimage.gaussian_filter1d(zt, 3.0, mode="nearest")
        s = np.minimum.accumulate(zt)
        k = np.arange(n, dtype=np.float64)
        hair = 0.002                            # strictly falling, so no flat or rising reach
        if rv["lake_src"] is not None:          # a lake outlet starts at the lake surface
            lvl = lakes[rv["lake_src"]]["level"]
            s = np.minimum(s, lvl - hair * k)
            s[0] = lvl
        for j in range(1, n):
            s[j] = min(s[j], s[j - 1] - hair)
        if kind == "lake":                      # an inflow ends at the lake surface
            lvl = lakes[rv["end"][1]]["level"]
            s = np.maximum(s, lvl + hair * (n - 1 - k))
            s[-1] = lvl
        if kind == "river":                     # a tributary ends exactly on its parent's surface
            pi, pj = rv["join"]
            P = float(rivers[pi]["surface"][pj])
            s = np.maximum(s, P + hair * (n - 1 - k))
            s[-1] = P
        rv["surface"] = s
        rv["depth"] = river_depth(rv["area"])

    # rasterise the centrelines and carve
    log("  carving channels")
    S = np.zeros((N, N), np.float32)
    HWc = np.zeros((N, N), np.float32)       # carve half width (never below 5 m)
    HWt = np.zeros((N, N), np.float32)       # true half width
    DP = np.zeros((N, N), np.float32)
    AA = np.zeros((N, N), np.float32)
    mask = np.zeros((N, N), bool)
    for i in sorted(range(len(rivers)), key=lambda k: rivers[k]["rank"], reverse=True):   # small first, big last
        rv = rivers[i]
        xy = rv["xy"]
        for j in range(len(xy) - 1):
            p0, p1 = xy[j], xy[j + 1]
            L = float(np.hypot(*(p1 - p0)))
            m = max(2, int(L / 3.0))
            t = np.linspace(0.0, 1.0, m)
            px = p0[0] + (p1[0] - p0[0]) * t
            py = p0[1] + (p1[1] - p0[1]) * t
            rr = np.clip(np.round(py / CELL).astype(int), 0, N - 1)
            cc = np.clip(np.round(px / CELL).astype(int), 0, N - 1)
            sj = rv["surface"][j] + (rv["surface"][j + 1] - rv["surface"][j]) * t
            wj = rv["width"][j] + (rv["width"][j + 1] - rv["width"][j]) * t
            dj = rv["depth"][j] + (rv["depth"][j + 1] - rv["depth"][j]) * t
            aj = rv["area"][j] + (rv["area"][j + 1] - rv["area"][j]) * t
            S[rr, cc] = sj
            HWt[rr, cc] = 0.5 * wj
            HWc[rr, cc] = np.maximum(0.5 * wj, 5.0)
            DP[rr, cc] = dj
            AA[rr, cc] = aj
            mask[rr, cc] = True
    dist, idx = ndimage.distance_transform_edt(~mask, return_indices=True)
    d_m = dist.astype(np.float32) * CELL
    ir, ic = idx
    s_n, hw, hwt, dp, a_n = S[ir, ic], HWc[ir, ic], HWt[ir, ic], DP[ir, ic], AA[ir, ic]
    inside = d_m <= hw
    bed = s_n - dp * (1.0 - np.square(np.minimum(d_m / hw, 1.0)))
    sh = 1.2 * hw + 14.0
    tt = smoothstep(0.0, 1.0, np.clip((d_m - hw) / sh, 0, 1))
    bank = s_n + (np.maximum(z, s_n) - s_n) * tt
    z2 = np.where(inside, bed, np.where(d_m < hw + sh, bank, z)).astype(np.float32)
    # lakes win over rivers
    z2 = np.where(lake_mask, z, z2).astype(np.float32)

    water_river = (d_m <= hwt) & (a_n >= MAP_MIN_KM2) & ~lake_mask
    level = lake_level.copy()
    level[water_river] = s_n[water_river]
    # river_dist: metres to the nearest lake or (small and up) river water
    dist_src = lake_mask | ((d_m <= np.maximum(hwt, 1.0)) & (a_n >= DIST_MIN_KM2))
    river_dist = np.clip(ndimage.distance_transform_edt(~dist_src) * CELL, 0, 2000).astype(np.float32)

    # drained area on the 2001 grid for the wetness model
    ax = np.linspace(0, H - 1, N)
    R, C = np.meshgrid(ax, ax, indexing="ij")
    logA = ndimage.map_coordinates(np.log1p(area * 100.0).astype(np.float32), [R, C], order=1)
    A_up = np.expm1(logA) / 100.0
    return z2, dict(rivers=rivers, level=level, river_dist=river_dist, logA=logA.astype(np.float32),
                    A_up=A_up.astype(np.float32), lake_mask=lake_mask, water_any=lake_mask | water_river)


# ------------------------------------------------------------------ output
def classes_doc():
    out = []
    for k, (name, lo) in enumerate(CLASSES):
        hi = CLASSES[k + 1][1] if k + 1 < len(CLASSES) else None
        a1 = lo if lo > 0 else AMIN_KM2
        a2 = hi if hi is not None else A_REF_KM2
        out.append({"name": name, "drained_km2": [lo, hi],
                    "width_m": [round(float(river_width(a1)), 1), round(float(river_width(a2)), 1)],
                    "depth_m": [round(float(river_depth(a1)), 2), round(float(river_depth(a2)), 2)]})
    return out


def class_stats(rivers):
    """Length and dimensions per class, counted segment by segment (a river changes class as it grows)."""
    out = {n: {"length_km": 0.0, "width_m": [1e9, 0.0], "depth_m": [1e9, 0.0]} for n, _ in CLASSES}
    for r in rivers:
        a = r["area"]
        seg = np.hypot(np.diff(r["xy"][:, 0]), np.diff(r["xy"][:, 1]))
        for j in range(len(seg)):
            c = out[river_class(float(0.5 * (a[j] + a[j + 1])))]
            c["length_km"] += seg[j] / 1000
            for key, arr in (("width_m", r["width"]), ("depth_m", r["depth"])):
                c[key] = [min(c[key][0], float(min(arr[j], arr[j + 1]))), max(c[key][1], float(max(arr[j], arr[j + 1])))]
    for c in out.values():
        c["length_km"] = round(c["length_km"], 1)
        c["width_m"] = [round(v, 1) for v in c["width_m"]]
        c["depth_m"] = [round(v, 2) for v in c["depth_m"]]
    return out


def rivers_doc(rivers, lakes):
    """The rivers.json document, game coordinates (x east of centre, z south of centre, y elevation)."""
    ordered = sorted(rivers, key=lambda r: r["rank"])
    ids = {id(r): f"river_{k + 1:03d}" for k, r in enumerate(ordered)}
    by_index = {i: r for i, r in enumerate(rivers)}
    lake_ids = [lk["spec"]["id"] for lk in lakes]
    out = []
    for r in ordered:
        xy = r["xy"]
        x, zz = xy[:, 0] - WORLD / 2, xy[:, 1] - WORLD / 2
        nodes = [[round(float(a), 1), round(float(b), 1), round(float(s), 3), round(float(w), 1), round(float(d), 2)]
                 for a, b, s, w, d in zip(x, zz, r["surface"], r["width"], r["depth"])]
        kind = r["end"][0]
        if kind == "river":
            pi, pj = r["join"]
            flows = {"type": "river", "id": ids[id(by_index[pi])], "node": int(pj)}
        elif kind == "lake":
            flows = {"type": "lake", "id": lake_ids[r["end"][1]]}
        else:
            flows = {"type": "edge"}
        src = {"type": "spring"} if r["lake_src"] is None else {"type": "lake", "id": lake_ids[r["lake_src"]]}
        seg = np.hypot(np.diff(xy[:, 0]), np.diff(xy[:, 1]))
        out.append({
            "id": ids[id(r)],
            "class": river_class(float(r["area"][-1])),
            "length_m": round(float(seg.sum()), 1),
            "drained_km2": [round(float(r["area"][0]), 2), round(float(r["area"][-1]), 2)],
            "source": src,
            "flows_into": flows,
            "nodes": nodes,
        })
    lake_docs = []
    for i, lk in enumerate(lakes):
        mask = lk["mask"]
        rr, cc = np.nonzero(mask)
        outline = lake_outline(mask)
        inflow = [ids[id(r)] for r in ordered if r["end"][0] == "lake" and r["end"][1] == i]
        outflow = [r for r in ordered if r["lake_src"] == i]
        lake_docs.append({
            "id": lk["spec"]["id"], "name": lk["spec"]["name"],
            "level_m": lk["level"], "area_km2": round(lk["area_km2"], 2), "max_depth_m": round(lk["max_depth"], 1),
            "centre": [round(float(cc.mean() * CELL - WORLD / 2), 1), round(float(rr.mean() * CELL - WORLD / 2), 1)],
            "bbox": [round(float(cc.min() * CELL - WORLD / 2), 1), round(float(rr.min() * CELL - WORLD / 2), 1),
                     round(float(cc.max() * CELL - WORLD / 2), 1), round(float(rr.max() * CELL - WORLD / 2), 1)],
            "outline": [[round(float(x - WORLD / 2), 1), round(float(y - WORLD / 2), 1)] for x, y in outline],
            "inflows": inflow,
            "outflow": ids[id(outflow[0])] if outflow else None,
        })
    return {
        "version": 1,
        "coordinates": "x east of the world centre (m), z south of the world centre (m), elevations in m; "
                       "river nodes are [x, z, surface_y, width, depth] in order from source to mouth",
        "world_size_m": 20000,
        "classes": classes_doc(),
        "class_totals": class_stats(rivers),
        "lakes": lake_docs,
        "rivers": out,
    }
