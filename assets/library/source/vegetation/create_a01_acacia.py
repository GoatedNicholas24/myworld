
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector

# ============================================================
# MY WORLD - A01 EAST AFRICAN SAVANNA ACACIA
# Blender 3.x compatible
#
# Outputs:
#   .blend source
#   .png preview
#   .glb runtime model
#   .json metadata
#
# Status remains pending review.
# ============================================================

ASSET_ID = "A01"
ASSET_NAME = "East African Savanna Acacia"

TREE_COLLECTION = "A01_Acacia_Tree"
STAGE_COLLECTION = "A01_Preview_Stage"

# ------------------------------------------------------------
# FIND THE MY WORLD REPOSITORY
# ------------------------------------------------------------

script_text = (
    bpy.context.space_data.text
    if bpy.context.space_data
    and bpy.context.space_data.type == "TEXT_EDITOR"
    else None
)

if script_text is None or not script_text.filepath:
    raise RuntimeError(
        "Save this script first as:\n"
        "assets/library/source/vegetation/create_a01_acacia.py\n"
        "Then run it from Blender's Text Editor."
    )

script_path = Path(
    bpy.path.abspath(script_text.filepath)
).resolve()

repo_root = script_path.parents[4]

if not (repo_root / "package.json").exists():
    raise RuntimeError(
        f"Could not identify the My World repository at:\n"
        f"{repo_root}\n"
        "Check the script's save location."
    )

SOURCE_DIR = repo_root / "assets/library/source/vegetation"
PREVIEW_DIR = repo_root / "assets/library/previews"
METADATA_DIR = repo_root / "assets/library/metadata"
RUNTIME_DIR = repo_root / "public/assets/models/vegetation"

for folder in (
    SOURCE_DIR,
    PREVIEW_DIR,
    METADATA_DIR,
    RUNTIME_DIR,
):
    folder.mkdir(parents=True, exist_ok=True)

BLEND_PATH = SOURCE_DIR / "A01_acacia_tree.blend"
PREVIEW_PATH = PREVIEW_DIR / "A01_acacia_tree.png"
GLB_PATH = RUNTIME_DIR / "a01_acacia_tree.glb"
META_PATH = METADATA_DIR / "A01_acacia_tree.json"

# ------------------------------------------------------------
# GENERAL HELPERS
# ------------------------------------------------------------

def get_or_create_collection(name):
    collection = bpy.data.collections.get(name)

    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)

    return collection


def clear_collection(collection):
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def move_to_collection(obj, collection):
    for old_collection in list(obj.users_collection):
        old_collection.objects.unlink(obj)

    collection.objects.link(obj)


def make_material(name, color, roughness=0.9):
    mat = bpy.data.materials.get(name)

    if mat is None:
        mat = bpy.data.materials.new(name)

    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True

    bsdf = mat.node_tree.nodes.get("Principled BSDF")

    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness

    return mat


def add_branch(
    name,
    points,
    radius,
    material,
    collection,
    taper=True,
):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 1

    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)

    for i, point in enumerate(points):
        bp = spline.bezier_points[i]
        bp.co = point
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"

        if taper:
            bp.radius = max(
                0.12,
                1.0 - 0.82 * i / max(1, len(points) - 1),
            )

    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.data.materials.append(material)

    return obj


def add_canopy_clump(
    name,
    location,
    scale,
    material,
    collection,
    seed_rotation=0.0,
):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=2,
        radius=1,
        location=location,
    )

    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    obj.scale = scale

    obj.rotation_euler = (
        math.radians(seed_rotation * 9),
        math.radians(seed_rotation * 13),
        math.radians(seed_rotation * 17),
    )

    obj.data.materials.append(material)

    for face in obj.data.polygons:
        face.use_smooth = False

    return obj


# ------------------------------------------------------------
# MATERIALS
# ------------------------------------------------------------

bark = make_material(
    "A01_Bark_Warm_Brown",
    (0.25, 0.105, 0.045),
)

bark_light = make_material(
    "A01_Bark_Sunlit",
    (0.39, 0.19, 0.075),
)

bark_shadow = make_material(
    "A01_Bark_Crack_Shadow",
    (0.105, 0.045, 0.018),
)

leaf_dark = make_material(
    "A01_Foliage_Olive_Shadow",
    (0.20, 0.29, 0.075),
)

leaf_mid = make_material(
    "A01_Foliage_Savanna_Olive",
    (0.32, 0.43, 0.12),
)

leaf_light = make_material(
    "A01_Foliage_Sunlit",
    (0.46, 0.53, 0.19),
)

ground_mat = make_material(
    "A01_Preview_Earth",
    (0.37, 0.27, 0.15),
)

# ------------------------------------------------------------
# RESET ONLY THE A01 TREE AND PREVIEW STAGE
# ------------------------------------------------------------

tree_collection = get_or_create_collection(TREE_COLLECTION)
stage_collection = get_or_create_collection(STAGE_COLLECTION)

clear_collection(tree_collection)
clear_collection(stage_collection)

# ------------------------------------------------------------
# MAIN TRUNK
# ------------------------------------------------------------

ring_levels = [
    (0.00,  0.00, 0.00, 0.43),
    (0.35, -0.06, 0.01, 0.34),
    (0.90, -0.12, 0.02, 0.28),
    (1.60, -0.08, 0.02, 0.23),
    (2.30,  0.04, 0.00, 0.19),
    (3.00,  0.16, 0.02, 0.15),
    (3.65,  0.18, 0.03, 0.12),
    (4.10,  0.10, 0.02, 0.10),
]

segments = 9
vertices = []
faces = []

for z, cx, cy, radius in ring_levels:
    for i in range(segments):
        angle = 2 * math.pi * i / segments
        r = radius * (
            1.0 + 0.09 * math.sin(i * 2.7 + z * 1.3)
        )

        vertices.append((
            cx + r * math.cos(angle),
            cy + r * math.sin(angle),
            z,
        ))

for level in range(len(ring_levels) - 1):
    for i in range(segments):
        a = level * segments + i
        b = level * segments + (i + 1) % segments
        c = (level + 1) * segments + (i + 1) % segments
        d = (level + 1) * segments + i

        faces.append((a, b, c, d))

faces.append(tuple(range(segments - 1, -1, -1)))

top_start = (len(ring_levels) - 1) * segments
faces.append(tuple(top_start + i for i in range(segments)))

mesh = bpy.data.meshes.new("A01_Irregular_Trunk_Mesh")
mesh.from_pydata(vertices, [], faces)
mesh.materials.append(bark)
mesh.materials.append(bark_light)
mesh.update()

trunk = bpy.data.objects.new("A01_Main_Trunk", mesh)
tree_collection.objects.link(trunk)

for polygon in mesh.polygons:
    if polygon.index % 7 == 0:
        polygon.material_index = 1

# ------------------------------------------------------------
# SURFACE ROOTS
# ------------------------------------------------------------

root_paths = [
    [(0, 0, 0.30), (-0.20, -0.14, 0.16), (-0.90, -0.38, 0.05)],
    [(0, 0, 0.27), (0.17, -0.16, 0.14), (0.72, -0.55, 0.04)],
    [(0, 0, 0.26), (0.17, 0.20, 0.13), (0.60, 0.64, 0.04)],
    [(0, 0, 0.27), (-0.17, 0.20, 0.13), (-0.70, 0.48, 0.04)],
]

for i, points in enumerate(root_paths):
    add_branch(
        f"A01_Surface_Root_{i + 1}",
        points,
        0.13,
        bark,
        tree_collection,
    )

# ------------------------------------------------------------
# MAIN BRANCHES
# ------------------------------------------------------------

branches = [
    ([(0.05, 0, 2.4), (-0.38, 0.02, 3.1),
      (-1.10, 0.06, 3.65), (-2.05, 0.05, 3.92)], 0.16),

    ([(-0.70, 0.04, 3.4), (-1.10, -0.20, 4.0),
      (-1.70, -0.25, 4.22)], 0.10),

    ([(-1.10, 0.06, 3.65), (-1.65, 0.25, 3.72),
      (-2.35, 0.28, 3.80)], 0.075),

    ([(0.12, 0.02, 2.8), (0.62, 0.10, 3.25),
      (1.35, 0.10, 3.65), (2.15, 0.05, 3.85)], 0.15),

    ([(0.95, 0.10, 3.45), (1.25, -0.22, 3.90),
      (1.90, -0.30, 4.10)], 0.09),

    ([(1.35, 0.10, 3.65), (1.70, 0.27, 3.72),
      (2.40, 0.32, 3.77)], 0.07),

    ([(0.05, 0.02, 3.0), (-0.12, 0.55, 3.55),
      (-0.55, 0.95, 3.90)], 0.10),

    ([(0.12, -0.02, 2.9), (0.50, -0.50, 3.55),
      (0.95, -0.80, 3.92)], 0.105),

    ([(-0.05, 0.02, 3.55), (-0.35, 0.05, 4.20),
      (-0.50, 0.10, 4.70)], 0.085),

    ([(0.10, 0.02, 3.65), (0.45, 0.05, 4.20),
      (0.65, 0.10, 4.65)], 0.08),
]

for i, (points, radius) in enumerate(branches):
    add_branch(
        f"A01_Branch_{i + 1:02d}",
        points,
        radius,
        bark,
        tree_collection,
    )

# ------------------------------------------------------------
# THINNER TWIGS
# ------------------------------------------------------------

fine_branches = [
    [(-2.05, 0.05, 3.92), (-2.30, 0.00, 4.12)],
    [(-1.70, -0.25, 4.22), (-1.90, -0.20, 4.38)],
    [(-2.35, 0.28, 3.80), (-2.48, 0.35, 4.02)],
    [(2.15, 0.05, 3.85), (2.40, 0.00, 4.05)],
    [(1.90, -0.30, 4.10), (2.05, -0.38, 4.30)],
    [(2.40, 0.32, 3.77), (2.57, 0.37, 3.95)],
    [(-0.50, 0.10, 4.70), (-0.75, 0.13, 4.85)],
    [(0.65, 0.10, 4.65), (0.85, 0.12, 4.82)],
]

for i, points in enumerate(fine_branches):
    add_branch(
        f"A01_Twig_{i + 1:02d}",
        points,
        0.035,
        bark_light,
        tree_collection,
        taper=False,
    )

# ------------------------------------------------------------
# BARK RIDGES
# Raised details following the trunk
# ------------------------------------------------------------

bark_ridges = [
    [(-0.22, -0.30, 0.25), (-0.18, -0.31, 0.75),
     (-0.24, -0.27, 1.20), (-0.15, -0.24, 1.75)],

    [(0.08, -0.31, 0.35), (0.13, -0.29, 0.85),
     (0.06, -0.26, 1.35), (0.12, -0.22, 1.85)],

    [(-0.08, -0.28, 1.45), (-0.02, -0.25, 1.95),
     (-0.08, -0.22, 2.35), (0.00, -0.19, 2.85)],

    [(0.19, -0.24, 1.90), (0.16, -0.22, 2.30),
     (0.22, -0.19, 2.70), (0.15, -0.16, 3.10)],

    [(-0.13, -0.21, 2.40), (-0.18, -0.19, 2.80),
     (-0.10, -0.16, 3.15), (-0.13, -0.14, 3.55)],

    [(0.02, -0.18, 3.00), (0.07, -0.16, 3.35),
     (0.02, -0.14, 3.65), (0.08, -0.12, 3.90)],
]

for i, points in enumerate(bark_ridges):
    add_branch(
        f"A01_Bark_Ridge_{i + 1:02d}",
        points,
        0.018,
        bark_light,
        tree_collection,
        taper=False,
    )

# ------------------------------------------------------------
# BARK CRACKS
# ------------------------------------------------------------

bark_cracks = [
    [(-0.27, -0.30, 0.65), (-0.20, -0.32, 0.78),
     (-0.25, -0.29, 0.94)],

    [(0.00, -0.33, 1.00), (0.06, -0.29, 1.10),
     (0.01, -0.28, 1.24)],

    [(0.20, -0.26, 2.15), (0.12, -0.25, 2.28),
     (0.18, -0.22, 2.43)],

    [(-0.12, -0.22, 2.95), (-0.04, -0.20, 3.08),
     (-0.10, -0.18, 3.20)],
]

for i, points in enumerate(bark_cracks):
    add_branch(
        f"A01_Bark_Crack_{i + 1:02d}",
        points,
        0.009,
        bark_shadow,
        tree_collection,
        taper=False,
    )

# ------------------------------------------------------------
# ORIGINAL CANOPY
# ------------------------------------------------------------

canopy_clumps = [
    (-1.85, 0.02, 4.22, 0.86, 0.67, 0.40, leaf_mid),
    (-1.35, -0.10, 4.38, 0.96, 0.77, 0.45, leaf_dark),
    (-0.72, -0.05, 4.48, 0.95, 0.75, 0.42, leaf_mid),
    (0.00, 0.02, 4.55, 0.90, 0.72, 0.43, leaf_light),
    (0.75, 0.03, 4.46, 0.98, 0.75, 0.43, leaf_mid),
    (1.40, 0.02, 4.34, 0.90, 0.72, 0.40, leaf_dark),
    (1.95, 0.04, 4.18, 0.78, 0.63, 0.37, leaf_mid),

    (-1.60, 0.48, 4.35, 0.76, 0.63, 0.36, leaf_dark),
    (-0.60, 0.55, 4.47, 0.87, 0.65, 0.38, leaf_mid),
    (0.55, 0.52, 4.40, 0.88, 0.66, 0.38, leaf_light),
    (1.55, 0.45, 4.27, 0.75, 0.62, 0.35, leaf_mid),

    (-1.35, -0.50, 4.30, 0.80, 0.60, 0.35, leaf_mid),
    (-0.35, -0.55, 4.40, 0.88, 0.65, 0.37, leaf_dark),
    (0.70, -0.53, 4.34, 0.86, 0.65, 0.37, leaf_mid),
    (1.55, -0.45, 4.18, 0.75, 0.60, 0.34, leaf_light),

    (-1.10, 0.08, 4.67, 0.60, 0.52, 0.28, leaf_light),
    (0.15, 0.16, 4.76, 0.67, 0.53, 0.29, leaf_mid),
    (1.15, 0.04, 4.63, 0.61, 0.50, 0.28, leaf_dark),
]

for i, item in enumerate(canopy_clumps):
    x, y, z, sx, sy, sz, material = item

    add_canopy_clump(
        f"A01_Canopy_Clump_{i + 1:02d}",
        (x, y, z),
        (sx, sy, sz),
        material,
        tree_collection,
        i + 1,
    )

# ------------------------------------------------------------
# ADDITIONAL FOLIAGE
# Smaller clusters fill canopy gaps
# ------------------------------------------------------------

extra_canopy = [
    (-2.15, -0.05, 4.30, 0.48, 0.40, 0.27, leaf_dark),
    (-1.80, -0.32, 4.55, 0.52, 0.40, 0.25, leaf_light),
    (-1.30, -0.30, 4.65, 0.48, 0.38, 0.25, leaf_mid),
    (-0.90, 0.25, 4.75, 0.50, 0.38, 0.25, leaf_light),
    (-0.40, -0.25, 4.78, 0.47, 0.38, 0.24, leaf_mid),
    (0.15, -0.28, 4.88, 0.50, 0.40, 0.25, leaf_dark),
    (0.55, 0.25, 4.76, 0.49, 0.38, 0.25, leaf_light),
    (1.00, -0.20, 4.70, 0.50, 0.38, 0.25, leaf_mid),
    (1.50, -0.18, 4.56, 0.48, 0.38, 0.25, leaf_light),
    (1.90, 0.20, 4.38, 0.44, 0.36, 0.23, leaf_dark),
    (-1.50, 0.70, 4.45, 0.48, 0.38, 0.25, leaf_mid),
    (-0.70, 0.72, 4.60, 0.47, 0.38, 0.24, leaf_dark),
    (0.20, 0.72, 4.60, 0.48, 0.38, 0.24, leaf_mid),
    (1.15, 0.66, 4.48, 0.47, 0.38, 0.24, leaf_light),
]

for i, item in enumerate(extra_canopy):
    x, y, z, sx, sy, sz, material = item

    add_canopy_clump(
        f"A01_Canopy_Fill_{i + 1:02d}",
        (x, y, z),
        (sx, sy, sz),
        material,
        tree_collection,
        i + 25,
    )

# ------------------------------------------------------------
# MOVABLE CANOPY PIVOTS
# Three independent groups for future wind animation.
# The canopy objects retain their world positions when parented.
# ------------------------------------------------------------

canopy_pivots = []

pivot_definitions = [
    ("A01_Pivot_Canopy_Left", -1.25),
    ("A01_Pivot_Canopy_Center", 0.0),
    ("A01_Pivot_Canopy_Right", 1.25),
]

for name, x in pivot_definitions:
    pivot = bpy.data.objects.new(name, None)
    tree_collection.objects.link(pivot)

    pivot.location = (x, 0.0, 3.85)
    pivot.empty_display_type = "SPHERE"
    pivot.empty_display_size = 0.12

    canopy_pivots.append((name, pivot))

bpy.context.view_layer.update()

canopy_prefixes = (
    "A01_Canopy_Clump_",
    "A01_Canopy_Fill_",
)

for obj in list(tree_collection.objects):
    if not obj.name.startswith(canopy_prefixes):
        continue

    # Choose the closest pivot using the original world-space X.
    world_x = obj.matrix_world.translation.x

    pivot_index = min(
        range(len(canopy_pivots)),
        key=lambda i: abs(
            world_x - canopy_pivots[i][1].location.x
        ),
    )

    pivot = canopy_pivots[pivot_index][1]
    original_world_matrix = obj.matrix_world.copy()

    obj.parent = pivot
    obj.matrix_world = original_world_matrix

bpy.context.view_layer.update()

# ------------------------------------------------------------
# PREVIEW GROUND
# Not included in the runtime GLB
# ------------------------------------------------------------

bpy.ops.mesh.primitive_plane_add(
    size=200,
    location=(0, 0, -0.06),
)

ground = bpy.context.object
ground.name = "A01_Preview_Ground"
move_to_collection(ground, stage_collection)
ground.data.materials.append(ground_mat)

# ------------------------------------------------------------
# PREVIEW CAMERA
# ------------------------------------------------------------

bpy.ops.object.camera_add(location=(10, -17, 9))

camera = bpy.context.object
camera.name = "A01_Preview_Camera"
move_to_collection(camera, stage_collection)

target = Vector((0, 0, 3.15))
direction = target - camera.location

camera.rotation_euler = direction.to_track_quat(
    "-Z", "Y"
).to_euler()

camera.data.type = "ORTHO"
camera.data.ortho_scale = 9.0

scene = bpy.context.scene
scene.camera = camera

# ------------------------------------------------------------
# PREVIEW LIGHTS
# ------------------------------------------------------------

def add_area_light(
    name,
    location,
    energy,
    size,
    target_point,
):
    bpy.ops.object.light_add(
        type="AREA",
        location=location,
    )

    light = bpy.context.object
    light.name = name
    move_to_collection(light, stage_collection)

    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size

    direction = Vector(target_point) - light.location

    light.rotation_euler = direction.to_track_quat(
        "-Z", "Y"
    ).to_euler()

    return light


add_area_light(
    "A01_Key_Light",
    (2, -8, 11),
    1500,
    7,
    (0, 0, 3),
)

add_area_light(
    "A01_Fill_Light",
    (-7, -2, 7),
    700,
    6,
    (0, 0, 3),
)

add_area_light(
    "A01_Rim_Light",
    (1, 6, 9),
    1100,
    5,
    (0, 0, 4),
)

# ------------------------------------------------------------
# RENDER SETTINGS
# Blender 3.x EEVEE
# ------------------------------------------------------------

scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100

scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False

if scene.world is None:
    scene.world = bpy.data.worlds.new("A01_Preview_World")

scene.world.color = (0.18, 0.18, 0.18)

scene.view_settings.view_transform = "Standard"
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1

# Try a contrast look supported by this Blender version.
try:
    scene.view_settings.look = "Medium High Contrast"
except (TypeError, ValueError):
    pass

# ------------------------------------------------------------
# MEASURE THE TREE
# Count triangles from geometry, not the empty pivots.
# ------------------------------------------------------------

bpy.context.view_layer.update()

tree_objects = list(tree_collection.objects)

geometry_types = {
    "MESH",
    "CURVE",
    "SURFACE",
    "FONT",
    "META",
}

triangle_count = 0
world_corners = []

depsgraph = bpy.context.evaluated_depsgraph_get()

for obj in tree_objects:
    if obj.type not in geometry_types:
        continue

    evaluated = obj.evaluated_get(depsgraph)
    evaluated_mesh = None

    try:
        evaluated_mesh = evaluated.to_mesh()

        if evaluated_mesh:
            for poly in evaluated_mesh.polygons:
                triangle_count += max(
                    0,
                    len(poly.vertices) - 2,
                )

    finally:
        if evaluated_mesh:
            evaluated.to_mesh_clear()

    for corner in obj.bound_box:
        world_corners.append(
            obj.matrix_world @ Vector(corner)
        )

if not world_corners:
    raise RuntimeError("No tree geometry was created.")

mins = [
    min(vertex[i] for vertex in world_corners)
    for i in range(3)
]

maxs = [
    max(vertex[i] for vertex in world_corners)
    for i in range(3)
]

dimensions = [
    round(maxs[i] - mins[i], 3)
    for i in range(3)
]

# ------------------------------------------------------------
# SAVE SOURCE BLEND
# ------------------------------------------------------------

bpy.ops.wm.save_as_mainfile(
    filepath=str(BLEND_PATH)
)

# ------------------------------------------------------------
# RENDER PREVIEW PNG
# ------------------------------------------------------------

scene.render.filepath = str(PREVIEW_PATH)

bpy.ops.render.render(write_still=True)

# ------------------------------------------------------------
# EXPORT RUNTIME GLB
# Include tree geometry and canopy pivots, exclude stage objects.
# Parent relationships are retained for future animation.
# ------------------------------------------------------------

bpy.ops.object.select_all(action="DESELECT")

for obj in tree_objects:
    obj.select_set(True)

if tree_objects:
    bpy.context.view_layer.objects.active = tree_objects[0]

bpy.ops.export_scene.gltf(
    filepath=str(GLB_PATH),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="EXPORT",
)

# ------------------------------------------------------------
# METADATA
# ------------------------------------------------------------

material_names = set()

for obj in tree_objects:
    if obj.data and hasattr(obj.data, "materials"):
        for mat in obj.data.materials:
            if mat is not None:
                material_names.add(mat.name)

metadata = {
    "id": ASSET_ID,
    "name": ASSET_NAME,
    "category": "vegetation",
    "biome": "East African savanna",
    "status": "generated_pending_review",
    "creation_method": "procedural Blender Python",

    "source": {
        "blend": str(
            BLEND_PATH.relative_to(repo_root)
        ).replace("\\", "/"),

        "script": str(
            script_path.relative_to(repo_root)
        ).replace("\\", "/"),

        "external_assets_used": False,
        "license": (
            "Original procedural model; "
            "no external assets used"
        ),
    },

    "runtime": {
        "format": "glb",

        "path": str(
            GLB_PATH.relative_to(repo_root)
        ).replace("\\", "/"),

        "file_size_bytes": GLB_PATH.stat().st_size,
        "triangle_count": triangle_count,
        "material_count": len(material_names),
        "dimensions_xyz": dimensions,
        "origin": "World origin at tree base",
        "textures": False,

        "animation_ready": True,
        "animation_note": (
            "Three canopy pivot empties group foliage. "
            "Actual wind animation must be implemented "
            "and tested in the game."
        ),
    },

    "preview": str(
        PREVIEW_PATH.relative_to(repo_root)
    ).replace("\\", "/"),

    "game_integration_tested": False,

    "review_notes": [
        "Inspect bark ridge placement and cracks.",
        "Inspect canopy silhouette, gaps and branch visibility.",
        "Check GLB import and materials in the game.",
        "Verify scale and origin.",
        "Test that all three canopy pivots export correctly.",
        "Implement and test gentle wind animation in JavaScript.",
    ],
}

with open(META_PATH, "w", encoding="utf-8") as file:
    json.dump(metadata, file, indent=2)

# ------------------------------------------------------------
# REPORT
# ------------------------------------------------------------

print("\n" + "=" * 58)
print("A01 ACACIA GENERATED")
print("=" * 58)

print(f"Repository: {repo_root}")
print(f"Source:     {BLEND_PATH}")
print(f"Preview:    {PREVIEW_PATH}")
print(f"Runtime:    {GLB_PATH}")
print(f"Metadata:   {META_PATH}")

print(f"Triangles:  {triangle_count:,}")
print(f"Dimensions: {dimensions}")
print(f"Materials:  {len(material_names)}")
print(f"GLB size:   {GLB_PATH.stat().st_size:,} bytes")

print("Canopy pivots:")
for name, pivot in canopy_pivots:
    print(f"  - {name}")

print("=" * 58)
print("Status: pending visual and game integration review.")
print("No checklist items were automatically completed.")
print("=" * 58)
