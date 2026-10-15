# T002: Resource and recipe data (JSON only, no code)

- **Owner (AI):** ChatGPT or Gemini
- **Branch:** `t002-data`
- **Status:** todo

## Goal

Create the first game data for the carpentry loop so the inventory and crafting code has something real to use.

## Files to read first

- `PROJECT_NOTES.md`, `docs/VISION.md`

## Files to create

- `data/resources.json`
- `data/recipes.json`

## Interface

`resources.json` is an object keyed by id:

```json
{
  "timber": { "name": "Timber", "stack": 20, "gatherFrom": "tree", "tool": null }
}
```

`recipes.json` is an array:

```json
[
  { "id": "stool", "name": "Wooden stool", "inputs": { "timber": 2 }, "output": { "stool": 1 }, "station": "workbench" }
]
```

Every id used in a recipe must exist in `resources.json` (items made by crafting also need an entry there).

## Rules

- 8 to 12 resources and 6 to 10 recipes, carpentry and farming only.
- Names in English, ids lowercase with underscores.
- Use real Ugandan timber, crops and tools where you are sure of them. If unsure, use a generic name. Do not invent cultural claims.
- No code. Valid JSON only.

## Done when

- [ ] Both files parse as valid JSON.
- [ ] Every recipe id and ingredient exists in `resources.json`.
- [ ] A crafting chain exists: gather timber, craft planks, craft a stool.

## Result

