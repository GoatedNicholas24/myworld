"""
Kampala Road kit for My World.

Builds modular, low-poly, "Entergalactic"-style buildings and street pieces
in Blender (flat saturated colours, chunky shapes, ink outlines in renders).

Run it inside Blender (Scripting tab: open this file and press Run).
Units are metres. The street runs along Y. Every building has its front
facing +X (toward the street) and sits at the origin, ready to export.

Game rules followed: flat colours only (the game re-skins them with toon
shading), one shared material per colour, no textures, low triangle counts.
Shop names are invented on purpose: no real brands or logos.
"""
import bpy
import bmesh
import math
import random

# ----------------------------------------------------------------------------
# Palette (sRGB hex). Bold and saturated on purpose.
# ----------------------------------------------------------------------------
PALETTE = {
    "asphalt": "#2b2545", "pavement": "#9a8bb0", "kerb": "#e6d3b3",
    "line_white": "#f7f1e3", "line_yellow": "#ffc933",
    "coral": "#ff6b5a", "teal": "#17b3a6", "mustard": "#ffb81c",
    "violet": "#7b4de3", "sky": "#4aa8ff", "pink": "#ff7eb6", "cream": "#f4e4c1",
    "trim_dark": "#1e1733", "glass": "#3b3170", "glass_lit": "#ffd45e",
    "shutter": "#5b6b8c", "sign_a": "#ff3d7f", "sign_b": "#22d3ee",
    "sign_c": "#ffe14d", "concrete": "#b9a9c9", "tank": "#2fa4ff",
}

# Street dimensions (metres)
ROAD_HALF = 5.0          # road is 10 m wide
PAVE_OUTER = 11.2        # pavement runs under the verandas to the shop walls
BUILDING_X = 9.0         # where a building's front edge stands
SEG_LEN = 20.0


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_rgba(h):
    h = h.lstrip("#")
    r, g, b = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0), (r, g, b, 1.0)


MATS = {}


def make_materials():
    for name, hx in PALETTE.items():
        lin, srgb = hex_to_rgba(hx)
        mat = bpy.data.materials.new("mat_" + name)
        try:
            mat.use_nodes = True
        except Exception:
            pass
        node = mat.node_tree.nodes.get("Principled BSDF") if mat.node_tree else None
        if node is not None:
            node.inputs["Base Color"].default_value = lin
            node.inputs["Roughness"].default_value = 1.0
            for key in ("Specular IOR Level", "Specular"):
                if key in node.inputs:
                    node.inputs[key].default_value = 0.0
        mat.diffuse_color = lin
        MATS[name] = mat


class Builder:
    """Collects boxes and prisms into one mesh with shared materials."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.slots = []

    def _idx(self, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)

    def box(self, x0, x1, y0, y1, z0, z1, mat, bottom=False):
        i = self._idx(mat)
        bm = self.bm
        v = [bm.verts.new(p) for p in (
            (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
            (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
        quads = [(4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (3, 0, 4, 7), (1, 2, 6, 5)]
        if bottom:
            quads.append((0, 3, 2, 1))
        for q in quads:
            f = bm.faces.new([v[k] for k in q])
            f.material_index = i

    def prism(self, cx, cy, z0, z1, r, mat, sides=8):
        i = self._idx(mat)
        bm = self.bm
        ring0 = [bm.verts.new((cx + r * math.cos(2 * math.pi * k / sides),
                               cy + r * math.sin(2 * math.pi * k / sides), z0)) for k in range(sides)]
        ring1 = [bm.verts.new((cx + r * math.cos(2 * math.pi * k / sides),
                               cy + r * math.sin(2 * math.pi * k / sides), z1)) for k in range(sides)]
        for k in range(sides):
            k2 = (k + 1) % sides
            f = bm.faces.new((ring0[k], ring0[k2], ring1[k2], ring1[k]))
            f.material_index = i
        f = bm.faces.new(ring1)
        f.material_index = i

    def build(self, coll):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for s in self.slots:
            me.materials.append(MATS[s])
        me.update()
        ob = bpy.data.objects.new(self.name, me)
        coll.objects.link(ob)
        return ob


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ----------------------------------------------------------------------------
# Buildings
# ----------------------------------------------------------------------------
def building(coll, name, w, floors, wall, accent, sign, lit=0.35,
             veranda=True, d=10.0, billboard=True, seed=1):
    rnd = random.Random(seed)
    b = Builder(name)
    fh, gh = 3.3, 4.2                       # floor height, ground floor height
    vd = 2.4 if veranda else 0.0            # veranda depth
    H = gh + (floors - 1) * fh

    # main body: front wall at x = -vd, back at x = -d
    b.box(-d, -vd, -w / 2, w / 2, 0, H, wall)

    # floor bands (chunky comic-book stripes)
    first_band = 2 if veranda else 1
    for f in range(first_band, floors):
        zf = gh + (f - 1) * fh
        b.box(-vd, -vd + 0.12, -w / 2 - 0.1, w / 2 + 0.1, zf - 0.12, zf + 0.12, accent)

    if veranda:
        # veranda ceiling slab, sign band, columns, shop fronts
        b.box(-vd, 0.0, -w / 2, w / 2, gh - 0.3, gh, accent)
        b.box(-0.02, 0.14, -w / 2, w / 2, gh - 1.0, gh + 0.05, sign)
        ncol = max(2, int(round(w / 3.0)) + 1)
        step = (w - 0.8) / (ncol - 1)
        ys = [-w / 2 + 0.4 + k * step for k in range(ncol)]
        for y in ys:
            b.box(-0.55, -0.15, y - 0.2, y + 0.2, 0, gh - 0.3, "concrete")
        for k in range(ncol - 1):
            yc = (ys[k] + ys[k + 1]) / 2
            bw = (ys[k + 1] - ys[k]) - 0.9
            kind = rnd.choice(["glass", "glass_lit", "shutter", "glass_lit"])
            b.box(-vd, -vd + 0.07, yc - bw / 2, yc + bw / 2, 0.1, 3.0, kind)
            b.box(-vd, -vd + 0.12, yc - bw / 2 - 0.1, yc + bw / 2 + 0.1, 3.05, 3.55,
                  rnd.choice(["sign_a", "sign_b", "sign_c"]))
    else:
        # low-rise: one big lit shop window, a door and a sign band
        b.box(0.0, 0.08, -w / 2 + 0.6, w / 2 - 2.2, 0.3, 2.8, "glass_lit")
        b.box(0.0, 0.08, w / 2 - 1.8, w / 2 - 0.6, 0.1, 2.6, "trim_dark")
        b.box(0.0, 0.25, -w / 2, w / 2, 3.0, 3.9, sign)

    # upper-floor windows with lintels
    for f in range(1, floors):
        zf = gh + (f - 1) * fh
        n = max(1, int(w // 3.0))
        sp = w / n
        for k in range(n):
            yc = -w / 2 + sp * (k + 0.5)
            mat = "glass_lit" if rnd.random() < lit else "glass"
            b.box(-vd, -vd + 0.08, yc - 0.6, yc + 0.6, zf + 0.8, zf + 2.5, mat)
            b.box(-vd, -vd + 0.2, yc - 0.8, yc + 0.8, zf + 2.5, zf + 2.75, accent)
            if rnd.random() < 0.15:
                b.box(-vd, -vd + 0.5, yc - 0.35, yc + 0.35, zf + 0.15, zf + 0.7, "concrete")

    # side-wall windows, so the buildings at the end of a street are not blank
    xs = [-vd - 1.5 - 2.8 * k for k in range(int((d - vd - 3.0) // 2.8) + 1)]
    for f in range(0, floors):
        zf = 0.0 if f == 0 else gh + (f - 1) * fh
        z0, z1 = (1.0, 2.7) if f == 0 else (zf + 0.8, zf + 2.5)
        for x in xs:
            for sgn in (-1, 1):
                ya, yb = sorted((sgn * (w / 2), sgn * (w / 2 + 0.08)))
                mat = "glass_lit" if rnd.random() < lit else "glass"
                b.box(x - 0.6, x + 0.6, ya, yb, z0, z1, mat)

    # cornice, stair-head and water tank on the roof
    b.box(-d - 0.1, -vd + 0.35, -w / 2 - 0.1, w / 2 + 0.1, H, H + 0.45, accent)
    b.box(-d + 1.0, -d + 3.6, -w / 2 + 0.8, -w / 2 + 3.0, H + 0.45, H + 2.6, "concrete")
    b.prism(-d + 2.2, w / 2 - 1.6, H + 0.45, H + 2.0, 0.9, "tank", 8)

    # rooftop-style advert board standing on the veranda edge (no text, no brands)
    if billboard and veranda:
        bwid = min(5.0, w - 4.0)
        b.box(-0.25, -0.05, -w / 2 + 2.0, -w / 2 + 2.0 + bwid, gh + 0.05, gh + 2.4,
              rnd.choice(["sign_a", "sign_b", "sign_c"]))

    ob = b.build(coll)
    ob["height_m"] = H
    ob["width_m"] = w
    return ob


# ----------------------------------------------------------------------------
# Street pieces (tile along Y, centred on the origin)
# ----------------------------------------------------------------------------
def street(coll, name, crossing=False, L=SEG_LEN):
    b = Builder(name)
    b.box(-ROAD_HALF, ROAD_HALF, -L / 2, L / 2, -0.3, 0.0, "asphalt")
    for s in (-1, 1):
        x0, x1 = sorted((s * ROAD_HALF, s * PAVE_OUTER))
        b.box(x0, x1, -L / 2, L / 2, -0.3, 0.15, "pavement")
        k0, k1 = sorted((s * ROAD_HALF, s * (ROAD_HALF + 0.3)))
        b.box(k0, k1, -L / 2, L / 2, 0.0, 0.17, "kerb")
        e0, e1 = sorted((s * (ROAD_HALF - 0.5), s * (ROAD_HALF - 0.65)))
        b.box(e0, e1, -L / 2, L / 2, 0.0, 0.02, "line_yellow")
    if crossing:
        for k in range(10):
            x = -4.5 + k * 1.0
            b.box(x, x + 0.5, -1.5, 1.5, 0.0, 0.02, "line_white")
    else:
        for k in range(4):
            y0 = -L / 2 + k * (L / 4) + 0.6
            b.box(-0.1, 0.1, y0, y0 + 2.6, 0.0, 0.02, "line_white")
    return b.build(coll)


# ----------------------------------------------------------------------------
# Scene setup
# ----------------------------------------------------------------------------
def clean_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)
    for ma in list(bpy.data.materials):
        bpy.data.materials.remove(ma)
    for co in list(bpy.data.collections):
        bpy.data.collections.remove(co)
    for cam in list(bpy.data.cameras):
        bpy.data.cameras.remove(cam)
    for li in list(bpy.data.lights):
        bpy.data.lights.remove(li)


def new_collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


# name, width, floors, wall, accent, sign, lit chance, veranda, billboard, seed
BUILDINGS = [
    ("bld_coral_arcade", 12, 4, "coral", "cream", "sign_c", 0.35, True, True, 11),
    ("bld_violet_tower", 9, 6, "violet", "sky", "sign_a", 0.45, True, True, 12),
    ("bld_teal_shops", 14, 3, "teal", "cream", "sign_a", 0.30, True, True, 13),
    ("bld_mustard_block", 10, 5, "mustard", "trim_dark", "sign_b", 0.40, True, False, 14),
    ("bld_pink_lowrise", 8, 2, "pink", "cream", "sign_b", 0.30, False, False, 15),
    ("bld_cream_colonial", 12, 3, "cream", "coral", "sign_b", 0.25, True, True, 16),
]


def build_all():
    clean_scene()
    make_materials()
    assets = new_collection("Assets")
    layout = new_collection("Preview_Layout")

    made = {}
    for (n, w, fl, wall, acc, sg, lit, ver, bb, seed) in BUILDINGS:
        made[n] = building(assets, n, w, fl, wall, acc, sg, lit, ver, billboard=bb, seed=seed)
    made["street_segment_20m"] = street(assets, "street_segment_20m")
    made["street_crossing_20m"] = street(assets, "street_crossing_20m", crossing=True)

    def place(asset_name, x, y, rot_deg):
        src = made[asset_name]
        inst = bpy.data.objects.new(asset_name + "_inst", src.data)
        inst.location = (x, y, 0)
        inst.rotation_euler = (0, 0, math.radians(rot_deg))
        layout.objects.link(inst)
        return inst

    # road: segment, crossing, segment (60 m)
    for name, y in (("street_segment_20m", -20), ("street_crossing_20m", 0), ("street_segment_20m", 20)):
        place(name, 0, y, 0)

    # buildings: west side faces +X, east side faces -X
    west = ["bld_coral_arcade", "bld_violet_tower", "bld_teal_shops",
            "bld_mustard_block", "bld_pink_lowrise", "bld_cream_colonial"]
    east = ["bld_teal_shops", "bld_cream_colonial", "bld_pink_lowrise",
            "bld_coral_arcade", "bld_mustard_block", "bld_violet_tower"]
    for side, order, x, rot in (("W", west, -BUILDING_X, 0), ("E", east, BUILDING_X, 180)):
        total = sum(made[n]["width_m"] for n in order) + 0.4 * (len(order) - 1)
        y = -total / 2
        for n in order:
            w = made[n]["width_m"]
            place(n, x, y + w / 2, rot)
            y += w + 0.4

    # hide the origin-stacked assets from view/render (kept for export)
    bpy.context.view_layer.layer_collection.children["Assets"].exclude = True
    return made


def make_camera(name, loc, target, lens):
    from mathutils import Vector
    data = bpy.data.cameras.new(name)
    data.lens = lens
    cam = bpy.data.objects.new(name, data)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(cam)
    return cam


def setup_preview():
    """Dusk-gradient sky, warm sun, two cameras and ink outlines (Freestyle)."""
    scn = bpy.context.scene
    vl = bpy.context.view_layer

    # world: gradient from peach at the horizon to violet overhead
    w = scn.world or bpy.data.worlds.new("World")
    scn.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    nt = w.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    rng = nt.nodes.new("ShaderNodeMapRange")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    bg = nt.nodes.new("ShaderNodeBackground")
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])   # direction of each sky pixel
    rng.inputs["From Min"].default_value = 0.0
    rng.inputs["From Max"].default_value = 0.8
    rng.inputs["To Min"].default_value = 0.0
    rng.inputs["To Max"].default_value = 1.0
    rng.clamp = True
    nt.links.new(sep.outputs["Z"], rng.inputs["Value"])
    nt.links.new(rng.outputs["Result"], ramp.inputs["Fac"])
    el = ramp.color_ramp.elements
    el[0].position = 0.0
    el[0].color = hex_to_rgba("#ffb08a")[0]
    el[1].position = 1.0
    el[1].color = hex_to_rgba("#5a2ea6")[0]
    mid = el.new(0.35)
    mid.color = hex_to_rgba("#ff6fa5")[0]
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    # sun
    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 3.5
    sun_data.color = (1.0, 0.85, 0.65)
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (math.radians(55), 0, math.radians(120))
    scn.collection.objects.link(sun)

    # cameras: street-level hero shot and an aerial overview
    hero = make_camera("Cam_Hero", (2.5, -33, 2.4), (0, 14, 7.5), 17)
    make_camera("Cam_Aerial", (-26, -40, 24), (0, 4, 5), 30)
    scn.camera = hero

    # punchy, graphic colours and ink outlines
    scn.view_settings.view_transform = "Standard"
    scn.render.resolution_x, scn.render.resolution_y = 1600, 900
    scn.render.use_freestyle = True
    scn.render.line_thickness_mode = "ABSOLUTE"
    scn.render.line_thickness = 2.2
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(100)
    if len(fs.linesets) == 0:
        fs.linesets.new("Ink")
    ls = fs.linesets[0]
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.linestyle.color = (0.07, 0.04, 0.13)
    ls.linestyle.thickness = 2.2


def export_glb(folder):
    """Exports each piece in the Assets collection as its own .glb (Y-up, origin kept).

    Usage in Blender's Python console, after running this script:
        export_glb(r"C:\\path\\to\\myworld\\public\\models\\kampala-road")
    """
    import os
    os.makedirs(folder, exist_ok=True)
    vl = bpy.context.view_layer
    layer_coll = vl.layer_collection.children["Assets"]
    layer_coll.exclude = False                      # selection needs it visible
    for ob in list(bpy.data.collections["Assets"].objects):
        for o in bpy.context.selected_objects:
            o.select_set(False)
        ob.select_set(True)
        vl.objects.active = ob
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(folder, ob.name + ".glb"), export_format="GLB",
            use_selection=True, export_apply=True, export_yup=True,
            export_cameras=False, export_lights=False, export_materials="EXPORT")
    layer_coll.exclude = True


if __name__ == "__main__":
    made = build_all()
    setup_preview()
    print({k: tri_count(v) for k, v in made.items()})
