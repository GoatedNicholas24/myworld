# Asset metadata

Create one JSON file per reviewed asset, named after its stable asset ID.

Suggested fields:

```json
{
  "id": "A01",
  "name": "East African savanna acacia tree",
  "category": "vegetation",
  "status": "in_progress",
  "source_blend": "assets/library/source/vegetation/A01_acacia_tree.blend",
  "runtime_glb": "public/assets/models/vegetation/a01_acacia_tree.glb",
  "preview": "assets/library/previews/A01_acacia_tree.png",
  "biomes": ["savannah_grassland", "woodland"],
  "dimensions_m": [0, 0, 0],
  "triangle_count": null,
  "glb_size_bytes": null,
  "materials": [],
  "external_sources": [],
  "license": "originally generated",
  "notes": "Fill measured values after the asset is built and exported."
}
```

Do not leave placeholder measurements in a completed asset record.
