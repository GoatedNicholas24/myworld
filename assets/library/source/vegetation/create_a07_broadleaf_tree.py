import bpy, math, json, random
from pathlib import Path
from mathutils import Vector

# A07 - East African Highland Broadleaf Tree
random.seed(959)
text_block = bpy.context.space_data.text if bpy.context.space_data and bpy.context.space_data.type == "TEXT_EDITOR" else None
script_override = globals().get("MY_WORLD_SCRIPT_PATH")
if not script_override and (not text_block or not text_block.filepath):
    raise RuntimeError("Save this script in its project path before running.")
script_path = Path(script_override or bpy.path.abspath(text_block.filepath)).resolve()
root = script_path.parents[4]
if not (root / "package.json").exists():
    raise RuntimeError(f"My World repository not found: {root}")

category = "vegetation"
asset_id = "A07"
asset_name = "East African Highland Broadleaf Tree"
collection_name = "A07_broadleaf_tree"
source_dir = root / "assets/library/source/vegetation"
runtime_dir = root / "public/assets/models/vegetation"
metadata_dir = root / "assets/library/metadata"
for folder in (source_dir, runtime_dir, metadata_dir):
    folder.mkdir(parents=True, exist_ok=True)

blend_path = source_dir / "A07_broadleaf_tree.blend"
glb_path = runtime_dir / "a07_broadleaf_tree.glb"
meta_path = metadata_dir / "A07_broadleaf_tree.json"

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

bark=mat("A07_Bark",(0.25,0.13,0.065)); foliage=[mat("A07_Leaf_Dark",(0.10,0.27,0.12)),mat("A07_Leaf",(0.20,0.40,0.16)),mat("A07_Leaf_Light",(0.34,0.50,0.22))]
beam("A07_Main_Trunk",(0,0,0.05),(0.05,0,3.2),0.27,bark,9)
for i in range(7):
    a=i*math.tau/7; z=random.uniform(1.7,2.8); end=(math.cos(a)*random.uniform(1.0,1.6),math.sin(a)*random.uniform(0.8,1.4),random.uniform(3.0,3.8))
    beam(f"A07_Branch_{i}",(0,0,z),end,0.10,bark,7)
for i in range(38):
    a=random.random()*math.tau; r=random.uniform(0.25,1.55); z=random.uniform(3.0,4.6)
    ico(f"A07_Canopy_{i:02d}",(math.cos(a)*r,math.sin(a)*r,z),(random.uniform(0.35,0.65),random.uniform(0.35,0.6),random.uniform(0.3,0.5)),random.choice(foliage),2)

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
    "id": asset_id, "name": asset_name, "category": category, "biome": "East African highlands and woodland",
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
