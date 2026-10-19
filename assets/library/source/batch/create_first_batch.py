import bpy
from pathlib import Path

# Run all eight first-batch asset generators in order.
# Save this file as assets/library/source/batch/create_first_batch.py

text_block = bpy.context.space_data.text if bpy.context.space_data and bpy.context.space_data.type == "TEXT_EDITOR" else None
if not text_block or not text_block.filepath:
    raise RuntimeError("Save this batch runner in the project path before running.")

runner_path = Path(bpy.path.abspath(text_block.filepath)).resolve()
root = runner_path.parents[4]

if not (root / "package.json").exists():
    raise RuntimeError(f"My World repository not found: {root}")

scripts = [
    root / "assets/library/source/vegetation/create_a01_acacia_tree.py",
    root / "assets/library/source/vegetation/create_a02_savanna_grass.py",
    root / "assets/library/source/vegetation/create_a03_thorny_shrub.py",
    root / "assets/library/source/props/create_a04_weathered_rocks.py",
    root / "assets/library/source/props/create_a05_fallen_branch_log.py",
    root / "assets/library/source/vegetation/create_a06_papyrus_reeds.py",
    root / "assets/library/source/vegetation/create_a07_broadleaf_tree.py",
    root / "assets/library/source/vegetation/create_a08_bamboo_clump.py",
]

missing = [str(path) for path in scripts if not path.exists()]
if missing:
    raise RuntimeError("Missing asset scripts:\n" + "\n".join(missing))

print("\n=== MY WORLD FIRST ASSET BATCH ===")
print(f"Repository: {root}")
print(f"Scripts: {len(scripts)}")

for index, script_path in enumerate(scripts, 1):
    print(f"\n[{index}/{len(scripts)}] Generating {script_path.name}")

    # Start each asset from an empty scene so its .blend stays independent.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    # Remove old empty asset collections from the scene.
    for child in list(bpy.context.scene.collection.children):
        bpy.context.scene.collection.children.unlink(child)
        if child.users == 0:
            bpy.data.collections.remove(child)

    namespace = {"MY_WORLD_SCRIPT_PATH": str(script_path)}
    source = script_path.read_text(encoding="utf-8")
    exec(compile(source, str(script_path), "exec"), namespace)

print("\n=== FIRST BATCH FINISHED ===")
print("Generated A01-A08 source .blend files, runtime .glb files, and metadata.")
print("All assets remain marked pending review.")
