# ============================================================
# MY WORLD - A02 DRY SAVANNA GRASS TUFT
#
# Painterly, texture-first: very few triangles, the look comes from a
# hand-painted blade atlas (brush streaks, warm tips, cool bases) and
# baked vertex-colour shading. See assets/library/STYLE_GUIDE.md.
#
# Three tiers, same atlas, same material:
#   low  ~110 triangles   med ~250   high ~455 (adds seed-head stalks)
#
# Wind: shader mask only (TEXCOORD_1: x = sway weight, y = phase).
# No node animation: grass is meant to be instanced thousands of times.
# Variants (green / dry / burned / regrowing) are colour tints applied
# in the game, not separate meshes.
#
# Run from Blender with REPO_ROOT set, or from the Text Editor after
# saving this file inside the repository. Status stays
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

ASSET_ID = "A02"
ASSET_NAME = "Dry Savanna Grass Tuft"
SEED = 2002

TIERS = {
    "low": dict(blades=22, ts=[0.0, 0.5, 0.85], stalks=0, wscale=1.35),
    "med": dict(blades=36, ts=[0.0, 0.3, 0.6, 0.85], stalks=0, wscale=1.10),
    "high": dict(blades=56, ts=[0.0, 0.3, 0.6, 0.85], stalks=7, wscale=1.00),
}
STALK_TS = [0.0, 0.35, 0.7, 0.8, 0.9]
TUFT_R = 0.30
BASE_H = 0.62

ATLAS_W, ATLAS_H, WINDOWS = 256, 512, 8
STRAW = [(0.0, (0.26, 0.20, 0.10)), (0.22, (0.52, 0.40, 0.17)), (0.55, (0.80, 0.64, 0.30)),
         (0.85, (0.92, 0.80, 0.47)), (1.0, (0.96, 0.88, 0.60))]
GREEN = [(0.0, (0.16, 0.20, 0.07)), (0.25, (0.34, 0.40, 0.14)), (0.6, (0.58, 0.62, 0.24)),
         (1.0, (0.80, 0.78, 0.40))]

# colour multipliers the game applies to the same painted texture
TINTS = {
    "dry": (1.0, 1.0, 1.0),
    "green": (0.62, 1.0, 0.55),
    "burned": (0.35, 0.30, 0.28),
    "regrowing": (0.70, 1.05, 0.50),
}


# ------------------------------------------------------------
# Painted atlas
# ------------------------------------------------------------

def make_atlas(path):
    rng = np.random.default_rng(SEED)
    H, W = ATLAS_H, ATLAS_W
    yy = (np.arange(H) / (H - 1))[:, None] * np.ones((1, W))
    xx = np.ones((H, 1)) * (np.arange(W) / (W - 1))[None, :]
    win = np.minimum((xx * WINDOWS).astype(int), WINDOWS - 1)
    uwin = xx * WINDOWS - np.floor(xx * WINDOWS)

    streak = painter.aniso_noise(rng, H, W, fx_cut=48, fy_cut=3.0, power=1.4)
    streak2 = painter.aniso_noise(rng, H, W, fx_cut=20, fy_cut=1.5, power=1.4)
    lowf = painter.aniso_noise(rng, H, W, fx_cut=4, fy_cut=2, power=2.0)

    gfrac = np.array([0.0, 0.30, 0.12, 0.45, 0.05, 0.22, 0.35, 0.0])
    g = np.clip(gfrac[win] + 0.18 * lowf, 0, 1)[..., None]
    col = painter.ramp(yy, STRAW) * (1 - g) + painter.ramp(yy, GREEN) * g

    val = (1.0 + 0.16 * painter.gouache(np.clip(streak / 2.2, -1, 1), 4, 0.5)
           + 0.07 * np.clip(streak2 / 2.2, -1, 1))
    col = col * val[..., None]
    col = col * (1 + 0.14 * (0.5 - uwin))[..., None]          # two-tone edge light
    warm = np.array([1.06, 1.0, 0.90])
    cool = np.array([0.92, 0.98, 1.08])
    col = col * (cool[None, None, :] * (1 - yy[..., None]) + warm[None, None, :] * yy[..., None])

    # last window: seed-head stalks (dark straw stem, speckled warm head)
    stem = painter.ramp(yy, [(0.0, (0.30, 0.23, 0.11)), (0.7, (0.58, 0.46, 0.22)), (1.0, (0.70, 0.55, 0.26))])
    speck = rng.random((H, W))
    head = np.array([0.66, 0.47, 0.21])[None, None, :] * (0.78 + 0.45 * speck[..., None])
    stalk = np.where((yy > 0.74)[..., None], head, stem * (0.9 + 0.2 * np.clip(streak / 2.2, -1, 1))[..., None])
    col = np.where((win == WINDOWS - 1)[..., None], stalk, col)

    rgba = np.concatenate([np.clip(col, 0, 1), np.ones((H, W, 1))], axis=2)
    return painter.save_texture("a02_grass_atlas", path, rgba, "JPEG", "sRGB")


# ------------------------------------------------------------
# Geometry
# ------------------------------------------------------------

class Mesh:
    def __init__(self):
        self.v = []
        self.f = []
        self.uv = []
        self.col = []
        self.wind = []

    def tris(self):
        return sum(len(f) - 2 for f in self.f)


def add_blade(M, base, ang, twist, h, lean, ts, hw_fn, uwin, tint, phase, rfrac, taper_tip=True):
    d = Vector((math.cos(ang), math.sin(ang), 0))
    a2 = ang + twist
    wv = Vector((-math.sin(a2), math.cos(a2), 0))

    def P(t):
        return base + d * (lean * h * t ** 1.8) + Vector((0, 0, h * (t - 0.30 * lean * t * t)))

    n0 = len(M.v)
    u0, u1 = uwin
    um = 0.5 * (u0 + u1)
    for t in ts:
        c = P(t)
        hw = hw_fn(t)
        for side, u in ((-1, u0), (1, u1)):
            M.v.append(c + wv * hw * side)
            M.uv.append((u, t))
            ao = (0.42 + 0.58 * t ** 0.65) * (0.80 + 0.20 * min(1.0, rfrac * 1.4))
            M.col.append(tuple(min(1.0, ao * tc) for tc in tint))
            M.wind.append((t ** 1.6, phase))
    M.v.append(P(1.0))
    M.uv.append((um, 1.0))
    M.col.append(tuple(min(1.0, 1.0 * tc) for tc in tint))
    M.wind.append((1.0, phase))
    for i in range(len(ts) - 1):
        a = n0 + 2 * i
        M.f.append((a, a + 1, a + 3, a + 2))
    last = n0 + 2 * (len(ts) - 1)
    M.f.append((last, last + 1, len(M.v) - 1))


def build_tier(tier):
    cfg = TIERS[tier]
    rng = random.Random(SEED)
    M = Mesh()
    for _ in range(cfg["blades"]):
        r = TUFT_R * (rng.random() ** 0.8)
        th = rng.uniform(0, 2 * math.pi)
        base = Vector((r * math.cos(th), r * math.sin(th), 0))
        rfrac = r / TUFT_R
        h = BASE_H * (0.50 + 0.65 * (1 - rfrac) ** 0.7 * rng.uniform(0.7, 1.0) + 0.20 * rng.random())
        ang = th + rng.uniform(-0.7, 0.7)
        lean = rng.uniform(0.25, 0.55) * (0.6 + 0.8 * rfrac)
        width = 0.045 * cfg["wscale"] * rng.uniform(0.85, 1.15)
        k = rng.randrange(WINDOWS - 1)
        uwin = (k / WINDOWS + 0.004, (k + 1) / WINDOWS - 0.004)
        tint = (rng.uniform(0.94, 1.0), rng.uniform(0.95, 1.0), rng.uniform(0.92, 1.0))
        add_blade(M, base, ang, rng.uniform(-0.7, 0.7), h, lean, cfg["ts"],
                  lambda t, w=width: 0.5 * w * (1 - 0.75 * t ** 1.4), uwin, tint, rng.random(), rfrac)
    for _ in range(cfg["stalks"]):
        r = TUFT_R * 0.55 * rng.random()
        th = rng.uniform(0, 2 * math.pi)
        base = Vector((r * math.cos(th), r * math.sin(th), 0))
        h = rng.uniform(0.95, 1.25)

        def hw(t):
            if t <= 0.7:
                return 0.007
            if t <= 0.8:
                return 0.007 + (0.022 - 0.007) * (t - 0.7) / 0.1
            return 0.022 + (0.026 - 0.022) * (t - 0.8) / 0.1

        uw = ((WINDOWS - 1) / WINDOWS + 0.004, 1.0 - 0.004)
        add_blade(M, base, th + rng.uniform(-0.5, 0.5), rng.uniform(-1.2, 1.2), h,
                  rng.uniform(0.10, 0.25), STALK_TS, hw, uw, (1.0, 1.0, 1.0), rng.random(), r / TUFT_R)
    return M


def to_object(M, name, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in M.v], [], M.f)
    mesh.materials.append(mat)
    for p in mesh.polygons:
        p.use_smooth = True
    uv = mesh.uv_layers.new(name="UVMap")
    uv.data.foreach_set("uv", [c for f in M.f for vi in f for c in M.uv[vi]])
    uw = mesh.uv_layers.new(name="UVWind")
    uw.data.foreach_set("uv", [c for f in M.f for vi in f for c in M.wind[vi]])
    ca = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    ca.data.foreach_set("color", [c for f in M.f for vi in f for c in (*M.col[vi], 1.0)])
    mesh.update()
    normals_ok = True
    try:
        nrm = []
        for v in M.v:
            n = Vector((v.x * 1.1, v.y * 1.1, 0.75 + 0.5 * min(v.z, 0.6)))
            nrm.append(n.normalized())
        mesh.normals_split_custom_set_from_vertices(nrm)
    except Exception as e:
        normals_ok = False
    return bpy.data.objects.new(name, mesh), normals_ok


# ------------------------------------------------------------
# Scene, export, previews
# ------------------------------------------------------------

def tinted_copy(mat, name, tint):
    new = mat.copy()
    new.name = name
    nt = new.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    link = bsdf.inputs["Base Color"].links[0]
    src = link.from_socket
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    mx.blend_type = "MULTIPLY"
    mx.inputs[0].default_value = 1.0
    mx.inputs[7].default_value = (tint[0], tint[1], tint[2], 1.0)
    nt.links.new(src, mx.inputs[6])
    nt.links.new(mx.outputs[2], bsdf.inputs["Base Color"])
    return new


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
    painter.reset_scene()
    scene = bpy.context.scene
    view_layer = bpy.context.view_layer

    tex_info = make_atlas(P["tex"] / "a02_grass_atlas.jpg")
    mat = painter.painted_material("A02_Grass", P["tex"] / "a02_grass_atlas.jpg", roughness=1.0)
    cam = painter.preview_stage(scene, cam_loc=(1.4, -2.2, 1.2), target=(0, 0, 0.28), ortho=1.5,
                                ground=(0.36, 0.26, 0.14), sky=(0.50, 0.58, 0.66))

    results = {}
    roots = {}
    meshes = {}
    for i, tier in enumerate(TIERS):
        M = build_tier(tier)
        coll = bpy.data.collections.new("A02_Grass_" + tier.upper())
        scene.collection.children.link(coll)
        root = bpy.data.objects.new("A02_Grass_" + tier.upper(), None)
        root.empty_display_type = "PLAIN_AXES"
        coll.objects.link(root)
        obj, normals_ok = to_object(M, "A02_%s_Tuft" % tier, mat)
        coll.objects.link(obj)
        obj.parent = root
        roots[tier] = root
        meshes[tier] = obj
        view_layer.update()

        glb = P["out"] / ("a02_dry_grass_tuft_%s.glb" % tier)
        for o in view_layer.objects:
            o.select_set(False)
        root.select_set(True)
        obj.select_set(True)
        view_layer.objects.active = root
        kw = dict(filepath=str(glb), export_format="GLB", use_selection=True, export_apply=True,
                  export_materials="EXPORT", export_cameras=False, export_lights=False,
                  export_animations=False)
        bpy.ops.export_scene.gltf(**kw)
        info = painter.inspect_glb(glb)
        if info["triangles"] != M.tris():
            raise RuntimeError("%s: GLB has %d triangles, built %d" % (tier, info["triangles"], M.tris()))
        results[tier] = {
            "glb": glb.relative_to(REPO).as_posix(),
            "triangles": info["triangles"], "glb_bytes": info["file_bytes"],
            "draw_calls": info["primitives_draw_calls"], "blades": TIERS[tier]["blades"],
            "stalks": TIERS[tier]["stalks"], "attributes": info["attributes"],
            "bbox_min": info["bbox_min"], "bbox_max": info["bbox_max"],
            "images": info["images"], "materials": info["materials"],
            "wind_mask_range": info.get("wind_mask_range"), "custom_normals": normals_ok,
        }

    def only(visible):
        for t, o in meshes.items():
            o.hide_render = o not in visible

    def aim(tx, ty, tz, ortho, offset=(1.4, -2.2, 1.2)):
        cam.data.ortho_scale = ortho
        cam.location = (tx + offset[0], ty + offset[1], tz + offset[2])
        painter.look_at(cam, (tx, ty, tz))

    xoff = {"low": -0.8, "med": 0.0, "high": 0.8}
    for tier in TIERS:
        roots[tier].location = (xoff[tier], 0, 0)
    view_layer.update()
    for tier in TIERS:
        only([meshes[tier]])
        aim(xoff[tier], 0, 0.30, 1.5)
        pp = P["prev"] / ("A02_dry_grass_tuft_%s.png" % tier)
        render(scene, pp, 900, 900)
        results[tier]["preview"] = pp.relative_to(REPO).as_posix()
    only(list(meshes.values()))
    aim(0, 0, 0.30, 3.2, offset=(1.2, -3.2, 1.3))
    cmp_path = P["prev"] / "A02_dry_grass_tuft_tiers_comparison.png"
    render(scene, cmp_path, 1500, 600)

    # tint variants: four medium tufts with colour multipliers
    only([])
    tint_objs = []
    for j, (tn, tv) in enumerate(TINTS.items()):
        tm = tinted_copy(mat, "A02_Grass_" + tn, tv)
        o = bpy.data.objects.new("A02_tint_" + tn, meshes["med"].data.copy())
        o.data.materials[0] = tm
        scene.collection.objects.link(o)
        o.location = (-1.35 + 0.9 * j, 0, 0)
        tint_objs.append(o)
    aim(0, 0, 0.30, 3.6, offset=(1.2, -3.2, 1.3))
    tint_path = P["prev"] / "A02_dry_grass_tuft_tints.png"
    render(scene, tint_path, 1500, 600)
    for o in tint_objs:
        bpy.data.objects.remove(o, do_unlink=True)

    # instanced field of medium tufts, to judge the painted look at distance
    rnd = random.Random(SEED + 9)
    field = []
    for _ in range(260):
        o = bpy.data.objects.new("A02_field", meshes["med"].data)
        scene.collection.objects.link(o)
        o.location = (rnd.uniform(-3.6, 3.6), rnd.uniform(-1.0, 4.2), 0)
        o.rotation_euler = (0, 0, rnd.uniform(0, 6.283))
        s = rnd.uniform(0.8, 1.45)
        o.scale = (s, s, s * rnd.uniform(0.8, 1.2))
        field.append(o)
    for t in TIERS:
        meshes[t].hide_render = True
    aim(0, 1.6, 0.25, 8.0, offset=(0.0, -7.5, 3.4))
    field_path = P["prev"] / "A02_dry_grass_tuft_field.png"
    render(scene, field_path, 1600, 700)
    for o in field:
        bpy.data.objects.remove(o, do_unlink=True)

    # restore for the saved source file: three tufts side by side
    for t in TIERS:
        meshes[t].hide_render = False
    blend = P["src"] / "A02_dry_grass_tuft.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))

    meta = {
        "id": ASSET_ID, "name": ASSET_NAME, "category": "vegetation",
        "biome": "East African savanna", "status": "generated_pending_review",
        "style": "painterly texture-first (see assets/library/STYLE_GUIDE.md)",
        "creation_method": "procedural Blender Python; painted blade atlas generated in code",
        "source": {
            "blend": blend.relative_to(REPO).as_posix(),
            "script": "assets/library/source/vegetation/create_a02_grass.py",
            "helper": "assets/library/source/painter.py",
            "texture": "assets/library/source/vegetation/textures/a02_grass_atlas.jpg",
            "external_assets_used": False,
            "license": "Original procedural model and texture; no external assets used",
        },
        "tiers": results,
        "texture": tex_info,
        "previews": {
            "comparison": cmp_path.relative_to(REPO).as_posix(),
            "tints": tint_path.relative_to(REPO).as_posix(),
            "field": field_path.relative_to(REPO).as_posix(),
        },
        "variants": {
            "how": "multiply the base colour (material colour factor or shader uniform) by these RGB values; height scaling is done in the game",
            "tints": {k: list(v) for k, v in TINTS.items()},
            "regrowing_note": "also scale the instance height to about 0.4",
        },
        "wind": {
            "mode": "shader mask only",
            "attribute": "TEXCOORD_1 (uv1 in three.js): x = sway weight (0 at base, 1 at tip), y = per-blade phase 0..1",
            "node_animation": "none; instance thousands of tufts with InstancedMesh and move vertices in the shader",
        },
        "shared": {
            "origin": "tuft base centre at the world origin, Z up in Blender, Y up in glTF",
            "size_m": "about 0.6 m wide, 0.6 m tall (stalks on the high tier reach about 1.2 m)",
            "material": "one matte painted material, double sided, no alpha (shape comes from the geometry)",
            "collision": "none",
            "instancing": "one draw call per tier; use InstancedMesh with random yaw and scale 0.8-1.45",
        },
        "game_integration_tested": False,
        "review_notes": [
            "Judge the painted look in the field preview, not only the single tuft.",
            "Check blade shapes and tint variants against the game ground colours and moods.",
            "Test shader wind and InstancedMesh in the game once 10 assets exist.",
        ],
    }
    (P["meta"] / "A02_dry_grass_tuft.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return {"texture": tex_info, "tiers": results, "saved": str(blend)}


if globals().get("DRY_RUN"):
    RESULT = {t: {"triangles": build_tier(t).tris(), "blades": TIERS[t]["blades"], "stalks": TIERS[t]["stalks"]} for t in TIERS}
else:
    RESULT = run()
