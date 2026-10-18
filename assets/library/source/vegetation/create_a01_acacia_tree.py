import bpy, math, json, random
from pathlib import Path
from mathutils import Vector

# A01 - East African Savanna Acacia
random.seed(137)
text_block = bpy.context.space_data.text if bpy.context.space_data and bpy.context.space_data.type == "TEXT_EDITOR" else None
if not text_block or not text_block.filepath:
    raise RuntimeError("Save this script in its project path before running.")
script_path = Path(globals().get("MY_WORLD_SCRIPT_PATH", bpy.path.abspath(text_block.filepath))).resolve()
root = script_path.parents[4]
if not (root / "package.json").exists():
    raise RuntimeError(f"My World repository not found: {root}")

category = "vegetation"
asset_id = "A01"
asset_name = "East African Savanna Acacia"
collection_name = "A01_acacia_tree"
source_dir = root / "assets/library/source/vegetation"
runtime_dir = root / "public/assets/models/vegetation"
metadata_dir = root / "assets/library/metadata"
for folder in (source_dir, runtime_dir, metadata_dir):
    folder.mkdir(parents=True, exist_ok=True)

blend_path = source_dir / "A01_acacia_tree.blend"
glb_path = runtime_dir / "a01_acacia_tree.glb"
meta_path = metadata_dir / "A01_acacia_tree.json"

collection = bpy.data.collections.get(collection_name)
if collection is None:
    collection = bpy.data.collections.new(collection_name)
    bpy.context.scene.collection.children.link(collection)
for old in list(collection.objects):
    bpy.data.objects.remove(old, do_unlink=True)

def mat(name, color, roughness=0.88):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1)
        bsdf.inputs["Roughness"].default_value = roughness
    return m

def mesh_object(name, verts, faces, material, smooth=False):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for p in mesh.polygons:
        p.use_smooth = smooth
    return obj

def ico(name, location, scale, material, subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj

def beam(name, start, end, radius, material, vertices=7):
    a, b = Vector(start), Vector(end)
    delta = b-a
    midpoint = (a+b)/2
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius*0.68, depth=delta.length, location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj

bark = mat("A01_Bark", (0.26,0.12,0.055))
bark_light = mat("A01_Bark_Light", (0.42,0.22,0.09))
leaf = [mat("A01_Olive", (0.29,0.39,0.10)), mat("A01_Shadow", (0.17,0.26,0.065)), mat("A01_Sunlit", (0.46,0.51,0.17))]
# Tapered irregular trunk, branches and roots
beam("A01_Trunk_Lower", (0,0,0.15), (0.05,0,2.8), 0.32, bark, 9)
beam("A01_Trunk_Upper", (0.05,0,2.4), (0.18,0,4.25), 0.17, bark, 8)
for i,(s,e,r) in enumerate([
((0,0,0.3),(-0.8,-0.3,0.04),0.13),((0,0,0.3),(0.7,-0.45,0.04),0.12),
((0,0,0.3),(0.55,0.55,0.04),0.11),((0,0,0.3),(-0.6,0.5,0.04),0.11),
((0.02,0,2.2),(-1.9,0.05,3.8),0.14),((0.03,0,2.4),(1.95,0.04,3.85),0.14),
((0,0,2.8),(-0.7,0.5,4.35),0.10),((0.1,0,2.9),(0.8,-0.5,4.4),0.10),
((-1.3,0.04,3.5),(-2.1,0.2,4.05),0.07),((1.25,0.03,3.55),(2.15,0.2,4.0),0.07)]):
    beam(f"A01_Branch_{i:02d}", s, e, r, bark_light if i%3==0 else bark)
pivots = {}
for pivot_name, pivot_x in [("A01_Pivot_Left", -1.0), ("A01_Pivot_Center", 0.0), ("A01_Pivot_Right", 1.0)]:
    pivot = bpy.data.objects.new(pivot_name, None)
    collection.objects.link(pivot)
    pivot.location = (pivot_x, 0, 3.8)
    pivot.empty_display_type = "SPHERE"
    pivot.empty_display_size = 0.10
    pivots[pivot_name] = pivot

for i in range(34):
    angle = random.random()*math.tau
    x = math.cos(angle)*random.uniform(0.25,2.05)
    y = math.sin(angle)*random.uniform(0.25,0.85)
    z = random.uniform(3.85,4.65) - 0.23*abs(x)
    size = random.uniform(0.32,0.67)
    obj = ico(f"A01_Canopy_{i:02d}", (x,y,z), (size*1.25,size,size*0.48), random.choice(leaf), 2)
    pivot = pivots["A01_Pivot_Left" if x < -0.65 else "A01_Pivot_Right" if x > 0.65 else "A01_Pivot_Center"]
    world_matrix = obj.matrix_world.copy()
    obj.parent = pivot
    obj.matrix_world = world_matrix
# Bark ridges on trunk face
for i in range(12):
    x = random.uniform(-0.19,0.19); z=random.uniform(0.35,2.5)
    beam(f"A01_Bark_Ridge_{i:02d}", (x,-0.29,z), (x+random.uniform(-0.05,0.05),-0.28,z+random.uniform(0.15,0.5)), 0.012, bark_light, 5)

# Save editable source and export only this asset's collection.
bpy.ops.object.select_all(action="DESELECT")
asset_objects = list(collection.objects)
for obj in asset_objects:
    obj.select_set(True)
if asset_objects:
    bpy.context.view_layer.objects.active = asset_objects[0]

bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format="GLB", use_selection=True, export_apply=True, export_materials="EXPORT")

triangles = 0
depsgraph = bpy.context.evaluated_depsgraph_get()
for obj in asset_objects:
    if obj.type not in {"MESH", "CURVE", "SURFACE", "FONT", "META"}:
        continue
    ev = obj.evaluated_get(depsgraph)
    em = None
    try:
        em = ev.to_mesh()
        if em:
            triangles += sum(max(0, len(poly.vertices)-2) for poly in em.polygons)
    finally:
        if em:
            ev.to_mesh_clear()

mats = sorted({m.name for o in asset_objects if o.data and hasattr(o.data, "materials") for m in o.data.materials if m})
metadata = {
    "id": asset_id, "name": asset_name, "category": category, "biome": "East African savanna",
    "status": "generated_pending_review",
    "source": {"blend": str(blend_path.relative_to(root)).replace("\\","/"),
               "script": str(script_path.relative_to(root)).replace("\\","/"),
               "external_assets_used": False, "license": "Original procedural model"},
    "runtime": {"format": "glb", "path": str(glb_path.relative_to(root)).replace("\\","/"),
                "file_size_bytes": glb_path.stat().st_size, "triangle_count": triangles,
                "material_count": len(mats), "textures": False},
    "game_integration_tested": False
}
with open(meta_path, "w", encoding="utf-8") as f:
    json.dump(metadata, f, indent=2)
print(f"{asset_id} generated | triangles={triangles} | GLB={glb_path}")
print("Status: pending review")
