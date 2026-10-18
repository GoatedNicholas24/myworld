"""
Great Lakes region terrain for My World (Blender 5.x, EEVEE).

Builds a 20 km x 20 km representative terrain from the design landmarks, paints it
with vertex colours, and sets up the lighting (sky, sun, haze, four moods).
No trees, water or props yet.

Run inside Blender (Scripting tab: open this file and press Run). It creates a new
scene called "GreatLakes" and leaves your other scenes alone.

After running, in Blender's Python console:
    render_view('hero', 'golden', r"C:\\temp\\hero_golden.png")
    export_data(r"C:\\path\\to\\myworld\\public\\terrain\\great_lakes")
    export_glb(r"C:\\temp\\great_lakes.glb")

Coordinates: X east, Y north, Z up, in metres. The terrain is centred on the origin.
Z = elevation - 900 m. The object is scaled 1.5x in Z for the renders only; the
exporters ignore that scale.
"""
import bpy, math, os, json, time
import numpy as np
from mathutils import Vector

N = 512                       # vertices per side (about 39 m between vertices)
SIZE = 20000.0                # metres
CELL = SIZE / (N - 1)
Z0 = 900.0                    # elevation that sits at Z = 0
EXAG = 1.5                    # vertical exaggeration used only for the Blender renders
ELEV_LO, ELEV_HI = 900.0, 5300.0   # range encoded in heightmap_u16.bin
NS = bpy.app.driver_namespace

# Design landmarks: name, x km, y km (from the north edge), elevation range in metres
LANDMARKS = [
    ("Mount Rwenzori-like Range", 10, 3, 3000, 5200), ("Northern Highlands", 4, 4, 1800, 2800),
    ("Eastern Highlands", 17, 6, 1600, 2600), ("Western Plateau", 3, 10, 1500, 2400),
    ("Central Valley", 10, 10, 1000, 1500), ("Rift Escarpment", 17, 11, 1200, 2200),
    ("Savannah Plains", 5, 17, 900, 1400), ("Southern Hills", 9, 16, 1000, 1800),
    ("Forest Plateau", 15, 18, 1400, 2200),
]

# ---------------------------------------------------------------- noise helpers
def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def noise2(x, y, freq, seed):
    rng = np.random.default_rng(seed)
    gs = int(freq * 20) + 4
    lat = rng.random((gs, gs)).astype(np.float32)
    px = x * freq; py = y * freq
    xi = np.floor(px).astype(np.int32); yi = np.floor(py).astype(np.int32)
    xf = px - xi; yf = py - yi
    u = xf * xf * (3 - 2 * xf); v = yf * yf * (3 - 2 * yf)
    xi = xi % (gs - 1); yi = yi % (gs - 1)
    a = lat[yi, xi]; b = lat[yi, xi + 1]; c = lat[yi + 1, xi]; d = lat[yi + 1, xi + 1]
    top = a + (b - a) * u; bot = c + (d - c) * u
    return top + (bot - top) * v

def fbm(x, y, freq, octv, seed, gain=0.5):
    s = 0; amp = 1; tot = 0
    for i in range(octv):
        s = s + amp * (noise2(x, y, freq * 2 ** i, seed + i * 17) - 0.5) * 2
        tot += amp; amp *= gain
    return s / tot

def ridged(x, y, freq, octv, seed):
    s = 0; amp = 1; tot = 0
    for i in range(octv):
        n = 1 - np.abs(noise2(x, y, freq * 2 ** i, seed + i * 31) * 2 - 1)
        s = s + amp * n * n; tot += amp; amp *= 0.5
    return s / tot

def thermal(h, it, T):
    n = h.shape[0]
    for _ in range(it):
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            hp = np.pad(h, 1, mode='edge')
            nb = hp[1 + dy:1 + dy + n, 1 + dx:1 + dx + n]
            m = np.maximum(h - nb - T, 0) * 0.2
            h = h - m
            acc = np.zeros((n + 2, n + 2), h.dtype)
            acc[1 + dy:1 + dy + n, 1 + dx:1 + dx + n] += m
            h = h + acc[1:-1, 1:-1]
    return h

# ---------------------------------------------------------------- heightfield
def make_heightfield():
    kx = np.linspace(0, 20, N, dtype=np.float32)
    X, Y = np.meshgrid(kx, kx)                      # X east (km), Y south (km); row 0 = north edge
    XW = X + 1.0 * fbm(X, Y, 0.22, 3, 11)
    YW = Y + 1.0 * fbm(X, Y, 0.22, 3, 12)
    def G(cx, cy, sx, sy):
        return np.exp(-(((XW - cx) / sx) ** 2 + ((YW - cy) / sy) ** 2))

    h = 1000 + 230 * fbm(XW, YW, 0.18, 3, 1)
    hill = fbm(XW, YW, 0.75, 4, 2)
    S = G(9, 16, 3.2, 2.4); plains = G(5, 17, 4.2, 3.2)
    Pw = smooth(.28, .52, G(3, 10, 3.0, 4.4) + 0.16 * fbm(XW, YW, 0.9, 3, 41))
    Pf = smooth(.28, .52, G(15, 18, 3.4, 2.6) + 0.16 * fbm(XW, YW, 0.9, 3, 42))
    Nh = G(4, 4, 3.2, 2.8); Eh = G(17, 6, 2.6, 3.2)
    R = G(10, 3.2, 4.6, 2.3); R2 = G(9.6, 2.6, 2.4, 1.2); R3 = G(12.4, 3.6, 1.7, 1.2)
    rid = ridged(XW, YW, 0.8, 5, 40)
    flat = np.clip(Pw + Pf + 0.8 * plains, 0, 1)

    h = h + hill * (60 + 240 * S + 60 * (1 - flat)) * (1 - 0.75 * flat)
    h = h + 750 * Pw + 550 * Pf - 250 * plains
    h = h + 900 * Nh + 420 * rid * Nh
    h = h + 700 * Eh + 300 * rid * Eh
    h = h + 2000 * R + 2600 * R2 + 1500 * R3 + 1250 * rid * R ** 1.2

    xr = 9.6 + 1.6 * np.sin(0.62 * Y + 0.4) + 0.7 * np.sin(1.45 * Y + 2.0) + 0.10 * (Y - 5)   # river line
    dxr = np.abs(X - xr)
    rs = smooth(4.8, 6.2, Y)
    Vc = np.exp(-(dxr / 1.7) ** 2) * smooth(5.5, 8.5, Y)
    h = h - 330 * G(10, 10, 2.6, 3.4) - 220 * Vc

    xe = 16.9 + 0.6 * fbm(XW, YW, 0.7, 3, 50)               # wavy rift escarpment
    ey = smooth(6.0, 8.5, Y) * (1 - smooth(15.0, 17.5, Y))
    step = smooth(-0.35, 0.35, X - xe)
    h = h + 500 * smooth(13.0, 16.4, X) * (1 - step) * ey
    h = h - 700 * step * ey

    h = thermal(h.astype(np.float32), 18, math.tan(math.radians(40)) * CELL)
    h = h - 16 * np.exp(-(dxr / 0.09) ** 2) * rs

    # dissected ridges, gullies and rolling lowlands
    gy0, gx0 = np.gradient(h, CELL); slope0 = np.sqrt(gx0 ** 2 + gy0 ** 2)
    mount = smooth(1700, 3600, h)
    h = h + (ridged(XW, YW, 1.1, 5, 201) - 0.45) * (90 + 560 * mount) \
          + (ridged(XW, YW, 3.2, 3, 203) - 0.45) * np.clip(slope0, 0, 1.2) * 150 \
          + fbm(XW, YW, 1.4, 3, 202) * 55 * (1 - mount)
    h = thermal(h.astype(np.float32), 6, math.tan(math.radians(42)) * CELL)
    h = h - 10 * np.exp(-(dxr / 0.09) ** 2) * rs
    h = h + 110 * (1 - smooth(1500, 2500, h))
    h = h - 50 * np.exp(-(dxr / 0.25) ** 2) * smooth(9, 20, Y)
    d = np.maximum(1100 - h, 0)
    h = h + d - 170 * (1 - np.exp(-d / 170))                  # soft floor near 930 m
    hm = float(h.max())
    if hm > 3500:
        h = np.where(h > 3500, 3500 + (h - 3500) * (1700.0 / (hm - 3500)), h)   # highest peak = 5200 m
    aux = dict(X=X, Y=Y, XW=XW, YW=YW, xr=xr, dxr=dxr, rs=rs, Vc=Vc, plains=plains)
    return h.astype(np.float32), aux

# ---------------------------------------------------------------- painting (vertex colours)
def lin(hx):
    c = np.array([int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)

def mix(a, b, t):
    t = np.asarray(t)[..., None]
    return a * (1 - t) + b * t

def box_blur(a, r, passes=2):
    k = 2 * r + 1
    for _ in range(passes):
        for ax in (0, 1):
            p = np.pad(a, [(r, r) if i == ax else (0, 0) for i in (0, 1)], mode='edge')
            c = np.cumsum(p, axis=ax, dtype=np.float64); c = np.insert(c, 0, 0, axis=ax)
            hi = [slice(None)] * 2; lo = [slice(None)] * 2
            hi[ax] = slice(k, None); lo[ax] = slice(0, -k)
            a = ((c[tuple(hi)] - c[tuple(lo)]) / k).astype(np.float32)
    return a

def paint(h, aux):
    X, Y, XW, YW, dxr, rs, Vc, plains = [aux[k] for k in ('X', 'Y', 'XW', 'YW', 'dxr', 'rs', 'Vc', 'plains')]
    c_gold, c_dry, c_green, c_forest = lin("#ecc04c"), lin("#d99b3a"), lin("#7bb83f"), lin("#2f7a43")
    c_farmA, c_farmB, c_tundra = lin("#a3d14a"), lin("#dcc24d"), lin("#a08f58")
    c_rockL, c_rockL2, c_rockH, c_snow, c_mud = lin("#b0583c"), lin("#d28a4e"), lin("#857b8e"), lin("#f8f4fb"), lin("#5a4331")
    gy, gx = np.gradient(h, CELL); slope = np.sqrt(gx ** 2 + gy ** 2)
    moist = 0.72 + 0.30 * fbm(XW, YW, 0.5, 3, 60) + 0.25 * smooth(1500, 2500, h) - 0.65 * plains \
            + 0.30 * Vc + 0.25 * np.exp(-(dxr / 0.5) ** 2) * rs
    moist = np.clip(moist, 0, 1)
    col = mix(mix(c_dry, c_gold, smooth(0.0, 0.3, moist)), c_green, smooth(0.35, 0.70, moist))
    forest = smooth(0.55, 0.8, moist) * smooth(1300, 1700, h) * (1 - smooth(2800, 3300, h)) * (1 - smooth(0.5, 0.9, slope))
    col = mix(col, c_forest, forest * 0.9)
    farm = smooth(0.0, 0.5, Vc) * (1 - smooth(0.15, 0.4, slope))
    q = np.floor(noise2(XW, YW, 2.5, 70) * 5) / 5
    col = mix(col, mix(c_farmA, c_farmB, q), farm * 0.8)
    tundra = smooth(2600, 3200, h) * (1 - smooth(3600, 4100, h))
    col = mix(col, c_tundra, tundra * 0.85)
    rock = np.maximum(smooth(0.72, 1.35, slope), 0.85 * smooth(3300, 4100, h))
    rock = np.clip(rock * (0.85 + 0.30 * (fbm(XW, YW, 2.5, 3, 82) * 0.5 + 0.5)), 0, 1)
    strata = 0.5 + 0.5 * np.sin(h * 0.055 + 6 * fbm(XW, YW, 1.5, 2, 81))
    rockcol = mix(mix(c_rockL, c_rockL2, 0.25 + 0.5 * strata), c_rockH, smooth(2600, 3800, h))
    col = mix(col, rockcol, rock)
    snow = smooth(3850, 4350, h + 300 * fbm(XW, YW, 1.2, 3, 90)) * (1 - 0.85 * smooth(0.9, 1.5, slope))
    col = mix(col, c_snow, snow)
    col = mix(col, c_mud, np.exp(-(dxr / 0.12) ** 2) * rs * 0.9)
    cav = box_blur(h, 8, 2) - h                                  # baked cavity: valleys darker, ridges lighter
    ao = 1 - 0.38 * np.clip(cav / 70, 0, 1) + 0.12 * np.clip(-cav / 70, 0, 1)
    col = col * ao[..., None] * (1 + 0.07 * fbm(X, Y, 8, 2, 95))[..., None]
    return np.concatenate([np.clip(col, 0, 1), np.ones((N, N, 1), np.float32)], axis=2).astype(np.float32)

# ---------------------------------------------------------------- moods
def lin3(hx):
    c = [int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return (c[0], c[1], c[2], 1.0)

# el = sun height above the horizon (deg), az = compass direction of the sun (deg, 0 = north, 90 = east)
MOODS = {
 'golden':   dict(el=17, az=235, sun='#ffb868', energy=7.0, ang=1.2, hor='#ffb98a', mid='#f27fa8', zen='#3a3a9a', glow='#ffa050', haze='#f2b79e', sky=0.60, exp=0.0),
 'midday':   dict(el=60, az=200, sun='#fff2dc', energy=4.5, ang=1.0, hor='#cfe8ff', mid='#8ec2ff', zen='#2c74d6', glow='#fff0c8', haze='#bcd9f0', sky=0.95, exp=-0.2),
 'overcast': dict(el=48, az=200, sun='#e8eeff', energy=0.9, ang=9.0, hor='#aab2bd', mid='#9aa3b0', zen='#7e8896', glow='#0d0d10', haze='#b2b9c3', sky=1.4, exp=0.3),
 'dawn':     dict(el=7,  az=80,  sun='#ffa890', energy=5.0, ang=2.0, hor='#ffc8a8', mid='#d890d0', zen='#4a3d9a', glow='#ff9a80', haze='#e6b8cc', sky=0.70, exp=0.0),
}

def apply_mood(name):
    m = MOODS[name]; nd = NS['gl_nodes']; sc = bpy.data.scenes["GreatLakes"]
    e, a = math.radians(m['el']), math.radians(m['az'])
    sv = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
    nd['sun'].rotation_euler = (-sv).to_track_quat('-Z', 'Y').to_euler()
    ld = nd['ld']; ld.energy = m['energy']; ld.color = lin3(m['sun'])[:3]; ld.angle = math.radians(m['ang'])
    el = nd['ramp'].color_ramp.elements
    el[0].position = 0.0;  el[0].color = lin3(m['hor'])
    el[1].position = 0.35; el[1].color = lin3(m['mid'])
    el[2].position = 1.0;  el[2].color = lin3(m['zen'])
    nd['dot'].inputs[1].default_value = tuple(sv)
    nd['glow'].outputs[0].default_value = lin3(m['glow'])
    nd['bg'].inputs['Strength'].default_value = m['sky']
    nd['hz'].outputs[0].default_value = lin3(m['haze'])
    nd['em'].inputs['Strength'].default_value = m['sky']
    sc.view_settings.exposure = m['exp']

# ---------------------------------------------------------------- scene
def build_scene(h, rgba, aux):
    for w in bpy.context.window_manager.windows:
        if w.scene.name == "GreatLakes":
            w.scene = [s for s in bpy.data.scenes if s.name != "GreatLakes"][0]
    for ob in [o for o in bpy.data.objects if o.name.startswith("GL_")]: bpy.data.objects.remove(ob, do_unlink=True)
    for s in [s for s in bpy.data.scenes if s.name == "GreatLakes"]: bpy.data.scenes.remove(s)
    for m in [m for m in bpy.data.meshes if m.name.startswith("GL_")]: bpy.data.meshes.remove(m)
    for m in [m for m in bpy.data.materials if m.name.startswith("GL_")]: bpy.data.materials.remove(m)
    for x in [x for x in bpy.data.worlds if x.name.startswith("GL_")]: bpy.data.worlds.remove(x)
    for x in [x for x in bpy.data.lights if x.name.startswith("GL_")]: bpy.data.lights.remove(x)
    for x in [x for x in bpy.data.cameras if x.name.startswith("GL_")]: bpy.data.cameras.remove(x)
    sc = bpy.data.scenes.new("GreatLakes")
    X, Y = aux['X'], aux['Y']

    # mesh
    co = np.stack([(X * 1000 - 10000).ravel(), (10000 - Y * 1000).ravel(), (h - Z0).ravel()], 1).astype(np.float32)
    idx = np.arange(N * N).reshape(N, N)
    quads = np.stack([idx[:-1, :-1].ravel(), idx[1:, :-1].ravel(), idx[1:, 1:].ravel(), idx[:-1, 1:].ravel()], 1)
    me = bpy.data.meshes.new("GL_Terrain")
    me.from_pydata(co.tolist(), [], quads.tolist()); me.update()
    try: me.polygons.foreach_set("use_smooth", np.ones(len(me.polygons), dtype=bool))
    except Exception: pass
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT"); ca.data.foreach_set("color", rgba.reshape(-1))
    terrain = bpy.data.objects.new("GL_Terrain", me); sc.collection.objects.link(terrain)
    terrain.scale = (1, 1, EXAG)
    terrain["size_m"] = SIZE; terrain["z_offset_m"] = Z0; terrain["render_vertical_exaggeration"] = EXAG
    terrain["min_elev_m"] = float(h.min()); terrain["max_elev_m"] = float(h.max())

    # render settings
    sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = 1600, 900
    for o, n, v in ((sc.eevee, 'taa_render_samples', 24), (sc.eevee, 'use_raytracing', True)):
        try: setattr(o, n, v)
        except Exception: pass
    sc.view_settings.view_transform = 'AgX'
    try:
        vs = sc.view_settings; vs.use_curve_mapping = True
        cv = vs.curve_mapping.curves[3]
        cv.points.new(0.25, 0.20); cv.points.new(0.75, 0.82); vs.curve_mapping.update()
    except Exception: pass

    # sky: gradient dome + sun glow + sun disc (same idea as the game's sky.js)
    w = bpy.data.worlds.new("GL_World"); sc.world = w; w.use_nodes = True
    wt = w.node_tree; wt.nodes.clear(); WN, WL = wt.nodes, wt.links
    def wn(t):
        return WN.new(t)
    tc = wn('ShaderNodeTexCoord')
    nrm = wn('ShaderNodeVectorMath'); nrm.operation = 'NORMALIZE'; WL.new(tc.outputs['Object'], nrm.inputs[0])
    sep = wn('ShaderNodeSeparateXYZ'); WL.new(nrm.outputs['Vector'], sep.inputs[0])
    mr = wn('ShaderNodeMapRange'); mr.clamp = True; mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = 0.8
    WL.new(sep.outputs['Z'], mr.inputs['Value'])
    ramp = wn('ShaderNodeValToRGB'); WL.new(mr.outputs['Result'], ramp.inputs['Fac']); ramp.color_ramp.elements.new(0.35)
    dot = wn('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    WL.new(nrm.outputs['Vector'], dot.inputs[0]); dot.inputs[1].default_value = (0, 1, 0)
    def wmath(op, b=None, src=None):
        m = wn('ShaderNodeMath'); m.operation = op
        if src is not None: WL.new(src, m.inputs[0])
        if b is not None: m.inputs[1].default_value = b
        return m
    dmax = wmath('MAXIMUM', 0.0, dot.outputs['Value'])
    g1s = wmath('MULTIPLY', 0.35, wmath('POWER', 6.0, dmax.outputs[0]).outputs[0])
    g2s = wmath('MULTIPLY', 1.5, wmath('POWER', 90.0, dmax.outputs[0]).outputs[0])
    dm = wn('ShaderNodeMapRange'); dm.clamp = True
    dm.inputs['From Min'].default_value = math.cos(math.radians(2.2)); dm.inputs['From Max'].default_value = math.cos(math.radians(1.0))
    WL.new(dot.outputs['Value'], dm.inputs['Value'])
    ds = wmath('MULTIPLY', 30.0, dm.outputs['Result'])
    s1 = wmath('ADD', None, g1s.outputs[0]); WL.new(g2s.outputs[0], s1.inputs[1])
    s2 = wmath('ADD', None, s1.outputs[0]); WL.new(ds.outputs[0], s2.inputs[1])
    glow = wn('ShaderNodeRGB')
    mixw = wn('ShaderNodeMix'); mixw.data_type = 'RGBA'; mixw.blend_type = 'ADD'; mixw.clamp_factor = False
    WL.new(s2.outputs[0], mixw.inputs[0]); WL.new(ramp.outputs['Color'], mixw.inputs[6]); WL.new(glow.outputs[0], mixw.inputs[7])
    bg = wn('ShaderNodeBackground'); WL.new(mixw.outputs[2], bg.inputs['Color'])
    wo = wn('ShaderNodeOutputWorld'); WL.new(bg.outputs['Background'], wo.inputs['Surface'])

    # sun
    ld = bpy.data.lights.new("GL_Sun", 'SUN'); sun = bpy.data.objects.new("GL_Sun", ld); sc.collection.objects.link(sun)

    # terrain material: painted colours + fine noise + distance haze + valley mist
    mat = bpy.data.materials.new("GL_TerrainMat"); mat.use_nodes = True
    mt = mat.node_tree; mt.nodes.clear(); MN, ML = mt.nodes, mt.links
    def mn(t):
        return MN.new(t)
    at = mn('ShaderNodeAttribute'); at.attribute_type = 'GEOMETRY'; at.attribute_name = 'Col'
    tco = mn('ShaderNodeTexCoord')
    nz = mn('ShaderNodeTexNoise'); nz.noise_dimensions = '3D'; nz.inputs['Scale'].default_value = 0.012
    nz.inputs['Detail'].default_value = 6.0; nz.inputs['Roughness'].default_value = 0.6
    ML.new(tco.outputs['Object'], nz.inputs['Vector'])
    nmr = mn('ShaderNodeMapRange'); nmr.inputs['To Min'].default_value = 0.86; nmr.inputs['To Max'].default_value = 1.14
    ML.new(nz.outputs['Fac'], nmr.inputs['Value'])
    mm = mn('ShaderNodeMix'); mm.data_type = 'RGBA'; mm.blend_type = 'MULTIPLY'; mm.inputs[0].default_value = 1.0
    ML.new(at.outputs['Color'], mm.inputs[6]); ML.new(nmr.outputs['Result'], mm.inputs[7])
    pb = mn('ShaderNodeBsdfPrincipled'); pb.inputs['Roughness'].default_value = 0.95
    for k in ('Specular IOR Level', 'Specular'):
        if k in pb.inputs: pb.inputs[k].default_value = 0.05
    ML.new(mm.outputs[2], pb.inputs['Base Color'])
    cam_d = mn('ShaderNodeCameraData')
    dmap = mn('ShaderNodeMapRange'); dmap.clamp = True; dmap.inputs['From Min'].default_value = 9000; dmap.inputs['From Max'].default_value = 110000
    ML.new(cam_d.outputs['View Z Depth'], dmap.inputs['Value'])
    dpow = mn('ShaderNodeMath'); dpow.operation = 'POWER'; dpow.inputs[1].default_value = 1.5; ML.new(dmap.outputs['Result'], dpow.inputs[0])
    dmul = mn('ShaderNodeMath'); dmul.operation = 'MULTIPLY'; dmul.inputs[1].default_value = 0.70; ML.new(dpow.outputs[0], dmul.inputs[0])
    sepz = mn('ShaderNodeSeparateXYZ'); ML.new(tco.outputs['Object'], sepz.inputs[0])
    zmap = mn('ShaderNodeMapRange'); zmap.clamp = True
    zmap.inputs['From Min'].default_value = 150; zmap.inputs['From Max'].default_value = 1400
    zmap.inputs['To Min'].default_value = 1.0; zmap.inputs['To Max'].default_value = 0.0
    ML.new(sepz.outputs['Z'], zmap.inputs['Value'])
    dmap2 = mn('ShaderNodeMapRange'); dmap2.clamp = True; dmap2.inputs['From Min'].default_value = 5000; dmap2.inputs['From Max'].default_value = 24000
    ML.new(cam_d.outputs['View Z Depth'], dmap2.inputs['Value'])
    mist = mn('ShaderNodeMath'); mist.operation = 'MULTIPLY'; ML.new(zmap.outputs['Result'], mist.inputs[0]); ML.new(dmap2.outputs['Result'], mist.inputs[1])
    mist2 = mn('ShaderNodeMath'); mist2.operation = 'MULTIPLY'; mist2.inputs[1].default_value = 0.12; ML.new(mist.outputs[0], mist2.inputs[0])
    fog = mn('ShaderNodeMath'); fog.operation = 'ADD'; fog.use_clamp = True
    ML.new(dmul.outputs[0], fog.inputs[0]); ML.new(mist2.outputs[0], fog.inputs[1])
    hz = mn('ShaderNodeRGB'); em = mn('ShaderNodeEmission'); ML.new(hz.outputs[0], em.inputs['Color'])
    msh = mn('ShaderNodeMixShader'); ML.new(fog.outputs[0], msh.inputs[0]); ML.new(pb.outputs['BSDF'], msh.inputs[1]); ML.new(em.outputs[0], msh.inputs[2])
    mo = mn('ShaderNodeOutputMaterial'); ML.new(msh.outputs[0], mo.inputs['Surface'])
    me.materials.append(mat)
    NS['gl_nodes'] = dict(sun=sun, ld=ld, ramp=ramp, dot=dot, glow=glow, bg=bg, hz=hz, em=em)

    # cameras
    def make_cam(name, loc, target, lens):
        cd = bpy.data.cameras.new(name); cd.lens = lens; cd.clip_start = 5; cd.clip_end = 150000
        co_ = bpy.data.objects.new(name, cd); co_.location = loc
        co_.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        sc.collection.objects.link(co_); return co_
    cams = {'hero': make_cam("GL_Cam_Hero", (-15000, -17500, 8800), (500, 1500, 1300), 32),
            'front': make_cam("GL_Cam_Front", (-2500, -20500, 6500), (0, 2500, 1800), 30),
            'valley': make_cam("GL_Cam_Valley", (-300, -3500, 420), (0, 8000, 3300), 24)}
    sc.camera = cams['hero']
    NS['gl_cams'] = cams
    apply_mood('golden')
    return sc

def show_in_viewport(camkey='hero'):
    sc = bpy.data.scenes["GreatLakes"]; sc.camera = NS['gl_cams'][camkey]
    for w in bpy.context.window_manager.windows:
        w.scene = sc
        for a in w.screen.areas:
            if a.type in ('VIEW_3D', 'IMAGE_EDITOR'):
                a.ui_type = 'VIEW_3D'; sp = a.spaces[0]
                sp.shading.type = 'RENDERED'; sp.overlay.show_overlays = False
                sp.clip_end = 150000; sp.region_3d.view_perspective = 'CAMERA'
                sp.region_3d.view_camera_zoom = 22; a.tag_redraw()
                return True
    return False

# ---------------------------------------------------------------- render + export helpers
def render_view(camkey, mood, path):
    """Full EEVEE render of one camera in one mood to a PNG."""
    sc = bpy.data.scenes["GreatLakes"]
    apply_mood(mood); sc.camera = NS['gl_cams'][camkey]
    sc.render.filepath = path; sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True, scene="GreatLakes")
    return path

def export_data(folder):
    """Heightmap + colour map + metadata for the game (engine builds its own chunks and LODs)."""
    os.makedirs(folder, exist_ok=True)
    h = NS['gl_h_final']; rgba = NS['gl_rgba']
    u16 = np.round((h - ELEV_LO) / (ELEV_HI - ELEV_LO) * 65535).astype('<u2')
    u16.tofile(os.path.join(folder, "heightmap_u16.bin"))
    c = np.clip(rgba[..., :3], 0, 1)
    srgb = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
    np.round(srgb * 255).astype(np.uint8).tofile(os.path.join(folder, "color_rgb8.bin"))
    meta = {
        "name": "Great Lakes region (representative)", "size_m": SIZE, "grid": N, "cell_m": round(CELL, 3),
        "heightmap": {"file": "heightmap_u16.bin", "type": "uint16 little-endian", "rows": "north to south",
                      "columns": "west to east", "elevation_m": "lo + value / 65535 * (hi - lo)",
                      "lo": ELEV_LO, "hi": ELEV_HI},
        "color": {"file": "color_rgb8.bin", "type": "uint8 RGB, sRGB, same layout as the heightmap"},
        "axes": "x east, y north, z up; scene z = elevation - 900",
        "landmarks": [{"name": n, "x_km": x, "y_km_from_north": y, "elevation_m": [lo, hi]} for n, x, y, lo, hi in LANDMARKS],
        "moods": MOODS,
    }
    with open(os.path.join(folder, "terrain.json"), "w") as f:
        json.dump(meta, f, indent=2)
    return {n: os.path.getsize(os.path.join(folder, n)) for n in os.listdir(folder)}

def export_glb(path):
    """One-mesh GLB with vertex colours. Large (about 13 MB); meant for checking, not for shipping."""
    terrain = bpy.data.objects["GL_Terrain"]; me = terrain.data
    old_mats = list(me.materials); old_scale = terrain.scale.copy()
    me.materials.clear()
    m = bpy.data.materials.new("GL_ExportMat"); m.use_nodes = True
    nt = m.node_tree; pb = nt.nodes.get("Principled BSDF")
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = "Col"
    nt.links.new(vc.outputs['Color'], pb.inputs['Base Color']); pb.inputs['Roughness'].default_value = 1.0
    me.materials.append(m); terrain.scale = (1, 1, 1)
    sc = bpy.data.scenes["GreatLakes"]; vl = sc.view_layers[0]
    for o in vl.objects: o.select_set(False)
    terrain.select_set(True); vl.objects.active = terrain
    try:
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                                  export_yup=True, export_cameras=False, export_lights=False)
    finally:
        me.materials.clear()
        for om in old_mats: me.materials.append(om)
        terrain.scale = old_scale
        bpy.data.materials.remove(m)
    return os.path.getsize(path)

def show_mood(name, camkey=None):
    apply_mood(name)
    if camkey: show_in_viewport(camkey)

def main():
    t0 = time.time()
    h, aux = make_heightfield()
    rgba = paint(h, aux)
    NS['gl_h_final'] = h; NS['gl_rgba'] = rgba
    build_scene(h, rgba, aux)
    ok = show_in_viewport('hero')
    return {"seconds": round(time.time() - t0, 1), "min_m": round(float(h.min())), "max_m": round(float(h.max())),
            "mean_m": round(float(h.mean())), "valley_m": round(float(h[256, 256])), "viewport": ok,
            "triangles": 2 * (N - 1) ** 2}

if __name__ == "__main__":
    RESULT = main()
