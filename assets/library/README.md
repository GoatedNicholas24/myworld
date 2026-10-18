# My World Asset Library

This branch starts from `terrain-generator` and is dedicated to creating, reviewing, and organising reusable 3D assets for My World.

## Rules

- Keep this branch based on `terrain-generator`; do not work on `master`.
- Create assets in small, reviewable steps: one primary asset per session.
- Use Blender and AI-assisted generation where useful, but inspect every result and keep it editable.
- Target stylised realism inspired by East African environments, with dignity and ecological specificity.
- Keep assets lightweight enough for low-end Android phones and weak laptops.
- Only use assets that are free for commercial use. Record source, author, licence, and changes in the repository's `ASSETS.md`.
- Prefer our own procedural/generated assets where practical; do not add dependencies just for asset creation.
- Do not edit Claude-owned generated terrain under `public/terrain/**`, `tools/terrain/**`, or `tools/blender/**`.
- Export runtime models as `.glb` unless a task gives a clear reason to use another format.
- Preserve the editable Blender source `.blend` and a preview image for each finished asset.

## Where things go

- `assets/library/source/`: editable Blender `.blend` source files, grouped by category.
- `assets/library/previews/`: review renders or screenshots for completed assets.
- `assets/library/metadata/`: per-asset notes, dimensions, triangle counts, origin/pivot, material and licence details.
- `public/assets/models/`: exported runtime `.glb` files loaded by the game.
- `assets/library/ASSET_CHECKLIST.md`: the living production checklist.

Do not commit temporary renders, caches, model-generation intermediates, or huge unused texture sets. Keep source and runtime exports clearly paired by asset ID.

## Asset completion standard

An asset is complete only when:
1. It looks correct in Blender and has sensible scale/origin.
2. It has a saved `.blend` source.
3. It has an exported `.glb` that can be inspected/imported.
4. Materials and textures survive export.
5. Triangle count and file size are recorded.
6. It has a preview and metadata entry.
7. Its licence/source is recorded in `ASSETS.md` if any external content was used.
8. It is checked against the LOW-quality target; avoid unnecessary geometry and materials.
9. The checklist is updated with its status.

The first asset is an East African savanna acacia tree. Do not generate the next asset until the first one has been reviewed.
