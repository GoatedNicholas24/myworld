# My World - Asset style guide

Decided by the project owner on 2026-10-19. This overrides the larger triangle
budgets in the master catalogue wherever they disagree.

## Look

- Painterly, like Firewatch (warm and cool painted shapes, soft gradients) and
  Entergalactic (clean cartoon shapes, confident flat colour).
- The look comes from hand-painted style textures, not from geometry.

## Targets

- Average Android phones, iPhones and average PCs.
- Few triangles, few materials, small textures, instancing wherever possible.
- Matte materials: no specular shine; colour comes from the painted texture
  multiplied by baked vertex colour (shading and ambient occlusion).

## Quality tiers

- Every asset ships in three tiers: `_low`, `_med`, `_high`, same ID and same
  materials, different triangle counts and texture detail.
- A settings page lets the player change the tier, with a warning on weak
  devices, but never blocks the choice.

## Suggested triangle budgets per tier (low / med / high)

| Asset class | low | med | high |
|---|---:|---:|---:|
| Grass tuft, tiny clutter | 100 | 250 | 450 |
| Shrub, rock, log | 300 | 700 | 1,400 |
| Tree | 1,500 | 3,500 | 7,000 |
| Hand tool, small prop | 200 | 450 | 900 |
| Building piece | 300 | 800 | 1,600 |

These are starting points; measure and adjust per asset.

## Movement

- Plants and trees keep movable parts: pivots for wind, plus a wind mask in the
  second UV set (TEXCOORD_1: x = sway weight, y = phase) for shader wind.
- Many-instance assets such as grass use the shader mask only (no node clip).

## Checks every asset must pass before review

- Exported GLB re-read from disk: triangle count, textures not blank, attributes.
- Preview render and metadata saved; checklist updated; status stays
  `generated_pending_review` until the owner approves it.
- In-game testing happens after the first 10 assets exist.
