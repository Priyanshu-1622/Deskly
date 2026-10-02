"""
Corporate office floor v2 — departments, support rooms, realistic plants.
Units: metres. Y up. Plan: X = east (0..60), Z = north (0..36).
"""
import math
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial
from trimesh.visual import TextureVisuals
from collections import defaultdict

H = 3.2
T = 0.15
TE = 0.3
W, D = 60.0, 36.0
NZ = 8.0            # north band offset vs v1
RNG = np.random.default_rng(42)

# ---------------------------------------------------------------- materials
MATS = {
    "slab": ((0.55, 0.55, 0.56, 1), 0, .9), "floor_polished": ((0.80, 0.79, 0.76, 1), 0, .35),
    "carpet": ((0.30, 0.33, 0.38, 1), 0, 1), "carpet_accent": ((0.20, 0.42, 0.45, 1), 0, 1),
    "carpet_design": ((0.44, 0.38, 0.48, 1), 0, 1), "carpet_mkt": ((0.58, 0.45, 0.36, 1), 0, 1),
    "carpet_hr": ((0.32, 0.47, 0.45, 1), 0, 1), "carpet_fin": ((0.36, 0.45, 0.36, 1), 0, 1),
    "carpet_res": ((0.27, 0.31, 0.44, 1), 0, 1), "carpet_sales": ((0.52, 0.35, 0.35, 1), 0, 1),
    "carpet_support": ((0.46, 0.44, 0.34, 1), 0, 1),
    "wood_floor": ((0.55, 0.38, 0.24, 1), 0, .6), "tile": ((0.88, 0.89, 0.90, 1), 0, .3),
    "wall": ((0.93, 0.92, 0.89, 1), 0, .9), "wall_ext": ((0.78, 0.78, 0.76, 1), 0, .8),
    "accent": ((0.10, 0.45, 0.48, 1), 0, .7), "accent_warm": ((0.85, 0.45, 0.20, 1), 0, .7),
    "glass": ((0.62, 0.80, 0.88, 0.28), .1, .05), "frame": ((0.18, 0.19, 0.21, 1), .7, .4),
    "door_wood": ((0.60, 0.44, 0.30, 1), 0, .55), "oak": ((0.78, 0.63, 0.45, 1), 0, .55),
    "walnut": ((0.36, 0.23, 0.14, 1), 0, .5), "white_metal": ((0.92, 0.92, 0.92, 1), .6, .35),
    "chrome": ((0.80, 0.81, 0.83, 1), 1, .18), "steel": ((0.66, 0.67, 0.69, 1), 1, .32),
    "fabric_dark": ((0.12, 0.13, 0.15, 1), 0, .95), "fabric_blue": ((0.16, 0.30, 0.50, 1), 0, .95),
    "leather": ((0.10, 0.07, 0.06, 1), 0, .45), "sofa_grey": ((0.55, 0.56, 0.58, 1), 0, .95),
    "sofa_green": ((0.30, 0.45, 0.35, 1), 0, .95), "black": ((0.04, 0.04, 0.05, 1), .2, .4),
    "screen": ((0.05, 0.10, 0.18, 1), 0, .15, (0.08, 0.18, 0.32)),
    "screen_code": ((0.04, 0.06, 0.08, 1), 0, .15, (0.05, 0.22, 0.12)),
    "screen_light": ((0.80, 0.84, 0.90, 1), 0, .15, (0.55, 0.58, 0.62)),
    "keyboard": ((0.20, 0.20, 0.22, 1), 0, .6), "quartz": ((0.95, 0.95, 0.94, 1), 0, .2),
    "cabinet": ((0.25, 0.27, 0.30, 1), 0, .5), "ceramic": ((0.97, 0.97, 0.97, 1), 0, .15),
    "mirror": ((0.85, 0.90, 0.92, 1), 1, .03), "whiteboard": ((0.98, 0.98, 0.98, 1), 0, .1),
    "pot": ((0.88, 0.86, 0.83, 1), 0, .5), "terracotta": ((0.70, 0.38, 0.25, 1), 0, .8),
    "pot_dark": ((0.16, 0.16, 0.17, 1), 0, .6), "soil": ((0.20, 0.14, 0.10, 1), 0, 1),
    "leaf_dark": ((0.10, 0.30, 0.12, 1), 0, .55), "leaf_mid": ((0.18, 0.42, 0.16, 1), 0, .55),
    "leaf_light": ((0.36, 0.56, 0.22, 1), 0, .6), "snake_dark": ((0.12, 0.28, 0.16, 1), 0, .5),
    "snake_edge": ((0.62, 0.62, 0.28, 1), 0, .5), "bark": ((0.33, 0.24, 0.17, 1), 0, .95),
    "tree_dark": ((0.14, 0.32, 0.14, 1), 0, .9), "tree_mid": ((0.24, 0.44, 0.18, 1), 0, .9),
    "tree_light": ((0.40, 0.56, 0.24, 1), 0, .9),
    "red": ((0.80, 0.08, 0.08, 1), 0, .4), "exit_green": ((0.05, 0.62, 0.25, 1), 0, .4, (0.0, 0.45, 0.12)),
    "led_green": ((0.10, 0.90, 0.30, 1), 0, .3, (0.1, 0.9, 0.3)), "led_blue": ((0.20, 0.50, 1.0, 1), 0, .3, (0.2, 0.5, 1.0)),
    "water": ((0.40, 0.65, 0.95, 0.6), 0, .1), "coffee": ((0.25, 0.14, 0.08, 1), 0, .3),
    "paper": ((0.97, 0.97, 0.95, 1), 0, .9), "concrete": ((0.62, 0.62, 0.63, 1), 0, .85),
    "rug": ((0.72, 0.66, 0.58, 1), 0, 1), "book1": ((0.55, 0.15, 0.15, 1), 0, .8),
    "book2": ((0.15, 0.25, 0.50, 1), 0, .8), "book3": ((0.80, 0.70, 0.35, 1), 0, .8),
    "grass": ((0.33, 0.52, 0.26, 1), 0, 1), "paving": ((0.70, 0.69, 0.66, 1), 0, .9),
    "cardboard": ((0.68, 0.52, 0.34, 1), 0, .9), "cork": ((0.72, 0.56, 0.38, 1), 0, .95),
    "bronze": ((0.72, 0.50, 0.22, 1), 1, .35), "epoxy": ((0.08, 0.09, 0.10, 1), 0, .25),
    "mat_purple": ((0.45, 0.30, 0.60, 1), 0, .9), "mat_teal": ((0.15, 0.55, 0.55, 1), 0, .9),
    "softbox": ((0.96, 0.96, 0.94, 1), 0, .9, (0.5, 0.5, 0.48)),
    "sign_eng": ((0.15, 0.35, 0.65, 1), 0, .5), "sign_design": ((0.50, 0.30, 0.62, 1), 0, .5),
    "sign_mkt": ((0.90, 0.50, 0.15, 1), 0, .5), "sign_hr": ((0.10, 0.55, 0.52, 1), 0, .5),
    "sign_fin": ((0.20, 0.55, 0.30, 1), 0, .5), "sign_res": ((0.18, 0.24, 0.58, 1), 0, .5),
    "sign_sales": ((0.80, 0.22, 0.22, 1), 0, .5), "sign_support": ((0.78, 0.62, 0.12, 1), 0, .5),
    "sign_it": ((0.32, 0.36, 0.42, 1), 0, .5), "sign_cafe": ((0.45, 0.28, 0.18, 1), 0, .5),
    "sign_text": ((0.98, 0.98, 0.98, 1), 0, .4), "sign_dark": ((0.15, 0.16, 0.18, 1), 0, .4),
}
material_objs = {}
for name, v in MATS.items():
    rgba, met, rough = v[0], v[1], v[2]
    kw = dict(name=name, baseColorFactor=[int(c * 255) for c in rgba], metallicFactor=met,
              roughnessFactor=rough, doubleSided=True)
    if rgba[3] < 1:
        kw["alphaMode"] = "BLEND"
    if len(v) > 3:
        kw["emissiveFactor"] = list(v[3])
    material_objs[name] = PBRMaterial(**kw)

SCENE = defaultdict(lambda: defaultdict(list))


# ---------------------------------------------------------------- primitives
def bx(mat, x0, x1, y0, y1, z0, z1):
    ex = (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
    if min(ex) <= 0:
        return None
    m = trimesh.creation.box(extents=ex)
    m.apply_translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    return (mat, m)


def cyl(mat, cx, cz, r, y0, y1, sections=14):
    m = trimesh.creation.cylinder(radius=r, height=y1 - y0, sections=sections)
    m.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
    m.apply_translation((cx, (y0 + y1) / 2, cz))
    return (mat, m)


def taper(mat, cx, cz, r0, r1, y0, y1, sections=16):
    m = trimesh.creation.cylinder(radius=1, height=1, sections=sections)
    m.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
    v = m.vertices.copy()
    t = v[:, 1] + 0.5
    r = r0 + (r1 - r0) * t
    v[:, 0] *= r
    v[:, 2] *= r
    v[:, 1] = y0 + t * (y1 - y0)
    v[:, 0] += cx
    v[:, 2] += cz
    return (mat, trimesh.Trimesh(v, m.faces, process=False))


def seg_cyl(mat, p0, p1, r, sections=6):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    if np.linalg.norm(p1 - p0) < 1e-4:
        return None
    return (mat, trimesh.creation.cylinder(radius=r, segment=[p0, p1], sections=sections))


def cyl_x(mat, x0, x1, cy, cz, r, sections=10):
    return seg_cyl(mat, (x0, cy, cz), (x1, cy, cz), r, sections)


def sphere(mat, cx, cy, cz, r, sx=1, sy=1, sz=1, sub=1, noise=0.0):
    m = trimesh.creation.icosphere(subdivisions=sub, radius=r)
    if noise:
        m.vertices += m.vertex_normals * RNG.normal(0, noise * r, (len(m.vertices), 1))
    m.apply_scale((sx, sy, sz))
    m.apply_translation((cx, cy, cz))
    return (mat, m)


MARKERS = []
DOORS = []
LIFTS = []
CUR = {"room": ""}


def marker(kind, x=0.0, y=0.0, z=0.0, fwd=(0, 0, -1), **meta):
    v = np.array([[0, 0, 0], list(fwd), [0, 1, 0]], float) + np.array([x, y, z])
    m = trimesh.Trimesh(v, [[0, 1, 2]], process=False)
    m.metadata.update(dict(kind=kind, **meta))
    return ("__marker__", m)


def nb(items):
    for it in items:
        if it is not None and it[0] != "__marker__":
            it[1].metadata["noblock"] = True
    return items


def add(zone, items):
    for it in items:
        if it is None:
            continue
        if it[0] == "__marker__":
            md = it[1].metadata
            md.setdefault("room", CUR["room"] or zone)
            MARKERS.append(it[1])
        else:
            SCENE[zone][it[0]].append(it[1])


def xform(items, x=0, z=0, rot=0, y=0):
    M = trimesh.transformations.rotation_matrix(math.radians(rot), [0, 1, 0])
    M[:3, 3] = (x, y, z)
    out = []
    for it in items:
        if it is None:
            continue
        m = it[1].copy()
        m.apply_transform(M)
        out.append((it[0], m))
    return out


def place(zone, items, x, z, rot=0, y=0):
    add(zone, xform(items, x, z, rot, y))


# ---------------------------------------------------------------- pixel font / signage
FONT = {
    "A": [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
    "B": ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
    "C": [" ####", "#    ", "#    ", "#    ", "#    ", "#    ", " ####"],
    "D": ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
    "E": ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
    "F": ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
    "G": [" ####", "#    ", "#    ", "#  ##", "#   #", "#   #", " ####"],
    "H": ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
    "I": ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
    "J": ["  ###", "   # ", "   # ", "   # ", "#  # ", "#  # ", " ##  "],
    "K": ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
    "L": ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
    "M": ["#   #", "## ##", "# # #", "#   #", "#   #", "#   #", "#   #"],
    "N": ["#   #", "##  #", "# # #", "#  ##", "#   #", "#   #", "#   #"],
    "O": [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
    "P": ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
    "Q": [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
    "R": ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
    "S": [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
    "T": ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
    "U": ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
    "V": ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
    "W": ["#   #", "#   #", "#   #", "# # #", "# # #", "## ##", "#   #"],
    "X": ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
    "Y": ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
    "Z": ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
    "&": [" ##  ", "#  # ", "#  # ", " ##  ", "# # #", "#  # ", " ## #"],
    "1": ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
    "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
    "3": ["#### ", "    #", "    #", " ### ", "    #", "    #", "#### "],
    "-": ["     ", "     ", "     ", "#####", "     ", "     ", "     "],
    " ": ["   "] * 7,
}


def text_items(text, p=0.05, depth=0.012, mat="sign_text"):
    """Text in local XY plane, centred at x=0, baseline y=0, readable from +Z."""
    widths = [len(FONT[c][0]) for c in text]
    total = (sum(widths) + len(text) - 1) * p
    x = -total / 2
    it = []
    for c, w in zip(text, widths):
        rows = FONT[c]
        for r, row in enumerate(rows):
            y = (6 - r) * p
            i = 0
            while i < len(row):
                if row[i] == "#":
                    j = i
                    while j < len(row) and row[j] == "#":
                        j += 1
                    it.append(bx(mat, x + i * p, x + j * p, y, y + p, 0, depth))
                    i = j
                else:
                    i += 1
        x += (w + 1) * p
    return it, total


def hanging_sign(text, color, p=0.055):
    it, tw = text_items(text, p)
    w = tw + 0.5
    h = 7 * p + 0.3
    out = [bx(color, -w / 2, w / 2, 0, h, -0.02, 0.02)]
    out += xform(it, 0, 0.02, 0, 0.15)
    out += xform(it, 0, -0.02, 180, 0.15)
    for sx in (-w / 2 + 0.15, w / 2 - 0.15):
        out.append(seg_cyl("black", (sx, h, 0), (sx, 3.5 - 2.55, 0), 0.006, 4))
    return out


def hang(zone, text, color, x, z, rot=0, y=2.45):
    items = hanging_sign(text, color)
    # cables were built to local height 0.95 -> reach y 3.4
    place(zone, items, x, z, rot, y)


def wall_text(zone, text, axis, fixed, center, y, side, p=0.035, mat="sign_dark", plate=None):
    it, tw = text_items(text, p, 0.01, mat)
    if plate:
        it = [bx(plate, -tw / 2 - 0.08, tw / 2 + 0.08, -0.08, 7 * p + 0.08, -0.004, 0.004)] + it
    off = T / 2 + 0.006
    if axis == "x":
        if side > 0:
            place(zone, it, center, fixed + off, 0, y)
        else:
            place(zone, it, center, fixed - off, 180, y)
    else:
        if side > 0:
            place(zone, it, fixed + off, center, 90, y)
        else:
            place(zone, it, fixed - off, center, -90, y)


# ---------------------------------------------------------------- walls
def wall(zone, axis, fixed, a0, a1, t=T, openings=(), mat="wall", h=H):
    ops = sorted(openings, key=lambda o: o[0])

    def seg(s0, s1, y0, y1, m=mat, tt=t):
        if s1 - s0 <= 1e-4 or y1 - y0 <= 1e-4:
            return None
        if axis == "x":
            return bx(m, s0, s1, y0, y1, fixed - tt / 2, fixed + tt / 2)
        return bx(m, fixed - tt / 2, fixed + tt / 2, y0, y1, s0, s1)

    items = []
    cur = a0
    for (s0, s1, bot, top, kind) in ops:
        items.append(seg(cur, s0, 0, h))
        items.append(seg(s0, s1, 0, bot))
        items.append(seg(s0, s1, top, h))
        if kind == "window":
            items.append(seg(s0, s1, bot, top, "glass", 0.02))
            for a, b, c, d in ((s0, s1, bot, bot + .05), (s0, s1, top - .05, top), (s0, s0 + .05, bot, top), (s1 - .05, s1, bot, top)):
                items.append(seg(a, b, c, d, "frame", t + 0.02))
            n = max(1, int(round((s1 - s0) / 1.2)))
            for i in range(1, n):
                p = s0 + (s1 - s0) * i / n
                items.append(seg(p - 0.025, p + 0.025, bot, top, "frame", t + 0.02))
            items.append(seg(s0, s1, bot - 0.03, bot, "quartz", t + 0.12))
        elif kind in ("door", "glassdoor", "exitdoor"):
            DOORS.append(dict(axis=axis, fixed=fixed, s0=s0, s1=s1, top=top, kind=kind, t=t))
            for a, b, c, d in ((s0, s0 + .04, 0, top), (s1 - .04, s1, 0, top), (s0, s1, top - .04, top)):
                items.append(seg(a, b, c, d, "frame", t + 0.02))
        cur = s1
    items.append(seg(cur, a1, 0, h))
    add(zone, items)


def glass_wall(zone, axis, fixed, a0, a1, doors=()):
    ops = [(d0, d1) for (d0, d1) in doors]
    items = []

    def seg(s0, s1, y0, y1, m, tt):
        if s1 - s0 <= 1e-4:
            return None
        if axis == "x":
            return bx(m, s0, s1, y0, y1, fixed - tt / 2, fixed + tt / 2)
        return bx(m, fixed - tt / 2, fixed + tt / 2, y0, y1, s0, s1)

    cur = a0
    spans = []
    for (s0, s1) in sorted(ops):
        spans.append((cur, s0))
        cur = s1
    spans.append((cur, a1))
    for (s0, s1) in spans:
        items += [seg(s0, s1, 0.08, H - 0.08, "glass", 0.02), seg(s0, s1, 0, 0.08, "frame", 0.08),
                  seg(s0, s1, H - 0.08, H, "frame", 0.08), seg(s0, s1, 1.0, 1.5, "whiteboard", 0.025)]
        n = max(1, int(round((s1 - s0) / 1.3)))
        for i in range(0, n + 1):
            p = s0 + (s1 - s0) * i / n
            items.append(seg(max(s0, p - 0.03), min(s1, p + 0.03), 0, H, "frame", 0.08))
    for (s0, s1) in ops:
        DOORS.append(dict(axis=axis, fixed=fixed, s0=s0, s1=s1, top=2.25, kind="glassdoor", t=0.08))
        items += [seg(s0, s1, 2.3, H, "glass", 0.02),
                  seg(s0, s1, 2.25, 2.3, "frame", 0.08), seg(s0, s0 + 0.05, 0, H, "frame", 0.08),
                  seg(s1 - 0.05, s1, 0, H, "frame", 0.08)]
    add(zone, items)


# ---------------------------------------------------------------- plants (realistic)
def leaf_mesh(L, Wd, droop=0.2, n=6, fold=0.12, tip=0.8):
    v = []
    for i in range(n + 1):
        t = i / n
        w = Wd * (math.sin(math.pi * min(t, 1.0) * 0.5 + math.pi * 0.5 * t) if False else math.sin(math.pi * t) ** tip)
        x = L * t
        y = -droop * L * t * t
        v += [(x, y, -w / 2), (x, y + fold * Wd * (1 - t), 0), (x, y, w / 2)]
    f = []
    for i in range(n):
        a = 3 * i
        f += [(a, a + 3, a + 1), (a + 1, a + 3, a + 4), (a + 1, a + 4, a + 2), (a + 2, a + 4, a + 5)]
    return trimesh.Trimesh(np.array(v), np.array(f), process=False)


def orient(m, direction, pos, roll=0.0):
    d = np.asarray(direction, float)
    d /= np.linalg.norm(d)
    pitch = math.asin(np.clip(d[1], -1, 1))
    yaw = math.atan2(-d[2], d[0])
    R = trimesh.transformations.rotation_matrix(yaw, [0, 1, 0]) @ \
        trimesh.transformations.rotation_matrix(pitch, [0, 0, 1]) @ \
        trimesh.transformations.rotation_matrix(roll, [1, 0, 0])
    R[:3, 3] = pos
    m = m.copy()
    m.apply_transform(R)
    return m


def pot_items(style="pot", r=0.22, h=0.45, square=False):
    if square:
        return [bx(style, -r, r, 0, h, -r, r), bx("soil", -r + .03, r - .03, h - .04, h - .02, -r + .03, r - .03)]
    return [taper(style, 0, 0, r * 0.78, r, 0, h, 20), taper(style, 0, 0, r, r * 1.04, h - 0.04, h, 20),
            cyl("soil", 0, 0, r * 0.95, h - 0.05, h - 0.03, 18)]


def fiddle_fig(h=1.9, pot="pot"):
    it = pot_items(pot, 0.22, 0.45)
    lean = RNG.normal(0, 0.03, 2)
    top = np.array([lean[0], h * 0.78, lean[1]])
    it.append(seg_cyl("bark", (0, 0.42, 0), top, 0.025, 7))
    # a couple of side branches
    branches = [(np.array([0, 0.42, 0]), top)]
    for k in range(2):
        a = RNG.uniform(0, 2 * math.pi)
        b0 = np.array([0, 0.42, 0]) + (top - np.array([0, 0.42, 0])) * RNG.uniform(0.5, 0.7)
        b1 = b0 + np.array([math.cos(a) * 0.22, 0.28, math.sin(a) * 0.22])
        it.append(seg_cyl("bark", b0, b1, 0.014, 6))
        branches.append((b0, b1))
    for k in range(72):
        b0, b1 = branches[k % len(branches)]
        t = RNG.uniform(0.35, 1.0) if k % len(branches) == 0 else RNG.uniform(0.3, 1.0)
        p = b0 + (b1 - b0) * t
        a = RNG.uniform(0, 2 * math.pi)
        up = RNG.uniform(0.1, 0.9)
        d = (math.cos(a), up, math.sin(a))
        L = RNG.uniform(0.26, 0.36)
        lf = leaf_mesh(L, L * RNG.uniform(0.62, 0.72), droop=0.28, fold=0.1, tip=0.55)
        mat = ["leaf_dark", "leaf_mid", "leaf_dark"][k % 3]
        it.append(seg_cyl("leaf_mid", p, p + np.array(d) * 0.05, 0.004, 3))
        it.append((mat, orient(lf, d, p + np.array(d) * 0.05, RNG.uniform(-0.4, 0.4))))
    return it


def snake_plant(h=0.95, pot="pot_dark", n=14, square=True, r=0.17):
    it = pot_items(pot, r, 0.38, square)
    for k in range(n):
        a = RNG.uniform(0, 2 * math.pi)
        rr = RNG.uniform(0, r * 0.55)
        base = np.array([math.cos(a) * rr, 0.36, math.sin(a) * rr])
        tilt = RNG.uniform(0.04, 0.28)
        d = (math.cos(a) * tilt, 1.0, math.sin(a) * tilt)
        L = RNG.uniform(0.55, 1.0) * h
        lf = leaf_mesh(L, RNG.uniform(0.055, 0.085), droop=0.0, n=5, fold=0.35, tip=0.45)
        it.append(("snake_dark" if k % 4 else "snake_edge", orient(lf, d, base, RNG.uniform(0, math.pi))))
    return it


def areca_palm(h=1.9, pot="terracotta"):
    it = pot_items(pot, 0.25, 0.48)
    for k in range(7):
        a = 2 * math.pi * k / 7 + RNG.uniform(-0.3, 0.3)
        horiz = np.array([math.cos(a), 0, math.sin(a)])
        p = np.array([0, 0.46, 0]) + horiz * 0.03
        ang = RNG.uniform(0.12, 0.35)          # from vertical
        seglen = h * RNG.uniform(0.16, 0.2)
        pts = [p.copy()]
        for s in range(6):
            d = horiz * math.sin(ang) + np.array([0, 1, 0]) * math.cos(ang)
            p = p + d * seglen
            pts.append(p.copy())
            ang += RNG.uniform(0.12, 0.2)
        for s in range(6):
            it.append(seg_cyl("leaf_light", pts[s], pts[s + 1], 0.009, 4))
        for s in range(2, 6):
            for q in np.linspace(0, 1, 4, endpoint=False):
                pos = pts[s] + (pts[s + 1] - pts[s]) * q
                tang = pts[s + 1] - pts[s]
                tang /= np.linalg.norm(tang)
                side = np.cross(tang, [0, 1, 0])
                side /= max(np.linalg.norm(side), 1e-6)
                for sgn in (-1, 1):
                    d = side * sgn + tang * 0.7 + np.array([0, -0.15, 0])
                    L = 0.26 * (1 - 0.1 * s)
                    lf = leaf_mesh(L, 0.035, droop=0.45, n=4, fold=0.4, tip=0.6)
                    it.append(("leaf_mid" if (s + int(q * 4)) % 2 else "leaf_light", orient(lf, d, pos)))
    return it


def monstera(h=1.1, pot="pot"):
    it = pot_items(pot, 0.24, 0.40)
    for k in range(11):
        a = RNG.uniform(0, 2 * math.pi)
        rr = RNG.uniform(0.15, 0.42)
        yy = RNG.uniform(0.6, h)
        tip = np.array([math.cos(a) * rr, yy, math.sin(a) * rr])
        base = np.array([0, 0.38, 0])
        mid = (base + tip) / 2 + np.array([0, 0.12, 0])
        it.append(seg_cyl("leaf_mid", base, mid, 0.008, 4))
        it.append(seg_cyl("leaf_mid", mid, tip, 0.008, 4))
        d = (math.cos(a), RNG.uniform(-0.2, 0.3), math.sin(a))
        L = RNG.uniform(0.3, 0.42)
        lf = leaf_mesh(L, L * 0.9, droop=0.25, n=6, fold=0.08, tip=0.5)
        it.append(("leaf_dark", orient(lf, d, tip, RNG.uniform(-0.3, 0.3))))
    return it


def desk_plant():
    it = [taper("pot", 0, 0, 0.045, 0.055, 0, 0.09, 12), cyl("soil", 0, 0, 0.05, 0.08, 0.085, 10)]
    for k in range(9):
        a = RNG.uniform(0, 2 * math.pi)
        d = (math.cos(a), RNG.uniform(-0.3, 0.4), math.sin(a))
        lf = leaf_mesh(0.07, 0.05, droop=0.3, n=3, fold=0.1, tip=0.6)
        it.append(("leaf_light" if k % 2 else "leaf_mid", orient(lf, d, (0, 0.09, 0))))
    return it


PLANT_KINDS = [fiddle_fig, areca_palm, monstera, snake_plant]


def plant(kind=None, **kw):
    f = kind or PLANT_KINDS[int(RNG.integers(len(PLANT_KINDS)))]
    return f(**kw)


def planter_strip(zone, axis, fixed, a0, a1):
    """Low planter trough with a row of snake plants — used as department dividers."""
    if axis == "z":
        add(zone, [bx("walnut", fixed - 0.22, fixed + 0.22, 0, 0.5, a0, a1),
                   bx("soil", fixed - 0.19, fixed + 0.19, 0.5, 0.52, a0 + .03, a1 - .03)])
    else:
        add(zone, [bx("walnut", a0, a1, 0, 0.5, fixed - 0.22, fixed + 0.22),
                   bx("soil", a0 + .03, a1 - .03, 0.5, 0.52, fixed - 0.19, fixed + 0.19)])
    n = int((a1 - a0) / 0.45)
    for i in range(n):
        s = a0 + (i + 0.5) * (a1 - a0) / n
        items = [it for it in snake_plant(0.75, n=8)[2:]]   # skip pot
        if axis == "z":
            place(zone, items, fixed, s, 0, 0.16)
        else:
            place(zone, items, s, fixed, 0, 0.16)


def tree(h=5.0):
    it = []
    it.append(taper("bark", 0, 0, 0.18, 0.09, -0.2, h * 0.55, 10))
    crown = np.array([0, h * 0.7, 0])
    for k in range(5):
        a = 2 * math.pi * k / 5 + RNG.uniform(-0.4, 0.4)
        b0 = np.array([0, h * RNG.uniform(0.35, 0.5), 0])
        b1 = b0 + np.array([math.cos(a) * h * 0.2, h * 0.28, math.sin(a) * h * 0.2])
        it.append(seg_cyl("bark", b0, b1, 0.05, 6))
    for k in range(11):
        a = RNG.uniform(0, 2 * math.pi)
        rr = RNG.uniform(0, h * 0.22)
        c = crown + np.array([math.cos(a) * rr, RNG.uniform(-0.15, 0.25) * h, math.sin(a) * rr])
        r = RNG.uniform(0.18, 0.26) * h
        it.append(sphere(["tree_dark", "tree_mid", "tree_light"][k % 3], *c, r, 1, 0.8, 1, sub=2, noise=0.12))
    return it


def shrub(r=0.5):
    return [sphere("tree_mid" if RNG.random() < .5 else "tree_dark", 0, r * 0.7, 0, r, 1.2, 0.8, 1, sub=1, noise=0.15),
            sphere("tree_light", r * 0.3, r * 0.9, 0.1, r * 0.6, 1, 0.8, 1, sub=1, noise=0.15)]


# ---------------------------------------------------------------- furniture
def office_chair(fabric="fabric_dark"):
    it = [bx(fabric, -0.25, 0.25, 0.44, 0.52, -0.25, 0.23), bx(fabric, -0.23, 0.23, 0.58, 1.10, 0.24, 0.30),
          bx("black", -0.03, 0.03, 0.50, 0.60, 0.22, 0.28), cyl("chrome", 0, 0, 0.03, 0.12, 0.44, 8)]
    for k in range(5):
        a = 2 * math.pi * k / 5
        leg = trimesh.creation.box(extents=(0.30, 0.04, 0.05))
        leg.apply_translation((0.15, 0.09, 0))
        leg.apply_transform(trimesh.transformations.rotation_matrix(a, [0, 1, 0]))
        it.append(("black", leg))
        it.append(cyl("black", 0.30 * math.cos(a), -0.30 * math.sin(a), 0.03, 0.0, 0.06, 6))
    for sx in (-1, 1):
        it.append(bx("black", sx * 0.27 - 0.02, sx * 0.27 + 0.02, 0.50, 0.68, -0.02, 0.04))
        it.append(bx("black", sx * 0.27 - 0.04, sx * 0.27 + 0.04, 0.68, 0.71, -0.15, 0.12))
    return nb(it) + [marker("chair", seat=0.52, style="office")]


def exec_chair():
    it = office_chair("leather") + nb([bx("leather", -0.25, 0.25, 1.10, 1.30, 0.25, 0.32)])
    for x in it:
        if x[0] == "__marker__":
            x[1].metadata["exec"] = True
    return it


def visitor_chair(fabric="fabric_blue"):
    it = [bx(fabric, -0.24, 0.24, 0.43, 0.50, -0.22, 0.22), bx(fabric, -0.24, 0.24, 0.50, 0.90, 0.20, 0.25)]
    for sx in (-0.21, 0.21):
        for sz in (-0.19, 0.19):
            it.append(cyl("chrome", sx, sz, 0.015, 0, 0.43, 6))
    return nb(it) + [marker("chair", seat=0.50, style="visitor")]


def armchair(mat="sofa_green"):
    return [bx(mat, -0.4, 0.4, 0.12, 0.45, -0.4, 0.4), bx(mat, -0.4, 0.4, 0.45, 0.95, 0.25, 0.4),
            bx(mat, -0.4, -0.3, 0.45, 0.65, -0.4, 0.4), bx(mat, 0.3, 0.4, 0.45, 0.65, -0.4, 0.4),
            bx("walnut", -0.35, 0.35, 0, 0.12, -0.35, 0.35)] and nb([bx(mat, -0.4, 0.4, 0.12, 0.45, -0.4, 0.4), bx(mat, -0.4, 0.4, 0.45, 0.95, 0.25, 0.4),
            bx(mat, -0.4, -0.3, 0.45, 0.65, -0.4, 0.4), bx(mat, 0.3, 0.4, 0.45, 0.65, -0.4, 0.4),
            bx("walnut", -0.35, 0.35, 0, 0.12, -0.35, 0.35)]) + [marker("chair", seat=0.45, style="lounge")]


def monitor(n=1, w=0.56, screen="screen", h=0.34):
    it = []
    xs = [0] if n == 1 else [-(w / 2 + 0.01), (w / 2 + 0.01)]
    for x in xs:
        it.append(marker("screen", x, 1.0 + h / 2, 0.006, fwd=(0, 0, 1), w=w - 0.03, h=h - 0.03))
        it += [bx("black", x - w / 2, x + w / 2, 1.00, 1.00 + h, -0.03, 0.0),
               bx(screen, x - w / 2 + .015, x + w / 2 - .015, 1.015, 0.985 + h, 0.0, 0.004),
               bx("black", x - 0.02, x + 0.02, 0.75, 1.02, -0.06, -0.03)]
    it.append(bx("black", -0.12, 0.12, 0.74, 0.75, -0.14, 0.0))
    return it


def laptop(screen="screen"):
    base = [bx("white_metal", -0.16, 0.16, 0, 0.018, -0.11, 0.11)]
    lid = trimesh.creation.box(extents=(0.32, 0.21, 0.008))
    lid.apply_translation((0, 0.105, 0))
    lid.apply_transform(trimesh.transformations.rotation_matrix(math.radians(-15), [1, 0, 0]))
    lid.apply_translation((0, 0.018, -0.11))
    scr = trimesh.creation.box(extents=(0.29, 0.18, 0.002))
    scr.apply_translation((0, 0.105, 0.005))
    scr.apply_transform(trimesh.transformations.rotation_matrix(math.radians(-15), [1, 0, 0]))
    scr.apply_translation((0, 0.018, -0.11))
    return base + [("white_metal", lid), (screen, scr)]


def headset():
    return [bx("black", -0.09, 0.09, 0.19, 0.21, -0.015, 0.015), bx("black", -0.1, -0.08, 0.1, 0.2, -0.015, 0.015),
            bx("black", 0.08, 0.1, 0.1, 0.2, -0.015, 0.015), cyl("black", -0.1, 0, 0.045, 0.0, 0.11, 10),
            cyl("black", 0.1, 0, 0.045, 0.0, 0.11, 10), bx("black", -0.01, 0.01, 0, 0.2, 0.02, 0.04)]


def desk(w=1.4, d=0.7, kit="std", chair=True, h=0.74, screen="screen"):
    """User on +Z side."""
    it = [bx("oak", -w / 2, w / 2, h - 0.03, h, -d / 2, d / 2)]
    for sx in (-1, 1):
        lx = sx * (w / 2 - 0.05)
        it.append(bx("white_metal", lx - 0.02, lx + 0.02, 0, h - 0.03, -d / 2 + 0.05, d / 2 - 0.05))
        it.append(bx("white_metal", lx - 0.03, lx + 0.03, 0, 0.02, -d / 2 + 0.03, d / 2 - 0.03))
    it.append(bx("white_metal", -w / 2 + 0.07, w / 2 - 0.07, 0.35, min(0.68, h - 0.06), -d / 2 + 0.02, -d / 2 + 0.04))
    dy = h - 0.74
    mon, top = [], []
    if kit == "dev":
        mon += monitor(2, 0.52, "screen_code")
        top += xform(laptop("screen_code"), -0.52 if w > 1.3 else 0.45, 0.12, 20, 0.74)
    elif kit == "design":
        mon += monitor(1, 0.8, "screen_light", 0.45)
        top += [bx("black", -0.2, 0.2, 0.74, 0.752, 0.05, 0.3), bx("screen", -0.17, 0.17, 0.752, 0.754, 0.07, 0.28),
                seg_cyl("white_metal", (0.25, 0.755, 0.1), (0.27, 0.755, 0.28), 0.006, 4)]
    elif kit == "headset":
        mon += monitor(1, 0.56, screen)
        top += xform(headset(), 0.5, 0.0, 90, 0.74)
    elif kit == "finance":
        mon += monitor(2, 0.52, "screen_light")
        top += [bx("keyboard", 0.45, 0.6, 0.74, 0.76, 0.05, 0.25), bx("paper", -0.62, -0.35, 0.74, 0.78, -0.05, 0.25)]
    elif kit == "research":
        mon += monitor(1, 0.56, screen)
        top += [bx("book1", -0.62, -0.42, 0.74, 0.78, -0.2, 0.08), bx("book2", -0.6, -0.44, 0.78, 0.81, -0.18, 0.06),
                bx("book3", -0.63, -0.41, 0.81, 0.84, -0.2, 0.08)]
        top += xform(laptop(), 0.45, 0.1, -15, 0.74)
    else:
        mon += monitor(1, 0.56, screen)
    if kit != "design":
        top.append(bx("keyboard", -0.22, 0.22, 0.74, 0.76, 0.02, 0.17))
    top.append(bx("keyboard", 0.30, 0.36, 0.74, 0.765, 0.05, 0.14))
    if kit not in ("research", "finance"):
        top.append(cyl("white_metal", -0.62 if kit == "dev" and w <= 1.3 else -0.5, 0.2, 0.04, 0.74, 0.84, 8))
    if RNG.random() < 0.25:
        top += xform(desk_plant(), 0.58, -0.22, 0, 0.74)
    it += xform(mon, 0, -d / 2 + 0.18, 0, dy)
    it += xform(top, 0, 0, 0, dy)
    it.append(bx("white_metal", w / 2 - 0.50, w / 2 - 0.10, 0.02, min(0.62, h - 0.12), -d / 2 + 0.08, d / 2 - 0.12))
    if chair:
        ch = xform(office_chair(), 0, d / 2 + 0.28, 0, 0)
        for x in ch:
            if x[0] == "__marker__":
                x[1].metadata.update(desk=True, kit=kit, standing=bool(h > 0.9))
        it += ch
    elif h > 0.9:
        it.append(marker("stand", 0, 0, d / 2 + 0.3, kit=kit))
    return it


def bench_cluster(n_side=3, kit="std", screen_mat="accent", w=1.4):
    it = []
    total = w * n_side
    for i in range(n_side):
        x = -total / 2 + w / 2 + i * w
        for side, rot in ((0.35, 0), (-0.35, 180)):
            it += xform(desk(w, 0.7, kit), x, side, rot)
    it += [bx(screen_mat, -total / 2, total / 2, 0.74, 1.15, -0.015, 0.015),
           bx("white_metal", -total / 2 - 0.01, -total / 2 + 0.02, 0.74, 1.15, -0.02, 0.02),
           bx("white_metal", total / 2 - 0.02, total / 2 + 0.01, 0.74, 1.15, -0.02, 0.02)]
    return it


def table_rect(w, d, mat="oak", h=0.74, leg="chrome"):
    it = [bx(mat, -w / 2, w / 2, h - 0.04, h, -d / 2, d / 2)]
    for sx in (-1, 1):
        for sz in (-1, 1):
            it.append(bx(leg, sx * (w / 2 - 0.1) - 0.03, sx * (w / 2 - 0.1) + 0.03, 0, h - 0.04,
                         sz * (d / 2 - 0.1) - 0.03, sz * (d / 2 - 0.1) + 0.03))
    return it


def table_round(r, mat="oak", h=0.74):
    return [cyl(mat, 0, 0, r, h - 0.04, h, 20), cyl("chrome", 0, 0, 0.04, 0.03, h - 0.04, 8),
            cyl("chrome", 0, 0, r * 0.55, 0, 0.03, 16)]


def round_meeting(zone, x, z, r=0.5, n=4, chairmat="fabric_blue", tmat="oak"):
    place(zone, table_round(r, tmat), x, z)
    for k in range(n):
        a = 360 * k / n + 45
        dx, dz = (r + 0.28) * math.sin(math.radians(a)), (r + 0.28) * math.cos(math.radians(a))
        place(zone, visitor_chair(chairmat), x + dx, z + dz, a)


def sofa(w=2.0, mat="sofa_grey", d=0.85):
    it = [bx(mat, -w / 2, w / 2, 0.10, 0.42, -d / 2, d / 2), bx(mat, -w / 2, w / 2, 0.42, 0.85, d / 2 - 0.2, d / 2),
          bx(mat, -w / 2, -w / 2 + 0.18, 0.42, 0.62, -d / 2, d / 2), bx(mat, w / 2 - 0.18, w / 2, 0.42, 0.62, -d / 2, d / 2)]
    n = max(2, int(round(w / 0.8)))
    cw = (w - 0.36) / n
    for i in range(n):
        x0 = -w / 2 + 0.18 + i * cw
        it.append(bx(mat, x0 + 0.01, x0 + cw - 0.01, 0.42, 0.50, -d / 2 + 0.02, d / 2 - 0.2))
    for sx in (-1, 1):
        for sz in (-1, 1):
            it.append(bx("black", sx * (w / 2 - 0.08) - 0.02, sx * (w / 2 - 0.08) + 0.02, 0, 0.10,
                         sz * (d / 2 - 0.08) - 0.02, sz * (d / 2 - 0.08) + 0.02))
    return it


def coffee_machine():
    return [marker("coffee", 0, 0, 0.62), bx("black", -0.22, 0.22, 0, 0.55, -0.25, 0.20), bx("steel", -0.22, 0.22, 0.55, 0.60, -0.25, 0.20),
            bx("steel", -0.12, 0.12, 0.30, 0.42, 0.20, 0.26), bx("steel", -0.16, 0.16, 0.02, 0.05, 0.12, 0.30),
            bx("screen", -0.10, 0.10, 0.45, 0.52, 0.20, 0.205), cyl("ceramic", 0, 0.22, 0.04, 0.05, 0.14, 10),
            cyl("coffee", 0, 0.22, 0.035, 0.14, 0.141, 10), bx("glass", -0.18, 0.02, 0.60, 0.72, -0.20, 0.0),
            bx("coffee", -0.17, 0.01, 0.60, 0.66, -0.19, -0.01)]


def water_cooler():
    return [marker("water", 0, 0, 0.6), bx("white_metal", -0.17, 0.17, 0, 1.0, -0.17, 0.17), bx("black", -0.10, 0.10, 0.70, 0.85, 0.17, 0.18),
            bx("chrome", -0.06, -0.03, 0.78, 0.82, 0.17, 0.22), bx("red", 0.03, 0.06, 0.78, 0.82, 0.17, 0.22),
            cyl("water", 0, 0, 0.14, 1.0, 1.45, 14)]


def fridge(w=0.75, h=1.85):
    return [bx("steel", -w / 2, w / 2, 0, h, -0.35, 0.35), bx("black", -w / 2, w / 2, h * 0.62, h * 0.625, 0.35, 0.355),
            bx("chrome", w / 2 - 0.08, w / 2 - 0.05, h * 0.3, h * 0.58, 0.35, 0.40),
            bx("chrome", w / 2 - 0.08, w / 2 - 0.05, h * 0.66, h * 0.9, 0.35, 0.40)]


def tv(w=1.6, h=0.9, y=1.1, screen="screen"):
    return [bx("black", -w / 2, w / 2, y, y + h, -0.03, 0.0), bx(screen, -w / 2 + 0.02, w / 2 - 0.02, y + 0.02, y + h - 0.02, 0.0, 0.005)]


def tv_stand(w=1.6, h=0.9, screen="screen"):
    return [marker("tvwatch", 0, 0, 1.6)] + tv(w, h, 1.2, screen) + [bx("black", -0.05, 0.05, 0, 1.25, -0.1, -0.03), bx("black", -0.4, 0.4, 0, 0.04, -0.35, 0.25)]


def whiteboard(w=2.0, h=1.1, y=0.9):
    return [marker("whiteboard", 0, 0, 0.9), bx("frame", -w / 2 - 0.02, w / 2 + 0.02, y - 0.02, y + h + 0.02, -0.02, 0.0),
            bx("whiteboard", -w / 2, w / 2, y, y + h, 0.0, 0.01), bx("frame", -w / 2, w / 2, y - 0.06, y - 0.02, 0.0, 0.08)]


def mobile_whiteboard(w=1.8):
    it = whiteboard(w, 1.1, 0.8)
    for sx in (-w / 2 - 0.05, w / 2 + 0.05):
        it += [bx("chrome", sx - .02, sx + .02, 0, 1.95, -0.03, 0.01), bx("chrome", sx - .03, sx + .03, 0, 0.04, -0.3, 0.3)]
    # scribbles
    for k in range(6):
        x = RNG.uniform(-w / 2 + .1, w / 2 - .5)
        y = RNG.uniform(0.95, 1.8)
        it.append(bx(["sign_eng", "red", "black"][k % 3], x, x + RNG.uniform(.15, .45), y, y + .012, 0.01, 0.013))
    return it


def moodboard(w=2.4):
    it = [bx("cork", -w / 2, w / 2, 0.8, 2.0, -0.02, 0.0)]
    for k in range(18):
        x = RNG.uniform(-w / 2 + .1, w / 2 - .3)
        y = RNG.uniform(0.85, 1.75)
        mat = ["sign_design", "sign_mkt", "paper", "sign_hr", "book3", "sign_sales"][k % 6]
        it.append(bx(mat, x, x + RNG.uniform(.12, .25), y, y + RNG.uniform(.12, .2), 0.0, 0.004))
    for sx in (-w / 2 - .04, w / 2 + .04):
        it += [bx("walnut", sx - .03, sx + .03, 0, 2.05, -0.04, 0.02), bx("walnut", sx - .04, sx + .04, 0, .04, -.35, .3)]
    return it


def bookshelf(w=1.8, h=2.2, d=0.35):
    it = [bx("walnut", -w / 2, w / 2, 0, 0.05, -d / 2, d / 2), bx("walnut", -w / 2, w / 2, h - 0.03, h, -d / 2, d / 2),
          bx("walnut", -w / 2, -w / 2 + 0.03, 0, h, -d / 2, d / 2), bx("walnut", w / 2 - 0.03, w / 2, 0, h, -d / 2, d / 2),
          bx("walnut", -w / 2, w / 2, 0, h, -d / 2, -d / 2 + 0.02)]
    for s in range(5):
        y = 0.05 + s * (h / 5)
        it.append(bx("walnut", -w / 2, w / 2, y, y + 0.025, -d / 2, d / 2))
        x = -w / 2 + 0.05
        while x < w / 2 - 0.35:
            bw = RNG.uniform(0.025, 0.05)
            bh = RNG.uniform(0.18, 0.30)
            it.append(bx(["book1", "book2", "book3", "paper"][int(RNG.integers(4))], x, x + bw, y + 0.025, y + 0.025 + bh, -d / 2 + 0.04, d / 2 - 0.06))
            x += bw + 0.004
            if RNG.random() < 0.05:
                x += 0.15
    return it


def filing_cabinet(n=4):
    it = [bx("white_metal", -0.23, 0.23, 0, 0.35 * n, -0.3, 0.3)]
    for k in range(n):
        it.append(bx("chrome", -0.08, 0.08, 0.35 * k + 0.25, 0.35 * k + 0.28, 0.3, 0.33))
        it.append(bx("black", -0.23, 0.23, 0.35 * k, 0.35 * k + 0.005, 0.3, 0.305))
    return it


def toilet():
    return [cyl("ceramic", 0, -0.05, 0.19, 0, 0.40, 14), cyl("ceramic", 0, -0.05, 0.20, 0.40, 0.43, 14),
            bx("ceramic", -0.20, 0.20, 0.35, 0.80, 0.15, 0.32), bx("chrome", -0.04, 0.04, 0.80, 0.81, 0.21, 0.26)]


def urinal():
    return [bx("ceramic", -0.20, 0.20, 0.45, 1.05, 0.0, 0.30), bx("chrome", -0.02, 0.02, 1.05, 1.20, 0.02, 0.06)]


def vanity(w=3.0):
    it = [bx("quartz", -w / 2, w / 2, 0.82, 0.86, -0.28, 0.28), bx("cabinet", -w / 2, w / 2, 0.15, 0.82, -0.25, 0.25),
          bx("mirror", -w / 2, w / 2, 1.05, 2.0, 0.28, 0.30)]
    n = max(1, int(w // 0.9))
    for i in range(n):
        x = -w / 2 + w * (i + 0.5) / n
        it += [bx("ceramic", x - 0.22, x + 0.22, 0.86, 0.90, -0.20, 0.15), bx("steel", x - 0.17, x + 0.17, 0.861, 0.901, -0.16, 0.11),
               bx("chrome", x - 0.02, x + 0.02, 0.86, 1.05, 0.15, 0.19), bx("chrome", x - 0.02, x + 0.02, 1.01, 1.05, 0.05, 0.19)]
    return it


def server_rack():
    it = [bx("black", -0.30, 0.30, 0, 2.0, -0.50, 0.50), bx("frame", -0.28, 0.28, 0.05, 1.95, -0.51, -0.50)]
    for k in range(14):
        y = 0.12 + k * 0.13
        it += [bx("keyboard", -0.26, 0.26, y, y + 0.09, -0.515, -0.505),
               bx("led_green" if k % 3 else "led_blue", 0.18, 0.22, y + 0.03, y + 0.05, -0.52, -0.515)]
    return it


def locker_bank(n=6, mat="accent"):
    it = []
    for i in range(n):
        x = -n * 0.4 / 2 + i * 0.4
        it += [bx("white_metal" if i % 2 else mat, x + 0.005, x + 0.395, 0.1, 1.9, -0.25, 0.25),
               bx("chrome", x + 0.32, x + 0.35, 1.0, 1.15, 0.25, 0.28)]
    it.append(bx("black", -n * 0.2, n * 0.2, 0, 0.1, -0.24, 0.24))
    return it


def printer():
    return [marker("printer", 0, 0, 0.7), bx("white_metal", -0.35, 0.35, 0, 0.9, -0.3, 0.3), bx("keyboard", -0.35, 0.35, 0.9, 1.1, -0.3, 0.3),
            bx("screen", 0.1, 0.3, 1.1, 1.13, 0.05, 0.25), bx("paper", -0.2, 0.15, 0.95, 0.97, 0.3, 0.4)]


def fire_ext():
    return [cyl("red", 0, 0, 0.08, 0.3, 0.85, 12), bx("black", -0.03, 0.03, 0.85, 0.95, -0.03, 0.03)]


def stool(h=0.75):
    return [marker("chair", seat=h, style="stool", fwd=(0, 0, -1))] + nb([cyl("fabric_dark", 0, 0, 0.18, h - 0.06, h, 14), cyl("chrome", 0, 0, 0.025, 0.02, h - 0.06, 8),
            cyl("chrome", 0, 0, 0.2, 0, 0.02, 14), cyl("chrome", 0, 0, 0.16, 0.28, 0.30, 14)])


def beanbag(mat="accent_warm"):
    return [sphere(mat, 0, 0.28, 0, 0.42, 1, 0.7, 1, sub=2, noise=0.04), sphere(mat, 0, 0.45, 0.15, 0.3, 1, 1, 0.6, sub=2)]


def pod(color="walnut"):
    """1.5 x 1.5 focus/phone pod, door (glass) on +Z."""
    return [bx(color, -0.75, 0.75, 0, 2.3, -0.75, -0.7), bx(color, -0.75, -0.7, 0, 2.3, -0.7, 0.75),
            bx(color, 0.7, 0.75, 0, 2.3, -0.7, 0.75), bx(color, -0.75, 0.75, 2.25, 2.3, 0.65, 0.75),
            bx("glass", -0.7, 0.7, 0, 2.25, 0.73, 0.75), bx("oak", -0.65, 0.65, 1.0, 1.03, -0.7, -0.3),
            bx("fabric_blue", -0.7, 0.7, 1.2, 2.1, -0.7, -0.68)] + xform(stool(0.72), 0, 0.0)


def exit_sign():
    it, tw = text_items("EXIT", 0.025, 0.006)
    return [bx("exit_green", -tw / 2 - .05, tw / 2 + .05, -0.05, 0.225, -0.015, 0)] + it


def gong():
    d = trimesh.creation.cylinder(radius=0.32, height=0.03, sections=24)
    d.apply_translation((0, 1.2, 0))
    return [bx("walnut", -0.45, -0.4, 0, 1.75, -0.03, 0.03), bx("walnut", 0.4, 0.45, 0, 1.75, -0.03, 0.03),
            bx("walnut", -0.5, 0.5, 1.7, 1.78, -0.04, 0.04), bx("walnut", -0.5, 0.5, 0, 0.05, -0.25, 0.25),
            ("bronze", d), seg_cyl("black", (0, 1.52, 0), (0, 1.7, 0), 0.005, 4)]


def studio_set():
    """Content studio: backdrop, camera on tripod, ring light, softbox. Faces -Z (camera at -Z side)."""
    it = [bx("black", -1.1, -1.07, 0, 2.4, 0.4, 0.43), bx("black", 1.07, 1.1, 0, 2.4, 0.4, 0.43),
          bx("black", -1.1, 1.1, 2.37, 2.41, 0.4, 0.43), bx("sign_hr", -1.05, 1.05, 0.0, 2.35, 0.43, 0.45),
          bx("sign_hr", -1.05, 1.05, 0.0, 0.01, -0.3, 0.43)]
    it += xform(visitor_chair("sofa_grey"), 0, 0.05, 180)
    # tripod + camera
    top = np.array([0, 1.35, -1.5])
    for k in range(3):
        a = 2 * math.pi * k / 3
        it.append(seg_cyl("black", top, top + np.array([math.cos(a) * .3, -1.35, math.sin(a) * .3]), 0.012, 5))
    it += [bx("black", -0.08, 0.08, 1.35, 1.47, -1.56, -1.44), cyl("black", 0, -1.38, 0.035, 1.39, 1.43, 10)]
    lens = trimesh.creation.cylinder(radius=0.035, height=0.1, sections=12)
    lens.apply_translation((0, 1.41, -1.39))
    it.append(("black", lens))
    # ring light
    ring = trimesh.creation.torus(major_radius=0.22, minor_radius=0.025, major_sections=24, minor_sections=6)
    ring.apply_translation((0.7, 1.55, -1.2))
    it += [("softbox", ring), seg_cyl("black", (0.7, 0, -1.2), (0.7, 1.33, -1.2), 0.012, 5)]
    # softbox
    it += [bx("softbox", -1.15, -0.65, 1.3, 1.9, -1.0, -0.95), bx("black", -1.15, -0.65, 1.3, 1.9, -1.2, -1.0),
           seg_cyl("black", (-0.9, 0, -1.1), (-0.9, 1.3, -1.1), 0.012, 5)]
    return it


def safe():
    d = trimesh.creation.cylinder(radius=0.06, height=0.03, sections=16)
    d.apply_translation((0.1, 0.55, 0.32))
    return [bx("sign_dark", -0.35, 0.35, 0, 0.9, -0.3, 0.3), bx("steel", -0.3, 0.3, 0.05, 0.85, 0.3, 0.31),
            ("chrome", d), bx("chrome", -0.2, -0.17, 0.35, 0.6, 0.31, 0.35)]


def lab_bench(w=3.0):
    it = [bx("epoxy", -w / 2, w / 2, 0.88, 0.92, -0.7, 0.7), bx("white_metal", -w / 2, w / 2, 0.1, 0.88, -0.65, 0.65),
          bx("black", -w / 2, w / 2, 0, 0.1, -0.6, 0.6)]
    # reagent shelf in the middle
    for y in (1.3, 1.7):
        it.append(bx("white_metal", -w / 2 + .1, w / 2 - .1, y, y + 0.03, -0.18, 0.18))
    for sx in (-w / 2 + .1, w / 2 - .12):
        it.append(bx("chrome", sx, sx + .02, 0.92, 1.8, -0.02, 0.02))
    for k in range(10):
        x = -w / 2 + 0.25 + k * (w - 0.5) / 9
        it.append(cyl(["water", "ceramic", "book3"][k % 3], x, RNG.uniform(-.1, .1), 0.04, 1.33, 1.33 + RNG.uniform(.1, .2), 8))
        it.append(bx("cardboard", x - .07, x + .07, 1.73, 1.73 + RNG.uniform(.1, .2), -.1, .1))
    # equipment on bench
    for side in (-1, 1):
        zz = side * 0.42
        it += [bx("sign_dark", -w / 2 + .2, -w / 2 + .6, 0.92, 1.12, zz - .13, zz + .13),                   # oscilloscope
               bx("screen_code", -w / 2 + .25, -w / 2 + .45, 0.96, 1.08, zz + side * .131, zz + side * .133),
               # microscope
               bx("white_metal", -.15, .15, 0.92, 0.95, zz - .1, zz + .1), bx("white_metal", -.03, .03, 0.95, 1.25, zz - .08, zz - .04),
               cyl("black", 0, zz, 0.02, 1.12, 1.3, 8),
               # 3D printer
               bx("frame", w / 2 - .65, w / 2 - .2, 0.92, 1.4, zz - .2, zz + .2), bx("glass", w / 2 - .63, w / 2 - .22, 0.94, 1.38, zz + side * .19, zz + side * .2),
               bx("sign_mkt", w / 2 - .5, w / 2 - .35, 0.95, 1.05, zz - .05, zz + .05)]
    return it


def pigeonholes(w=2.4, h=1.8, cols=8, rows=6):
    it = [bx("walnut", -w / 2, w / 2, 0.8, 0.8 + h, -0.2, -0.18)]
    for c in range(cols + 1):
        x = -w / 2 + c * w / cols
        it.append(bx("walnut", x - .01, x + .01, 0.8, 0.8 + h, -0.2, 0.15))
    for r in range(rows + 1):
        y = 0.8 + r * h / rows
        it.append(bx("walnut", -w / 2, w / 2, y - .01, y + .01, -0.2, 0.15))
    for c in range(cols):
        for r in range(rows):
            if RNG.random() < 0.5:
                x = -w / 2 + (c + 0.5) * w / cols
                y = 0.8 + r * h / rows
                it.append(bx("paper", x - .1, x + .1, y + .01, y + .06, -0.15, 0.1))
    it.append(bx("cabinet", -w / 2, w / 2, 0, 0.8, -0.2, 0.15))
    return it


def boxes_shelf(w=1.8, h=2.0):
    it = []
    for sx in (-w / 2, w / 2 - .04):
        for sz in (-.25, .21):
            it.append(bx("steel", sx, sx + .04, 0, h, sz, sz + .04))
    for k in range(4):
        y = 0.1 + k * (h - .15) / 3
        it.append(bx("steel", -w / 2, w / 2, y, y + .03, -.25, .25))
        x = -w / 2 + .05
        while x < w / 2 - .35 and k < 3:
            bw = RNG.uniform(.25, .45)
            it.append(bx("cardboard", x, x + bw, y + .03, y + .03 + RNG.uniform(.2, .38), -.22, .2))
            x += bw + .03
    return it


def stairs(zone, ox, oz):
    """Dog-leg stair in a 4 x 8 m room; origin at room SW corner (ox, oz)."""
    n = 8
    for i in range(n):
        z0 = oz + 1.6 + i * (4.4 / n)
        add(zone, [bx("concrete", ox + .1, ox + 1.95, 0, 0.2 * (i + 1), z0, z0 + 4.4 / n)])
    add(zone, [bx("concrete", ox + .1, ox + 3.9, 0, 1.6, oz + 6.0, oz + 7.9)])
    for i in range(n):
        z0 = oz + 6.0 - (i + 1) * (4.4 / n)
        add(zone, [bx("concrete", ox + 2.05, ox + 3.9, 1.6, 1.6 + 0.2 * (i + 1), z0, z0 + 4.4 / n)])
    add(zone, [bx("wall", ox + 1.95, ox + 2.05, 0, 3.2, oz + 1.6, oz + 6.0)])
    for k in range(10):
        za = oz + 1.6 + 4.4 * k / 10
        add(zone, [bx("chrome", ox + 1.88, ox + 1.92, 0.9 + 1.6 * k / 10, 0.94 + 1.6 * k / 10, za, za + .44),
                   bx("chrome", ox + 2.08, ox + 2.12, 4.1 - 1.6 * (k + 1) / 10, 4.14 - 1.6 * (k + 1) / 10, za, za + .44)])
    place(zone, fire_ext(), ox + 3.7, oz + 0.8)


# ================================================================= SITE
Z = "Site"; CUR["room"] = Z
add(Z, [bx("grass", -14, W + 14, -0.27, -0.21, -14, D + 14)])
add(Z, [bx("paving", -3, W + 3, -0.25, -0.2, -3, D + 3)])                         # perimeter path
add(Z, [bx("paving", 17, 23, -0.25, -0.2, -14, -3)])                              # entrance walk
add(Z, [bx("concrete", -14, W + 14, -0.26, -0.205, -14, -9)])                     # road
for x in np.arange(-10, W + 12, 3.0):
    add(Z, [bx("paper", x, x + 1.4, -0.205, -0.2, -11.6, -11.4)])                 # lane markings
for (x, z) in [(-7, 4), (-7, 14), (-7, 24), (-7, 33), (W + 7, 4), (W + 7, 14), (W + 7, 24), (W + 7, 33),
               (8, D + 7), (22, D + 8), (38, D + 7), (52, D + 8), (10, -6.5), (30, -6.5), (45, -6.5), (-8, -6)]:
    place(Z, tree(RNG.uniform(4.2, 6.0)), x, z, 0, -0.2)
for x in np.arange(-2, W + 2, 1.3):
    if 16 < x < 24:
        continue
    place(Z, shrub(RNG.uniform(0.35, 0.5)), x, -1.6, 0, -0.2)
for z in np.arange(1, D, 1.4):
    place(Z, shrub(RNG.uniform(0.35, 0.5)), -1.6, z, 0, -0.2)
    place(Z, shrub(RNG.uniform(0.35, 0.5)), W + 1.6, z, 0, -0.2)
for x in (14.5, 25.5):                                                            # outdoor benches
    add(Z, [bx("oak", x - 0.9, x + 0.9, 0.25, 0.3, -5.2, -4.7), bx("steel", x - 0.8, x - 0.75, -0.2, 0.25, -5.1, -4.8),
            bx("steel", x + 0.75, x + 0.8, -0.2, 0.25, -5.1, -4.8)])

add("Floor", [bx("slab", 0, W, -0.2, 0.0, 0, D)])
FF = 0.01
for mat, (x0, x1, z0, z1) in {
    "floor_polished": (13, 33, 0.15, 9.6), "tile": (0.15, 9, 0.15, 8), "concrete": (9, 13, 0.15, 8)}.items():
    add("Floor", [bx(mat, x0, x1, 0, FF, z0, z1)])
add("Floor", [bx("tile", 33, 40, 0, FF, 0.15, 8), bx("floor_polished", 0.15, 13, 0, FF, 8, 9.6),
              bx("floor_polished", 33, 59.85, 0, FF, 8, 9.6), bx("floor_polished", 10, 59.85, 0, FF, 26.4, 28),
              bx("floor_polished", 16.5, 59.85, 0, FF, 16.6, 17.6)])
# department carpets
DEPT_FLOORS = [("carpet", 0.15, 16.5, 9.6, 24.8), ("carpet", 10, 16.5, 24.8, 26.4),
               ("carpet_design", 16.5, 24.5, 17.6, 26.4),
               ("carpet_mkt", 24.5, 33, 17.6, 26.4), ("carpet_hr", 33, 40, 17.6, 26.4),
               ("carpet_fin", 40, 46, 17.6, 26.4), ("carpet_res", 46, 59.85, 17.6, 26.4),
               ("wood_floor", 16.5, 30, 9.6, 16.6), ("carpet_sales", 30, 42, 9.6, 16.6),
               ("concrete", 42, 47, 9.6, 16.6), ("carpet_support", 47, 59.85, 9.6, 16.6)]
for (m, x0, x1, z0, z1) in DEPT_FLOORS:
    add("Floor", [bx(m, x0, x1, 0, FF + 0.002, z0, z1)])
# A distinct timber promenade makes the route to the CEO entrance readable.
add("Floor", [bx("wood_floor", 7.55, 10.45, 0, FF + 0.005, 9.6, 24.8)])
# south-east rooms and north band
add("Floor", [bx("carpet_accent", 40, 49, 0, FF, 0.15, 8), bx("wood_floor", 49, 55.5, 0, FF, 0.15, 8),
              bx("concrete", 55.5, 59.85, 0, FF, 0.15, 8), bx("wood_floor", 0.15, 10, 0, FF, 24.8, 35.85),
              bx("carpet_accent", 10, 30, 0, FF, 28, 35.85), bx("carpet_hr", 30, 36, 0, FF, 28, 35.85),
              bx("carpet_fin", 36, 42, 0, FF, 28, 35.85), bx("concrete", 42, 45, 0, FF, 28, 35.85),
              bx("tile", 45, 56, 0, FF, 28, 35.85), bx("concrete", 56, 59.85, 0, FF, 28, 35.85)])

# ================================================================= WALLS
WIN = lambda a, b: (a, b, 0.8, 2.8, "window")
HIGH = lambda a, b: (a, b, 1.8, 2.6, "window")
wall("Exterior_Walls", "x", TE / 2, 0, W, TE, mat="wall_ext", openings=[
    WIN(1.2, 3.8), WIN(5.2, 7.8), WIN(14, 17.6), (18.4, 21.6, 0, 2.8, "glassdoor"), WIN(22.4, 26),
    HIGH(34.2, 35.8), HIGH(37.2, 38.8), WIN(41, 44), WIN(45, 48.3), WIN(49.7, 52), WIN(53, 55), HIGH(56.5, 59)])
wall("Exterior_Walls", "x", D - TE / 2, 0, W, TE, mat="wall_ext", openings=[
    WIN(1, 4.4), WIN(5.6, 9), WIN(11, 17), WIN(18.8, 21.2), WIN(22.8, 25.2), WIN(26.8, 29.2),
    WIN(31, 35), WIN(37, 41), WIN(46, 50), WIN(51, 55)])
wall("Exterior_Walls", "z", TE / 2, 0, D, TE, mat="wall_ext", openings=[
    WIN(2, 6), WIN(10, 13), WIN(14, 17), WIN(18, 21), WIN(22, 25), WIN(29.5, 34.5)])
wall("Exterior_Walls", "z", W - TE / 2, 0, D, TE, mat="wall_ext", openings=[
    WIN(10, 12.8), WIN(13.8, 16.3), WIN(18.2, 21.2), WIN(22, 25.6), (28.3, 29.5, 0, 2.2, "exitdoor")])
add("Entrance", [bx("frame", 17.5, 22.5, 3.0, 3.15, -2.0, 0), bx("accent", 18.2, 21.8, 3.15, 3.55, -0.2, -0.05),
                 bx("rug", 18.3, 21.7, 0, 0.012, 0.3, 1.8)])
it, tw = text_items("WELCOME", 0.04)
place("Entrance", it, 20, -0.21, 180, 3.2)
for x in (17.0, 23.0):
    place("Entrance", areca_palm(1.7, "pot_dark"), x, -0.9, 0, -0.2)

# south band
wall("Kitchen", "x", 8, 0.15, 9, openings=[(4.5, 6.5, 0, 2.2, "open")])
wall("Kitchen", "z", 9, 0.15, 8)
wall("Stairwell", "x", 8, 9, 13)
wall("Stairwell", "z", 13, 0.15, 8, openings=[(0.35, 1.35, 0, 2.1, "door")])
wall("Lifts", "x", 2.6, 27, 33, t=0.25, mat="concrete", openings=[(28.0, 29.1, 0, 2.2, "open"), (30.9, 32.0, 0, 2.2, "open")])
wall("Lifts", "z", 27, 0.15, 2.6, t=0.25, mat="concrete")
wall("Lifts", "z", 30, 0.15, 2.6, t=0.25, mat="concrete")
wall("Washrooms", "z", 33, 0.15, 8, openings=[(2.8, 3.7, 0, 2.1, "door"), (5.6, 6.5, 0, 2.1, "door")])
wall("Washrooms", "x", 4, 33, 40)
wall("Washrooms", "x", 8, 33, 40)
wall("Washrooms", "z", 40, 0.15, 8)
wall("Training_Room", "x", 8, 40, 49, openings=[(46.8, 48.6, 0, 2.3, "glassdoor"), (41, 46, 1.0, 2.4, "window")])
wall("Wellness_Room", "z", 49, 0.15, 8)
wall("Wellness_Room", "x", 8, 49, 52.5, openings=[(50.6, 51.5, 0, 2.1, "door")])
wall("First_Aid", "z", 52.5, 0.15, 8)
wall("First_Aid", "x", 8, 52.5, 55.5, openings=[(53.6, 54.5, 0, 2.1, "door")])
wall("Mail_Room", "z", 55.5, 0.15, 8)
wall("Mail_Room", "x", 8, 55.5, 59.85, openings=[(56.8, 58.2, 0, 2.2, "door")])

# north band (z 28..36)
N0 = 28
CEO_FRONT = 24.8
wall("CEO_Office", "x", CEO_FRONT, 0.15, 10, openings=[(8.0, 9.55, 0, 2.4, "door"), (1.5, 6.8, 1.0, 2.4, "window")])
glass_wall("Boardroom", "x", N0, 10, 18, doors=[(16.4, 17.5)])
for (a, b, d) in ((18, 22, 20.6), (22, 26, 24.6), (26, 30, 28.6)):
    glass_wall("Meeting_Rooms", "x", N0, a, b, doors=[(d, d + 1.0)])
wall("HR_Office", "x", N0, 30, 36, openings=[(30.4, 31.4, 0, 2.2, "door"), (32, 35.5, 1.0, 2.4, "window")])
wall("Finance_Office", "x", N0, 36, 42, openings=[(36.4, 37.4, 0, 2.2, "door"), (38, 41.5, 1.0, 2.4, "window")])
wall("Server_Room", "x", N0, 42, 45, openings=[(42.4, 43.4, 0, 2.1, "door")])
glass_wall("RnD_Lab", "x", N0, 45, 56, doors=[(45.4, 46.6)])
wall("Fire_Stair", "x", N0, 56, 59.85, openings=[(56.3, 57.6, 0, 2.1, "exitdoor")])
wall("Partitions", "z", 10, CEO_FRONT, D - TE)
for x in (18, 22, 26, 30, 36, 42, 45, 56):
    wall("Partitions", "z", x, N0, D - TE)
add("Boardroom", [bx("accent", 10.08, 10.12, 0, H, N0 + .1, D - .15)])
add("CEO_Office", [bx("walnut", 9.88, 9.92, 0, H, CEO_FRONT + .1, D - .15)])

# room name signs over doors (read from corridor)
for (txt, cx, zone) in (("CEO", 8.78, "CEO_Office"), ("BOARDROOM", 14, "Boardroom"), ("MEETING 1", 20, "Meeting_Rooms"),
                        ("MEETING 2", 24, "Meeting_Rooms"), ("MEETING 3", 28, "Meeting_Rooms"), ("HR", 33, "HR_Office"),
                        ("FINANCE", 39, "Finance_Office"), ("SERVER", 43.5, "Server_Room"), ("R&D LAB", 50.5, "RnD_Lab"),
                        ("STAIRS", 58, "Fire_Stair")):
    wall_text(zone, txt, "x", CEO_FRONT if zone == "CEO_Office" else N0, cx, 2.55, -1, 0.035, "sign_dark", "whiteboard")
for (txt, cx, zone) in (("KITCHEN", 3.2, "Kitchen"), ("TRAINING", 44.5, "Training_Room"), ("WELLNESS", 50.75, "Wellness_Room"),
                        ("FIRST AID", 54.0, "First_Aid"), ("MAIL ROOM", 57.7, "Mail_Room")):
    wall_text(zone, txt, "x", 8, cx, 2.5, 1, 0.03 if len(txt) > 7 else 0.035, "sign_dark", "whiteboard")
wall_text("Washrooms", "MEN", "z", 33, 6.05, 2.3, -1, 0.035, "sign_dark", "whiteboard")
wall_text("Washrooms", "WOMEN", "z", 33, 3.25, 2.3, -1, 0.035, "sign_dark", "whiteboard")
wall_text("Stairwell", "STAIRS", "z", 13, 2.3, 2.3, 1, 0.035, "sign_dark", "whiteboard")

# ================================================================= SOUTH BAND ROOMS
Z = "Reception"; CUR["room"] = Z
add(Z, [bx("quartz", 17.5, 22.5, 0, 1.1, 4.6, 5.2), bx("accent", 17.5, 22.5, 0.05, 1.0, 4.58, 4.6),
        bx("quartz", 17.2, 22.8, 1.1, 1.14, 4.5, 5.25), bx("white_metal", 17.5, 22.5, 0, 0.74, 5.2, 5.9),
        bx("oak", 17.5, 22.5, 0.72, 0.75, 5.2, 5.9)])
for x in (19.0, 21.0):
    place(Z, monitor(), x, 5.4, 0)
    place(Z, office_chair(), x, 6.3, 0)
add(Z, [bx("accent", 17.0, 23.0, 0, 3.0, 7.55, 7.75), bx("walnut", 17.0, 23.0, 3.0, 3.2, 7.55, 7.75)])
it, tw = text_items("RECEPTION", 0.06, 0.02, "sign_text")
place(Z, it, 20, 7.54, 180, 1.9)
place(Z, sofa(2.2, "sofa_green"), 14.9, 2.6, -90)
place(Z, sofa(2.2, "sofa_green"), 25.1, 2.6, 90)
place(Z, table_rect(0.6, 1.2, "walnut", 0.42), 15.9, 2.6)
place(Z, table_rect(0.6, 1.2, "walnut", 0.42), 24.1, 2.6)
place(Z, visitor_chair(), 23.8, 4.3, 180)
place(Z, fiddle_fig(2.0), 13.7, 0.9)
place(Z, monstera(1.1), 13.7, 7.1)
place(Z, fiddle_fig(2.0), 26.3, 0.9)
place(Z, areca_palm(1.8), 17.6, 1.0)
place(Z, areca_palm(1.8), 22.4, 1.0)
add(Z, [bx("rug", 14.3, 17.2, 0, 0.015, 1.2, 4.0), bx("rug", 22.8, 25.7, 0, 0.015, 1.2, 4.0)])
planter_strip(Z, "x", 7.9, 24.4, 26.7)

Z = "Kitchen"; CUR["room"] = Z
add(Z, [bx("cabinet", 8.3, 8.92, 0.1, 0.88, 0.5, 7.2), bx("quartz", 8.25, 8.92, 0.88, 0.92, 0.5, 7.2),
        bx("black", 8.32, 8.92, 0, 0.1, 0.5, 7.2), bx("cabinet", 8.55, 8.92, 1.55, 2.35, 0.5, 5.6),
        bx("quartz", 8.9, 8.92, 0.92, 1.55, 0.5, 7.2), bx("steel", 8.4, 8.8, 0.89, 0.925, 3.2, 3.9),
        bx("chrome", 8.8, 8.86, 0.92, 1.25, 3.52, 3.58), bx("chrome", 8.6, 8.86, 1.21, 1.25, 3.52, 3.58),
        bx("black", 8.4, 8.9, 0.92, 1.22, 4.4, 5.0), bx("screen", 8.39, 8.4, 0.97, 1.17, 4.5, 4.8),
        bx("steel", 8.45, 8.85, 0.92, 1.12, 5.3, 5.6)])
for zz in np.arange(0.5, 7.2, 0.6):
    add(Z, [bx("chrome", 8.28, 8.3, 0.7, 0.72, zz + 0.2, zz + 0.4)])
place(Z, coffee_machine(), 8.6, 1.3, -90, 0.92)
place(Z, coffee_machine(), 8.6, 2.1, -90, 0.92)
place(Z, fridge(), 8.55, 7.5, -90)
place(Z, water_cooler(), 0.5, 7.5, -90)
add(Z, [bx("accent_warm", 0.3, 1.1, 0, 1.9, 0.3, 1.2), bx("glass", 1.1, 1.12, 0.6, 1.8, 0.4, 0.95),
        bx("black", 1.1, 1.13, 0.8, 1.6, 0.98, 1.12)])
place(Z, table_rect(1.8, 0.9, "oak"), 3.2, 4.5, 90)
for dz in (-0.5, 0.5):
    place(Z, visitor_chair("sofa_green"), 2.55, 4.5 + dz, -90)
    place(Z, visitor_chair("sofa_green"), 3.85, 4.5 + dz, 90)
round_meeting(Z, 5.8, 2.2, 0.5, 4, "sofa_green")
round_meeting(Z, 5.8, 5.8, 0.5, 4, "sofa_green")
add(Z, [bx("walnut", 0.2, 0.55, 0.9, 1.1, 2.1, 5.9)])
place(Z, snake_plant(0.9, "pot"), 0.6, 1.7)

Z = "Stairwell"; CUR["room"] = Z
stairs(Z, 9, 0)
place(Z, exit_sign(), 13.09, 0.85, 90, 2.25)

Z = "Lifts"; CUR["room"] = Z
for (x0, x1) in ((28.0, 29.1), (30.9, 32.0)):
    xc = (x0 + x1) / 2
    LIFTS.append(dict(x0=x0, x1=x1, z=2.755))
    add(Z, [bx("steel", x0 - 0.12, x0, 0, 2.3, 2.72, 2.8), bx("steel", x1, x1 + 0.12, 0, 2.3, 2.72, 2.8),
            bx("steel", x0 - 0.12, x1 + 0.12, 2.2, 2.35, 2.72, 2.8), bx("black", xc - 0.25, xc + 0.25, 2.42, 2.58, 2.73, 2.76),
            bx("led_blue", xc - 0.2, xc + 0.2, 2.46, 2.54, 2.76, 2.765), bx("steel", x0 - 0.3, x1 + 0.3, 0, 0.02, 0.4, 2.45),
            bx("mirror", x0 - 0.3, x1 + 0.3, 0.9, 2.2, 0.4, 0.43), bx("chrome", x0 - 0.3, x1 + 0.3, 0.9, 0.94, 0.45, 0.5)])
for xc in (29.7, 32.6):
    add(Z, [bx("steel", xc - 0.05, xc + 0.05, 1.0, 1.35, 2.73, 2.76), bx("led_blue", xc - 0.02, xc + 0.02, 1.1, 1.14, 2.76, 2.77),
            bx("led_blue", xc - 0.02, xc + 0.02, 1.2, 1.24, 2.76, 2.77)])
place(Z, sofa(1.8, "sofa_grey", 0.6), 30.0, 7.4, 180)
add(Z, [bx("black", 27.2, 27.25, 1.0, 2.0, 3.2, 4.4), bx("white_metal", 27.25, 27.26, 1.05, 1.95, 3.25, 4.35)])
place(Z, fiddle_fig(1.9), 32.5, 7.4)
place(Z, fire_ext(), 32.75, 4.8)

Z = "Washrooms"; CUR["room"] = Z
for (zlo, zhi, label) in ((4.0, 8.0, "Men"), (0.15, 4.0, "Women")):
    sw = (zhi - zlo - 0.1) / 3
    for i in range(3):
        za = zlo + 0.05 + i * sw
        zb = za + sw
        add(Z, [bx("cabinet", 38.1, 38.13, 0.15, 2.1, za, zb - 0.7), bx("accent", 38.1, 38.12, 0.15, 2.0, zb - 0.68, zb - 0.02)])
        if i > 0:
            add(Z, [bx("cabinet", 38.13, 39.9, 0.15, 2.1, za - 0.015, za + 0.015)])
        place(Z, toilet(), 39.5, (za + zb) / 2, -90)
        add(Z, [bx("chrome", 38.9, 39.1, 0.75, 0.9, zb - 0.06, zb - 0.03)])
    if label == "Men":
        place(Z, vanity(2.6), 35.2, 4.38, 180)
        for k in range(3):
            x = 34.8 + k * 0.9
            place(Z, urinal(), x, 7.62, 180)
            if k < 2:
                add(Z, [bx("ceramic", x + 0.43, x + 0.47, 0.4, 1.4, 7.4, 7.92)])
    else:
        place(Z, vanity(2.6), 35.2, 3.62, 0)
        add(Z, [bx("white_metal", 33.2, 33.7, 0.0, 0.9, 0.3, 0.8)])
    add(Z, [bx("white_metal", 33.1, 33.2, 1.2, 1.6, zlo + 0.5, zlo + 0.8)])
    place(Z, snake_plant(0.7, "pot", 9, False, 0.13), 33.45, zhi - 0.45 if label == "Men" else zlo + 0.5)

Z = "Training_Room"; CUR["room"] = Z
add(Z, [bx("black", 40.1, 40.14, 0.6, 2.6, 1.6, 6.4), bx("screen_light", 40.14, 40.15, 0.65, 2.55, 1.65, 6.35)])
add(Z, [bx("walnut", 41.0, 41.5, 0, 1.1, 6.6, 7.1), bx("walnut", 40.95, 41.55, 1.1, 1.14, 6.55, 7.15)])   # lectern
place(Z, laptop(), 41.25, 6.85, 90, 1.14)
for x in (42.8, 44.4, 46.0, 47.6):
    for zc in (2.4, 5.4):
        place(Z, table_rect(0.6, 2.4, "oak", 0.74, "white_metal"), x, zc)
        for dz in (-0.75, 0, 0.75):
            place(Z, visitor_chair("fabric_blue"), x + 0.55, zc + dz, 90)
place(Z, mobile_whiteboard(1.6), 48.3, 7.1, 180)
place(Z, areca_palm(1.7), 48.5, 0.7)

Z = "Wellness_Room"; CUR["room"] = Z
add(Z, [bx("mat_purple", 49.5, 50.2, 0, 0.012, 1.0, 2.8), bx("mat_teal", 50.6, 51.3, 0, 0.012, 1.0, 2.8),
        bx("rug", 49.4, 52.1, 0, 0.008, 3.6, 6.4)])
place(Z, armchair("sofa_grey"), 51.6, 4.2, 90)
place(Z, armchair("sofa_green"), 51.6, 5.6, 90)
add(Z, [sphere("fabric_blue", 49.9, 0.15, 5.0, 0.3, 1, 0.45, 1, 2), sphere("mat_purple", 50.5, 0.15, 5.9, 0.3, 1, 0.45, 1, 2)])
place(Z, monstera(1.1), 49.6, 7.3)
place(Z, snake_plant(0.9), 52.0, 0.6)
add(Z, [cyl("ceramic", 52.05, 7.5, 0.08, 0.6, 0.72, 10), bx("walnut", 51.8, 52.3, 0, 0.6, 7.25, 7.75)])

Z = "First_Aid"; CUR["room"] = Z
add(Z, [bx("white_metal", 52.8, 53.0, 1.1, 1.8, 6.4, 7.4), bx("red", 52.99, 53.01, 1.35, 1.55, 6.87, 6.93),
        bx("red", 52.99, 53.01, 1.42, 1.48, 6.8, 7.0)])                                   # first-aid cabinet
add(Z, [bx("white_metal", 53.0, 55.2, 0, 0.55, 0.4, 1.2), bx("whiteboard", 53.0, 55.2, 0.55, 0.65, 0.4, 1.2),
        bx("fabric_blue", 53.0, 53.4, 0.65, 0.75, 0.45, 1.15)])                          # rest cot
place(Z, armchair("fabric_blue"), 54.5, 3.5, 180)
place(Z, fridge(0.5, 0.85), 55.1, 5.6, 90)
add(Z, [bx("cabinet", 52.65, 53.2, 0, 0.88, 4.0, 5.0), bx("quartz", 52.65, 53.25, 0.88, 0.92, 4.0, 5.0),
        bx("steel", 52.75, 53.15, 0.89, 0.925, 4.3, 4.7)])
place(Z, desk_plant(), 53.0, 4.8, 0, 0.92)

Z = "Mail_Room"; CUR["room"] = Z
place(Z, pigeonholes(2.4), 55.85, 3.2, 90)
place(Z, boxes_shelf(1.8), 59.55, 3.0, -90)
place(Z, boxes_shelf(1.8), 59.55, 5.2, -90)
place(Z, table_rect(1.6, 0.8, "oak", 0.9, "steel"), 57.6, 4.2, 90)
for (x, z, s) in ((57.4, 3.8, .35), (57.8, 4.6, .25), (58.3, 1.2, .45), (58.8, 1.0, .3), (56.5, 6.9, .4)):
    y = 0.9 if (x, z) in ((57.4, 3.8), (57.8, 4.6)) else 0
    add(Z, [bx("cardboard", x - s / 2, x + s / 2, y, y + s * .7, z - s / 2, z + s / 2)])
place(Z, printer(), 56.1, 6.5, -90)

# ================================================================= NORTH BAND ROOMS (z 28..36)
Z = "CEO_Office"; CUR["room"] = Z
add(Z, [bx("rug", 1.0, 5.7, 0, 0.015, 25.2, 29.3)])
add(Z, [bx("rug", 2.8, 7.4, 0, 0.015, 22.6 + NZ, 27.0 + NZ)])
add(Z, [bx("walnut", 3.4, 6.6, 0.72, 0.77, 24.9 + NZ, 25.9 + NZ), bx("walnut", 3.4, 3.5, 0, 0.72, 24.9 + NZ, 25.9 + NZ),
        bx("walnut", 6.5, 6.6, 0, 0.72, 24.9 + NZ, 25.9 + NZ), bx("walnut", 3.5, 6.5, 0.2, 0.72, 24.9 + NZ, 24.95 + NZ),
        bx("walnut", 5.8, 6.5, 0, 0.72, 25.5 + NZ, 25.9 + NZ)])
place(Z, monitor(2, 0.56), 5.0, 25.25 + NZ, 0, 0.03)
add(Z, [bx("keyboard", 4.75, 5.25, 0.77, 0.79, 25.5 + NZ, 25.65 + NZ), bx("black", 6.1, 6.35, 0.77, 0.79, 25.3 + NZ, 25.5 + NZ)])
place(Z, laptop(), 3.9, 25.5 + NZ, -20, 0.77)
place(Z, exec_chair(), 5.0, 26.3 + NZ, 0)
place(Z, visitor_chair("leather"), 4.3, 24.3 + NZ, 180)
place(Z, visitor_chair("leather"), 5.7, 24.3 + NZ, 180)
add(Z, [bx("walnut", 2.5, 7.5, 0, 0.7, 27.35 + NZ, 27.8 + NZ), bx("quartz", 2.5, 7.5, 0.7, 0.73, 27.35 + NZ, 27.8 + NZ)])
place(Z, desk_plant(), 3.0, 27.55 + NZ, 0, 0.73)
place(Z, bookshelf(1.8), 9.65, 22.3 + NZ, 90)
place(Z, bookshelf(1.8), 9.65, 24.2 + NZ, 90)
place(Z, tv(1.4, 0.8, 1.3), 9.85, 26.3 + NZ, 90)
place(Z, sofa(2.2, "leather"), 0.75, 23.6 + NZ, -90)
place(Z, armchair("leather"), 2.6, 21.7 + NZ, 160)
place(Z, table_rect(0.6, 1.1, "walnut", 0.42), 1.8, 23.6 + NZ)
round_meeting(Z, 3.3, 27.3, 0.62, 4, "leather", "walnut")
# The new southern half is a private briefing and work area. Keep the east
# aisle from the entrance to the executive desk open for both player and team.
place(Z, whiteboard(2.5, 1.25, 0.9), 0.2, 27.3, 90)
place(Z, [marker("tvwatch", 0, 0, 1.6)] + tv(1.9, 1.05, 1.15, "screen_light"), 9.82, 29.0, -90)
add(Z, [bx("walnut", 5.7, 7.0, 0, 0.71, 25.0, 25.65), bx("quartz", 5.65, 7.05, 0.71, 0.75, 24.98, 25.67)])
place(Z, coffee_machine(), 6.25, 25.35, 0, 0.75)
place(Z, printer(), 1.05, 25.65, 0)
place(Z, safe(), 1.0, 34.3, 180)
add(Z, [marker("archive", 1.0, 0, 34.2, fwd=(0, 0, 1))])
# Floor lamp with a switch that controls its local light in the renderer.
add(Z, [cyl("bronze", 0.75, 29.1, 0.16, 0, 0.035, 16), cyl("bronze", 0.75, 29.1, 0.018, 0.035, 1.7, 10),
        cyl("softbox", 0.75, 29.1, 0.22, 1.67, 1.82, 20), marker("lamp", 0.75, 1.55, 29.1, fwd=(-1, 0, 0))])
place(Z, fiddle_fig(2.1), 0.7, 27.2 + NZ)
place(Z, areca_palm(1.9), 9.2, 27.2 + NZ)
add(Z, [bx("accent_warm", 0.16, 0.2, 1.3, 2.3, 20.8 + NZ, 22.2 + NZ)])

Z = "Boardroom"; CUR["room"] = Z
add(Z, [bx("walnut", 11.6, 16.4, 0.72, 0.76, 23.4 + NZ, 25.0 + NZ), bx("black", 13.8, 14.2, 0.76, 0.78, 24.1 + NZ, 24.3 + NZ)])
for x in (12.6, 15.4):
    add(Z, [bx("chrome", x - 0.3, x + 0.3, 0, 0.72, 24.1 + NZ, 24.3 + NZ)])
for i in range(5):
    x = 12.0 + i * 1.0
    place(Z, office_chair(), x, 22.8 + NZ, 180)
    place(Z, office_chair(), x, 25.6 + NZ, 0)
place(Z, office_chair(), 11.1, 24.2 + NZ, -90)
place(Z, tv(2.4, 1.35, 1.0), 17.9, 24.2 + NZ, 90)
add(Z, [bx("walnut", 17.4, 17.85, 0, 0.6, 22.5 + NZ, 25.9 + NZ)])
place(Z, whiteboard(2.4), 10.18, 24.2 + NZ, -90)
place(Z, snake_plant(1.0), 11.0, 27.4 + NZ)
place(Z, snake_plant(1.0), 17.2, 27.4 + NZ)

Z = "Meeting_Rooms"; CUR["room"] = Z
for x0 in (18, 22, 26):
    CUR["room"] = "Meeting_%d" % ((x0 - 18) // 4 + 1)
    xc = x0 + 2
    place(Z, table_rect(1.1, 2.6, "oak"), xc, 24.2 + NZ)
    for dz in (-0.8, 0.0, 0.8):
        place(Z, office_chair("fabric_blue"), xc - 0.85, 24.2 + NZ + dz, -90)
        place(Z, office_chair("fabric_blue"), xc + 0.85, 24.2 + NZ + dz, 90)
    place(Z, tv(1.4, 0.8, 1.1), xc, 27.8 + NZ, 180)
    add(Z, [bx("black", xc - 0.15, xc + 0.15, 0.74, 0.76, 24.1 + NZ, 24.3 + NZ),
            bx("black", x0 + 2.4, x0 + 2.6, 1.3, 1.45, N0 - .1, N0 - .08), bx("led_green", x0 + 2.42, x0 + 2.58, 1.32, 1.43, N0 - .11, N0 - .1)])
    place(Z, snake_plant(0.8, "pot", 10, False, 0.14), x0 + 0.4, 27.4 + NZ)

Z = "HR_Office"; CUR["room"] = Z
place(Z, desk(1.6, 0.8, "std", False), 33, 34.6, 0)
place(Z, office_chair(), 33, 35.3, 0)
place(Z, visitor_chair(), 32.5, 33.5, 180)
place(Z, visitor_chair(), 33.5, 33.5, 180)
for i in range(3):
    place(Z, filing_cabinet(4), 35.6, 29.0 + i * 0.5, -90)
round_meeting(Z, 31.4, 29.8, 0.45, 3)
place(Z, monstera(1.1), 35.4, 35.3)

Z = "Finance_Office"; CUR["room"] = Z
place(Z, desk(1.6, 0.8, "finance", False), 39, 34.6, 0)
place(Z, exec_chair(), 39, 35.3, 0)
place(Z, visitor_chair("leather"), 38.5, 33.5, 180)
place(Z, visitor_chair("leather"), 39.5, 33.5, 180)
place(Z, safe(), 41.45, 29.2, -90)
place(Z, bookshelf(1.6, 2.0), 41.7, 31.6, -90)
place(Z, fiddle_fig(1.9), 36.6, 35.3)
round_meeting(Z, 37.4, 29.9, 0.45, 3, "leather", "walnut")

Z = "Server_Room"; CUR["room"] = Z
for i in range(4):
    place(Z, server_rack(), 42.6, 29.3 + i * 0.62, 90)  # Leave a usable central service aisle.
for i in range(4):
    place(Z, server_rack(), 44.5, 29.3 + i * 0.62, -90)
add(Z, [bx("white_metal", 42.3, 44.8, 0, 1.9, 34.9, 35.6), bx("keyboard", 42.4, 44.7, 1.4, 1.8, 34.88, 34.9),
        bx("sign_mkt", 42.2, 42.5, 0, 2.0, 33.3, 34.3)])
place(Z, fire_ext(), 44.7, 28.4)

Z = "RnD_Lab"; CUR["room"] = Z
place(Z, lab_bench(3.4), 48.7, 31.2)
place(Z, lab_bench(3.4), 52.9, 31.2)
for x in (47.5, 48.7, 49.9, 51.7, 52.9, 54.1):
    for dz in (-1.0, 1.0):
        place(Z, stool(0.65), x, 31.2 + dz)
# perimeter bench under windows with fume hood
add(Z, [bx("epoxy", 45.2, 55.8, 0.88, 0.92, 35.1, 35.8), bx("white_metal", 45.2, 55.8, 0.1, 0.88, 35.15, 35.8)])
add(Z, [bx("white_metal", 45.2, 46.8, 0.92, 2.4, 34.9, 35.8), bx("glass", 45.3, 46.7, 0.95, 1.8, 34.88, 34.9),
        bx("black", 45.3, 46.7, 1.8, 2.3, 34.88, 34.9)])                                   # fume hood
place(Z, boxes_shelf(1.8), 55.6, 29.4, -90)
add(Z, [bx("cork", 45.12, 45.14, 1.0, 2.2, 29.0, 31.5)])                                  # tool pegboard
for k in range(10):
    zz = 29.2 + k * 0.22
    add(Z, [bx(["red", "black", "steel", "sign_mkt"][k % 4], 45.14, 45.18, 1.3 + (k % 3) * .25, 1.5 + (k % 3) * .25, zz, zz + .06)])
add(Z, [bx("white_metal", 45.2, 45.8, 0, 1.0, 33.0, 33.7), bx("ceramic", 45.3, 45.7, 1.0, 1.05, 33.1, 33.6)])     # eye-wash/sink
place(Z, mobile_whiteboard(1.8), 50.8, 34.2, 180)

Z = "Fire_Stair"; CUR["room"] = Z
stairs(Z, 56, N0)
place(Z, exit_sign(), 59.83, 28.9, -90, 2.3)
place(Z, exit_sign(), 57.0, N0 - T / 2 - .01, 180, 2.25)

# ================================================================= DEPARTMENTS (middle zone z 9.6..26.4)
# ---- Engineering (programmers)  x 0.3..16.5, z 9.6..26.4
Z = "Dept_Engineering"; CUR["room"] = Z
# Removing the middle desk bank opens a continuous 2.6 m route to the CEO door.
for cx in (3.3, 13.3):
    for cz in (11.3, 14.5, 17.7, 20.9):
        place(Z, bench_cluster(3, "dev", "sign_eng"), cx, cz)
# Engineering's huddle furniture stays west of the new route.
place(Z, mobile_whiteboard(1.8), 2.4, 24.1, 180)
place(Z, sofa(2.0, "fabric_blue"), 3.9, 23.35, 180)
place(Z, table_rect(0.9, 0.5, "oak", 0.42), 3.9, 24.2)
place(Z, pod("sign_eng"), 13.6, 24.0, 0)
place(Z, pod("sign_eng"), 15.2, 24.0, 0)
place(Z, locker_bank(8, "sign_eng"), 2.4, 8.35 - 0.0, 0)
place(Z, locker_bank(8, "sign_eng"), 0.55, 10.8, 90)  # Keep the kitchen doorway clear.
place(Z, fiddle_fig(1.9), 0.7, 22.4)
place(Z, areca_palm(1.8), 1.0, 21.9)
hang(Z, "ENGINEERING", "sign_eng", 8.3, 16.1)
planter_strip(Z, "z", 16.5, 18.0, 21.7)
planter_strip(Z, "z", 16.5, 22.7, 26.0)
planter_strip(Z, "z", 16.5, 10.0, 13.0)

# ---- Design  x 16.5..24.5, z 17.6..26.4
Z = "Dept_Design"; CUR["room"] = Z
for cx in (18.6, 22.4):
    for cz in (19.3, 22.5):
        place(Z, bench_cluster(2, "design", "sign_design"), cx, cz)
place(Z, moodboard(2.6), 18.6, 26.1, 180)
place(Z, table_rect(1.8, 0.9, "oak", 0.95, "white_metal"), 22.4, 25.2)
for k in range(8):
    x = 21.7 + (k % 4) * 0.35
    add(Z, [bx(["sign_design", "sign_mkt", "sign_hr", "book3"][k % 4], x, x + 0.25, 0.95, 0.955, 24.95 + (k // 4) * .3, 25.15 + (k // 4) * .3)])
for dx in (-0.6, 0.6):
    place(Z, stool(0.72), 22.4 + dx, 24.4)
add(Z, [bx("black", 23.7, 24.3, 0, 1.0, 25.9, 26.3), bx("white_metal", 23.65, 24.35, 1.0, 1.15, 25.85, 26.35)])   # plotter
hang(Z, "DESIGN", "sign_design", 20.5, 17.1)
planter_strip(Z, "z", 24.5, 18.0, 23.2)

# ---- Marketing  x 24.5..33, z 17.6..26.4
Z = "Dept_Marketing"; CUR["room"] = Z
for cx in (26.5, 30.3):
    for cz in (19.3, 22.5):
        place(Z, bench_cluster(2, "std", "sign_mkt"), cx, cz)
place(Z, studio_set(), 31.3, 25.3, 180)
round_meeting(Z, 26.3, 25.2, 0.55, 4, "sofa_green")
place(Z, tv_stand(1.4, 0.8, "screen_light"), 28.6, 26.1, 180)
place(Z, moodboard(1.6), 28.6, 24.35, 0)
place(Z, monstera(1.1), 24.9, 24.2)
hang(Z, "MARKETING", "sign_mkt", 28.4, 17.1)
planter_strip(Z, "z", 33.0, 18.0, 23.2)

# ---- HR team  x 33..40
Z = "Dept_HR"; CUR["room"] = Z
place(Z, bench_cluster(3, "std", "sign_hr"), 36.5, 19.3)
place(Z, bench_cluster(2, "std", "sign_hr"), 36.5, 22.5)
round_meeting(Z, 35.0, 25.0, 0.45, 3, "fabric_blue")
for i in range(4):
    place(Z, filing_cabinet(4), 37.8 + i * 0.5, 26.0, 180)
add(Z, [bx("cork", 33.3, 33.32, 1.0, 2.0, 22.0, 24.2)])
for k in range(8):
    zz = 22.1 + (k % 4) * .5
    add(Z, [bx(["paper", "sign_hr", "book3"][k % 3], 33.32, 33.325, 1.1 + (k // 4) * .45, 1.4 + (k // 4) * .45, zz, zz + .3)])
place(Z, snake_plant(1.0), 39.6, 24.9)
hang(Z, "HR", "sign_hr", 36.5, 17.1)
planter_strip(Z, "z", 40.0, 18.0, 23.2)

# ---- Finance  x 40..46
Z = "Dept_Finance"; CUR["room"] = Z
place(Z, bench_cluster(2, "finance", "sign_fin"), 43.0, 19.3)
place(Z, bench_cluster(2, "finance", "sign_fin"), 43.0, 22.5)
for i in range(5):
    place(Z, filing_cabinet(4), 40.7 + i * 0.5, 26.0, 180)
place(Z, safe(), 45.4, 25.8, 180)
place(Z, printer(), 45.4, 24.6, -90)
place(Z, fiddle_fig(1.8), 44.0, 25.9)
hang(Z, "FINANCE", "sign_fin", 43.0, 17.1)
planter_strip(Z, "z", 46.0, 18.0, 23.2)

# ---- Research  x 46..59.85
Z = "Dept_Research"; CUR["room"] = Z
for cx in (49.4, 55.0):
    for cz in (19.3, 22.5):
        place(Z, bench_cluster(3, "research", "sign_res"), cx, cz)
for x in (47.4, 49.3, 51.2):
    place(Z, bookshelf(1.8, 2.0), x, 26.15, 180)
place(Z, mobile_whiteboard(2.0), 54.0, 26.0, 180)
place(Z, mobile_whiteboard(2.0), 56.3, 26.0, 180)
place(Z, armchair("sofa_grey"), 58.9, 19.0, 90)
place(Z, armchair("sofa_grey"), 58.9, 20.4, 90)
add(Z, [cyl("walnut", 58.9, 19.7, 0.22, 0.5, 0.53, 14), cyl("chrome", 58.9, 19.7, 0.02, 0, 0.5, 6)])
place(Z, areca_palm(1.9), 58.9, 22.2)
place(Z, monstera(1.1), 58.9, 25.6)
hang(Z, "RESEARCH", "sign_res", 52.2, 17.1)

# ---- Café / breakout  x 16.5..30, z 9.6..16.6
Z = "Cafe_Breakout"; CUR["room"] = Z
add(Z, [bx("walnut", 17.2, 21.2, 0, 0.95, 10.1, 10.8), bx("quartz", 17.1, 21.3, 0.95, 0.99, 10.05, 10.85),
        bx("walnut", 17.2, 21.2, 0, 0.95, 10.8, 11.0)])
place(Z, coffee_machine(), 17.8, 10.45, 180, 0.99)
place(Z, coffee_machine(), 18.6, 10.45, 180, 0.99)
for k in range(6):
    add(Z, [cyl("ceramic", 19.4 + 0.12 * (k % 3), 10.3 + 0.14 * (k // 3), 0.04, 0.99, 1.09, 10)])
add(Z, [bx("glass", 20.2, 21.1, 0.99, 1.3, 10.2, 10.7), bx("book3", 20.3, 21.0, 0.99, 1.08, 10.3, 10.6)])   # pastry case
place(Z, fridge(0.6, 1.8), 16.95, 10.5, 90)
for x in (17.6, 18.6, 19.6, 20.6):
    place(Z, stool(0.72), x, 11.55)
for (x, z) in ((22.6, 11.0), (25.4, 11.0), (28.2, 11.0)):
    round_meeting(Z, x, z, 0.45, 4, "sign_cafe" if x < 25 else "fabric_blue")
place(Z, sofa(2.4, "sofa_grey"), 18.6, 16.0, 0)
place(Z, sofa(2.0, "sofa_green"), 17.1, 14.0, -90)
place(Z, table_rect(1.3, 0.7, "oak", 0.4), 18.8, 14.3)
add(Z, [bx("rug", 17.4, 20.8, 0, 0.015, 12.9, 16.2)])
place(Z, table_rect(2.4, 0.7, "walnut", 1.05, "black"), 23.2, 14.4)
for dx in (-0.8, 0, 0.8):
    place(Z, stool(), 23.2 + dx, 13.75)
    place(Z, stool(), 23.2 + dx, 15.05, 180)
add(Z, [bx("walnut", 26.2, 27.8, 0.72, 0.9, 13.9, 14.7), bx("grass", 26.25, 27.75, 0.75, 0.76, 13.95, 14.65)])
for k in range(4):
    add(Z, [cyl_x("chrome", 26.0, 28.0, 0.92, 14.05 + k * 0.2, 0.012, 6)])
add(Z, [bx("walnut", 26.1, 27.9, 0, 0.72, 13.95, 14.0), bx("walnut", 26.1, 27.9, 0, 0.72, 14.6, 14.65)])
place(Z, beanbag(), 28.6, 15.8)
place(Z, beanbag("sign_design"), 29.4, 14.9)
place(Z, beanbag("sofa_green"), 25.6, 15.9)
place(Z, tv_stand(1.8, 1.0), 21.4, 13.0, 90)
place(Z, fiddle_fig(2.0), 16.9, 12.1)
place(Z, areca_palm(1.9), 29.5, 12.8)
place(Z, water_cooler(), 21.6, 10.4)
hang(Z, "CAFE", "sign_cafe", 23.8, 9.9)

# ---- Sales  x 30..42, z 9.6..16.6
Z = "Dept_Sales"; CUR["room"] = Z
for cx in (33.0, 38.3):
    for cz in (11.3, 14.5):
        place(Z, bench_cluster(3, "headset", "sign_sales"), cx, cz)
place(Z, tv_stand(1.6, 0.9, "screen_light"), 41.4, 12.4, -90)
place(Z, gong(), 41.3, 15.3, -90)
place(Z, snake_plant(1.0), 30.6, 16.1)
hang(Z, "SALES", "sign_sales", 35.7, 9.9)
planter_strip(Z, "z", 30.2, 10.2, 15.8)

# ---- IT helpdesk + print hub  x 42..47
Z = "IT_Helpdesk"; CUR["room"] = Z
add(Z, [bx("sign_it", 42.8, 46.6, 0, 1.05, 12.3, 12.8), bx("quartz", 42.7, 46.7, 1.05, 1.09, 12.25, 12.9),
        bx("white_metal", 42.8, 46.6, 0, 0.74, 12.9, 13.6), bx("oak", 42.8, 46.6, 0.72, 0.75, 12.9, 13.6)])
for x in (43.7, 45.7):
    place(Z, monitor(2, 0.5), x, 13.05, 0, 0.01)
    place(Z, office_chair(), x, 14.0, 0)
place(Z, boxes_shelf(1.8), 46.6, 15.3, -90)
place(Z, printer(), 42.6, 15.2, 90)
place(Z, printer(), 42.6, 16.1, 90)
add(Z, [bx("steel", 44.4, 45.4, 0.1, 1.0, 15.6, 16.2), bx("black", 44.4, 45.4, 0.05, 0.1, 15.6, 16.2)])   # laptop cart
for k in range(5):
    add(Z, [bx("white_metal", 44.45 + k * .19, 44.47 + k * .19, 0.2, 0.45, 15.65, 16.15)])
hang(Z, "IT HELPDESK", "sign_it", 44.8, 9.9)
place(Z, snake_plant(0.9), 46.6, 10.1)

# ---- Customer support  x 47..59.85, z 9.6..16.6
Z = "Dept_Support"; CUR["room"] = Z
for cx in (50.2, 55.6):
    for cz in (11.3, 14.5):
        place(Z, bench_cluster(3, "headset", "sign_support"), cx, cz)
place(Z, tv_stand(1.6, 0.9, "screen_light"), 58.9, 13.0, -90)
place(Z, fiddle_fig(1.9), 59.2, 16.0)
hang(Z, "CUSTOMER SUPPORT", "sign_support", 53.0, 9.9)
planter_strip(Z, "z", 47.2, 10.2, 15.8)

# ---- corridor fittings
Z = "Corridor"; CUR["room"] = Z
for (x, z, r) in ((0.35, 26.8, -90), (59.65, 26.8, 90), (30, 9.0, 0)):
    place(Z, fire_ext(), x, z, r)
place(Z, exit_sign(), 20, 0.31, 0, 2.85)
place(Z, water_cooler(), 53.6, 27.1, 180)
for x in (12.5, 33.5, 44.6):
    place(Z, snake_plant(1.0), x, 27.4)

# ================================================================= EXPORT
scene = trimesh.Scene()
total = 0
counts = {}
for zone, mats in SCENE.items():
    scene.graph.update(frame_from=scene.graph.base_frame, frame_to=zone, matrix=np.eye(4))
    for mat, meshes in mats.items():
        if not meshes:
            continue
        m = trimesh.util.concatenate(meshes)
        m.visual = TextureVisuals(material=material_objs[mat])
        total += len(m.faces)
        scene.add_geometry(m, geom_name=f"{zone}_{mat}", node_name=f"{zone}_{mat}", parent_node_name=zone)
scene.export("corporate_office_v3.glb")

# ---- world data: collision grid, markers, doors
import json, base64
from pathlib import Path
LAYOUT = json.loads(Path(__file__).with_name('office-layout.json').read_text(encoding='utf-8'))
GX0, GZ0, CELL, NX, NZ_ = -4.0, -8.0, 0.2, 340, 240
occ = np.zeros((NZ_, NX), np.uint8)
cx = GX0 + (np.arange(NX) + 0.5) * CELL
cz = GZ0 + (np.arange(NZ_) + 0.5) * CELL
for zone, mats in SCENE.items():
    if zone in ("Floor",):
        continue
    for mat, meshes in mats.items():
        for m in meshes:
            if m.metadata.get("noblock"):
                continue
            (x0, y0, z0), (x1, y1, z1) = m.bounds
            if y1 < 0.15 or y0 > 1.7:
                continue
            if (x1 - x0) * (z1 - z0) < 0.0004 and zone == "Site":
                continue
            e = CELL * 0.5
            ix = np.where((cx >= x0 - e) & (cx <= x1 + e))[0]
            iz = np.where((cz >= z0 - e) & (cz <= z1 + e))[0]
            if len(ix) and len(iz):
                occ[iz[0]:iz[-1] + 1, ix[0]:ix[-1] + 1] = 1
bits = np.packbits(occ.flatten())
marks = []
for m in MARKERS:
    v = m.vertices
    f = v[1] - v[0]
    md = {k: (bool(v_) if isinstance(v_, (bool, np.bool_)) else v_) for k, v_ in m.metadata.items() if k not in ("shape", "extents")}
    marks.append(dict(p=[round(float(x), 3) for x in v[0]], f=[round(float(f[0]), 3), round(float(f[2]), 3)], **md))
world = dict(grid=dict(x0=GX0, z0=GZ0, cell=CELL, nx=NX, nz=NZ_, bits=base64.b64encode(bits.tobytes()).decode()),
             markers=marks, doors=DOORS, lifts=LIFTS, bounds=[0, 0, W, D], layout=LAYOUT)
json.dump(world, open("world.json", "w"))
from collections import Counter
print("markers", Counter(m["kind"] for m in marks), "doors", len(DOORS), "blocked %", round(occ.mean() * 100, 1))
