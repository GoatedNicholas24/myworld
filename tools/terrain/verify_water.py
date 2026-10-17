#!/usr/bin/env python3
"""Read the water files back from disk and check them against each other and the heightmap.

    python3 tools/terrain/verify_water.py [DIR]      # default public/terrain/great_lakes

Independent of the generator: it only reads terrain.json, rivers.json and the .bin maps.
Exit code 1 if any check fails.
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "public", "terrain", "great_lakes")
N, CELL, HALF = 2001, 10.0, 10000.0
fails = []


def check(ok, msg):
    print(("  ok   " if ok else "  FAIL ") + msg)
    if not ok:
        fails.append(msg)


def rd(name, dt):
    a = np.fromfile(os.path.join(OUT, name), dtype=dt)
    assert a.size == N * N, (name, a.size)
    return a.reshape(N, N)


def sample(arr, x, z):
    """Bilinear sample of a master map at game coordinates (x east, z south of centre)."""
    c, r = (np.asarray(x) + HALF) / CELL, (np.asarray(z) + HALF) / CELL
    r0, c0 = np.clip(np.floor(r).astype(int), 0, N - 2), np.clip(np.floor(c).astype(int), 0, N - 2)
    fr, fc = r - r0, c - c0
    return (arr[r0, c0] * (1 - fr) * (1 - fc) + arr[r0, c0 + 1] * (1 - fr) * fc
            + arr[r0 + 1, c0] * fr * (1 - fc) + arr[r0 + 1, c0 + 1] * fr * fc)


meta = json.load(open(os.path.join(OUT, "terrain.json")))
doc = json.load(open(os.path.join(OUT, "rivers.json")))
H = 900.0 + rd("heightmap_u16.bin", "<u2").astype(np.float64) / 65535 * 4400.0
wraw = rd("water_level_u16.bin", "<u2")
W = np.where(wraw > 0, 900.0 + wraw.astype(np.float64) / 65535 * 4400.0, 0.0)
rdist = rd("river_dist_u16.bin", "<u2")
rivers, lakes = doc["rivers"], doc["lakes"]
rid = {r["id"]: r for r in rivers}
lid = {l["id"]: l for l in lakes}

print("structure")
check(doc["version"] == 1 and doc["world_size_m"] == 20000, "rivers.json header")
check(len(lakes) == 4, f"four lakes ({len(lakes)})")
check(len(rid) == len(rivers), "river ids unique")
check("water" in meta and "water_level" in meta["maps"], "terrain.json has the water section and map entry")
check(meta["water"]["rivers"]["count"] == len(rivers), "terrain.json river count matches rivers.json")
check(all(len(n) == 5 for r in rivers for n in r["nodes"]), "every node is [x, z, surface, width, depth]")
allp = np.array([n for r in rivers for n in r["nodes"]])
check(np.abs(allp[:, 0]).max() <= HALF + 0.1 and np.abs(allp[:, 1]).max() <= HALF + 0.1, "all nodes inside the world")
check(np.isfinite(allp).all(), "no NaN or inf")

print("dimensions")
wmax = allp[:, 3].max()
check(abs(wmax - 300.0) < 0.6, f"widest river is Nile-class: {wmax:.1f} m")
widest = {r["id"] for r in rivers if max(n[3] for n in r["nodes"]) > 0.9 * wmax}
check(len(widest) == 1, f"exactly one river is within 10% of the widest ({sorted(widest)})")
check(abs(allp[:, 4].max() - 8.0) < 0.05, f"deepest river {allp[:, 4].max():.2f} m")
check(allp[:, 3].min() >= 2.0 and allp[:, 4].min() >= 0.3, f"smallest stream {allp[:, 3].min():.1f} m wide, {allp[:, 4].min():.2f} m deep")
narrow = allp[allp[:, 3] <= 5.0]
check(len(narrow) > 500 and narrow[:, 4].max() <= 0.95, f"{len(narrow)} nodes are wadable stream (<=5 m wide, <={narrow[:, 4].max():.2f} m deep)")
cls = {}
for r in rivers:
    cls[r["class"]] = cls.get(r["class"], 0) + 1
check(set(cls) == {"stream", "small", "medium", "large", "great"}, f"all five classes in use {cls}")
w_by_len = np.sort(allp[:, 3])
check(np.percentile(w_by_len, 50) < 10 and (allp[:, 3] > 100).mean() < 0.04, f"most river is small ({np.percentile(w_by_len, 50):.1f} m median), big water is rare ({(allp[:, 3] > 100).mean() * 100:.1f}% of nodes over 100 m)")

print("flow")
bad_fall = bad_mouth = bad_pos = 0
for r in rivers:
    n = np.array(r["nodes"])
    if (np.diff(n[:, 2]) > -0.0009).any():
        bad_fall += 1
    f = r["flows_into"]
    if f["type"] == "river":
        p = rid[f["id"]]["nodes"][f["node"]]
        if abs(p[2] - n[-1, 2]) > 0.006:
            bad_mouth += 1
        if np.hypot(p[0] - n[-1, 0], p[1] - n[-1, 1]) > 0.2:
            bad_pos += 1
        if rid[f["id"]]["drained_km2"][1] < r["drained_km2"][1]:
            bad_mouth += 1
    elif f["type"] == "lake":
        if abs(n[-1, 2] - lid[f["id"]]["level_m"]) > 0.006:
            bad_mouth += 1
    if r["source"]["type"] == "lake":
        if abs(n[0, 2] - lid[r["source"]["id"]]["level_m"]) > 0.006:
            bad_mouth += 1
check(bad_fall == 0, f"surface falls on every step of every river ({bad_fall} rivers fail)")
check(bad_mouth == 0, f"mouths meet the parent river / lake surface exactly ({bad_mouth} fail)")
check(bad_pos == 0, f"tributary mouths sit on the parent's node ({bad_pos} fail)")
check(all(r["flows_into"]["type"] != "edge" or abs(max(abs(r["nodes"][-1][0]), abs(r["nodes"][-1][1])) - HALF) < 1.0 for r in rivers),
      "rivers that leave the map end exactly on its edge")
trunk = max(rivers, key=lambda r: r["drained_km2"][1])
check(trunk["flows_into"]["type"] == "edge" and trunk["drained_km2"][1] > 200, f"the trunk ({trunk['id']}) drains {trunk['drained_km2'][1]} km2 off the map")

print("rivers against the heightmap")
wet_ok, tot = 0, 0
gaps = []
for r in rivers:
    n = np.array(r["nodes"])
    if len(n) < 8:
        continue
    t = np.gradient(n[:, :2], axis=0)
    t /= np.maximum(np.hypot(t[:, 0], t[:, 1]), 1e-9)[:, None]
    for k in range(2, len(n) - 2, 2):
        x, z, s, w, d = n[k]
        c, rr = int(round((x + HALF) / CELL)), int(round((z + HALF) / CELL))
        if not (1 <= c < N - 1 and 1 <= rr < N - 1):
            continue
        tot += 1
        if H[rr - 1:rr + 2, c - 1:c + 2].min() <= s - 0.4 * d:
            wet_ok += 1
        off = w / 2 + 12.0
        for sg in (1, -1):
            px, pz = x - sg * t[k, 1] * off, z + sg * t[k, 0] * off
            if W[int(np.clip(round((pz + HALF) / CELL), 0, N - 1)), int(np.clip(round((px + HALF) / CELL), 0, N - 1))] > 0:
                continue       # that side is itself water (a lake next to a river mouth)
            gaps.append(s - sample(H, px, pz))
check(wet_ok / tot > 0.97, f"a carved bed lies under the river line ({wet_ok / tot * 100:.1f}% of {tot} nodes)")
g = np.array(gaps)
check((g > 0.15).mean() < 0.06 and (g > 1.0).mean() < 0.012 and (g > 5.0).mean() < 0.002,
      f"banks hold the water: ground beside the river is below the surface by >0.15 m on {(g > 0.15).mean() * 100:.1f}% of sides, >1 m on {(g > 1).mean() * 100:.2f}%, >5 m on {(g > 5).mean() * 100:.3f}%")
above = []
for r in rivers:
    n = np.array(r["nodes"])
    if r["class"] in ("medium", "large", "great"):
        for x, z, s, w, d in n[::2]:
            if w >= 24:
                above.append(sample(H, x, z) - s)
above = np.array(above)
check(np.percentile(above, 99) < 0.2, f"big rivers: the ground at the centreline is under the water (99th pct {np.percentile(above, 99):.2f} m, max {above.max():.2f} m)")

print("water_level map")
wet = W > 0
check(wet.sum() > 15e6 / 100 / 3, f"water covers {wet.mean() * 100:.2f}% of the map")
viol = (H[wet] > W[wet] + 0.15).mean()
check(viol < 0.002, f"under water the ground is below the surface ({viol * 100:.3f}% of cells higher by > 0.15 m)")
check((rdist[wet] == 0).all(), "river_dist is 0 in every water cell")
dens_ok = True
for rid_, info in meta["resource_density"].items():
    dm = np.fromfile(os.path.join(OUT, info["file"]), dtype="u1").reshape(N, N)
    if dm[wet].max() != 0:
        dens_ok = False
check(dens_ok, "no resource density under water")

print("lakes")
from scipy import ndimage  # noqa: E402  (only needed here)
sizes = []
for l in lakes:
    lvl = l["level_m"]
    q = np.round((lvl - 900.0) / 4400.0 * 65535)
    m = np.abs(wraw.astype(np.int64) - q) <= 1
    # the lake body: the biggest component at this level
    lb, kk = ndimage.label(m)
    cnt = np.bincount(lb.ravel())[1:]
    area = cnt.max() * CELL * CELL / 1e6
    sizes.append(area)
    check(abs(area - l["area_km2"]) / l["area_km2"] < 0.03, f"{l['id']}: area on the map {area:.2f} km2 vs {l['area_km2']} in rivers.json")
    body = lb == (1 + int(np.argmax(cnt)))
    ring = ndimage.binary_dilation(body, iterations=3) & ~ndimage.binary_dilation(body, iterations=1)
    # leaks: bank cells below the surface, apart from places a river runs in or out
    nodes = np.array([n for r in rivers for n in r["nodes"] if True])
    low = ring & (H < lvl + 0.02)
    rr, cc = np.nonzero(low)
    near_river = 0
    for a_, b_ in zip(rr.tolist(), cc.tolist()):
        x, z = b_ * CELL - HALF, a_ * CELL - HALF
        if (np.hypot(nodes[:, 0] - x, nodes[:, 1] - z) < 1.1 * nodes[:, 3] + 45).any():
            near_river += 1
    leak = len(rr) - near_river
    check(leak <= 0.003 * ring.sum() + 3, f"{l['id']}: banks hold the water ({leak} of {int(ring.sum())} bank cells below the surface, {near_river} at river mouths)")
    check(abs(float(np.median(H[body])) - lvl) < l["max_depth_m"], f"{l['id']}: lake bed is below the surface (deepest {lvl - H[body].min():.1f} m)")
check(sizes[0] > 2.5 * max(sizes[1:]) and sizes[0] > 10, f"one large lake ({sizes[0]:.1f} km2) then smaller ones {[round(s, 2) for s in sizes[1:]]}")
check(sorted(sizes, reverse=True) == [sizes[0]] + sorted(sizes[1:], reverse=True) , "lakes shrink in size")
check(all(l["outflow"] in rid for l in lakes), "every lake has an outflow river")
check(all(len(l["outline"]) > 20 for l in lakes), "every lake has an outline polygon")

print("orientation")
# the trunk must run through the low south-west; its end is on the south edge
end = trunk["nodes"][-1]
check(end[1] > 9990 and end[0] < -5000, f"trunk leaves at the south-west ({end[0]:.0f}, {end[1]:.0f})")
big = lid["lake_great"]
check(big["centre"][0] < 0 and big["centre"][1] > 3000, f"big lake is in the south-west (centre {big['centre']})")

print(f"\n{len(fails)} check(s) failed")
sys.exit(1 if fails else 0)
