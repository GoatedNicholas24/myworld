# ============================================================
# MY WORLD - A01 EAST AFRICAN SAVANNA ACACIA, THREE QUALITY TIERS
#
# One skeleton and one random seed, built at three detail levels:
#   low  >= 3,500 triangles
#   med  >= 6,000 triangles
#   high >= 8,000 triangles
#
# Geometry is built as plain data, then merged into a few meshes:
#   1 trunk-and-branches mesh (3 bark materials)
#   3 canopy meshes, one per wind pivot (3 foliage materials)
# so each tier is only about 12 draw calls.
#
# Outputs (all new files; nothing from the first A01 pass is touched):
#   source/vegetation/A01_acacia_tree_tiers.blend
#   public/assets/models/vegetation/a01_acacia_tree_<tier>.glb
#   previews/A01_acacia_tree_<tier>.png and ..._tiers_comparison.png
#   metadata/A01_acacia_tree_tiers.json
#
# Run from Blender with REPO_ROOT set, or from the Text Editor
# after saving this file inside the repository.
# Status stays generated_pending_review.
# ============================================================

import bpy
import bmesh
import math
import json
import random
from pathlib import Path
from mathutils import Vector, Matrix

ASSET_ID = "A01"
ASSET_NAME = "East African Savanna Acacia"
TIERS = {"low": 3500, "med": 6000, "high": 8000}
SEED = 1801

DETAIL = {
    "low": dict(trunk_sides=7, trunk_rings=9, limb_sides=5, branch_sides=4,
                tw_sides=3, sub=1, anchors=26, branch_every=3, twigs=0,
                ridges=0, cracks=0, roots=3, pad_subdiv=1, fill_subdiv=1),
    "med": dict(trunk_sides=10, trunk_rings=14, limb_sides=7, branch_sides=5,
                tw_sides=3, sub=2, anchors=36, branch_every=2, twigs=1,
                ridges=6, cracks=0, roots=5, pad_subdiv=2, fill_subdiv=1),
    "high": dict(trunk_sides=14, trunk_rings=22, limb_sides=9, branch_sides=6,
                 tw_sides=4, sub=2, anchors=40, branch_every=2, twigs=2,
                 ridges=12, cracks=8, roots=7, pad_subdiv=2, fill_subdiv=2),
}

PALETTE = {
    "bark": ("A01_Bark_Warm_Brown", (0.25, 0.105, 0.045), 0.9),
    "bark_light": ("A01_Bark_Sunlit", (0.39, 0.19, 0.075), 0.9),
    "bark_shadow": ("A01_Bark_Crack_Shadow", (0.105, 0.045, 0.018), 0.95),
    "leaf_dark": ("A01_Foliage_Olive_Shadow", (0.09, 0.15, 0.045), 0.85),
    "leaf_mid": ("A01_Foliage_Savanna_Olive", (0.17, 0.27, 0.07), 0.85),
    "leaf_light": ("A01_Foliage_Sunlit", (0.30, 0.40, 0.11), 0.85),
}

PIVOT_X = (-1.6, 0.0, 1.6)
PIVOT_Z = 4.0
CAN_R = 3.1
CAN_CX = 0.12
CAN_CY = 0.0


def pivot_index(x):
    return min(range(3), key=lambda i: abs(x - PIVOT_X[i]))


def canopy_z(r):
    q = min(r / CAN_R, 1.2)
    return 4.5 + 0.32 * (1 - q * q) - 0.38 * q ** 4


def trunk_profile(z):
    cx = 0.10 * math.sin(z * 1.1) + 0.035 * z
    cy = 0.06 * math.sin(z * 0.8 + 1.0)
    r = 0.27 + 0.16 * math.exp(-z * 2.4) - 0.02 * z / 2.7
    return cx, cy, r


# ------------------------------------------------------------
# Plain-data mesh container
# ------------------------------------------------------------

class Group:
    def __init__(self, name):
        self.name = name
        self.verts = []
        self.faces = []
        self.mats = []
        self.smooth = []

    def add(self, verts, faces, mats, smooth):
        base = len(self.verts)
        self.verts.extend(verts)
        if isinstance(mats, str):
            mats = [mats] * len(faces)
        for f, m in zip(faces, mats):
            self.faces.append(tuple(base + i for i in f))
            self.mats.append(m)
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


def tube(g, pts, r0, r1, sides, sub, mat, rng, tip=True, wobble=0.0):
    path = catmull([Vector(p) for p in pts], max(1, sub))
    n = len(path)
    tans = []
    for i in range(n):
        t = path[min(i + 1, n - 1)] - path[max(i - 1, 0)]
        if t.length < 1e-6:
            t = Vector((0, 0, 1))
        tans.append(t.normalized())
    ref = Vector((0, 0, 1)) if abs(tans[0].z) < 0.95 else Vector((1, 0, 0))
    nrm = tans[0].cross(ref).normalized()
    verts = []
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
            rr = r * (1 + wobble * rng.uniform(-1, 1)) if wobble else r
            verts.append(path[i] + (nrm * math.cos(a) + bn * math.sin(a)) * rr)
    faces = []
    for i in range(n - 1):
        for k in range(sides):
            a = i * sides + k
            b = i * sides + (k + 1) % sides
            c = (i + 1) * sides + (k + 1) % sides
            d = (i + 1) * sides + k
            faces.append((a, b, c, d))
    if tip:
        verts.append(path[-1] + tans[-1] * r1 * 0.8)
        ti = len(verts) - 1
        last = (n - 1) * sides
        for k in range(sides):
            faces.append((last + k, last + (k + 1) % sides, ti))
    g.add(verts, faces, mat, True)
    return path


# ------------------------------------------------------------
# Icosphere blobs for foliage
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


def blob(canopy, center, sc, subdiv, base_mat, rng, jitter, tilt=0.0):
    tv, tf = ico_template(subdiv)
    yaw = rng.uniform(0, 2 * math.pi)
    rot = (Matrix.Rotation(yaw, 3, "Z")
           @ Matrix.Rotation(rng.uniform(-tilt, tilt), 3, "X")
           @ Matrix.Rotation(rng.uniform(-tilt, tilt), 3, "Y"))
    center = Vector(center)
    verts = []
    for v in tv:
        j = 1 + jitter * rng.uniform(-1, 1)
        p = Vector((v.x * sc[0] * j, v.y * sc[1] * j, v.z * sc[2] * j))
        verts.append(rot @ p + center)
    mats = []
    for f in tf:
        c = Vector((0, 0, 0))
        for i in f:
            c += tv[i]
        nz = c.z / max(c.length, 1e-6)
        if nz > 0.5:
            mats.append("leaf_light")
        elif nz < -0.15:
            mats.append("leaf_dark")
        else:
            mats.append(base_mat)
    canopy[pivot_index(center.x)].add(verts, tf, mats, False)


# ------------------------------------------------------------
# Tree parts
# ------------------------------------------------------------

def build_trunk(g, d, rng):
    sides = d["trunk_sides"]
    rings = d["trunk_rings"]
    ph1 = rng.uniform(0, 6.28)
    ph2 = rng.uniform(0, 6.28)
    verts = []
    faces = []
    for i in range(rings):
        z = -0.08 + 2.83 * i / (rings - 1)
        cx, cy, r = trunk_profile(z)
        for k in range(sides):
            a = 2 * math.pi * k / sides
            rr = r * (1 + 0.055 * math.sin(k * 2.3 + z * 1.7 + ph1)
                      + 0.03 * math.sin(k * 4.1 + z * 3.3 + ph2))
            verts.append(Vector((cx + rr * math.cos(a),
                                 cy + rr * math.sin(a), z)))
    for i in range(rings - 1):
        for k in range(sides):
            a = i * sides + k
            b = i * sides + (k + 1) % sides
            c = (i + 1) * sides + (k + 1) % sides
            dd = (i + 1) * sides + k
            faces.append((a, b, c, dd))
    top = (rings - 1) * sides
    faces.append(tuple(top + k for k in range(sides)))
    mats = ["bark"] * len(faces)
    for fi in range(len(faces) - 1):
        if fi % 6 == 0:
            mats[fi] = "bark_light"
    g.add(verts, faces, mats, True)


def build_roots(g, d, rng):
    n = d["roots"]
    cx, cy, r = trunk_profile(0.3)
    sides = max(4, d["limb_sides"] - 2)
    for j in range(n):
        th = 2 * math.pi * j / n + rng.uniform(-0.3, 0.3)
        c, s = math.cos(th), math.sin(th)
        L = rng.uniform(0.9, 1.4)
        pts = [
            (cx + c * r * 0.5, cy + s * r * 0.5, 0.40),
            (cx + c * r * 1.3, cy + s * r * 1.3, 0.16),
            (cx + c * (r + L * 0.55), cy + s * (r + L * 0.55), 0.05),
            (cx + c * (r + L), cy + s * (r + L), -0.04),
        ]
        tube(g, pts, 0.11, 0.03, sides, d["sub"], "bark", rng)


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


def ang_diff(a, b):
    d = (a - b + math.pi) % (2 * math.pi) - math.pi
    return abs(d)


def build_crown(bark, canopy, d, rng):
    cx, cy, _ = trunk_profile(2.6)
    phis = [math.radians(90 + rng.uniform(-12, 12)),
            math.radians(210 + rng.uniform(-12, 12)),
            math.radians(330 + rng.uniform(-12, 12))]
    limbs = []
    for phi in phis:
        pts = limb_points(phi, rng)
        tube(bark, pts, 0.17, 0.045, d["limb_sides"], d["sub"], "bark", rng,
             wobble=0.04)
        limbs.append((phi, catmull(pts, 4)))

    # canopy anchors on a golden-angle spiral over a flat-topped umbrella
    n = d["anchors"]
    anchors = []
    for i in range(n):
        rr = CAN_R * math.sqrt((i + 0.5) / n)
        th = i * 2.39996
        x = CAN_CX + rr * math.cos(th)
        y = CAN_CY + rr * 0.92 * math.sin(th)
        z = canopy_z(rr) + rng.uniform(-0.08, 0.08)
        anchors.append((x, y, z, rr))

    # pads
    hr_base = 1.55 * CAN_R / math.sqrt(n)
    for (x, y, z, rr) in anchors:
        hr = hr_base * rng.uniform(0.85, 1.15)
        mat = rng.choice(["leaf_mid", "leaf_mid", "leaf_dark"])
        blob(canopy, (x, y, z),
             (hr, hr * 0.92, 0.30 * rng.uniform(0.9, 1.1)),
             d["pad_subdiv"], mat, rng, 0.12, tilt=0.10)

    # radiating branches from limbs up to the pads
    for idx, (x, y, z, rr) in enumerate(anchors):
        if idx % d["branch_every"] != 0:
            continue
        ang = math.atan2(y - cy, x - cx)
        limb = min(limbs, key=lambda L: ang_diff(ang, L[0]))
        rt = max(0.45, 0.55 * rr)
        path = limb[1]
        P = min(path, key=lambda p: abs(math.hypot(p.x - cx, p.y - cy) - rt))
        A = Vector((x, y, z - 0.16))
        mid = P.lerp(A, 0.5) + Vector((rng.uniform(-0.15, 0.15),
                                       rng.uniform(-0.15, 0.15), 0.12))
        tube(bark, [P, mid, A], 0.065, 0.02, d["branch_sides"], d["sub"],
             "bark", rng)
        for t in range(d["twigs"]):
            ta = rng.uniform(0, 2 * math.pi)
            dv = Vector((math.cos(ta), math.sin(ta), 0))
            tube(bark, [A, A + dv * 0.18 + Vector((0, 0, 0.10)),
                        A + dv * 0.34 + Vector((0, 0, 0.20))],
                 0.022, 0.008, d["tw_sides"], 1, "bark_light", rng)


def build_bark_detail(g, d, rng):
    ridges = d["ridges"]
    for j in range(ridges):
        th = 2 * math.pi * j / ridges + rng.uniform(-0.2, 0.2)
        z0 = rng.uniform(0.1, 0.9)
        z1 = min(2.5, z0 + rng.uniform(1.0, 1.7))
        pts = []
        for s in range(4):
            z = z0 + (z1 - z0) * s / 3
            cx, cy, r = trunk_profile(z)
            a = th + rng.uniform(-0.06, 0.06)
            rr = r * 1.04
            pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a), z))
        tube(g, pts, 0.020, 0.012, 3, 1, "bark_light", rng)
    cracks = d["cracks"]
    for j in range(cracks):
        th = 2 * math.pi * (j + 0.5) / cracks + rng.uniform(-0.2, 0.2)
        z0 = rng.uniform(0.3, 2.0)
        pts = []
        for s in range(3):
            z = z0 + 0.22 * s
            cx, cy, r = trunk_profile(z)
            a = th + rng.uniform(-0.05, 0.05)
            rr = r * 1.03
            pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a), z))
        tube(g, pts, 0.010, 0.007, 3, 1, "bark_shadow", rng)


def fill_foliage(canopy, d, rng, total_fn, target):
    # small leaf clusters until the triangle target is reached
    while total_fn() < target:
        remaining = target - total_fn()
        sub = d["fill_subdiv"] if remaining >= 80 else 1
        rr = CAN_R * (rng.random() ** 0.55)
        th = rng.uniform(0, 2 * math.pi)
        x = CAN_CX + rr * math.cos(th)
        y = CAN_CY + rr * 0.92 * math.sin(th)
        z = canopy_z(rr) + 0.20 + rng.uniform(-0.12, 0.15)
        s = rng.uniform(0.22, 0.40) * (0.9 if sub == 1 else 1.0)
        mat = rng.choice(["leaf_mid", "leaf_mid", "leaf_dark", "leaf_light"])
        blob(canopy, (x, y, z), (s, s, s * 0.6), sub, mat, rng, 0.18)


def plan(tier):
    d = DETAIL[tier]
    target = TIERS[tier]
    rng = random.Random(SEED)
    bark = Group("bark")
    canopy = [Group("canopy_%d" % i) for i in range(3)]

    def total():
        return bark.tris() + sum(c.tris() for c in canopy)

    bd = {}
    last = 0
    for label, fn in (
        ("trunk", lambda: build_trunk(bark, d, rng)),
        ("roots", lambda: build_roots(bark, d, rng)),
        ("limbs_branches_pads", lambda: build_crown(bark, canopy, d, rng)),
        ("bark_detail", lambda: build_bark_detail(bark, d, rng)),
    ):
        fn()
        bd[label] = total() - last
        last = total()
    fill_foliage(canopy, d, rng, total, target)
    bd["fill_foliage"] = total() - last
    bd["TOTAL"] = total()
    bd["target_min"] = target
    return bark, canopy, bd


# ------------------------------------------------------------
# Blender objects, export, preview
# ------------------------------------------------------------

def make_materials():
    out = {}
    for key, (name, col, rough) in PALETTE.items():
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.diffuse_color = (col[0], col[1], col[2], 1.0)
        try:
            mat.use_nodes = True
        except Exception:
            pass
        nt = mat.node_tree
        if nt:
            b = nt.nodes.get("Principled BSDF")
            if b:
                b.inputs["Base Color"].default_value = (col[0], col[1], col[2], 1.0)
                b.inputs["Roughness"].default_value = rough
                for k in ("Specular IOR Level", "Specular"):
                    if k in b.inputs:
                        b.inputs[k].default_value = 0.15
                        break
        out[key] = mat
    return out


def group_to_object(g, name, mats):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in g.verts], [], g.faces)
    used = []
    for m in g.mats:
        if m not in used:
            used.append(m)
    for m in used:
        mesh.materials.append(mats[m])
    idx = {m: i for i, m in enumerate(used)}
    for poly, m, sm in zip(mesh.polygons, g.mats, g.smooth):
        poly.material_index = idx[m]
        poly.use_smooth = sm
    mesh.update()
    return bpy.data.objects.new(name, mesh)


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


def setup_render(scene):
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
    if scene.world is None:
        scene.world = bpy.data.worlds.new("A01_Preview_World")
    scene.world.color = (0.45, 0.50, 0.56)
    try:
        scene.world.use_nodes = True
        bg = scene.world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.45, 0.50, 0.56, 1.0)
            bg.inputs[1].default_value = 1.0
    except Exception:
        pass


def run_all():
    repo = Path(globals().get("REPO_ROOT") or Path(__file__).resolve().parents[4])
    if not (repo / "package.json").exists():
        raise RuntimeError("Not the My World repository: %s" % repo)
    src_dir = repo / "assets/library/source/vegetation"
    prev_dir = repo / "assets/library/previews"
    meta_dir = repo / "assets/library/metadata"
    out_dir = repo / "public/assets/models/vegetation"
    for p in (src_dir, prev_dir, meta_dir, out_dir):
        p.mkdir(parents=True, exist_ok=True)
    blend_path = src_dir / "A01_acacia_tree_tiers.blend"
    script_rel = (src_dir / "create_a01_acacia_tiers.py").relative_to(repo).as_posix()

    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)

    scene = bpy.context.scene
    view_layer = bpy.context.view_layer
    mats = make_materials()
    setup_render(scene)

    # preview stage
    stage = bpy.data.collections.new("A01_Preview_Stage")
    scene.collection.children.link(stage)
    gmat = bpy.data.materials.get("A01_Preview_Earth") or bpy.data.materials.new("A01_Preview_Earth")
    gmat.diffuse_color = (0.30, 0.20, 0.11, 1.0)
    try:
        gmat.use_nodes = True
        gb = gmat.node_tree.nodes.get("Principled BSDF")
        gb.inputs["Base Color"].default_value = (0.30, 0.20, 0.11, 1.0)
        gb.inputs["Roughness"].default_value = 1.0
    except Exception:
        pass
    gm = bpy.data.meshes.new("A01_Preview_Ground")
    gm.from_pydata([(-60, -60, -0.02), (60, -60, -0.02), (60, 60, -0.02), (-60, 60, -0.02)],
                   [], [(0, 1, 2, 3)])
    gm.materials.append(gmat)
    ground = bpy.data.objects.new("A01_Preview_Ground", gm)
    stage.objects.link(ground)

    cam_data = bpy.data.cameras.new("A01_Preview_Camera")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 9.0
    cam = bpy.data.objects.new("A01_Preview_Camera", cam_data)
    stage.objects.link(cam)
    cam.location = (10, -17, 9)
    look_at(cam, (0, 0, 2.9))
    scene.camera = cam

    for nm, loc, energy, rot in (
        ("A01_Key_Sun", (0, 0, 10), 3.6, (math.radians(48), math.radians(8), math.radians(38))),
        ("A01_Fill_Sun", (0, 0, 10), 0.8, (math.radians(62), 0, math.radians(-130))),
    ):
        ld = bpy.data.lights.new(nm, "SUN")
        ld.energy = energy
        lo = bpy.data.objects.new(nm, ld)
        stage.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = rot

    results = {}
    roots = {}
    for tier, target in TIERS.items():
        cname = "A01_Acacia_" + tier.upper()
        coll = bpy.data.collections.new(cname)
        scene.collection.children.link(coll)
        show_only([cname])
        view_layer.update()

        bark, canopy, bd = plan(tier)
        root = bpy.data.objects.new(cname, None)
        root.empty_display_type = "PLAIN_AXES"
        coll.objects.link(root)
        roots[tier] = root
        objs = [root]

        bark_obj = group_to_object(bark, "A01_%s_Trunk_and_Branches" % tier, mats)
        coll.objects.link(bark_obj)
        bark_obj.parent = root
        objs.append(bark_obj)

        pivots = []
        for i, nm in enumerate(("Left", "Center", "Right")):
            pv = bpy.data.objects.new("A01_%s_Pivot_Canopy_%s" % (tier, nm), None)
            pv.empty_display_type = "SPHERE"
            pv.empty_display_size = 0.12
            coll.objects.link(pv)
            pv.parent = root
            pv.location = (PIVOT_X[i], 0.0, PIVOT_Z)
            pivots.append(pv)
            objs.append(pv)
        view_layer.update()
        for i, nm in enumerate(("Left", "Center", "Right")):
            co = group_to_object(canopy[i], "A01_%s_Canopy_%s" % (tier, nm), mats)
            coll.objects.link(co)
            co.parent = pivots[i]
            co.matrix_parent_inverse = pivots[i].matrix_world.inverted()
            objs.append(co)
        view_layer.update()

        # measure
        allv = list(bark.verts)
        for c in canopy:
            allv.extend(c.verts)
        mins = [min(v[i] for v in allv) for i in range(3)]
        maxs = [max(v[i] for v in allv) for i in range(3)]
        dims = [round(maxs[i] - mins[i], 3) for i in range(3)]
        tri = bark.tris() + sum(c.tris() for c in canopy)
        mesh_objs = [o for o in objs if o.type == "MESH"]
        prim_count = sum(len(o.data.materials) for o in mesh_objs)
        vert_count = sum(len(o.data.vertices) for o in mesh_objs)

        # export
        glb_path = out_dir / ("a01_acacia_tree_%s.glb" % tier)
        for o in view_layer.objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        view_layer.objects.active = root
        bpy.ops.export_scene.gltf(
            filepath=str(glb_path), export_format="GLB", use_selection=True,
            export_apply=True, export_materials="EXPORT",
            export_cameras=False, export_lights=False)

        # preview
        prev_path = prev_dir / ("A01_acacia_tree_%s.png" % tier)
        scene.render.resolution_x = 900
        scene.render.resolution_y = 900
        scene.render.filepath = str(prev_path)
        bpy.ops.render.render(write_still=True)

        results[tier] = {
            "glb": glb_path.relative_to(repo).as_posix(),
            "preview": prev_path.relative_to(repo).as_posix(),
            "triangles": tri,
            "target_min": target,
            "vertices_in_blender": vert_count,
            "nodes": len(objs),
            "mesh_nodes": len(mesh_objs),
            "primitives_draw_calls": prim_count,
            "materials": len(mats),
            "dimensions_xyz_m": dims,
            "glb_bytes": glb_path.stat().st_size,
            "breakdown": bd,
        }

    # side-by-side layout for the source file and comparison render
    show_only(["A01_Acacia_LOW", "A01_Acacia_MED", "A01_Acacia_HIGH"])
    for tier, x in (("low", -7.5), ("med", 0.0), ("high", 7.5)):
        roots[tier].location = (x, 0, 0)
    cam_data.ortho_scale = 23.0
    cam.location = (0, -30, 8)
    look_at(cam, (0, 0, 2.8))
    view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    cmp_path = prev_dir / "A01_acacia_tree_tiers_comparison.png"
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
        "creation_method": "procedural Blender Python, one skeleton in three detail tiers",
        "source": {
            "blend": blend_path.relative_to(repo).as_posix(),
            "script": script_rel,
            "external_assets_used": False,
            "license": "Original procedural model; no external assets used",
        },
        "tiers": results,
        "comparison_preview": cmp_path.relative_to(repo).as_posix(),
        "shared": {
            "textures": False,
            "origin": "World origin at the tree base, Z up in Blender, Y up in glTF",
            "wind_pivots": ["Left", "Center", "Right"],
            "animation_note": "Three canopy pivot empties; wind animation must be implemented and tested in the game.",
            "collision_suggestion": "Cylinder around the trunk only; canopy is not physical.",
        },
        "quality_selection_note": "The game should pick a tier from device capability by default, and a settings page may let the player override it with a warning on limited devices.",
        "game_integration_tested": False,
        "supersedes_note": "The first single-model A01 files (a01_acacia_tree.glb, A01_acacia_tree.blend, A01_acacia_tree.json, create_a01_acacia.py) are untouched and uncommitted.",
        "review_notes": [
            "Judge canopy silhouette and branch visibility against the comparison preview.",
            "Check bark colour and foliage colour in the game lighting moods.",
            "Confirm GLB import and the three canopy pivots in three.js.",
            "Profile the high tier on a weak Android phone.",
        ],
    }
    with open(meta_dir / "A01_acacia_tree_tiers.json", "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
    return results


if globals().get("DRY_RUN"):
    RESULT = {t: plan(t)[2] for t in TIERS}
else:
    RESULT = run_all()
