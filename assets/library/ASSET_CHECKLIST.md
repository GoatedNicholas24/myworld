# My World — Starter Asset Checklist

We will build this library gradually, normally **one asset per session**. The order prioritises assets that make the world recognisable and establish a repeatable Blender → GLB → game workflow.

Status key: `[ ]` not started · `[~]` in progress · `[x]` reviewed and complete

## Phase 0 — Library foundation

- [x] Create the `assets-library` branch from `terrain-generator`.
- [x] Define source, preview, metadata, and runtime-export locations.
- [ ] Confirm Blender MCP can inspect a test scene safely.
- [ ] Agree on the shared asset naming, scale, origin, triangle-count, and export conventions.
- [ ] Verify one exported GLB can be viewed and loaded by the current game.

## Phase 1 — First playable environment assets

- [ ] **A01 — East African savanna acacia tree.** Hero test asset: distinctive flat canopy, irregular trunk and branches, stylised-realistic materials. Keep it lightweight. This is the first asset to make in the next chat.
- [ ] **A02 — Dry grass tuft.** Small reusable ground vegetation; should be cheap to instance many times.
- [ ] **A03 — Savanna thorny shrub.** Irregular silhouette, a few colour variants from shared geometry/materials.
- [ ] **A04 — Weathered rock / boulder set.** One reusable base mesh with several size/rotation variants.
- [ ] **A05 — Fallen branch and log.** Useful as scenery and a future harvestable timber resource.
- [ ] **A06 — Papyrus / wetland reed clump.** For lake edges, rivers, and marshes.
- [ ] **A07 — Broadleaf highland tree.** A distinct silhouette from the acacia for forest and highland areas.
- [ ] **A08 — Bamboo clump.** Reusable stalks and leaves for suitable highland/forest areas.

## Phase 2 — Harvestable materials and small props

- [ ] **A09 — Loose stone and stone outcrop variants.**
- [ ] **A10 — Clay / red-earth deposit.** Readable ground-level resource node.
- [ ] **A11 — Bundle of thatch grass.** Harvested material pickup.
- [ ] **A12 — Cut timber / wood bundle.** Resource pickup that visually matches the tree/log assets.
- [ ] **A13 — Simple woven basket.** Storage and carrying prop.
- [ ] **A14 — Primitive stone hand tool.** First crafted-tool visual.

## Phase 3 — First construction pieces

- [ ] **A15 — Wooden poles and rope/fibre bundle.**
- [ ] **A16 — Thatch roof section.**
- [ ] **A17 — Mud wall section.**
- [ ] **A18 — Small shelter kit.** Assemble from modular pieces rather than making one uneditable mesh.

## Phase 4 — Living world and variety

- [ ] **A19 — Small bird.** Start static/idle; add rigging only if needed.
- [ ] **A20 — Insect / butterfly.** Simple silhouette and inexpensive animation.
- [ ] **A21 — Fish.** Low-poly base for freshwater environments.
- [ ] **A22 — Mushroom / fungus cluster.**
- [ ] **A23 — Farm crop stages.** Seedling, growing plant, mature plant.
- [ ] **A24 — One livestock animal.** Choose after checking the target world and animation requirements.

## Per-asset checklist

Copy this block into the metadata note for every asset:

- [ ] Purpose and biome/use case documented.
- [ ] Shape and material reviewed in Blender.
- [ ] Correct scale, origin, and orientation.
- [ ] Reusable geometry/materials; no needless mesh detail.
- [ ] Triangle count and GLB file size recorded.
- [ ] Saved editable `.blend` source.
- [ ] Exported and inspected `.glb`.
- [ ] Preview image saved.
- [ ] Metadata saved (ID, category, dimensions, triangle count, materials, source/licence).
- [ ] Any external source/licence recorded in `ASSETS.md`.
- [ ] Tested in the game or marked clearly as not yet integrated.
- [ ] Checklist status updated.

## Naming convention

Use stable IDs and lowercase snake case:

- Source: `assets/library/source/vegetation/A01_acacia_tree.blend`
- Runtime: `public/assets/models/vegetation/a01_acacia_tree.glb`
- Preview: `assets/library/previews/A01_acacia_tree.png`
- Metadata: `assets/library/metadata/A01_acacia_tree.json`

If a model is revised, keep the same ID and update its source/export together. Do not mark an asset complete just because the model-generation step succeeded.
