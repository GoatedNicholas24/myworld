# My World — Master Asset, Resource and Processing Catalogue

**Branch:** `assets-library`  
**Purpose:** Master production plan for the reusable 3D assets, resource states, variants, extraction stages, and production systems required by *My World*.  
**Visual direction:** stylised painterly realism inspired by East African landscapes and cultures.  
**Performance target:** low-end Android first; scalable upward to PCs. Use instancing, shared materials, LODs, simple collision meshes, and data-driven variants.

> This is the complete planning catalogue, not a claim that every asset is already modelled. Build it in phases. A variant should usually be a parameter or material change, not a separate model.

---

## 1. Asset rules

1. Give every reusable asset a stable ID and one canonical name.
2. Keep editable Blender source under `assets/library/source/<category>/`, metadata under `assets/library/metadata/`, and runtime exports under `public/assets/models/<category>/`.
3. Export game models as GLB. Keep the Blender source. Record dimensions, origin, triangle count, material count, file size, collision approach, variants, and review status.
4. Prefer procedural variation, shared materials, and instancing over many unique meshes.
5. Use simple collision proxies. Decorative geometry should not automatically become physical collision.
6. Use only assets that are free for commercial use; document external source and licence in `assets/library/ASSETS.md`. Prefer original procedural assets.
7. Use accurate regional ecology and respectful cultural specificity. Do not treat all African environments, architecture, clothing, or languages as interchangeable.
8. No asset is complete until it is visually reviewed and the exported GLB is tested in-game.
9. Keep all generated assets marked `generated_pending_review` until approved.
10. This catalogue does not authorise editing Claude-owned `public/terrain/**`, `tools/terrain/**`, or `tools/blender/**`.

### Suggested technical budgets

These are initial targets, not rigid limits; measure real assets and profile the game.

| Asset class | Initial target | Notes |
|---|---:|---|
| Tiny ground clutter | 50–500 triangles | Instance many copies; combine into patches where suitable |
| Grass/reed clump | 300–2,000 | Few shared materials; wind animation optional |
| Small prop/resource node | 200–2,500 | Clear silhouette and readable state |
| Rock/log/shrub | 500–3,000 | Reuse mesh variants and materials |
| Common tree | 2,000–6,000 | LODs for dense vegetation; avoid excessive transparent leaves |
| Hero tree/large prop | 4,000–10,000 | Use sparingly and profile |
| Hand tool/small item | 200–2,000 | Often held close to camera |
| Modular building piece | 300–3,000 | Reusable dimensions, snap points, simple collision |
| Small animal | 1,000–5,000 | Separate rig only if animation is needed |
| Large animal | 4,000–15,000 | LODs and animation budget required |
| Human character | 8,000–25,000 | Shared skeleton, modular clothing, LODs |
| Vehicle/large machine | 2,000–15,000 | Separate moving parts and collision proxy |

---

## 2. Resource lifecycle and processing levels

A resource should have **gameplay states**, not just different-looking objects. Store quantities, quality, moisture, contamination, durability, and location as data where useful. Only create a separate mesh when the appearance changes meaningfully.

| Level | State | Meaning | Example |
|---|---|---|---|
| L0 | Environmental source | Part of the world, not yet acquired | standing tree, clay bank, ore vein, wild crop |
| L1 | Extracted/raw | Harvested or mined; irregular and unrefined | log, clay lump, ore chunk, raw fibre |
| L2 | Collected/sorted | Separated, bundled, washed, dried, or graded | branch bundle, sorted ore, dry clay, cleaned fibre |
| L3 | Primary processed | First transformation with simple tools | cut planks, charcoal, crushed stone, dried grain |
| L4 | Refined/component | Consistent material used as an ingredient | sawn timber, fired brick, metal ingot, woven cloth |
| L5 | Manufactured part | Shaped part ready to assemble | board, hinge, rope, roof panel, tool head |
| L6 | Finished product | Usable tool, furniture, machine, building, or trade good | axe, basket, door, cart, pot |
| L7 | Used/damaged/recycled | Worn, broken, repaired, or recoverable | blunt tool, scrap metal, rotten wood, rubble |

Not every resource needs all eight states. A stone may go L0 → L1 → L3 (shaped stone); a plant fibre may go L0 → L1 → L2 → L4 → L5. Recipes should declare input quantities, tools, skills, station, time, energy/fuel, yield, by-products, and failure/quality rules.

### Common resource variables

- **Quantity:** mass, count, volume, or stack units.
- **Quality:** grade, purity, strength, grain size, straightness, freshness.
- **Moisture:** affects drying, weight, combustion, spoilage, and construction.
- **Contamination:** soil, salt, pests, impurities, or disease.
- **Durability:** remaining usable life or wear.
- **Provenance:** source biome/node and extraction method.
- **Processing:** current level, recipe history, and work invested.
- **Market value:** depends on quality, scarcity, location, and demand.
- **Ecological recovery:** regrowth, replenishment, erosion, or depletion.

---

## 3. Environment, terrain and biome catalogue

Terrain itself is primarily height/biome/material data, not a separate mesh for every patch. The starting region is a 20 × 20 km Great Lakes East African landscape, streamed/chunked and generated with LODs.

| ID | Asset/system | Variants and properties | Description / use |
|---|---|---|---|
| ENV-01 | Terrain chunk | height, slope, roughness, chunk LOD | Reusable terrain tiles driven by existing terrain data |
| ENV-02 | Ground material set | red earth, dark soil, sand, gravel, loam, rock, wet mud | Blended by biome, moisture, slope and disturbance |
| ENV-03 | Soil profiles | fertility, depth, pH-like category, moisture, drainage | Drives crops, vegetation, erosion and yield |
| ENV-04 | Water surfaces | lake, river, stream, pond, marsh; depth, flow, turbidity | Existing water data should drive placement and appearance |
| ENV-05 | Riverbank/lake shore | muddy, sandy, rocky, vegetated | Shore transitions and walkable edges |
| ENV-06 | Cliff/escarpment dressing | ledges, scree, exposed strata | Decorative pieces placed on top of terrain; do not replace terrain generation |
| ENV-07 | Cave entrance/interior kit | small/large opening, dry/wet, rock type | Later exploration/mining locations |
| ENV-08 | Paths and tracks | footpath, cattle track, dirt road, gravel road | Wear changes with traffic and rain |
| ENV-09 | Seasonal ground states | dry, wet, muddy, burned, regrowing | Material/vegetation state variants, not wholly separate worlds |
| ENV-10 | Weather/sky system | clear, cloud, rain, storm, mist; wind strength | Drives visibility, moisture, plant movement and farming |
| ENV-11 | Biome masks | savanna, dry woodland, tropical/riverine forest, highlands, wetlands, rocky outcrops | Data fields controlling asset distribution |
| ENV-12 | Ecology state | sunlight, moisture, fertility, cover, grazing, fire, disturbance | Simulation variables controlling plant growth and resource renewal |

**Biome coverage:** savanna and dry woodland; tropical/riverine forest; highlands; lakes/rivers/wetlands; cliffs/caves. Future regions can add semi-arid scrub, trade-city outskirts, Sahel-like environments, and additional forest types using the same systems.

---

## 4. Vegetation catalogue

Plant assets should support growth stages and seasonal states where gameplay needs them. Most common vegetation uses shared materials and instanced meshes.

| ID | Asset | Variants / properties | Description and resource outputs |
|---|---|---|---|
| A01 | East African savanna acacia | young/mature/old; sparse/dense canopy; healthy/dry/burned; branch breakage | Shade, pods, firewood, poles; canopy sway optional |
| A02 | Dry savanna grass tuft | green/dry/burned/regrowing; short/tall; density | Grazing, thatch, seed; cheap instanced ground cover |
| A03 | Thorny savanna shrub | small/large; flowering/fruiting/dry | Fuel, browse, thorn barrier, possible fruit |
| A04 | Weathered rock/boulder set | 4–8 shapes; size, colour, lichen, cracks | Scenery and stone source |
| A05 | Fallen branch/log | fresh/dry/rotted; small/large; cut/broken ends | Timber, firewood, bark, habitat |
| A06 | Papyrus/reed clump | young/mature/dry; sparse/dense; wetland depth | Fibre, thatch, stems |
| A07 | Highland broadleaf tree | young/mature; canopy density; wet/dry; fallen | Timber, shade, leaf litter |
| A08 | Bamboo clump | shoot/mature; cut/uncut culms; sparse/dense | Poles, shoots, fibre; suitable regions only |
| A09 | Riverine tree set | species silhouette, age, root exposure | Shade, timber; bankside stabilisation |
| A10 | Fig tree | young/mature; fruiting/non-fruiting | Fruit, shade, wildlife food |
| A11 | Palm set | species, height, fruit state | Fronds, fruit, fibre; regionally appropriate placement |
| A12 | Banana plant | sucker/young/mature/harvested; leaf damage | Fruit, leaves, pseudostem fibre |
| A13 | Plantain/food crop set | growth stages and harvest state | Food and crop-cycle teaching |
| A14 | Maize/sorghum/millet | seedling, vegetative, flowering, mature, harvested, failed | Grain, stalks, seed; crop yield variables |
| A15 | Beans/groundnuts | growth stage, moisture stress, harvested | Food, seed, crop rotation |
| A16 | Cassava/sweet potato | foliage stage, harvest state | Roots/tubers, planting material |
| A17 | Coffee/tea crop | young/mature, flowering, ripe, pruned | Commercial crop and processing chain |
| A18 | Wild fruit/berry plant | unripe/ripe/overripe, seasonal | Food and wildlife forage |
| A19 | Medicinal/herb plants | species identity, growth and harvest state | Ingredients; require authored safe fictional recipes or sourced facts |
| A20 | Flowering ground plants | flowering/non-flowering, density | Biodiversity and pollinator support |
| A21 | Fern/moss/lichen | wet/dry, coverage | Forest and rock dressing |
| A22 | Mushroom/fungus clusters | young/mature/decayed; edible/inedible data label | Decomposition and gathering |
| A23 | Aquatic plants | submerged/floating/emergent | Habitat, water-edge ecology |
| A24 | Crop residue/leaf litter | fresh/dry/composting | Mulch, compost, fuel |
| A25 | Stump/root system | fresh cut, old, regrowing, rotten | Wood residue and regrowth state |
| A26 | Seedling/sapling kit | species, age, health, watered | Replanting and forestry |
| A27 | Weeds/invasive plant set | species, density, flowering | Competition, land management |
| A28 | Grassland patch generator | species mix, density, height, moisture | Combines individual plants into biome-aware patches |

**Plant variables:** species, growth stage, height, canopy radius, health, water stress, fertility, season, maturity, fruit/seed quantity, harvested fraction, fire damage, regrowth timer, grazing pressure, and harvest method.

---

## 5. Animals, insects and aquatic life

Use a shared skeleton/animation set where possible. Wildlife should respond to habitat, water, food, noise and time. Start with few representative species rather than dozens of unique rigs.

| ID | Asset/system | Variants / properties | Description / outputs |
|---|---|---|---|
| FAU-01 | Small bird | species palette, perched/flying/nesting | Ambient life, seed dispersal |
| FAU-02 | Pollinating insect | bee/butterfly-like variants, idle/fly | Pollination and flowering plants |
| FAU-03 | Beetle/ground insect | size, colour, crawl/fly | Soil ecology and food chain |
| FAU-04 | Termite mound/colony | mound size, active/damaged | Distinctive savanna scenery and soil effects |
| FAU-05 | Freshwater fish | species/size; swim, bite, catch | Food resource; freshwater habitat |
| FAU-06 | Frog/amphibian | wet/dry habitat, idle/hop | Wetland biodiversity |
| FAU-07 | Lizard | size/colour, bask/run | Ground wildlife |
| FAU-08 | Rodent/small mammal | species, burrow, day/night activity | Food-web and crop interactions |
| FAU-09 | Hare/antelope-sized herbivore | species, age, herd size | Grazing, migration and wildlife observation |
| FAU-10 | Large herbivore | species, adult/young, herd | Later wildlife system; high animation cost |
| FAU-11 | Predator | species, adult/young, hunt/rest | Later ecology; avoid overloading early scope |
| FAU-12 | Livestock starter | goat or chicken first; age, health, sex where relevant | Husbandry, breeding, products |
| FAU-13 | Cattle | calf/juvenile/adult, health, herd | Grazing, milk/meat/traction depending game design |
| FAU-14 | Domestic dog/cat | coat variants, age, idle/walk/run | Settlement companion/utility |
| FAU-15 | Aquatic invertebrate | shellfish/crustacean/insect larvae | Wetland food chain |
| FAU-16 | Nest/burrow/den | species, active/abandoned | Habitat prop tied to animal behaviour |
| FAU-17 | Tracks/droppings/feathers | species, age/freshness | Optional tracking clues and ecology feedback |

Animal variables: species, age, sex where gameplay requires it, health, hunger, thirst, stamina, temperament, domestication, reproductive state, herd/flock, habitat, time-of-day activity, yield, and welfare. Do not simulate every animal individually at full detail at distant ranges; use population counts or simplified agents.

---

## 6. Mineral, soil, water and organic resources

| ID | Resource | Source variants and extraction | Processing ladder / products |
|---|---|---|---|
| RES-01 | Soil/topsoil | surface; careful scraping | raw soil → screened topsoil → planting medium/compost mix |
| RES-02 | Clay | bank, pit, wet/dry deposit | raw clay → cleaned/kneaded clay → shaped wetware → dried ware → fired pot/brick |
| RES-03 | Sand | riverbank/pit; grain grade | raw sand → screened/washed sand → mortar/glass ingredient if later supported |
| RES-04 | Gravel | riverbed/outcrop | loose gravel → sorted aggregate → road base/concrete ingredient |
| RES-05 | Stone | loose stone, boulder, quarry | raw stone → sorted rubble → chipped/shaped block → dressed masonry |
| RES-06 | Hard rock | exposed outcrop, quarry | broken rock → sorted chunks → cut blocks/aggregate |
| RES-07 | Ore deposit | authored deposit types and abundance | ore chunk → sorted/crushed ore → concentrated ore → smelted metal |
| RES-08 | Wood | tree species, trunk size, moisture | standing tree → felled trunk → log → split firewood/pole/plank → seasoned timber |
| RES-09 | Bark | species, harvest damage | raw bark → dried bark → fibre/tannin/decorative use |
| RES-10 | Plant fibre | bark, reeds, banana pseudostem, wild fibre | raw fibre → stripped → cleaned → dried → spun/twisted cord → rope/net/cloth |
| RES-11 | Grass/thatch | grass type, maturity, moisture | standing grass → cut bundle → sorted/dried thatch → tied roof bundle → roof panel |
| RES-12 | Reeds/bamboo | species, length, maturity | standing stem → cut stem → trimmed/dried pole → split strips/panels → basket/fence/structure |
| RES-13 | Wild seeds/grains | species, ripe/unripe, moisture | gathered → cleaned → dried → stored/ground/cooked/planted |
| RES-14 | Fruit/vegetables | species, ripeness, freshness | growing → harvested → sorted → fresh food/dried/preserved/processed |
| RES-15 | Fish/meat | species, size, freshness | caught/slaughtered → cleaned → raw portions → cooked/smoked/dried/preserved |
| RES-16 | Milk/eggs | animal, freshness, quality | collected → filtered/sorted → consumed/processed (where implemented) |
| RES-17 | Manure/compost | source, age, moisture | fresh manure → composting → mature compost → soil amendment |
| RES-18 | Ash/charcoal | fuel type, burn completeness | wood → charred wood/ash → charcoal; ash used as a process ingredient if designed |
| RES-19 | Water | source, clarity, contamination, temperature | source water → collected → settled/filtered/boiled as gameplay allows |
| RES-20 | Salt/mineral salts | deposit/source and purity | raw deposit → crushed/sorted → usable salt (only where geographically plausible) |
| RES-21 | Fibre/animal hides | species, size, condition | raw hide → cleaned → scraped → cured/tanned → leather-like material |
| RES-22 | Bone/shell | species, size | raw bone/shell → cleaned → shaped component/ornament |
| RES-23 | Fuel | dry wood, charcoal, crop residue, later fuels | gathered → dried/sorted → usable fuel unit |
| RES-24 | By-products | sawdust, offcuts, husks, peel, slag, rubble | reuse, compost, fuel, feed, or waste depending on material |

Ore/metal types, glass, cement-like binders, and advanced industrial materials should be introduced only after the geography, technology progression, and gameplay economy justify them. Do not imply that every material exists in every region.

---

## 7. Tools, equipment and carryable items

| ID | Asset family | Variants / properties | Purpose |
|---|---|---|---|
| ITM-01 | Hands/primitive gathering kit | empty hand, stone, stick | First-stage collection |
| ITM-02 | Stone hand tool | chipped stone, hafted version, durability | Basic cutting/scraping |
| ITM-03 | Cutting tool/axe | stone/metal head, handle, sharpness | Chop wood and process plants |
| ITM-04 | Digging tool | stick, stone, metal head | Soil, clay, planting |
| ITM-05 | Hammer/mallet | wood/stone/metal | Shape materials and build |
| ITM-06 | Knife/blade | material, edge condition | Cutting and crafting |
| ITM-07 | Carry basket | size, weave, capacity, damage | Gather and transport resources |
| ITM-08 | Sack/bag | fibre, hide, capacity | Carrying grain and materials |
| ITM-09 | Rope/twine | fibre type, length, strength, wear | Tying, construction, hauling |
| ITM-10 | Fishing kit | line, hook, net, trap | Fishing and water resource gathering |
| ITM-11 | Farming kit | hoe, planting stick, sickle, watering vessel | Soil preparation and crop harvesting |
| ITM-12 | Containers | gourd, clay pot, jar, bucket, barrel | Store liquids, food, seeds, materials |
| ITM-13 | Cooking equipment | hearth, pot, pan, grinding stone | Food preparation |
| ITM-14 | Crafting equipment | work surface, anvil-like surface, vise, hand tools | Recipes and skill progression |
| ITM-15 | Protective equipment | gloves, footwear, eye/heat protection | Optional safety/skill gating for later work |
| ITM-16 | Repair kit | fasteners, spare handle, patch materials | Maintain tools and equipment |
| ITM-17 | Trade goods | bundles, pottery, cloth, processed food, crafted items | Markets, barter and economic simulation |

Each tool should define: allowed actions, required skill, durability, speed multiplier, quality modifier, stamina cost, repair recipe, and compatible resource types.

---

## 8. Processing stations and production machines

A station is a 3D prop plus a data definition. Recipes should not be hard-coded into the mesh.

| ID | Station | Input → output examples | Properties |
|---|---|---|---|
| STA-01 | Ground crafting spot | sticks/stone/fibre → primitive items | no built structure required |
| STA-02 | Drying rack | wet plants/fish/hide → dried material | capacity, airflow, weather exposure, time |
| STA-03 | Hearth/fire pit | wood/crop residue → cooked food, charcoal, ash | fuel, heat, oxygen, safety, output quality |
| STA-04 | Grinding stone/mortar | grain/ore/plant → meal/powder | effort, fineness, throughput |
| STA-05 | Clay work area | clay/water → shaped wetware | moisture, skill, mould/tool |
| STA-06 | Kiln | dry clay/wood → fired pots/bricks | temperature, fuel, firing duration, breakage |
| STA-07 | Sawing/splitting station | logs → poles, planks, offcuts | tool, worker skill, yield, waste |
| STA-08 | Loom/weaving frame | fibre/yarn/reeds → cloth/mat/basket panel | pattern, quality, time |
| STA-09 | Rope-making setup | fibre → cord/rope | fibre length, twist, strength |
| STA-10 | Forge/smelting furnace | ore/charcoal/flux → metal or slag | unlock later; heat, fuel, ore grade, skill |
| STA-11 | Shaping bench | ingot/wood/stone → tool part | recipes, tool wear, accuracy |
| STA-12 | Water collection/filter | source water → cleaner water | flow, filter material, capacity, maintenance |
| STA-13 | Compost bay | plant waste/manure → compost | carbon/nitrogen proxy, moisture, time |
| STA-14 | Farm plot | seeds/water/soil → crop yield | fertility, moisture, season, pests, labour |
| STA-15 | Animal pen/coop | feed/water/animal → products and offspring | capacity, health, cleanliness, fencing |
| STA-16 | Storage rack/shed | items → stored items | capacity, weather protection, pest exposure |
| STA-17 | Workshop | components → finished goods | tools, power source, worker skill, recipe |
| STA-18 | Mill/pump (later) | water/wind/manual power → mechanical work | power output, flow/wind, upkeep |
| STA-19 | Market stall | goods → trade | stock, prices, demand, spoilage, customer flow |
| STA-20 | Recycling/salvage station | damaged goods/scrap → recovered materials | recovery fraction, contamination, labour |

---

## 9. Building and settlement asset kit

Use modular pieces with consistent snap dimensions, pivots, material slots, and collision proxies. A building should be assembled from pieces and have a data definition for durability, shelter, capacity, ownership and upgrades.

| ID | Asset family | Variants / properties | Description |
|---|---|---|---|
| BLD-01 | Poles and beams | diameter, length, straight/bent, species | Structural frame parts |
| BLD-02 | Rope/fibre ties | length, strength, weathering | Connections and lashings |
| BLD-03 | Thatch roof modules | small/large, slope, dry/wet/damaged | Roof panels assembled on frames |
| BLD-04 | Mud wall modules | thickness, plaster, cracks, wet/dry | Wall segments with openings |
| BLD-05 | Wattle-and-daub panels | weave density, mud finish | Alternative wall construction |
| BLD-06 | Stone wall/block | rubble/dressed, height, mortar state | Durable construction progression |
| BLD-07 | Floor modules | earth, compacted earth, timber, stone | Interior floor surface |
| BLD-08 | Door/window kit | size, material, open/closed/broken | Functional openings |
| BLD-09 | Roof ridge/supports | length, joint type | Modular roof assembly |
| BLD-10 | Foundation kit | soil type, stone/wood, height | Elevates and stabilises structures |
| BLD-11 | Fence/gate | poles, woven, thorn, stone | Boundaries, crops and livestock |
| BLD-12 | Raised platform/steps | wood/earth/stone | Access and storage |
| BLD-13 | Small shelter kit | open shelter, hut, storage shelter | First assembled structure |
| BLD-14 | House kit | room count, roof, wall, floor, quality | Modular homes with regional styles |
| BLD-15 | Granary/store | raised/ground, capacity, pest protection | Grain storage |
| BLD-16 | Animal shelter | species, capacity, ventilation | Livestock care |
| BLD-17 | Workshop building | craft type, station slots, upgrade tier | Production hub |
| BLD-18 | Market stall/shop | open/closed, goods display, upgrade tier | Trade |
| BLD-19 | Well/water point | source, depth, lining, water quality | Settlement water supply |
| BLD-20 | Bridge/ferry landing | span, material, load limit | Crossing water and ravines |
| BLD-21 | Road/path modules | width, surface, wear, slope | Transport network |
| BLD-22 | Furniture | bench, stool, table, bed, shelf | Interior utility and decoration |
| BLD-23 | Storage containers | basket, chest, granary, rack | Inventory storage with capacity |
| BLD-24 | Settlement decoration | pots, mats, tools, firewood, textiles | Visual variety using reusable props |
| BLD-25 | Ruins/abandoned structures | age, damage, vegetation cover | Exploration and salvage |
| BLD-26 | Public/community spaces | gathering area, market square, shared shelter | Settlement growth and social life |

Cultural architecture, settlement layout, textiles and decorative motifs should be authored for a specific region and period rather than assembled from generic “African” motifs.

---

## 10. People, clothing and social systems

Characters are a major cost. Build one optimised base rig, then use modular clothing, hair, accessories, body proportions, skin tones and animation sets. Do not make a separate mesh for every NPC.

| ID | Asset/system | Variants / properties | Description |
|---|---|---|---|
| HUM-01 | Base humanoid rig | body proportions, height, age range | Shared skeleton for compatible characters |
| HUM-02 | Face/hair set | hairstyles, facial hair, age variation | Modular appearance |
| HUM-03 | Clothing set | workwear, everyday, rain/cold, ceremonial when contextually appropriate | Region-specific, practical clothing |
| HUM-04 | Footwear/headwear/accessories | material, condition, climate | Modular character additions |
| HUM-05 | Carry/hand props | basket, tool, sack, water vessel | Attach to hand/back slots |
| HUM-06 | Worker/NPC role profiles | farmer, builder, gatherer, craftsperson, trader, herder | Data-defined roles, not unique models |
| HUM-07 | Animation set | idle, walk, run, crouch, gather, chop, dig, carry, craft, build, eat, sleep, interact | Reusable animations |
| HUM-08 | Social interaction set | greet, trade, help, teach, argue, cooperate | Later relationship and community systems |
| HUM-09 | Character state variables | skills, needs, health, mood, knowledge, relationships, inventory | Simulation data |
| HUM-10 | Population/settlement agent system | role, household, job, path, schedule | Use simplified simulation for distant agents |

Language and dialogue should be data-driven and localisable. Characters' skills, knowledge, and social ties should be state variables rather than being encoded into the model.

---

## 11. Transport and logistics

| ID | Asset | Variants / properties | Description |
|---|---|---|---|
| TRN-01 | Carry load | basket/sack/wood bundle, weight, balance | Visible load when carrying |
| TRN-02 | Handcart | capacity, wheel type, damage | Early bulk transport |
| TRN-03 | Pack animal tack | harness, load capacity, fit | Later regional transport |
| TRN-04 | Boat/canoe | size, buoyancy, capacity, damage | Lake and river travel where appropriate |
| TRN-05 | Simple raft/ferry | capacity, current resistance | Crossing points |
| TRN-06 | Bicycle/modern vehicle (later) | fuel/power, condition, capacity | Add only if the era/setting requires it |
| TRN-07 | Road transport network | slope, roughness, width, bridge limits | Pathfinding and travel cost |
| TRN-08 | Storage/warehouse logistics | capacity, route, loss rate | Moves goods between production and markets |

Transport simulation should track capacity, load, movement cost, durability, terrain restrictions and travel time.

---

## 12. World interaction and visual-effect assets

| ID | Asset/effect | Variants / properties | Use |
|---|---|---|---|
| FX-01 | Dust puff | light/heavy, dry/wet ground | Walking, digging, carts |
| FX-02 | Leaf/grass movement | wind strength, gust, shelter | Vegetation animation |
| FX-03 | Fire/smoke/embers | fuel, size, wind, wetness | Cooking, burning, industry |
| FX-04 | Water splash/ripple | size, speed, depth | Fishing, rain, movement |
| FX-05 | Harvest/chop particles | wood chips, leaves, soil clods | Feedback for actions |
| FX-06 | Construction particles | dust, fragments, mortar | Building/repair |
| FX-07 | Crop/weather effects | rain, wilt, growth cue | Farming feedback |
| FX-08 | Resource highlights | subtle outline, icon, distance | Accessibility and discovery |
| FX-09 | Audio library | footsteps, wind, insects, birds, water, tools, crafting, animals, settlement ambience | Layered ambience and action feedback |
| FX-10 | Interaction markers | harvest, inspect, carry, craft, build | Clear input prompts |
| FX-11 | Inventory icons | resource, tool, food, component, product | UI representation; use consistent silhouette |
| FX-12 | Map symbols | water, settlement, resource, path, biome | Navigation and discovery |

---

## 13. Data-driven resource and recipe schema

Keep game logic in data files; models should not determine recipe rules. A resource definition should contain fields similar to:

```json
{
  "id": "wood_acacia_raw",
  "displayName": "Raw Acacia Wood",
  "category": "organic_material",
  "sourceAsset": "A01",
  "state": "L1_extracted",
  "unit": "kg",
  "quality": 1.0,
  "moisture": 0.45,
  "durability": null,
  "allowedProcesses": ["dry", "split", "cut"],
  "byproducts": ["bark", "wood_chips"],
  "renewable": true,
  "regrowthRule": "tree_growth_and_ecology",
  "biomeTags": ["savanna", "dry_woodland"]
}
```

A recipe definition should contain:

- `id`, display name, input resources and quantities.
- Required tool, station, skill level, and optional blueprint.
- Work time, energy/fuel, water, and other costs.
- Output quantities, quality formula, by-products, and waste.
- Unlock condition, failure chance, and repair/recycling path.
- Region/biome restrictions when appropriate.

### Example wood chain

1. **L0:** living tree with species, size, health, age and ecological value.
2. **L1:** felled log; yield depends on trunk size, tool and skill.
3. **L2:** sorted logs, branches and bark; moisture recorded.
4. **L3:** split firewood or rough-cut boards; offcuts and chips produced.
5. **L4:** seasoned timber with species, grade, moisture and length.
6. **L5:** poles, planks, beams, door pieces and roof supports.
7. **L6:** shelter, furniture, cart or tool handle.
8. **L7:** damaged timber; repair, salvage, reuse, compost or fuel.

### Example clay chain

1. **L0:** clay deposit with depth, quantity, moisture and contamination.
2. **L1:** extracted raw clay.
3. **L2:** screened/cleaned clay, water added to desired consistency.
4. **L3:** shaped wet pot/brick.
5. **L4:** air-dried ware.
6. **L5:** fired pottery/brick; quality depends on kiln heat, fuel and duration.
7. **L6:** storage vessel, cooking pot or building component.
8. **L7:** broken ceramic; shards may be reused as aggregate or discarded.

---

## 14. Variation system: avoid asset explosion

Use parameterised variants for:

- **Geometry:** scale within limits, branch angle, canopy density, rock silhouette, pole length.
- **Material:** healthy/dry/burned, fresh/weathered, wet/dry, clean/dirty.
- **State:** standing, harvested, depleted, growing, damaged, repaired, ruined.
- **Quality:** rough/standard/fine; reflected in mesh details only when visually meaningful.
- **Season:** leaf/fruit/flower states, crop stages, soil wetness, water level.
- **Age:** seedling, young, mature, old, dead.
- **Use/wear:** pristine, worn, blunt, cracked, patched.
- **Culture/region:** use documented region-specific design sets, not arbitrary colour swaps.

Keep stable gameplay variables separate from rendering. A tree's age, health and harvest yield should live in data; the model can switch among a small number of visual states.

---

## 15. Production roadmap

### Batch 1 — Starter library already planned
- [ ] A01 acacia tree
- [ ] A02 dry savanna grass
- [ ] A03 thorny shrub
- [ ] A04 weathered rock set
- [ ] A05 fallen branch/log
- [ ] A06 papyrus/reeds
- [ ] A07 highland broadleaf tree
- [ ] A08 bamboo clump

These generators have been committed to the branch, but each output is still pending visual and game integration review.

### Batch 2 — Gatherable resources
- [ ] Loose stone and outcrop variants
- [ ] Clay deposit
- [ ] Thatch bundle
- [ ] Timber/wood bundle
- [ ] Woven basket
- [ ] Primitive stone tool
- [ ] Poles, rope/fibre and cut log states

### Batch 3 — First construction
- [ ] Thatch roof module
- [ ] Mud wall module
- [ ] Pole/beam connectors
- [ ] Door/opening module
- [ ] Basic shelter assembled from modular pieces
- [ ] Storage rack and granary prototype

### Batch 4 — Basic survival and production loop
- [ ] Fire pit and cooking pot
- [ ] Drying rack
- [ ] Grinding stone
- [ ] Clay work area and kiln
- [ ] Farm plot and first crop growth stages
- [ ] Water collection point
- [ ] One fish and one livestock animal

### Batch 5 — Living landscape
- [ ] More tree and crop species
- [ ] Small birds and pollinators
- [ ] Insects, fungi and aquatic plants
- [ ] Tracks/nests/burrows
- [ ] Seasonal and disturbed ground states

### Batch 6 — Settlement and society
- [ ] Character base rig and starter animation set
- [ ] Clothing and role variants
- [ ] Market stall, workshop and house variants
- [ ] Furniture, containers and trade goods
- [ ] Social, work and skill systems

### Batch 7 — Advanced production and regions
- [ ] Metal/ore processing and advanced tools
- [ ] Improved mills, pumps and machines
- [ ] Carts, boats and regional transport
- [ ] Additional biomes, settlement styles and regional economies
- [ ] Industrial/modern assets only if the game's progression and setting require them

---

## 16. Definition of done

For each asset, record:

- [ ] ID, name, category, intended biome and gameplay purpose.
- [ ] Variants and state transitions.
- [ ] Editable `.blend` source and runtime `.glb`.
- [ ] Dimensions, scale, origin and orientation.
- [ ] Triangle count, material count, file size and texture use.
- [ ] Collision approach and LOD/instancing strategy.
- [ ] Resource outputs, extraction method and processing level, if harvestable.
- [ ] Pivot/rig/animation notes, if movable.
- [ ] Source and commercial licence, if external content is used.
- [ ] Visual review in Blender.
- [ ] GLB material/export check.
- [ ] In-game integration test, or explicit `not_tested` status.
- [ ] Checklist and metadata updated.

**Priority principle:** Build the smallest coherent loop first: gather grass, wood, stone, clay and water; process a few materials; craft tools; assemble a shelter; grow food; store and trade goods. Expand species, machinery and settlement complexity after this loop works and performs well.
