import bpy, math, json, random
from pathlib import Path
from mathutils import Vector

# A03 - Savanna Thorny Shrub
random.seed(411)
text_block = bpy.context.space_data.text if bpy.context.space_data and bpy.context.space_data.type == "TEXT_EDITOR" else None
if not text_block or not text_block.filepath:
    raise RuntimeError("Save this script in its project path before running.")
script_path = Path(globals().get("MY_WORLD_SCRIPT_PATH", bpy.path.abspath(text_block.filepath))).resolve()
root = script_path.parents[4]
if not (root / "package.json").exists():
    raise RuntimeError(f"My World repository not found: {root}")

category = "vegetation"
asset_id = "A03"
asset_name = "Savanna Thorny Shrub"
collection_name = "A03_thorny_shrub"
source_dir = root / "assets/library/source/vegetation"
runtime_dir = root / "public/assets/models/vegetation"
metadata_dir = root / "assets/library/metadata"
for folder in (source_dir, runtime_dir, metadata_dir):
    folder.mkdir(parents=True, exist_ok=True)

blend_path = source_dir / "A03_thorny_shrub.blend"
glb_path = runtime_dir / "a03_thorny_shrub.glb"
meta_path = metadata_dir / "A03_thorny_shrub.json"

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

wood=mat("A03_Shrub_Wood",(0.30,0.17,0.07)); greens=[mat("A03_Leaf_Dark",(0.18,0.28,0.07)),mat("A03_Leaf",(0.32,0.43,0.12)),mat("A03_Leaf_Dry",(0.52,0.46,0.20))]
for i in range(9):
    a=i*math.tau/9; end=(math.cos(a)*random.uniform(0.45,0.9),math.sin(a)*random.uniform(0.4,0.8),random.uniform(0.55,1.15))
    beam(f"A03_Shrub_Stem_{i:02d}",(0,0,0.08),end,0.045,wood,5)
    for j in range(3):
        t=(j+1)/4; pos=(end[0]*t,end[1]*t,end[2]*t)
        tip=(pos[0]+math.cos(a+0.8)*0.23,pos[1]+math.sin(a+0.8)*0.23,pos[2]+0.12)
        beam(f"A03_Thorn_{i}_{j}",pos,tip,0.012,wood,4)
for i in range(28):
    a=random.random()*math.tau; r=random.uniform(0.2,0.8)
    ico(f"A03_LeafCluster_{i:02d}",(math.cos(a)*r,math.sin(a)*r,random.uniform(0.45,1.1)),(random.uniform(0.15,0.28),0.16,0.12),random.choice(greens),1)

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
    "id": asset_id, "name": asset_name, "category": category, "biome": "Dry East African savanna",
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
