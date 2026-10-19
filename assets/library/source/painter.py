# ============================================================
# MY WORLD - shared painterly asset helpers
#
# Used by every asset generator script in this folder tree.
# Look target: Firewatch (warm/cool painted shapes, soft gradients)
# and Entergalactic (clean cartoon shapes, bold flat colour).
# Principle: few triangles, painted textures carry the look.
# ============================================================

import bpy
import json
import math
import struct
import numpy as np
from pathlib import Path
from mathutils import Vector


# ------------------------------------------------------------
# Texture painting
# ------------------------------------------------------------

TEX_CHECK = {}


def aniso_noise(rng, h, w, fx_cut, fy_cut, power=1.6):
    """Tileable noise stretched along one axis: a small cut-off means long features."""
    n = rng.standard_normal((h, w))
    F = np.fft.fft2(n)
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    amp = 1.0 / (1.0 + (fx / fx_cut) ** 2 + (fy / fy_cut) ** 2) ** (power / 2.0)
    out = np.real(np.fft.ifft2(F * amp))
    return (out - out.mean()) / (out.std() + 1e-9)


def ramp(t, stops):
    """Piecewise-linear colour ramp. t is an array 0..1, stops = [(pos, (r,g,b)), ...]."""
    t = np.clip(t, 0.0, 1.0)
    pos = [s[0] for s in stops]
    out = np.zeros(t.shape + (3,))
    for c in range(3):
        out[..., c] = np.interp(t, pos, [s[1][c] for s in stops])
    return out


def gouache(x, levels=4, soft=0.45):
    """Soft posterise: blends a smooth value with a stepped one for a painted-shape look."""
    stepped = np.floor(x * levels + 0.5) / levels
    return x * (1 - soft) + stepped * soft


def save_texture(name, path, rgba, fmt, colorspace, blank_check="rgb"):
    """Save a numpy RGBA float array as PNG or JPEG and prove it is not blank.

    The colour space has to be set BEFORE the pixels: setting it afterwards
    resets a generated image to black and drops the file format.
    """
    path = Path(path)
    h, w = rgba.shape[:2]
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.clip(rgba, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = str(path)
    img.file_format = fmt
    img.save()
    bpy.data.images.remove(img)
    chk = bpy.data.images.load(str(path), check_existing=False)
    arr = np.empty(len(chk.pixels), dtype=np.float32)
    chk.pixels.foreach_get(arr)
    bpy.data.images.remove(chk)
    arr = arr.reshape(-1, 4)
    head = path.read_bytes()[:3]
    ok_head = head == (b"\xff\xd8\xff" if fmt == "JPEG" else b"\x89PN")
    spread = float(arr[:, 3].std()) if blank_check == "alpha" else float(arr[:, :3].std())
    if not ok_head or spread < 0.02:
        raise RuntimeError("Texture %s saved blank or in the wrong format (header %r, spread %.4f)"
                           % (name, head, spread))
    TEX_CHECK[name] = {"bytes": path.stat().st_size, "spread": round(spread, 3),
                       "size": [w, h], "file": path.name}
    return TEX_CHECK[name]


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
    return magic, ver, chunks, json.loads(chunks[0][1].decode("utf-8"))


def write_glb(path, magic, ver, chunks, j):
    jb = json.dumps(j, separators=(",", ":")).encode("utf-8")
    jb += b" " * ((4 - len(jb) % 4) % 4)
    chunks[0][1] = jb
    body = b""
    for ct, cd in chunks:
        body += struct.pack("<I4s", len(cd), ct) + cd
    Path(path).write_bytes(struct.pack("<4sII", magic, ver, 12 + len(body)) + body)


def patch_glb(path, mask_materials=(), cutoff=0.5, rename_animation=None):
    magic, ver, chunks, j = read_glb(path)
    for m in j.get("materials", []):
        if any(k in m.get("name", "") for k in mask_materials):
            m["alphaMode"] = "MASK"
            m["alphaCutoff"] = cutoff
            m["doubleSided"] = True
    if rename_animation:
        for a in j.get("animations", []):
            a["name"] = rename_animation
    write_glb(path, magic, ver, chunks, j)


_CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}
_NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def inspect_glb(path):
    """Re-read an exported GLB from disk and report what is really inside it."""
    magic, ver, chunks, j = read_glb(path)
    bin_ = chunks[1][1] if len(chunks) > 1 else b""

    def acc(i):
        a = j["accessors"][i]
        bv = j["bufferViews"][a["bufferView"]]
        dt = _CT[a["componentType"]]
        n = _NC[a["type"]]
        o = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = bv.get("byteStride")
        isz = np.dtype(dt).itemsize * n
        if stride and stride != isz:
            raw = np.frombuffer(bin_, dtype=np.uint8, count=a["count"] * stride, offset=o).reshape(a["count"], stride)
            return np.frombuffer(raw[:, :isz].tobytes(), dtype=dt).reshape(a["count"], n)
        return np.frombuffer(bin_, dtype=dt, count=a["count"] * n, offset=o).reshape(a["count"], n)

    tris = 0
    prims = 0
    attrs = set()
    uv1 = []
    pos = []
    for m in j["meshes"]:
        for pr in m["primitives"]:
            prims += 1
            tris += j["accessors"][pr["indices"]]["count"] // 3
            attrs.update(pr["attributes"].keys())
            pos.append(acc(pr["attributes"]["POSITION"]))
            if "TEXCOORD_1" in pr["attributes"]:
                uv1.append(acc(pr["attributes"]["TEXCOORD_1"]))
    pos = np.concatenate(pos)
    images = {}
    for im in j.get("images", []):
        bv = j["bufferViews"][im["bufferView"]]
        raw = bin_[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
        images[im.get("name")] = {"bytes": len(raw), "magic": raw[:3].hex()}
    out = {
        "triangles": tris, "nodes": len(j["nodes"]), "meshes": len(j["meshes"]),
        "primitives_draw_calls": prims, "attributes": sorted(attrs), "images": images,
        "bbox_min": [round(float(v), 3) for v in pos.min(0)],
        "bbox_max": [round(float(v), 3) for v in pos.max(0)],
        "materials": {m.get("name"): {"alphaMode": m.get("alphaMode", "OPAQUE"),
                                      "doubleSided": m.get("doubleSided", False),
                                      "has_base_texture": "baseColorTexture" in m.get("pbrMetallicRoughness", {})}
                      for m in j.get("materials", [])},
        "animations": [a.get("name") for a in j.get("animations", [])],
    }
    if uv1:
        u = np.concatenate(uv1)
        out["wind_mask_range"] = [[round(float(u[:, 0].min()), 2), round(float(u[:, 0].max()), 2)],
                                  [round(float(u[:, 1].min()), 2), round(float(u[:, 1].max()), 2)]]
    out["file_bytes"] = Path(path).stat().st_size
    return out


# ------------------------------------------------------------
# Scene helpers
# ------------------------------------------------------------

def reset_scene():
    """Empty the open Blender file without a factory reset (that would unload the MCP add-on)."""
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions,
                 bpy.data.cameras, bpy.data.lights, bpy.data.curves):
        for d in list(coll):
            coll.remove(d)


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def painted_material(name, tex_path, roughness=1.0, vertex_colour=True, alpha=False, cs="sRGB"):
    """Principled material: painted texture x vertex colour, no specular shine (matte painted look)."""
    old = bpy.data.materials.get(name)
    if old:
        bpy.data.materials.remove(old)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    b = nodes.get("Principled BSDF")
    b.inputs["Roughness"].default_value = roughness
    for k in ("Specular IOR Level", "Specular"):
        if k in b.inputs:
            b.inputs[k].default_value = 0.0
            break
    tname = Path(tex_path).name
    old_i = bpy.data.images.get(tname)
    if old_i:
        bpy.data.images.remove(old_i)
    img = bpy.data.images.load(str(tex_path))
    img.colorspace_settings.name = cs
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    if vertex_colour:
        vc = nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Color"
        mx = nodes.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.blend_type = "MULTIPLY"
        mx.inputs[0].default_value = 1.0
        links.new(tex.outputs["Color"], mx.inputs[6])
        links.new(vc.outputs["Color"], mx.inputs[7])
        links.new(mx.outputs[2], b.inputs["Base Color"])
    else:
        links.new(tex.outputs["Color"], b.inputs["Base Color"])
    if alpha:
        links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    mat.use_backface_culling = False
    return mat


def preview_stage(scene, cam_loc=(10, -17, 9), target=(0, 0, 2.9), ortho=10.5,
                  ground=(0.30, 0.20, 0.11), sky=(0.45, 0.52, 0.60)):
    """Ground, sky, two sun lights and an orthographic camera. Not exported."""
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
        scene.world = bpy.data.worlds.new("Preview_World")
    scene.world.use_nodes = True
    wnt = scene.world.node_tree
    for n in list(wnt.nodes):
        wnt.nodes.remove(n)
    bg = wnt.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (sky[0], sky[1], sky[2], 1.0)
    bg.inputs[1].default_value = 1.0
    wout = wnt.nodes.new("ShaderNodeOutputWorld")
    wnt.links.new(bg.outputs[0], wout.inputs[0])

    stage = bpy.data.collections.new("Preview_Stage")
    scene.collection.children.link(stage)
    gmat = bpy.data.materials.new("Preview_Earth")
    gmat.use_nodes = True
    gb = gmat.node_tree.nodes.get("Principled BSDF")
    gb.inputs["Base Color"].default_value = (ground[0], ground[1], ground[2], 1.0)
    gb.inputs["Roughness"].default_value = 1.0
    gm = bpy.data.meshes.new("Preview_Ground")
    gm.from_pydata([(-80, -80, -0.01), (80, -80, -0.01), (80, 80, -0.01), (-80, 80, -0.01)], [], [(0, 1, 2, 3)])
    gm.materials.append(gmat)
    stage.objects.link(bpy.data.objects.new("Preview_Ground", gm))
    cd = bpy.data.cameras.new("Preview_Camera")
    cd.type = "ORTHO"
    cd.ortho_scale = ortho
    cam = bpy.data.objects.new("Preview_Camera", cd)
    stage.objects.link(cam)
    cam.location = cam_loc
    look_at(cam, target)
    scene.camera = cam
    for nm, energy, rot in (
        ("Key_Sun", 3.6, (math.radians(48), math.radians(8), math.radians(38))),
        ("Fill_Sun", 0.9, (math.radians(62), 0, math.radians(-130))),
    ):
        ld = bpy.data.lights.new(nm, "SUN")
        ld.energy = energy
        lo = bpy.data.objects.new(nm, ld)
        stage.objects.link(lo)
        lo.location = (0, 0, 10)
        lo.rotation_euler = rot
    return cam


def tinted_copy(mat, name, tint):
    """Copy of a painted material with an extra colour multiplier (used for season previews)."""
    new = mat.copy()
    new.name = name
    nt = new.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    src = bsdf.inputs["Base Color"].links[0].from_socket
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    mx.blend_type = "MULTIPLY"
    mx.inputs[0].default_value = 1.0
    mx.inputs[7].default_value = (tint[0], tint[1], tint[2], 1.0)
    nt.links.new(src, mx.inputs[6])
    nt.links.new(mx.outputs[2], bsdf.inputs["Base Color"])
    return new
