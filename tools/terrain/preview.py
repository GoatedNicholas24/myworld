"""Optional previews (matplotlib): hillshade, biomes, rivers. Written to <out>/preview/."""
import os
import numpy as np


def load(out, name, dtype):
    return np.fromfile(os.path.join(out, name), dtype=dtype).reshape(2001, 2001)


def make(out, meta):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import LightSource, ListedColormap
    os.makedirs(os.path.join(out, "preview"), exist_ok=True)
    z = 900 + load(out, "heightmap_u16.bin", "<u2").astype(np.float32) / 65535 * 4400
    ls = LightSource(azdeg=315, altdeg=40)
    rgb = ls.shade(z, cmap=plt.cm.terrain, vert_exag=2.2, dx=10, dy=10, blend_mode="soft", vmin=900, vmax=4500)
    plt.imsave(os.path.join(out, "preview", "hillshade.png"), rgb[::2, ::2])
    biome = load(out, "biome_u8.bin", "u1")
    cmap = ListedColormap([b["paint"] for b in meta["biomes"]])
    shade = ls.hillshade(z, vert_exag=2.2, dx=10, dy=10)
    col = cmap(biome / max(1, len(meta["biomes"]) - 1))[..., :3]
    plt.imsave(os.path.join(out, "preview", "biomes.png"), (col * (0.55 + 0.45 * shade[..., None]))[::2, ::2])
    rd = load(out, "river_dist_u16.bin", "<u2")
    img = np.where((rd <= 0)[..., None], np.array([0.1, 0.35, 0.8]), (rgb[..., :3] * 0.85 + 0.1))
    plt.imsave(os.path.join(out, "preview", "rivers.png"), img[::2, ::2])


def make_water(out):
    """rivers_water.png: hillshade with lakes and every river (line width = river width) from rivers.json."""
    import json
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import LightSource
    doc = json.load(open(os.path.join(out, "rivers.json")))
    z = 900 + load(out, "heightmap_u16.bin", "<u2").astype(np.float32) / 65535 * 4400
    rgb = LightSource(315, 40).shade(z, cmap=plt.cm.terrain, vert_exag=2.2, dx=10, dy=10, blend_mode="soft", vmin=900, vmax=4500)
    fig, ax = plt.subplots(figsize=(12, 12), dpi=100)
    ax.imshow(rgb, extent=(-10, 10, 10, -10))
    for l in doc["lakes"]:
        o = np.array(l["outline"]) / 1000
        ax.fill(o[:, 0], o[:, 1], color="#2a7fff", alpha=0.85, lw=0)
    for r in doc["rivers"]:
        n = np.array(r["nodes"])
        ax.plot(n[:, 0] / 1000, n[:, 1] / 1000, color="#2a7fff", lw=max(0.5, n[:, 3].mean() / 22))
    ax.set_xlim(-10, 10)
    ax.set_ylim(10, -10)
    ax.set_xlabel("x east of centre (km)")
    ax.set_ylabel("z south of centre (km)")
    fig.savefig(os.path.join(out, "preview", "rivers_water.png"), bbox_inches="tight")
