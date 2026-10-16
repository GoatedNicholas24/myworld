#!/usr/bin/env python3
"""Generate every master map for the Great Lakes region.

    python3 tools/terrain/generate.py                 # writes public/terrain/great_lakes/
    python3 tools/terrain/generate.py --out some/dir --seed 7 --preview

Needs numpy and scipy (see requirements.txt). Same seed -> byte-identical output.
Contract: docs/TERRAIN_PIPELINE.md. Rules: data/biomes.json, data/resource_rules.json.
"""
import argparse
import hashlib
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

import landforms as L   # noqa: E402
import derive as D      # noqa: E402

H0, HSPAN = 900.0, 4400.0


def write(path, arr):
    with open(path, "wb") as f:
        f.write(np.ascontiguousarray(arr).astype("<" + arr.dtype.str[1:]).tobytes())


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(REPO, "public", "terrain", "great_lakes"))
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--preview", action="store_true", help="also write preview PNGs (needs matplotlib)")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    log = lambda m: print(f"[{time.time() - t0:6.1f}s] {m}", flush=True)

    biomes = json.load(open(os.path.join(REPO, "data", "biomes.json")))["biomes"]
    rules = json.load(open(os.path.join(REPO, "data", "resource_rules.json")))["resources"]
    resources = json.load(open(os.path.join(REPO, "data", "resources.json")))
    res_ids = set(resources)
    missing = [r["id"] for r in rules if r["id"] not in res_ids]
    assert not missing, f"rule ids not in resources.json: {missing}"

    log("heightfield")
    z, _ = L.make_heightfield(a.seed, log=log)
    log("rivers")
    z, river_dist, logA, A_up = D.rivers(z, log=log)
    z = np.clip(z, L.ELEV_FLOOR, L.ELEV_CEIL)   # cubic resampling can overshoot by a metre or two
    log("derived maps")
    slope_rr, wet, rock = D.derive_maps(z, river_dist, logA, A_up, a.seed)

    log("biomes and resource densities")
    rm = D.RuleMaps(z, slope_rr, wet, rock, river_dist, a.seed)
    biome, _, shares = D.biome_map(rm, biomes)
    dens = D.density_maps(rm, rules)

    log("writing")
    h16 = np.clip(np.round((z - H0) / HSPAN * 65535), 0, 65535).astype(np.uint16)
    slope_deg = np.degrees(np.arctan(slope_rr))
    files = {
        "heightmap_u16.bin": h16,
        "slope_u8.bin": np.clip(np.round(slope_deg * 255 / 90), 0, 255).astype(np.uint8),
        "wetness_u8.bin": np.clip(np.round(wet * 255), 0, 255).astype(np.uint8),
        "rock_u8.bin": np.clip(np.round(rock * 255), 0, 255).astype(np.uint8),
        "river_dist_u16.bin": np.clip(np.round(river_dist), 0, 2000).astype(np.uint16),
        "biome_u8.bin": biome,
    }
    for rid, m in dens.items():
        files[f"density_{rid}_u8.bin"] = m
    for name, arr in files.items():
        assert arr.shape == (L.N, L.N), (name, arr.shape)
        write(os.path.join(a.out, name), arr)

    zq = H0 + h16.astype(np.float64) / 65535 * HSPAN
    stats = {
        "elevation_m": [float(zq.min()), float(zq.max())],
        "slope_deg_max": float(slope_deg.max()),
        "river_cells_pct": float((river_dist <= 0).mean() * 100),
        "wetness_mean": float(wet.mean()), "rock_mean": float(rock.mean()),
    }
    landmark_report = []
    for name, x, y, (lo, hi), tgt, r in L.LANDMARKS:
        c, rr, w = int(x * 100), int(y * 100), 150
        patch = zq[max(0, rr - w):rr + w + 1, max(0, c - w):c + w + 1]
        landmark_report.append({"name": name, "x_km": x, "y_km_from_north": y, "design_range_m": [lo, hi],
                                "mean_m": round(float(patch.mean())), "min_m": round(float(patch.min())),
                                "max_m": round(float(patch.max()))})

    meta = {
        "name": "Great Lakes region (representative)",
        "version": 1,
        "seed": a.seed,
        "size_m": 20000, "samples": [L.N, L.N], "cell_m": 10, "chunk_m": 250, "chunks": [80, 80],
        "axes": "x east, y north, z up; row 0 north, column 0 west; row-major little-endian",
        "elevation": {"file": "heightmap_u16.bin", "type": "uint16", "formula": "900 + value / 65535 * 4400", "unit": "m"},
        "maps": {
            "slope": {"file": "slope_u8.bin", "type": "uint8", "meaning": "slope angle in degrees = value * 90 / 255"},
            "wetness": {"file": "wetness_u8.bin", "type": "uint8", "meaning": "value / 255"},
            "rock": {"file": "rock_u8.bin", "type": "uint8", "meaning": "value / 255"},
            "river_dist": {"file": "river_dist_u16.bin", "type": "uint16", "meaning": "metres to nearest river bank, capped at 2000"},
            "biome": {"file": "biome_u8.bin", "type": "uint8", "meaning": "index into biomes[]"},
        },
        "biomes": [{"index": i, "id": b["id"], "name": b["name"], "paint": b["paint"],
                    "share": round(shares[b["id"]], 4)} for i, b in enumerate(biomes)],
        "resource_density": {r["id"]: {"file": f"density_{r['id']}_u8.bin", "type": "uint8",
                                       "meaning": "rule weight 0..1 = value / 255; expected objects per km2 = weight * density_per_km2",
                                       "density_per_km2": r["density_per_km2"], "min_spacing_m": r["min_spacing_m"],
                                       **({"review": True} if r.get("review") else {})} for r in rules},
        "stats": stats,
        "landmarks": landmark_report,
        "sha256_16": {n: sha(os.path.join(a.out, n)) for n in sorted(files)},
    }
    with open(os.path.join(a.out, "terrain.json"), "w") as f:
        json.dump(meta, f, indent=2)

    total = 0
    for n in sorted(os.listdir(a.out)):
        sz = os.path.getsize(os.path.join(a.out, n))
        total += sz
        print(f"  {n:34s}{sz / 1e6:8.2f} MB")
    log(f"done: {total / 1e6:.1f} MB total")
    print("elevation", [round(v) for v in stats["elevation_m"]], "m;  biome shares:")
    for b in meta["biomes"]:
        print(f"  {b['id']:26s}{b['share'] * 100:6.1f}%")
    for l in landmark_report:
        ok = l["design_range_m"][0] <= l["mean_m"] <= l["design_range_m"][1]
        print(f"  {l['name']:28s} mean {l['mean_m']:5d}  {'OK' if ok else 'OUT OF RANGE'}")

    if a.preview:
        import preview
        preview.make(a.out, meta)


if __name__ == "__main__":
    main()
