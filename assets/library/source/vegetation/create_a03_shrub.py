# ============================================================
# MY WORLD - A03 SAVANNA THORNY SHRUB
#
# Painterly, texture-first (see assets/library/STYLE_GUIDE.md).
# Zigzag thorny stems (3-sided prisms), painted alpha-cut leaf-cluster
# cards with inked edges, single-triangle thorns, and two optional
# overlay nodes the game switches by season:
#   <tier>_Shrub    stems + thorns + leaf cards   (always shown)
#   <tier>_Flowers  cream puff-flower cards       (flowering season)
#   <tier>_Pods     hanging seed-pod cards        (fruiting season)
#
# One painted 512x512 atlas serves everything (leaf, flower, pod, bark,
# thorn cells), so each node is a single draw call.
#
# Variants (green / dry / burned) are colour tints applied in the game.
# Wind: shader mask only (TEXCOORD_1: x = sway weight, y = phase).
#
# Tiers (base mesh triangles): low ~300, med ~700, high ~1400.
# Run from Blender with REPO_ROOT set. Status stays
# generated_pending_review.
# ============================================================

import bpy
import math
import json
import random
import sys
import importlib
import numpy as np
from pathlib import Path
from mathutils import Vector

REPO = Path(globals().get("REPO_ROOT") or Path(__file__).resolve().parents[4])
if not (REPO / "package.json").exists():
    raise RuntimeError("Not the My World repository: %s" % REPO)
sys.path.insert(0, str(REPO / "assets/library/source"))
import painter
importlib.reload(painter)

ASSET_ID = "A03"
ASSET_NAME = "Savanna Thorny Shrub"
SEED = 3003

TIERS = {
    "low": dict(mains=5, main_segs=2, sec=1, sec_segs=2, tert=0, tert_segs=0, thorns=8,
                crossed=0.0, size=0.46, target=300, flowers=12, pods=10, ov=0.30),
    "med": dict(mains=6, main_segs=3, sec=2, sec_segs=2, tert=0, tert_segs=0, thorns=24,
                crossed=0.35, size=0.36, target=700, flowers=22, pods=18, ov=0.22),
    "high": dict(mains=7, main_segs=3, sec=2, sec_segs=3, tert=1, tert_segs=2, thorns=70,
                 crossed=0.70, size=0.31, target=1400, flowers=34, pods=28, ov=0.18),
}

CELL, AT = 128, 512
LEAF_CELLS = [(cx, cy) for cy in (3, 2) for cx in range(4)]
FLOWER_CELLS = [(0, 1), (1, 1)]
POD_CELLS = [(2, 1), (3, 1)]
BARK_CELLS = [(0, 0), (1, 0), (2, 0)]
THORN_CELL = (3, 0)

CENTRE = Vector((0.0, 0.0, 0.55))
HEIGHT_REF = 1.25

TINTS = {
    "green": (0.85, 1.05, 0.80),
    "dry": (1.20, 0.80, 0.50),
    "burned": (0.30, 0.27, 0.25),
}

LEAF = [(0.0, (0.16, 0.19, 0.12)), (0.35, (0.36, 0.42, 0.17)),
        (0.7, (0.62, 0.62, 0.27)), (1.0, (0.90, 0.80, 0.42))]


# ------------------------------------------------------------
# Painted atlas
# ------------------------------------------------------------

def stamp(rgb, alpha, cx, cy, ang, a, b, color):
    n = rgb.shape[0]
    R = int(max(a, b)) + 2
    x0, x1 = max(0, int(cx) - R), min(n, int(cx) + R + 1)
    y0, y1 = max(0, int(cy) - R), min(n, int(cy) + R + 1)
    if x0 >= x1 or y0 >= y1:
        return
    ys, xs = np.mgrid[y0:y1, x0:x1]
    dx = xs - cx
    dy = ys - cy
    ca, sa = math.cos(ang), math.sin(ang)
    u = dx * ca + dy * sa
    v = -dx * sa + dy * ca
    m = (u / a) ** 2 + (v / b) ** 2 <= 1.0
    rgb[y0:y1, x0:x1][m] = color
    alpha[y0:y1, x0:x1][m] = 1.0


def ink_edge(rgb, alpha, px=2, strength=0.55):
    a = alpha > 0.5
    er = a.copy()
    for _ in range(px):
        er = er & np.roll(er, 1, 0) & np.roll(er, -1, 0) & np.roll(er, 1, 1) & np.roll(er, -1, 1)
    rgb[a & ~er] *= strength


def pad_transparent(rgb, alpha):
    op = alpha > 0.5
    mean = rgb[op].mean(0) if op.any() else np.array([0.4, 0.4, 0.3])
    rgb[~op] = mean


def paint_leaf_cell(rng):
    rgb = np.zeros((CELL, CELL, 3))
    alpha = np.zeros((CELL, CELL))
    R = 50
    m = CELL / 2
    leaflets = []
    for _ in range(175):
        r = R * math.sqrt(rng.random())
        th = rng.uniform(0, 2 * math.pi)
        leaflets.append((m + r * math.cos(th) * 1.1, m + r * math.sin(th) * 0.85, th))
    leaflets.sort(key=lambda t: t[1])
    for (x, y, th) in leaflets:
        L = 0.5 + 0.5 * ((x - m) * 0.7 + (y - m) * 0.7) / R + rng.uniform(-0.12, 0.12)
        L = float(painter.gouache(np.clip(L, 0, 1), 4, 0.5))
        col = painter.ramp(np.array(L), LEAF)
        a = rng.uniform(5.0, 9.0)
        stamp(rgb, alpha, x, y, th + rng.uniform(-0.7, 0.7), a, a * rng.uniform(0.38, 0.55), col)
    ink_edge(rgb, alpha)
    pad_transparent(rgb, alpha)
    return rgb, alpha


def paint_flower_cell(rng, warm):
    rgb = np.zeros((CELL, CELL, 3))
    alpha = np.zeros((CELL, CELL))
    m = CELL / 2
    ys, xs = np.mgrid[0:CELL, 0:CELL]
    pal = [(0.0, (0.72, 0.60, 0.32)), (0.5, (0.93, 0.85, 0.55)), (1.0, (0.99, 0.97, 0.80))]
    if not warm:
        pal = [(0.0, (0.74, 0.62, 0.50)), (0.5, (0.94, 0.86, 0.72)), (1.0, (1.0, 0.97, 0.90))]
    puffs = []
    for _ in range(5):
        r = rng.uniform(34, 42) * math.sqrt(rng.random())
        th = rng.uniform(0, 2 * math.pi)
        puffs.append((m + r * math.cos(th), m + r * math.sin(th), rng.uniform(15, 23)))
    puffs.sort(key=lambda p: p[1])
    for (px, py, pr) in puffs:
        d = np.hypot(xs - px, ys - py)
        mask = d <= pr
        light = 0.5 + 0.5 * ((xs - px) * 0.7 + (ys - py) * 0.7) / pr - 0.25 * d / pr
        noise = np.random.default_rng(int(rng.random() * 1e9)).standard_normal((CELL, CELL))
        light = painter.gouache(np.clip(light + 0.08 * noise, 0, 1), 4, 0.5)
        col = painter.ramp(light, pal)
        rgb[mask] = col[mask]
        alpha[mask] = 1.0
    ink_edge(rgb, alpha, 2, 0.6)
    pad_transparent(rgb, alpha)
    return rgb, alpha


def paint_pod_cell(rng):
    rgb = np.zeros((CELL, CELL, 3))
    alpha = np.zeros((CELL, CELL))
    pal = [(0.0, (0.34, 0.20, 0.09)), (0.5, (0.52, 0.34, 0.15)), (1.0, (0.76, 0.54, 0.24))]
    for i in range(6):
        x0 = 18 + i * 18 + rng.uniform(-4, 4)
        y0 = rng.uniform(106, 116)
        curl = rng.uniform(-0.5, 0.5)
        length = rng.uniform(50, 76)
        steps = int(length / 4)
        for s in range(steps):
            t = s / steps
            x = x0 + curl * 24 * t * t + 6 * math.sin(t * 3 + i)
            y = y0 - length * t
            L = 0.35 + 0.65 * (0.5 + 0.5 * math.sin(i * 1.7 + t * 2.0))
            stamp(rgb, alpha, x, y, math.pi / 2, 5.5, 4.2, painter.ramp(np.array(float(painter.gouache(np.array(L), 3, 0.5))), pal))
    ink_edge(rgb, alpha, 1, 0.6)
    pad_transparent(rgb, alpha)
    return rgb, alpha


def paint_bark_cell(rng_np, shade):
    H = W = CELL
    yy = (np.arange(H) / (H - 1))[:, None] * np.ones((1, W))
    streak = painter.aniso_noise(rng_np, H, W, fx_cut=30, fy_cut=2.0, power=1.4)
    pal = [(0.0, (0.17, 0.12, 0.09)), (0.5, (0.34, 0.25, 0.18)), (1.0, (0.58, 0.48, 0.36))]
    col = painter.ramp(yy, pal) * shade
    col = col * (1 + 0.18 * painter.gouache(np.clip(streak / 2.2, -1, 1), 4, 0.5))[..., None]
    return np.clip(col, 0, 1), np.ones((H, W))


def paint_thorn_cell():
    H = W = CELL
    yy = (np.arange(H) / (H - 1))[:, None] * np.ones((1, W))
    pal = [(0.0, (0.42, 0.28, 0.20)), (0.4, (0.70, 0.60, 0.46)), (1.0, (0.90, 0.85, 0.72))]
    return painter.ramp(yy, pal), np.ones((H, W))


def make_atlas(path):
    rng = random.Random(SEED)
    nrng = np.random.default_rng(SEED)
    rgb = np.zeros((AT, AT, 3))
    alpha = np.zeros((AT, AT))

    def put(cell, cxy):
        cx, cy = cxy
        rgb[cy * CELL:(cy + 1) * CELL, cx * CELL:(cx + 1) * CELL] = cell[0]
        alpha[cy * CELL:(cy + 1) * CELL, cx * CELL:(cx + 1) * CELL] = cell[1]

    for cxy in LEAF_CELLS:
        put(paint_leaf_cell(rng), cxy)
    for i, cxy in enumerate(FLOWER_CELLS):
        put(paint_flower_cell(rng, warm=(i == 0)), cxy)
    for cxy in POD_CELLS:
        put(paint_pod_cell(rng), cxy)
    for i, cxy in enumerate(BARK_CELLS):
        put(paint_bark_cell(nrng, (1.0, 0.95 + 0.05 * i, 0.92 + 0.06 * i)), cxy)
    put(paint_thorn_cell(), THORN_CELL)
    rgba = np.concatenate([np.clip(rgb, 0, 1), alpha[..., None]], axis=2)
    return painter.save_texture("a03_shrub_atlas", path, rgba, "PNG", "sRGB", blank_check="alpha")


def cell_uv(cxy, inset=3):
    cx, cy = cxy
    return ((cx * CELL + inset) / AT, ((cx + 1) * CELL - inset) / AT,
            (cy * CELL + inset) / AT, ((cy + 1) * CELL - inset) / AT)


# ------------------------------------------------------------
# Geometry
# ------------------------------------------------------------

class MeshData:
    def __init__(self):
        self.v, self.f, self.uv, self.col, self.wind, self.nrm = [], [], [], [], [], []

    def tris(self):
        return sum(len(f) - 2 for f in self.f)


def wind_x(p):
    h = max(0.0, min(1.0, p.z / HEIGHT_REF)) ** 1.2
    lat = min(1.0, math.hypot(p.x, p.y) / 0.9)
    return max(0.0, min(1.0, h * (0.3 + 0.7 * lat)))


def stem_col(p):
    ao = 0.50 + 0.5 * min(1.0, max(p.z, 0.0) / 0.8)
    return (ao * 0.92, ao * 0.97, ao)


def card_col(p):
    rn = min(1.0, (p - CENTRE).length / 1.0)
    k = (0.60 + 0.40 * rn ** 0.8) * (0.88 + 0.12 * min(1.0, max(p.z, 0.0) / 1.3))
    k = min(1.0, k)
    return (k * 0.92, k * 0.98, k)


def globe_normal(p):
    return ((p - CENTRE).normalized() + Vector((0, 0, 0.35))).normalized()


def add_tube(M, pts, r0, r1, sides, cell, phase):
    n = len(pts)
    tans = []
    for i in range(n):
        t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        tans.append(t.normalized() if t.length > 1e-6 else Vector((0, 0, 1)))
    dist = [0.0]
    for i in range(1, n):
        dist.append(dist[-1] + (pts[i] - pts[i - 1]).length)
    total = max(dist[-1], 1e-6)
    ref = Vector((0, 0, 1)) if abs(tans[0].z) < 0.95 else Vector((1, 0, 0))
    nrm = tans[0].cross(ref).normalized()
    u0, u1, v0, v1 = cell_uv(cell, 2)
    base = len(M.v)
    ring_n = sides + 1
    rings = []
    for i in range(n):
        T = tans[i]
        nrm = nrm - T * nrm.dot(T)
        if nrm.length < 1e-6:
            nrm = T.orthogonal()
        nrm.normalize()
        bn = T.cross(nrm)
        t = dist[i] / total
        r = r0 + (r1 - r0) * t
        rings.append((pts[i], T, nrm.copy(), bn.copy(), r))
        for k in range(ring_n):
            a = 2 * math.pi * (k % sides) / sides
            rad = nrm * math.cos(a) + bn * math.sin(a)
            p = pts[i] + rad * r
            M.v.append(p)
            M.uv.append((u0 + (u1 - u0) * k / sides, v0 + (v1 - v0) * t))
            M.nrm.append(rad)
            M.col.append(stem_col(p))
            M.wind.append((wind_x(p), phase))
    for i in range(n - 1):
        for k in range(sides):
            a = base + i * ring_n + k
            M.f.append((a, a + 1, base + (i + 1) * ring_n + k + 1, base + (i + 1) * ring_n + k))
    return rings


def add_card(M, c, n, sx, sy, cell, roll, phase, crossed=False):
    n = n.normalized()
    up = Vector((0, 0, 1))
    right = n.cross(up)
    if right.length < 1e-3:
        right = Vector((1, 0, 0))
    right.normalize()
    upv = right.cross(n).normalized()
    cr, sr = math.cos(roll), math.sin(roll)
    r2 = right * cr + upv * sr
    u2 = -right * sr + upv * cr
    u0, u1, v0, v1 = cell_uv(cell, 3)
    quads = [(r2, u2)]
    if crossed:
        quads.append((n, u2))
    for (rv, uv_) in quads:
        base = len(M.v)
        for (sx_, sy_, u, v) in ((-1, -1, u0, v0), (1, -1, u1, v0), (1, 1, u1, v1), (-1, 1, u0, v1)):
            p = c + rv * (sx * 0.5 * sx_) + uv_ * (sy * 0.5 * sy_)
            M.v.append(p)
            M.uv.append((u, v))
            M.nrm.append(globe_normal(p))
            M.col.append(card_col(p))
            M.wind.append((wind_x(p), phase))
        M.f.append((base, base + 1, base + 2, base + 3))


def add_thorn(M, ring, rng, phase):
    P, T, nrm, bn, r = ring
    a = rng.uniform(0, 2 * math.pi)
    for sgn in (0.0, math.pi):
        rad = nrm * math.cos(a + sgn) + bn * math.sin(a + sgn)
        A = P + rad * r
        B = A + T * 0.035
        C = A + rad * 0.09 + T * 0.016
        u0, u1, v0, v1 = cell_uv(THORN_CELL, 3)
        base = len(M.v)
        for p, uv in ((A, (u0, v0)), (B, (u1, v0)), (C, ((u0 + u1) / 2, v1))):
            M.v.append(p)
            M.uv.append(uv)
            M.nrm.append(rad)
            M.col.append((0.95, 0.97, 1.0))
            M.wind.append((wind_x(p), phase))
        M.f.append((base, base + 1, base + 2))


def zigzag(rng, start, d0, length, nseg, zig=0.55, up=0.10):
    pts = [Vector(start)]
    d = d0.normalized()
    seg = length / nseg
    for i in range(nseg):
        perp = d.cross(Vector((0, 0, 1)))
        if perp.length < 1e-3:
            perp = Vector((1, 0, 0))
        perp.normalize()
        sgn = 1 if i % 2 == 0 else -1
        d = (d + perp * zig * sgn * rng.uniform(0.6, 1.2) + Vector((0, 0, up))
             + Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), rng.uniform(-0.05, 0.1)))).normalized()
        pts.append(pts[-1] + d * seg)
    return pts


def direction(az, el):
    return Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))


def build_tier(tier):
    cfg = TIERS[tier]
    rng = random.Random(SEED + 1)
    B = MeshData()
    nodes = []
    stems = []
    for i in range(cfg["mains"]):
        az = 2 * math.pi * i / cfg["mains"] + rng.uniform(-0.3, 0.3)
        el = math.radians(rng.uniform(50, 72))
        start = Vector((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 0.0))
        pts = zigzag(rng, start, direction(az, el), rng.uniform(0.75, 1.0), cfg["main_segs"])
        stems.append((pts, 0.036, 0.014, 0))
        nodes.append(pts[-1])
        for s in range(cfg["sec"]):
            k = rng.randint(1, len(pts) - 2) if len(pts) > 2 else 1
            sa = az + rng.choice((-1, 1)) * rng.uniform(0.6, 1.05)
            se = math.radians(rng.uniform(25, 55))
            sp = zigzag(rng, pts[k], direction(sa, se), rng.uniform(0.45, 0.7), cfg["sec_segs"])
            stems.append((sp, 0.020, 0.010, 1))
            nodes.append(sp[-1])
            nodes.append(sp[len(sp) // 2])
            for t in range(cfg["tert"]):
                ta = sa + rng.choice((-1, 1)) * rng.uniform(0.6, 1.0)
                tp = zigzag(rng, sp[-1], direction(ta, math.radians(rng.uniform(15, 45))),
                            rng.uniform(0.3, 0.45), cfg["tert_segs"])
                stems.append((tp, 0.011, 0.006, 2))
                nodes.append(tp[-1])
    rings_all = []
    for (pts, r0, r1, depth) in stems:
        cell = BARK_CELLS[rng.randrange(len(BARK_CELLS))]
        rings = add_tube(B, pts, r0, r1, 3, cell, rng.random())
        if depth <= 1:
            rings_all.extend(rings[1:-1] or rings)
    for _ in range(cfg["thorns"] // 2):
        add_thorn(B, rings_all[rng.randrange(len(rings_all))], rng, rng.random())

    centres = []

    def one_card():
        base_pt = nodes[rng.randrange(len(nodes))]
        off = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.6, 1.0))) * 0.2
        c = base_pt + off
        out = ((c - CENTRE).normalized() + Vector((0, 0, 0.12)) +
               Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * 0.35).normalized()
        s = cfg["size"] * rng.uniform(0.85, 1.2)
        crossed = rng.random() < cfg["crossed"]
        add_card(B, c, out, s, s * rng.uniform(0.8, 1.0), LEAF_CELLS[rng.randrange(len(LEAF_CELLS))],
                 rng.uniform(-0.5, 0.5), rng.random(), crossed)
        centres.append((c, out))

    for p in list(nodes):
        if B.tris() >= cfg["target"]:
            break
        c = p
        out = ((c - CENTRE).normalized() + Vector((0, 0, 0.12))).normalized()
        s = cfg["size"] * rng.uniform(0.95, 1.2)
        add_card(B, c, out, s, s * 0.9, LEAF_CELLS[rng.randrange(len(LEAF_CELLS))],
                 rng.uniform(-0.5, 0.5), rng.random(), rng.random() < cfg["crossed"])
        centres.append((c, out))
    while B.tris() < cfg["target"]:
        one_card()

    outer = sorted(centres, key=lambda t: -((t[0] - CENTRE).length + 0.3 * t[0].z))
    pool = outer[:max(cfg["flowers"] + cfg["pods"], 8) * 2]
    rng.shuffle(pool)
    F, Pd = MeshData(), MeshData()
    for (c, out) in pool[:cfg["flowers"]]:
        p = c + out * 0.10
        s = cfg["ov"] * rng.uniform(0.85, 1.15)
        add_card(F, p, out, s, s, FLOWER_CELLS[rng.randrange(2)], rng.uniform(-0.4, 0.4), rng.random())
    for (c, out) in pool[cfg["flowers"]:cfg["flowers"] + cfg["pods"]]:
        p = c + out * 0.05 + Vector((0, 0, -0.10))
        s = cfg["ov"] * rng.uniform(0.9, 1.15)
        add_card(Pd, p, out, s * 0.85, s * 1.1, POD_CELLS[rng.randrange(2)], rng.uniform(-0.15, 0.15), rng.random())
    return B, F, Pd


def to_object(M, name, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in M.v], [], M.f)
    mesh.materials.append(mat)
    for p in mesh.polygons:
        p.use_smooth = True
    mesh.uv_layers.new(name="UVMap").data.foreach_set("uv", [c for f in M.f for vi in f for c in M.uv[vi]])
    mesh.uv_layers.new(name="UVWind").data.foreach_set("uv", [c for f in M.f for vi in f for c in M.wind[vi]])
    ca = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    ca.data.foreach_set("color", [c for f in M.f for vi in f for c in (*M.col[vi], 1.0)])
    mesh.update()
    ok = True
    try:
        mesh.normals_split_custom_set_from_vertices([n.normalized() for n in M.nrm])
    except Exception:
        ok = False
    return bpy.data.objects.new(name, mesh), ok


# ------------------------------------------------------------
# Scene, export, previews
# ------------------------------------------------------------

def render(scene, path, w, h):
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def run():
    P = dict(src=REPO / "assets/library/source/vegetation",
             tex=REPO / "assets/library/source/vegetation/textures",
             prev=REPO / "assets/library/previews",
             meta=REPO / "assets/library/metadata",
             out=REPO / "public/assets/models/vegetation")
    for p in P.values():
        p.mkdir(parents=True, exist_ok=True)
    a02_glb = P["out"] / "a02_dry_grass_tuft_med.glb"
    painter.reset_scene()
    scene = bpy.context.scene
    view_layer = bpy.context.view_layer

    tex_info = make_atlas(P["tex"] / "a03_shrub_atlas.png")
    mat = painter.painted_material("A03_Shrub", P["tex"] / "a03_shrub_atlas.png", roughness=1.0, alpha=True)
    cam = painter.preview_stage(scene, cam_loc=(2.2, -3.6, 1.7), target=(0, 0, 0.55), ortho=2.8,
                                ground=(0.36, 0.26, 0.14), sky=(0.50, 0.58, 0.66))

    def aim(tx, ty, tz, ortho, offset):
        cam.data.ortho_scale = ortho
        cam.location = (tx + offset[0], ty + offset[1], tz + offset[2])
        painter.look_at(cam, (tx, ty, tz))

    results, roots, objs = {}, {}, {}
    for tier in TIERS:
        B, F, Pd = build_tier(tier)
        coll = bpy.data.collections.new("A03_Shrub_" + tier.upper())
        scene.collection.children.link(coll)
        root = bpy.data.objects.new("A03_Shrub_" + tier.upper(), None)
        root.empty_display_type = "PLAIN_AXES"
        coll.objects.link(root)
        parts = {}
        normals_ok = True
        for label, M in (("Shrub", B), ("Flowers", F), ("Pods", Pd)):
            o, ok = to_object(M, "A03_%s_%s" % (tier, label), mat)
            normals_ok = normals_ok and ok
            coll.objects.link(o)
            o.parent = root
            parts[label] = (o, M)
        roots[tier] = root
        objs[tier] = {k: v[0] for k, v in parts.items()}
        view_layer.update()

        glb = P["out"] / ("a03_thorny_shrub_%s.glb" % tier)
        for o in view_layer.objects:
            o.select_set(False)
        root.select_set(True)
        for o, _ in parts.values():
            o.select_set(True)
        view_layer.objects.active = root
        bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True, export_apply=True,
                                  export_materials="EXPORT", export_cameras=False, export_lights=False,
                                  export_animations=False)
        painter.patch_glb(glb, mask_materials=("A03_Shrub",), cutoff=0.5)
        info = painter.inspect_glb(glb)
        _, _, _, j = painter.read_glb(glb)
        names = [n.get("name") for n in j["nodes"]]
        expect = ["A03_%s_%s" % (tier, k) for k in ("Shrub", "Flowers", "Pods")]
        total = B.tris() + F.tris() + Pd.tris()
        if info["triangles"] != total:
            raise RuntimeError("%s: GLB has %d triangles, built %d" % (tier, info["triangles"], total))
        if any(e not in names for e in expect):
            raise RuntimeError("%s: missing nodes %s in %s" % (tier, expect, names))
        sv = B.v
        mins = [min(v[i] for v in sv) for i in range(3)]
        maxs = [max(v[i] for v in sv) for i in range(3)]
        results[tier] = {
            "glb": glb.relative_to(REPO).as_posix(), "glb_bytes": info["file_bytes"],
            "shrub_triangles": B.tris(), "flowers_triangles": F.tris(), "pods_triangles": Pd.tris(),
            "total_triangles_all_nodes": total, "draw_calls_all_nodes": info["primitives_draw_calls"],
            "nodes": names, "attributes": info["attributes"], "images": info["images"],
            "materials": info["materials"], "wind_mask_range": info.get("wind_mask_range"),
            "custom_normals": normals_ok,
            "shrub_size_m": [round(maxs[0] - mins[0], 2), round(maxs[1] - mins[1], 2), round(maxs[2] - mins[2], 2)],
        }

    def show(visible):
        for t in TIERS:
            for lab, o in objs[t].items():
                o.hide_render = o not in visible

    xoff = {"low": -1.8, "med": 0.0, "high": 1.8}
    for t in TIERS:
        roots[t].location = (xoff[t], 0, 0)
    view_layer.update()
    for t in TIERS:
        show([objs[t]["Shrub"]])
        aim(xoff[t], 0, 0.60, 2.8, (2.2, -3.6, 1.7))
        pp = P["prev"] / ("A03_thorny_shrub_%s.png" % t)
        render(scene, pp, 900, 900)
        results[t]["preview"] = pp.relative_to(REPO).as_posix()
    show([objs[t]["Shrub"] for t in TIERS])
    aim(0, 0, 0.60, 6.2, (2.0, -6.0, 2.4))
    cmp_path = P["prev"] / "A03_thorny_shrub_tiers_comparison.png"
    render(scene, cmp_path, 1600, 600)

    # season states on the medium tier: green, dry+pods, flowering, burned
    show([])
    med = objs["med"]
    season = []
    plan = [("green", TINTS["green"], None), ("dry_fruiting", TINTS["dry"], "Pods"),
            ("flowering", TINTS["green"], "Flowers"), ("burned", TINTS["burned"], None)]
    for j, (sn, tint, overlay) in enumerate(plan):
        x = -2.7 + 1.8 * j
        d = med["Shrub"].data.copy()
        d.materials[0] = painter.tinted_copy(mat, "A03_Shrub_" + sn, tint)
        o = bpy.data.objects.new("A03_season_" + sn, d)
        scene.collection.objects.link(o)
        o.location = (x, 0, 0)
        season.append(o)
        if overlay:
            o2 = bpy.data.objects.new("A03_season_%s_%s" % (sn, overlay), med[overlay].data)
            scene.collection.objects.link(o2)
            o2.location = (x, 0, 0)
            season.append(o2)
    aim(0, 0, 0.60, 8.0, (2.2, -6.2, 2.4))
    seasons_path = P["prev"] / "A03_thorny_shrub_seasons.png"
    render(scene, seasons_path, 1800, 600)
    for o in season:
        bpy.data.objects.remove(o, do_unlink=True)

    # mixed field: A02 grass (imported from its GLB, which tests that file) + A03 shrubs
    before_o, before_m = set(bpy.data.objects), set(bpy.data.meshes)
    before_mat, before_img = set(bpy.data.materials), set(bpy.data.images)
    field_info = {"a02_import": "not run"}
    field = []
    if a02_glb.exists():
        bpy.ops.import_scene.gltf(filepath=str(a02_glb))
        new_o = [o for o in bpy.data.objects if o not in before_o]
        gmesh = next((o for o in new_o if o.type == "MESH"), None)
        if gmesh:
            zs = [v.co.z for v in gmesh.data.vertices]
            field_info = {"a02_import": "ok", "a02_vertices": len(gmesh.data.vertices),
                          "a02_height_after_import_m": round(max(zs) - min(zs), 3),
                          "a02_material": gmesh.data.materials[0].name if gmesh.data.materials else None}
            rnd = random.Random(SEED + 9)
            for o in new_o:
                o.hide_render = True
            for _ in range(330):
                o = bpy.data.objects.new("field_grass", gmesh.data)
                scene.collection.objects.link(o)
                o.location = (rnd.uniform(-4.2, 4.2), rnd.uniform(-1.2, 4.6), 0)
                o.rotation_euler = (0, 0, rnd.uniform(0, 6.283))
                s = rnd.uniform(0.8, 1.4)
                o.scale = (s, s, s * rnd.uniform(0.8, 1.2))
                field.append(o)
    rnd = random.Random(SEED + 11)
    for k in range(26):
        o = bpy.data.objects.new("field_shrub", med["Shrub"].data)
        scene.collection.objects.link(o)
        o.location = (rnd.uniform(-3.8, 3.8), rnd.uniform(-0.6, 4.4), 0)
        o.rotation_euler = (0, 0, rnd.uniform(0, 6.283))
        s = rnd.uniform(0.75, 1.5)
        o.scale = (s, s, s)
        field.append(o)
        if k % 4 == 0:
            o2 = bpy.data.objects.new("field_flowers", med["Flowers"].data)
            scene.collection.objects.link(o2)
            o2.location, o2.rotation_euler, o2.scale = o.location, o.rotation_euler, o.scale
            field.append(o2)
    aim(0, 1.7, 0.50, 9.0, (0.0, -7.5, 3.6))
    field_path = P["prev"] / "A03_thorny_shrub_field.png"
    render(scene, field_path, 1800, 720)
    for o in field:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in [o for o in list(bpy.data.objects) if o not in before_o]:
        bpy.data.objects.remove(o, do_unlink=True)
    for m_ in [m for m in list(bpy.data.meshes) if m not in before_m and m.users == 0]:
        bpy.data.meshes.remove(m_)
    for m_ in [m for m in list(bpy.data.materials) if m not in before_mat and m.users == 0]:
        bpy.data.materials.remove(m_)
    for i_ in [i for i in list(bpy.data.images) if i not in before_img and i.users == 0]:
        bpy.data.images.remove(i_)

    for t in TIERS:
        for o in objs[t].values():
            o.hide_render = False
    blend = P["src"] / "A03_thorny_shrub.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))

    meta = {
        "id": ASSET_ID, "name": ASSET_NAME, "category": "vegetation",
        "biome": "East African savanna and dry woodland", "status": "generated_pending_review",
        "style": "painterly texture-first (see assets/library/STYLE_GUIDE.md)",
        "creation_method": "procedural Blender Python; painted atlas generated in code",
        "source": {
            "blend": blend.relative_to(REPO).as_posix(),
            "script": "assets/library/source/vegetation/create_a03_shrub.py",
            "helper": "assets/library/source/painter.py",
            "texture": "assets/library/source/vegetation/textures/a03_shrub_atlas.png",
            "external_assets_used": False,
            "license": "Original procedural model and texture; no external assets used",
        },
        "tiers": results,
        "texture": tex_info,
        "previews": {"comparison": cmp_path.relative_to(REPO).as_posix(),
                     "seasons": seasons_path.relative_to(REPO).as_posix(),
                     "field": field_path.relative_to(REPO).as_posix()},
        "a02_import_test": field_info,
        "nodes_in_each_glb": {
            "<tier>_Shrub": "stems, thorns and leaf cards; always shown",
            "<tier>_Flowers": "cream puff-flower cards; show in the flowering season",
            "<tier>_Pods": "hanging seed-pod cards; show in the fruiting season",
        },
        "variants": {
            "how": "multiply the base colour by these RGB values in the game; toggle the Flowers and Pods nodes by season",
            "tints": {k: list(v) for k, v in TINTS.items()},
            "sizes": "small and large are instance scale (about 0.75 to 1.5) in the game, not separate meshes",
        },
        "wind": {
            "mode": "shader mask only",
            "attribute": "TEXCOORD_1 (uv1 in three.js): x = sway weight (0 at base, 1 at outer tips), y = per-part phase 0..1",
            "node_animation": "none",
        },
        "shared": {
            "origin": "shrub base centre at the world origin, Z up in Blender, Y up in glTF",
            "material": "one painted material, alpha-cut (MASK, cutoff 0.5), double sided, one draw call per node",
            "collision": "none, or a small sphere or cylinder at the base if the shrub must block movement",
            "thorns": "geometry on med and high tiers; none on low (too small to read)",
        },
        "game_integration_tested": False,
        "review_notes": [
            "Judge the painted leaf clusters and inked edges in the field and season previews.",
            "Check the alpha-cut cost on weak phones; leaf cards overlap a lot.",
            "Test shader wind, season toggles and tints in the game once 10 assets exist.",
        ],
    }
    (P["meta"] / "A03_thorny_shrub.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return {"texture": tex_info, "tiers": results, "field": field_info, "saved": str(blend)}


if globals().get("DRY_RUN"):
    RESULT = {}
    for t in TIERS:
        B, F, Pd = build_tier(t)
        RESULT[t] = {"shrub": B.tris(), "flowers": F.tris(), "pods": Pd.tris()}
else:
    RESULT = run()
