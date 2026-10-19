# ============================================================
# MY WORLD - A01 EAST AFRICAN SAVANNA ACACIA, v2
# Three quality tiers, articulated for wind, textured.
#
#   low  >= 32,000 triangles
#   med  >= 40,000 triangles
#   high <= 50,000 triangles
#
# Detail that costs no triangles:
#   - tileable bark albedo + normal map (fissures, lichen patches)
#   - alpha-cut leaflet texture on the foliage (feathery edges)
#   - baked vertex-colour shading / ambient occlusion (COLOR_0)
#   - wind masks in a second UV set (TEXCOORD_1: x = sway weight, y = phase)
#
# Movable parts: a pivot hierarchy
#   root > trunk > crown > 3 limbs > up to 3 canopy groups per limb
# with a looping node animation clip called wind_sway
# (30 fps, 121 frames, first frame = rest pose, loop-closed).
#
# Use EITHER the animation clip OR the shader wind masks in the game,
# not both on the same tree.
#
# Stages (set STAGE before running):
#   init       clear scene, make textures, materials and the preview stage
#   tier:low   build, export, patch, test and preview one tier (also med, high)
#   finish     side-by-side layout, save .blend, comparison render, metadata
#   DRY_RUN    only build geometry data and report triangle counts
# Status stays generated_pending_review.
# ============================================================

import bpy
import bmesh
import math
import json
import random
import struct
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix

ASSET_ID = "A01"
ASSET_NAME = "East African Savanna Acacia"
TIERS = {"low": 32000, "med": 40000, "high": 50000}
TIER_MODE = {"low": "min", "med": "min", "high": "max"}
SEED = 1801
FPS = 30
LOOP_FRAMES = 120
KEY_STEP = 6

DETAIL = {
    "low": dict(trunk_sides=20, trunk_rings=44, limb_sides=10, limb_sub=3,
                br_sides=5, br_sub=3, anchors=64, subbr=1, sb_sides=4,
                twigs=3, tw_sides=3, roots=5, root_sides=7,
                pad_subdiv=2, fill_subdiv=1),
    "med": dict(trunk_sides=24, trunk_rings=54, limb_sides=12, limb_sub=4,
                br_sides=6, br_sub=3, anchors=84, subbr=2, sb_sides=4,
                twigs=3, tw_sides=4, roots=6, root_sides=8,
                pad_subdiv=2, fill_subdiv=1),
    "high": dict(trunk_sides=28, trunk_rings=66, limb_sides=14, limb_sub=4,
                 br_sides=7, br_sub=3, anchors=92, subbr=3, sb_sides=5,
                 twigs=4, tw_sides=4, roots=7, root_sides=9,
                 pad_subdiv=2, fill_subdiv=2),
}

LEAF_COL = {
    "dark": (0.11, 0.18, 0.05),
    "mid": (0.20, 0.30, 0.08),
    "light": (0.30, 0.40, 0.11),
}

# wind sway amplitude per pivot level, degrees
PIVOT_AMP = {"trunk": 0.35, "crown": 0.5, "limb": 1.0, "inner": 1.5, "outer": 2.4}

TREE_H = 5.4
CAN_R = 3.1
CAN_CX = 0.12
CAN_CY = 0.0
TILE = 0.63
FISSURE = 0.30


def canopy_z(r):
    q = min(r / CAN_R, 1.2)
    return 4.5 + 0.20 * (1 - q * q) - 0.30 * q ** 4


def trunk_profile(z):
    cx = 0.10 * math.sin(z * 1.1) + 0.035 * z
    cy = 0.06 * math.sin(z * 0.8 + 1.0)
    r = 0.27 + 0.16 * math.exp(-z * 2.4) - 0.02 * z / 2.7
    return cx, cy, r


def sway_weight(x, y, z):
    h = (max(z, 0.0) / TREE_H) ** 1.5
    lat = min(math.hypot(x - CAN_CX, y - CAN_CY) / 3.4, 1.0)
    return min(1.0, h * (0.55 + 0.45 * lat))


# ------------------------------------------------------------
# Periodic value noise for bark fissures
# ------------------------------------------------------------

def _hash(ix, iy, seed):
    h = (ix * 374761393 + iy * 668265263 + seed * 1274126177) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h ^= (h >> 16)
    return (h & 0xFFFF) / 65535.0


def hash01(a, b):
    return _hash(int(a), int(b), 77)


def vnoise(u, v, cu, seed):
    iu = math.floor(u)
    iv = math.floor(v)
    fu = u - iu
    fv = v - iv
    su = fu * fu * (3 - 2 * fu)
    sv = fv * fv * (3 - 2 * fv)
    a = _hash(iu % cu, iv, seed)
    b = _hash((iu + 1) % cu, iv, seed)
    c = _hash(iu % cu, iv + 1, seed)
    d = _hash((iu + 1) % cu, iv + 1, seed)
    return (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + d * su) * sv


def bark_field(t, z, seed):
    # t: 0..1 around the stem (periodic), z: distance along the stem
    f1 = vnoise(t * 12, z / 0.95, 12, seed)
    f2 = vnoise(t * 26, z / 0.40, 26, seed + 7)
    f3 = vnoise(t * 52, z / 0.18, 52, seed + 13)
    r1 = 1 - abs(2 * f1 - 1)
    r2 = 1 - abs(2 * f2 - 1)
    return min(1.0, max(0.0, 0.55 * r1 + 0.30 * r2 + 0.15 * f3))


# ------------------------------------------------------------
# Plain-data mesh container
# ------------------------------------------------------------

class Group:
    def __init__(self, name, mat):
        self.name = name
        self.mat = mat
        self.verts = []
        self.faces = []
        self.smooth = []
        self.uvs = []
        self.cols = []
        self.wind = []
        self.centers = []

    def add(self, verts, faces, smooth, face_uvs, cols, wind):
        base = len(self.verts)
        self.verts.extend(verts)
        self.cols.extend(cols)
        self.wind.extend(wind)
        for f, uv in zip(faces, face_uvs):
            self.faces.append(tuple(base + i for i in f))
            self.uvs.append(uv)
            self.smooth.append(smooth)

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)


def catmull(pts, sub):
    n = len(pts)
    out = []
    for i in range(n - 1):
        p0 = pts[max(i - 1, 0)]
        p1 = pts[i]
        p2 = pts[i + 1]
        p3 = pts[min(i + 2, n - 1)]
        for s in range(sub):
            t = s / sub
            t2 = t * t
            t3 = t2 * t
            out.append(0.5 * ((2 * p1) + (p2 - p0) * t
                              + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (3 * p1 - p0 - 3 * p2 + p3) * t3))
    out.append(pts[-1].copy())
    return out


def tube(g, pts, r0, r1, sides, sub, phase, tip=True, bark_amp=0.0, seed=0):
    path = catmull([Vector(p) for p in pts], max(1, sub))
    n = len(path)
    tans = []
    for i in range(n):
        t = path[min(i + 1, n - 1)] - path[max(i - 1, 0)]
        if t.length < 1e-6:
            t = Vector((0, 0, 1))
        tans.append(t.normalized())
    dist = [0.0]
    for i in range(1, n):
        dist.append(dist[-1] + (path[i] - path[i - 1]).length)
    ref = Vector((0, 0, 1)) if abs(tans[0].z) < 0.95 else Vector((1, 0, 0))
    nrm = tans[0].cross(ref).normalized()
    ur = max(1, round(2 * math.pi * (r0 + r1) * 0.5 / TILE))
    verts = []
    cols = []
    wind = []
    for i in range(n):
        T = tans[i]
        nrm = nrm - T * nrm.dot(T)
        if nrm.length < 1e-6:
            nrm = T.orthogonal()
        nrm.normalize()
        bn = T.cross(nrm)
        u = i / max(n - 1, 1)
        r = r0 + (r1 - r0) * u
        for k in range(sides):
            a = 2 * math.pi * k / sides
            if bark_amp:
                f = bark_field(k / sides, dist[i] * 1.3 + seed * 0.37, seed)
                rr = r * (1 + bark_amp * (f - 0.5) * 2)
                ao = 0.62 + 0.38 * f
            else:
                rr = r
                ao = 0.85
            p = path[i] + (nrm * math.cos(a) + bn * math.sin(a)) * rr
            verts.append(p)
            cols.append((ao, ao, ao))
            wind.append((sway_weight(p.x, p.y, p.z), phase))
    faces = []
    uvs = []
    for i in range(n - 1):
        for k in range(sides):
            a = i * sides + k
            b = i * sides + (k + 1) % sides
            c = (i + 1) * sides + (k + 1) % sides
            d = (i + 1) * sides + k
            faces.append((a, b, c, d))
            u0 = k / sides * ur
            u1 = (k + 1) / sides * ur
            v0 = dist[i] / TILE
            v1 = dist[i + 1] / TILE
            uvs.append([(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
    if tip:
        tp = path[-1] + tans[-1] * r1 * 0.8
        verts.append(tp)
        cols.append((0.85, 0.85, 0.85))
        wind.append((sway_weight(tp.x, tp.y, tp.z), phase))
        ti = len(verts) - 1
        last = (n - 1) * sides
        vl = dist[-1] / TILE
        for k in range(sides):
            faces.append((last + k, last + (k + 1) % sides, ti))
            uvs.append([(k / sides * ur, vl), ((k + 1) / sides * ur, vl),
                        ((k + 0.5) / sides * ur, vl + r1 / TILE)])
    g.add(verts, faces, True, uvs, cols, wind)
    return path


# ------------------------------------------------------------
# Foliage blobs
# ------------------------------------------------------------

_ICO = {}


def ico_template(subdiv):
    if subdiv not in _ICO:
        bm = bmesh.new()
        try:
            bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
        except TypeError:
            bmesh.ops.create_icosphere(bm, subdivisions=subdiv, diameter=1.0)
        bm.verts.index_update()
        verts = [v.co.normalized() for v in bm.verts]
        faces = [tuple(v.index for v in f.verts) for f in bm.faces]
        bm.free()
        _ICO[subdiv] = (verts, faces)
    return _ICO[subdiv]


def sdiff(a, b):
    return (a - b + math.pi) % (2 * math.pi) - math.pi


def assign(x, y, cx, cy, phis):
    ang = math.atan2(y - cy, x - cx)
    li = min(range(3), key=lambda i: abs(sdiff(ang, phis[i])))
    rh = math.hypot(x - cx, y - cy)
    if rh < 1.5:
        band = 0
    else:
        band = 1 if sdiff(ang, phis[li]) >= 0 else 2
    return li, band


def blob(canopy_map, key, center, sc, subdiv, base, rng, jitter, tilt):
    tv, tf = ico_template(subdiv)
    yaw = rng.uniform(0, 2 * math.pi)
    rot = (Matrix.Rotation(yaw, 3, "Z")
           @ Matrix.Rotation(rng.uniform(-tilt, tilt), 3, "X")
           @ Matrix.Rotation(rng.uniform(-tilt, tilt), 3, "Y"))
    center = Vector(center)
    ox = rng.random()
    oy = rng.random()
    phase = rng.random()
    loc = []
    for v in tv:
        j = 1 + jitter * rng.uniform(-1, 1)
        loc.append(Vector((v.x * sc[0] * j, v.y * sc[1] * j, v.z * sc[2] * j)))
    verts = [rot @ p + center for p in loc]
    bc = LEAF_COL[base]
    cols = []
    wind = []
    for v, dv in zip(verts, tv):
        s = dv.z * 0.5 + 0.5
        ao = min(1.0, max(0.55, 0.55 + 0.45 * (v.z - 3.7) / 1.3))
        k = (0.55 + 0.75 * (s ** 1.2)) * ao
        cols.append((bc[0] * k, bc[1] * k, bc[2] * k))
        wind.append((sway_weight(v.x, v.y, v.z), phase))
    uvs = []
    for f in tf:
        c = Vector((0, 0, 0))
        for i in f:
            c += tv[i]
        ax = max(range(3), key=lambda a: abs(c[a]))
        fu = []
        for i in f:
            p = loc[i]
            if ax == 2:
                a, b = p.x, p.y
            elif ax == 0:
                a, b = p.y, p.z
            else:
                a, b = p.x, p.z
            fu.append((a / 0.85 + ox, b / 0.85 + oy))
        uvs.append(fu)
    g = canopy_map[key]
    g.add(verts, tf, False, uvs, cols, wind)
    g.centers.append(center)


# ------------------------------------------------------------
# Tree parts
# ------------------------------------------------------------

def build_trunk(g, d):
    sides = d["trunk_sides"]
    rings = d["trunk_rings"]
    ur = 3
    knots = [(0.7, 0.9, 0.06, 0.12), (4.1, 1.7, 0.05, 0.10), (2.3, 0.55, 0.05, 0.10)]
    verts = []
    cols = []
    wind = []
    zs = []
    for i in range(rings):
        z = -0.08 + 2.83 * i / (rings - 1)
        zs.append(z)
        cx, cy, r = trunk_profile(z)
        for k in range(sides):
            t = k / sides
            a = 2 * math.pi * t
            f = bark_field(t, z, SEED)
            low = vnoise(t * 3, z / 1.4, 3, SEED + 3)
            rr = r * (1 + FISSURE * (f ** 1.5 - 0.35) + 0.12 * (low - 0.5))
            for (ka, kz, kh, kr) in knots:
                da = abs(sdiff(a, ka)) * r
                dz = z - kz
                rr += kh * math.exp(-(da * da + dz * dz) / (kr * kr))
            ground = 0.75 + 0.25 * min(max(z, 0.0) / 0.6, 1.0)
            ao = (0.55 + 0.45 * f) * ground
            p = Vector((cx + rr * math.cos(a), cy + rr * math.sin(a), z))
            verts.append(p)
            cols.append((ao, ao, ao))
            wind.append((sway_weight(p.x, p.y, p.z), 0.0))
    faces = []
    uvs = []
    for i in range(rings - 1):
        for k in range(sides):
            a = i * sides + k
            b = i * sides + (k + 1) % sides
            c = (i + 1) * sides + (k + 1) % sides
            dd = (i + 1) * sides + k
            faces.append((a, b, c, dd))
            u0 = k / sides * ur
            u1 = (k + 1) / sides * ur
            v0 = zs[i] / TILE
            v1 = zs[i + 1] / TILE
            uvs.append([(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
    top = (rings - 1) * sides
    faces.append(tuple(top + k for k in range(sides)))
    uvs.append([(verts[top + k].x / TILE, verts[top + k].y / TILE) for k in range(sides)])
    g.add(verts, faces, True, uvs, cols, wind)


def build_roots(g, d, rng):
    n = d["roots"]
    cx, cy, r = trunk_profile(0.3)
    for j in range(n):
        th = 2 * math.pi * j / n + rng.uniform(-0.3, 0.3)
        c, s = math.cos(th), math.sin(th)
        L = rng.uniform(0.55, 0.95)
        pts = [
            (cx + c * r * 0.4, cy + s * r * 0.4, 0.65),
            (cx + c * r * 1.15, cy + s * r * 1.15, 0.30),
            (cx + c * (r + L * 0.45), cy + s * (r + L * 0.45), 0.10),
            (cx + c * (r + L), cy + s * (r + L), -0.05),
        ]
        tube(g, pts, 0.19, 0.045, d["root_sides"], d["limb_sub"], 0.0,
             bark_amp=0.12, seed=40 + j)


def limb_points(phi, rng):
    cx, cy, _ = trunk_profile(2.6)
    spec = [(0.0, 2.55), (0.35, 2.95), (0.95, 3.45),
            (1.7, 3.85), (2.4, 4.08), (2.95, 4.15)]
    drift = rng.uniform(-0.05, 0.05)
    pts = []
    for i, (rr, zz) in enumerate(spec):
        a = phi + drift * i
        if i > 0:
            rr += rng.uniform(-0.1, 0.1)
            zz += rng.uniform(-0.08, 0.08)
        pts.append(Vector((cx + rr * math.cos(a), cy + rr * math.sin(a), zz)))
    return pts


def build_crown(limb_g, canopy_map, d, rng_l, rng_a):
    cx, cy, _ = trunk_profile(2.6)
    phis = [math.radians(90 + rng_l.uniform(-12, 12)),
            math.radians(210 + rng_l.uniform(-12, 12)),
            math.radians(330 + rng_l.uniform(-12, 12))]
    limbs = []
    for li, phi in enumerate(phis):
        pts = limb_points(phi, rng_l)
        tube(limb_g[li], pts, 0.17, 0.045, d["limb_sides"], d["limb_sub"],
             li / 3.0, bark_amp=0.10, seed=10 + li)
        limbs.append((phi, catmull(pts, 4)))

    n = d["anchors"]
    anchors = []
    for i in range(n):
        rr = CAN_R * math.sqrt((i + 0.5) / n)
        th = i * 2.39996
        x = CAN_CX + rr * math.cos(th)
        y = CAN_CY + rr * 0.92 * math.sin(th)
        z = canopy_z(rr) + rng_a.uniform(-0.08, 0.08)
        anchors.append((x, y, z, rr))

    hr_base = 1.55 * CAN_R / math.sqrt(n)
    for (x, y, z, rr) in anchors:
        hr = hr_base * rng_a.uniform(0.85, 1.15)
        base = rng_a.choice(["mid", "mid", "dark"])
        key = assign(x, y, cx, cy, phis)
        blob(canopy_map, key, (x, y, z),
             (hr, hr * 0.92, 0.30 * rng_a.uniform(0.9, 1.1)),
             d["pad_subdiv"], base, rng_a, 0.12, 0.10)

    for idx, (x, y, z, rr) in enumerate(anchors):
        ang = math.atan2(y - cy, x - cx)
        li = min(range(3), key=lambda i: abs(sdiff(ang, limbs[i][0])))
        g = limb_g[li]
        rt = max(0.45, 0.55 * rr)
        path = limbs[li][1]
        P = min(path, key=lambda p: abs(math.hypot(p.x - cx, p.y - cy) - rt))
        A = Vector((x, y, z - 0.16))
        mid = P.lerp(A, 0.5) + Vector((rng_a.uniform(-0.15, 0.15),
                                       rng_a.uniform(-0.15, 0.15), 0.12))
        ph = hash01(idx, 3) 
        bpath = tube(g, [P, mid, A], 0.065, 0.02, d["br_sides"], d["br_sub"],
                     ph, bark_amp=0.08, seed=100 + idx)
        for s in range(d["subbr"]):
            t = 0.35 + 0.45 * (s + 1) / (d["subbr"] + 1)
            Q = bpath[min(len(bpath) - 1, int(t * (len(bpath) - 1)))]
            ta = rng_a.uniform(0, 2 * math.pi)
            dv = Vector((math.cos(ta), math.sin(ta), 0))
            tube(g, [Q, Q + dv * 0.35 + Vector((0, 0, 0.12)),
                     Q + dv * 0.7 + Vector((0, 0, 0.20))],
                 0.035, 0.012, d["sb_sides"], 2, ph)
        for t in range(d["twigs"]):
            ta = rng_a.uniform(0, 2 * math.pi)
            dv = Vector((math.cos(ta), math.sin(ta), 0))
            tube(g, [A, A + dv * 0.18 + Vector((0, 0, 0.10)),
                     A + dv * 0.34 + Vector((0, 0, 0.20))],
                 0.022, 0.008, d["tw_sides"], 2, ph)
    return phis, (cx, cy)


def fill_foliage(canopy_map, d, rng, total_fn, target, mode, cx, cy, phis):
    big = 80 if d["fill_subdiv"] == 2 else 20
    while True:
        remaining = target - total_fn()
        if mode == "min" and remaining <= 0:
            break
        if mode == "max" and remaining < 20:
            break
        sub = d["fill_subdiv"] if remaining >= big else 1
        rr = CAN_R * (rng.random() ** 0.55)
        th = rng.uniform(0, 2 * math.pi)
        x = CAN_CX + rr * math.cos(th)
        y = CAN_CY + rr * 0.92 * math.sin(th)
        z = canopy_z(rr) + 0.20 + rng.uniform(-0.12, 0.15)
        s = rng.uniform(0.22, 0.40) * (0.9 if sub == 1 else 1.0)
        base = rng.choice(["mid", "mid", "dark", "light"])
        key = assign(x, y, cx, cy, phis)
        blob(canopy_map, key, (x, y, z), (s, s, s * 0.6), sub, base, rng, 0.18, 0.2)


def plan(tier):
    d = DETAIL[tier]
    target = TIERS[tier]
    trunk = Group("trunk", "bark")
    limbs = [Group("limb_%d" % i, "bark") for i in range(3)]
    canopy_map = {(li, b): Group("canopy_%d%d" % (li, b), "leaf")
                  for li in range(3) for b in range(3)}

    def total():
        return (trunk.tris() + sum(g.tris() for g in limbs)
                + sum(g.tris() for g in canopy_map.values()))

    bd = {}
    last = 0
    build_trunk(trunk, d)
    bd["trunk"] = total() - last
    last = total()
    build_roots(trunk, d, random.Random(SEED + 1))
    bd["roots"] = total() - last
    last = total()
    phis, (cx, cy) = build_crown(limbs, canopy_map, d, random.Random(SEED + 2),
                                 random.Random(SEED + 3))
    bd["limbs_branches_twigs_pads"] = total() - last
    last = total()
    fill_foliage(canopy_map, d, random.Random(SEED + 4), total, target,
                 TIER_MODE[tier], cx, cy, phis)
    bd["fill_foliage"] = total() - last
    bd["TOTAL"] = total()
    bd["target"] = target
    bd["mode"] = TIER_MODE[tier]
    bd["canopy_blob_counts"] = {"%d%d" % k: len(g.centers) for k, g in canopy_map.items()}
    return dict(trunk=trunk, limbs=limbs, canopy=canopy_map, phis=phis,
                crown=(cx, cy), bd=bd)


# ------------------------------------------------------------
# Textures (numpy, tileable)
# ------------------------------------------------------------

def _pnoise(rng, h, w, fxc, fyc, power=1.6):
    n = rng.standard_normal((h, w))
    F = np.fft.fft2(n)
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    amp = 1.0 / (1.0 + (fx / fxc) ** 2 + (fy / fyc) ** 2) ** (power / 2.0)
    out = np.real(np.fft.ifft2(F * amp))
    return (out - out.mean()) / (out.std() + 1e-9)


TEX_CHECK = {}


def _save_img(name, path, rgba, fmt, cs):
    h, w = rgba.shape[:2]
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name, w, h, alpha=True)
    # Colour space MUST be set before the pixels: setting it afterwards
    # resets a generated image to black and drops the file format.
    img.colorspace_settings.name = cs
    img.pixels.foreach_set(np.clip(rgba, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = str(path)
    img.file_format = fmt
    img.save()
    bpy.data.images.remove(img)
    # read back and refuse blank output
    chk = bpy.data.images.load(str(path), check_existing=False)
    arr = np.empty(len(chk.pixels), dtype=np.float32)
    chk.pixels.foreach_get(arr)
    bpy.data.images.remove(chk)
    arr = arr.reshape(-1, 4)
    head = Path(path).read_bytes()[:3]
    ok_head = head == (b"\xff\xd8\xff" if fmt == "JPEG" else b"\x89PN")
    spread = float(arr[:, :3].std()) if fmt != "PNG" or "leaf" not in name else float(arr[:, 3].std())
    if not ok_head or spread < 0.02:
        raise RuntimeError("Texture %s saved blank or in the wrong format (header %r, spread %.4f)"
                           % (name, head, spread))
    TEX_CHECK[name] = {"bytes": Path(path).stat().st_size, "spread": round(spread, 3)}


def make_textures(tex_dir, size=512):
    tex_dir.mkdir(parents=True, exist_ok=True)
    r = np.random.default_rng(SEED)
    n1 = _pnoise(r, size, size, 14, 2.5)
    n2 = _pnoise(r, size, size, 30, 6)
    n3 = _pnoise(r, size, size, 80, 60, 1.0)
    n4 = _pnoise(r, size, size, 6, 6)
    crev = np.clip(np.exp(-(n1 / 0.30) ** 2) + 0.6 * np.exp(-(n2 / 0.30) ** 2), 0, 1)
    height = 1.0 - crev * 0.9 + 0.06 * n3 + 0.10 * n2
    ridge_c = np.array([0.40, 0.33, 0.28])
    crev_c = np.array([0.08, 0.06, 0.05])
    grey_c = np.array([0.52, 0.52, 0.47])
    shade = (0.82 + 0.10 * np.clip(n3, -1.5, 1.5) + 0.06 * np.clip(n2, -1.5, 1.5))[..., None]
    col = ridge_c[None, None, :] * shade
    t = (crev ** 0.8)[..., None]
    col = col * (1 - t) + crev_c[None, None, :] * t
    lich = np.clip((n4 - 1.2) / 0.8, 0, 1)[..., None] * 0.30
    col = col * (1 - lich) + grey_c[None, None, :] * lich
    alb = np.concatenate([col, np.ones((size, size, 1))], axis=2)
    _save_img("a01_bark_albedo", tex_dir / "a01_bark_albedo.jpg", alb, "JPEG", "sRGB")

    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5
    S = 5.0
    nx, ny, nz = -dx * S, -dy * S, np.ones_like(dx)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nm = np.stack([nx / ln, ny / ln, nz / ln], axis=2) * 0.5 + 0.5
    nrm = np.concatenate([nm, np.ones((size, size, 1))], axis=2)
    _save_img("a01_bark_normal", tex_dir / "a01_bark_normal.jpg", nrm, "JPEG", "Non-Color")

    rl = np.random.default_rng(SEED + 5)
    rgb = np.zeros((size, size, 3))
    alpha = np.zeros((size, size))

    def stamp(cx, cy, ang, a, b, shade_rgb):
        R = int(a + 2)
        ys, xs = np.mgrid[-R:R + 1, -R:R + 1]
        ca, sa = math.cos(ang), math.sin(ang)
        u = xs * ca + ys * sa
        v = -xs * sa + ys * ca
        m = (u / a) ** 2 + (v / b) ** 2 <= 1.0
        py = (ys[m] + int(cy)) % size
        px = (xs[m] + int(cx)) % size
        alpha[py, px] = 1.0
        rgb[py, px] = shade_rgb

    base_leaf = np.array([0.78, 0.92, 0.62])
    for _ in range(60):
        x = rl.uniform(0, size)
        y = rl.uniform(0, size)
        ang = rl.uniform(0, 2 * math.pi)
        length = rl.uniform(90, 170)
        steps = int(length / 6)
        for s in range(steps):
            px_ = x + math.cos(ang) * s * 6
            py_ = y + math.sin(ang) * s * 6
            stamp(px_, py_, ang, 4, 0.9, base_leaf * 0.55)
            for side in (-1, 1):
                la = ang + side * math.radians(rl.uniform(62, 80))
                sh = base_leaf * rl.uniform(0.85, 1.1)
                stamp(px_ + math.cos(la) * 3, py_ + math.sin(la) * 3, la, 7, 1.9, np.clip(sh, 0, 1))
    leaf = np.concatenate([rgb, alpha[..., None]], axis=2)
    _save_img("a01_foliage_leaf", tex_dir / "a01_foliage_leaf.png", leaf, "PNG", "sRGB")
    return {"leaf_alpha_coverage": round(float(alpha.mean()), 3), "textures": TEX_CHECK}


# ------------------------------------------------------------
# GLB helpers
# ------------------------------------------------------------

def read_glb(path):
    data = Path(path).read_bytes()
    magic, ver, total = struct.unpack("<4sII", data[:12])
    off = 12
    chunks = []
    while off < len(data):
        clen, ctype = struct.unpack("<I4s", data[off:off + 8])
        chunks.append([ctype, data[off + 8: off + 8 + clen]])
        off += 8 + clen
    j = json.loads(chunks[0][1].decode("utf-8"))
    return magic, ver, chunks, j


def write_glb(path, magic, ver, chunks, j):
    jb = json.dumps(j, separators=(",", ":")).encode("utf-8")
    jb += b" " * ((4 - len(jb) % 4) % 4)
    chunks[0][1] = jb
    body = b""
    for ct, cd in chunks:
        body += struct.pack("<I4s", len(cd), ct) + cd
    Path(path).write_bytes(struct.pack("<4sII", magic, ver, 12 + len(body)) + body)


def patch_glb(path):
    magic, ver, chunks, j = read_glb(path)
    for m in j.get("materials", []):
        if "Foliage" in m.get("name", ""):
            m["alphaMode"] = "MASK"
            m["alphaCutoff"] = 0.45
            m["doubleSided"] = True
    for a in j.get("animations", []):
        a["name"] = "wind_sway"
    write_glb(path, magic, ver, chunks, j)


def inspect_glb(path):
    magic, ver, chunks, j = read_glb(path)
    tris = 0
    prims = 0
    attrs = set()
    for m in j["meshes"]:
        for pr in m["primitives"]:
            prims += 1
            tris += j["accessors"][pr["indices"]]["count"] // 3
            attrs.update(pr["attributes"].keys())
    anim = []
    for a in j.get("animations", []):
        anim.append({"name": a.get("name"), "channels": len(a["channels"]),
                     "paths": sorted({c["target"]["path"] for c in a["channels"]})})
    mats = {m.get("name"): {"alphaMode": m.get("alphaMode", "OPAQUE"),
                            "has_normal_map": "normalTexture" in m,
                            "has_base_texture": "baseColorTexture" in m.get("pbrMetallicRoughness", {})}
            for m in j.get("materials", [])}
    return {"triangles": tris, "nodes": len(j["nodes"]), "meshes": len(j["meshes"]),
            "primitives_draw_calls": prims, "attributes": sorted(attrs),
            "images": [(i.get("mimeType"), i.get("name")) for i in j.get("images", [])],
            "materials": mats, "animations": anim}


# ------------------------------------------------------------
# Blender scene
# ------------------------------------------------------------

def paths():
    repo = Path(globals().get("REPO_ROOT") or Path(__file__).resolve().parents[4])
    if not (repo / "package.json").exists():
        raise RuntimeError("Not the My World repository: %s" % repo)
    return dict(
        repo=repo,
        src=repo / "assets/library/source/vegetation",
        tex=repo / "assets/library/source/vegetation/textures",
        prev=repo / "assets/library/previews",
        meta=repo / "assets/library/metadata",
        out=repo / "public/assets/models/vegetation",
    )


def find_layer_coll(lc, name):
    if lc.name == name:
        return lc
    for ch in lc.children:
        r = find_layer_coll(ch, name)
        if r:
            return r
    return None


def show_only(names):
    root_lc = bpy.context.view_layer.layer_collection
    for t in TIERS:
        cname = "A01_Acacia_" + t.upper()
        lc = find_layer_coll(root_lc, cname)
        if lc:
            lc.exclude = cname not in names


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def make_materials(tex_dir):
    mats = {}
    specs = {
        "bark": ("A01_Bark", "a01_bark_albedo.jpg", "a01_bark_normal.jpg", 0.95, False),
        "leaf": ("A01_Foliage", "a01_foliage_leaf.png", None, 0.80, True),
    }
    for key, (name, cfile, nfile, rough, alpha) in specs.items():
        old = bpy.data.materials.get(name)
        if old:
            bpy.data.materials.remove(old)
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nt = mat.node_tree
        nodes, links = nt.nodes, nt.links
        b = nodes.get("Principled BSDF")
        b.inputs["Roughness"].default_value = rough
        for k in ("Specular IOR Level", "Specular"):
            if k in b.inputs:
                b.inputs[k].default_value = 0.15
                break
        ci = bpy.data.images.get(cfile)
        if ci:
            bpy.data.images.remove(ci)
        ci = bpy.data.images.load(str(tex_dir / cfile))
        ci.colorspace_settings.name = "sRGB"
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = ci
        vc = nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Color"
        mx = nodes.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.blend_type = "MULTIPLY"
        mx.inputs[0].default_value = 1.0
        links.new(tex.outputs["Color"], mx.inputs[6])
        links.new(vc.outputs["Color"], mx.inputs[7])
        links.new(mx.outputs[2], b.inputs["Base Color"])
        if alpha:
            links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
        if nfile:
            ni = bpy.data.images.get(nfile)
            if ni:
                bpy.data.images.remove(ni)
            ni = bpy.data.images.load(str(tex_dir / nfile))
            ni.colorspace_settings.name = "Non-Color"
            nt_ = nodes.new("ShaderNodeTexImage")
            nt_.image = ni
            nmap = nodes.new("ShaderNodeNormalMap")
            links.new(nt_.outputs["Color"], nmap.inputs["Color"])
            links.new(nmap.outputs["Normal"], b.inputs["Normal"])
        mats[key] = mat
    return mats


def get_materials():
    return {"bark": bpy.data.materials["A01_Bark"], "leaf": bpy.data.materials["A01_Foliage"]}


def group_to_object(g, name, mats):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in g.verts], [], g.faces)
    mesh.materials.append(mats[g.mat])
    for poly, sm in zip(mesh.polygons, g.smooth):
        poly.use_smooth = sm
    uv = mesh.uv_layers.new(name="UVMap")
    uv.data.foreach_set("uv", [c for fuv in g.uvs for pair in fuv for c in pair])
    uw = mesh.uv_layers.new(name="UVWind")
    flatw = []
    flatc = []
    for f in g.faces:
        for vi in f:
            flatw.extend(g.wind[vi])
            c = g.cols[vi]
            flatc.extend((c[0], c[1], c[2], 1.0))
    uw.data.foreach_set("uv", flatw)
    ca = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    ca.data.foreach_set("color", flatc)
    mesh.update()
    return bpy.data.objects.new(name, mesh)


def stage_init():
    P = paths()
    for p in (P["src"], P["tex"], P["prev"], P["meta"], P["out"]):
        p.mkdir(parents=True, exist_ok=True)
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    scene = bpy.context.scene
    info = make_textures(P["tex"])
    make_materials(P["tex"])

    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except Exception:
        pass
    try:
        scene.eevee.taa_render_samples = 24
    except Exception:
        pass
    scene.render.fps = FPS
    if scene.world is None:
        scene.world = bpy.data.worlds.new("A01_Preview_World")
    scene.world.color = (0.45, 0.50, 0.56)
    scene.world.use_nodes = True
    wnt = scene.world.node_tree
    for n in list(wnt.nodes):
        wnt.nodes.remove(n)
    wbg = wnt.nodes.new("ShaderNodeBackground")
    wbg.inputs[0].default_value = (0.45, 0.52, 0.60, 1.0)
    wbg.inputs[1].default_value = 1.0
    wout = wnt.nodes.new("ShaderNodeOutputWorld")
    wnt.links.new(wbg.outputs[0], wout.inputs[0])

    stage = bpy.data.collections.new("A01_Preview_Stage")
    scene.collection.children.link(stage)
    gmat = bpy.data.materials.get("A01_Preview_Earth") or bpy.data.materials.new("A01_Preview_Earth")
    gmat.diffuse_color = (0.30, 0.20, 0.11, 1.0)
    gmat.use_nodes = True
    gb = gmat.node_tree.nodes.get("Principled BSDF")
    if gb:
        gb.inputs["Base Color"].default_value = (0.30, 0.20, 0.11, 1.0)
        gb.inputs["Roughness"].default_value = 1.0
    gm = bpy.data.meshes.new("A01_Preview_Ground")
    gm.from_pydata([(-80, -80, -0.02), (80, -80, -0.02), (80, 80, -0.02), (-80, 80, -0.02)],
                   [], [(0, 1, 2, 3)])
    gm.materials.append(gmat)
    stage.objects.link(bpy.data.objects.new("A01_Preview_Ground", gm))
    cam_data = bpy.data.cameras.new("A01_Preview_Camera")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 10.5
    cam = bpy.data.objects.new("A01_Preview_Camera", cam_data)
    stage.objects.link(cam)
    cam.location = (10, -17, 9)
    look_at(cam, (0, 0, 2.9))
    scene.camera = cam
    for nm, energy, rot in (
        ("A01_Key_Sun", 3.6, (math.radians(48), math.radians(8), math.radians(38))),
        ("A01_Fill_Sun", 0.8, (math.radians(62), 0, math.radians(-130))),
    ):
        ld = bpy.data.lights.new(nm, "SUN")
        ld.energy = energy
        lo = bpy.data.objects.new(nm, ld)
        stage.objects.link(lo)
        lo.location = (0, 0, 10)
        lo.rotation_euler = rot
    return info


def animate(pivots):
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = LOOP_FRAMES + 1
    for idx, (obj, amp, wx) in enumerate(pivots):
        phi = wx * 0.40 + hash01(idx, 9) / 65535.0 * 0 + hash01(idx, 11) * 1.2
        obj.rotation_mode = "XYZ"

        def s(kk, th, ph):
            return math.sin(kk * th + ph) - math.sin(ph)

        for f in range(0, LOOP_FRAMES + 1, KEY_STEP):
            th = 2 * math.pi * f / LOOP_FRAMES
            ay = amp * (0.70 * s(1, th, phi) + 0.25 * s(2, th, 1.7 * phi + 0.6) + 0.10 * s(3, th, 0.4 + phi))
            ax = 0.5 * amp * (0.6 * s(1, th, phi + 1.2) + 0.4 * s(2, th, 0.5 * phi))
            az = 0.25 * amp * s(2, th, 0.7 * phi)
            obj.rotation_euler = (math.radians(ax), math.radians(ay), math.radians(az))
            obj.keyframe_insert("rotation_euler", frame=f + 1)
        obj.rotation_euler = (0.0, 0.0, 0.0)


def stage_tier(tier):
    P = paths()
    scene = bpy.context.scene
    view_layer = bpy.context.view_layer
    mats = get_materials()
    P_ = plan(tier)
    bd = P_["bd"]
    cname = "A01_Acacia_" + tier.upper()
    old = bpy.data.collections.get(cname)
    if old:
        for o in list(old.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(old)
    coll = bpy.data.collections.new(cname)
    scene.collection.children.link(coll)
    show_only([cname])
    scene.frame_set(1)
    view_layer.update()

    def mk_empty(name, kind, loc, parent, size=0.12):
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = kind
        e.empty_display_size = size
        coll.objects.link(e)
        e.parent = parent
        e.location = loc
        return e

    pre = "A01_%s_" % tier
    root = bpy.data.objects.new(cname, None)
    root.empty_display_type = "PLAIN_AXES"
    coll.objects.link(root)
    cx, cy = P_["crown"]
    crown_w = Vector((cx, cy, 2.55))

    p_trunk = mk_empty(pre + "P_Trunk", "SPHERE", (0, 0, 0), root)
    p_crown = mk_empty(pre + "P_Crown", "SPHERE", tuple(crown_w), p_trunk)
    view_layer.update()
    pivots = [(p_trunk, PIVOT_AMP["trunk"], 0.0), (p_crown, PIVOT_AMP["crown"], crown_w.x)]
    objs = [root, p_trunk, p_crown]

    trunk_obj = group_to_object(P_["trunk"], pre + "Trunk", mats)
    coll.objects.link(trunk_obj)
    trunk_obj.parent = p_trunk
    objs.append(trunk_obj)

    probe = None
    for li in range(3):
        p_limb = mk_empty(pre + "P_Limb_%d" % li, "SPHERE", (0, 0, 0), p_crown)
        view_layer.update()
        pivots.append((p_limb, PIVOT_AMP["limb"], crown_w.x))
        objs.append(p_limb)
        lo = group_to_object(P_["limbs"][li], pre + "Limb_%d" % li, mats)
        coll.objects.link(lo)
        lo.parent = p_limb
        lo.matrix_parent_inverse = p_limb.matrix_world.inverted()
        objs.append(lo)
        for band in range(3):
            g = P_["canopy"][(li, band)]
            if not g.centers:
                continue
            mx = sum(c.x for c in g.centers) / len(g.centers)
            my = sum(c.y for c in g.centers) / len(g.centers)
            mz = min(c.z for c in g.centers) - 0.1
            world = Vector((mx, my, mz))
            p_can = mk_empty(pre + "P_Canopy_%d%d" % (li, band), "SPHERE",
                             tuple(world - crown_w), p_limb)
            view_layer.update()
            pivots.append((p_can, PIVOT_AMP["inner"] if band == 0 else PIVOT_AMP["outer"], world.x))
            objs.append(p_can)
            co = group_to_object(g, pre + "Canopy_%d%d" % (li, band), mats)
            coll.objects.link(co)
            co.parent = p_can
            co.matrix_parent_inverse = p_can.matrix_world.inverted()
            objs.append(co)
            if li == 0 and band == 1:
                probe = co
    view_layer.update()

    animate(pivots)
    scene.frame_set(1)
    view_layer.update()

    # measure
    groups = [P_["trunk"]] + P_["limbs"] + list(P_["canopy"].values())
    allv = [v for g in groups for v in g.verts]
    mins = [min(v[i] for v in allv) for i in range(3)]
    maxs = [max(v[i] for v in allv) for i in range(3)]
    dims = [round(maxs[i] - mins[i], 3) for i in range(3)]
    tri = bd["TOTAL"]

    # export
    glb_path = P["out"] / ("a01_acacia_tree_%s.glb" % tier)
    for o in view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    view_layer.objects.active = root
    kwargs = dict(filepath=str(glb_path), export_format="GLB", use_selection=True,
                  export_apply=True, export_materials="EXPORT",
                  export_cameras=False, export_lights=False, export_animations=True)
    try:
        bpy.ops.export_scene.gltf(export_animation_mode="ACTIVE_ACTIONS", **kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)
    patch_glb(glb_path)
    info = inspect_glb(glb_path)

    # wind test: motion of a canopy vertex over the loop
    probe_i = max(range(len(probe.data.vertices)),
                  key=lambda i: (probe.data.vertices[i].co - Vector((cx, cy, 2.55))).length)
    ref = None
    sway = {}
    for f in (1, 16, 31, 46, 61, 76, 91, 106, 121):
        scene.frame_set(f)
        pos = probe.matrix_world @ probe.data.vertices[probe_i].co
        if ref is None:
            ref = pos.copy()
        sway[f] = round((pos - ref).length * 100, 2)
    scene.frame_set(1)
    view_layer.update()
    wind_test = {"probe": probe.name, "displacement_cm_by_frame": sway,
                 "max_cm": max(sway.values()), "loop_closure_error_cm": sway[121]}

    # preview
    prev_path = P["prev"] / ("A01_acacia_tree_%s.png" % tier)
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.filepath = str(prev_path)
    bpy.ops.render.render(write_still=True)

    stats = {
        "glb": glb_path.relative_to(P["repo"]).as_posix(),
        "preview": prev_path.relative_to(P["repo"]).as_posix(),
        "triangles_built": tri, "glb_triangles": info["triangles"],
        "glb_bytes": glb_path.stat().st_size,
        "dimensions_xyz_m": dims,
        "nodes": info["nodes"], "meshes": info["meshes"],
        "primitives_draw_calls": info["primitives_draw_calls"],
        "attributes": info["attributes"], "images": info["images"],
        "materials": info["materials"], "animations": info["animations"],
        "pivot_count": len(pivots), "wind_test": wind_test, "breakdown": bd,
    }
    Path(bpy.app.tempdir, "a01_%s_stats.json" % tier).write_text(json.dumps(stats))
    return stats


def stage_finish():
    P = paths()
    scene = bpy.context.scene
    view_layer = bpy.context.view_layer
    stats = {t: json.loads(Path(bpy.app.tempdir, "a01_%s_stats.json" % t).read_text()) for t in TIERS}
    show_only(["A01_Acacia_LOW", "A01_Acacia_MED", "A01_Acacia_HIGH"])
    for tier, x in (("low", -8.5), ("med", 0.0), ("high", 8.5)):
        bpy.data.objects["A01_Acacia_" + tier.upper()].location = (x, 0, 0)
    cam = bpy.data.objects["A01_Preview_Camera"]
    cam.data.ortho_scale = 26.0
    cam.location = (0, -30, 8)
    look_at(cam, (0, 0, 2.8))
    scene.frame_set(1)
    view_layer.update()
    blend_path = P["src"] / "A01_acacia_tree_tiers.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    cmp_path = P["prev"] / "A01_acacia_tree_tiers_comparison.png"
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 750
    scene.render.filepath = str(cmp_path)
    bpy.ops.render.render(write_still=True)
    meta = {
        "id": ASSET_ID,
        "name": ASSET_NAME,
        "category": "vegetation",
        "biome": "East African savanna",
        "status": "generated_pending_review",
        "version": 2,
        "creation_method": "procedural Blender Python; one skeleton, three detail tiers, articulated for wind",
        "source": {
            "blend": blend_path.relative_to(P["repo"]).as_posix(),
            "script": (P["src"] / "create_a01_acacia_tiers.py").relative_to(P["repo"]).as_posix(),
            "textures": [
                "assets/library/source/vegetation/textures/a01_bark_albedo.jpg",
                "assets/library/source/vegetation/textures/a01_bark_normal.jpg",
                "assets/library/source/vegetation/textures/a01_foliage_leaf.png",
            ],
            "external_assets_used": False,
            "license": "Original procedural model and textures; no external assets used",
        },
        "triangle_budget": {"low": ">= 32,000", "med": ">= 40,000", "high": "<= 50,000"},
        "tiers": stats,
        "comparison_preview": cmp_path.relative_to(P["repo"]).as_posix(),
        "wind": {
            "node_animation": {
                "clip": "wind_sway", "fps": FPS, "frames": LOOP_FRAMES + 1,
                "duration_s": LOOP_FRAMES / FPS, "loops": True,
                "first_frame_is_rest_pose": True,
                "pivot_hierarchy": "root > P_Trunk > P_Crown > P_Limb_0..2 > P_Canopy_<limb><band>",
                "amplitude_degrees": PIVOT_AMP,
                "note": "Play with an AnimationMixer; scale mixer weight toward 0 for calm, 1 for the full sway, and timeScale for speed. Wind blows toward +X in model space.",
            },
            "shader_wind_masks": {
                "attribute": "TEXCOORD_1 (uv1 in three.js)",
                "x": "sway weight, 0 at the base rising to 1 at the canopy edge",
                "y": "per-part phase 0..1 for desynchronised flutter",
                "note": "Alternative to the clip, cheaper for forests: do not use both on the same tree.",
            },
        },
        "detail_without_triangles": [
            "Tileable bark albedo + normal map (fissures, lichen patches)",
            "Alpha-cut acacia leaflet texture on the foliage",
            "Baked vertex-colour shading and ambient occlusion in COLOR_0",
            "Wind masks stored in a second UV set",
        ],
        "shared": {
            "origin": "World origin at the tree base, Z up in Blender, Y up in glTF",
            "collision_suggestion": "Cylinder around the trunk only; canopy is not physical.",
            "alpha": "Foliage material is alpha-cut (MASK, cutoff 0.45), double sided.",
        },
        "quality_selection_note": "The game picks a tier from device capability by default; a settings page may let the player override it with a warning on limited devices.",
        "game_integration_tested": False,
        "supersedes_note": "Version 1 of the tiers (3.5k/6k/8k, no wind parts) is archived in assets/library/source/vegetation/legacy_v1/. The very first single-model A01 files are untouched.",
        "review_notes": [
            "Judge bark relief, fissure scale and colour in the comparison preview.",
            "Check the foliage cutout look in the game lighting moods.",
            "Test the wind_sway clip and the node pivots in three.js.",
            "Profile the high tier on a weak Android phone; consider the legacy v1 meshes as distant LODs.",
        ],
    }
    (P["meta"] / "A01_acacia_tree_tiers.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return {"saved": str(blend_path), "comparison": str(cmp_path)}


STAGE = globals().get("STAGE", "dry")
if globals().get("DRY_RUN"):
    RESULT = {t: plan(t)["bd"] for t in TIERS}
elif STAGE == "init":
    RESULT = stage_init()
elif STAGE.startswith("tier:"):
    RESULT = stage_tier(STAGE.split(":")[1])
elif STAGE == "finish":
    RESULT = stage_finish()
