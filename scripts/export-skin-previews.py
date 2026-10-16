"""Export existing game geometry/UVs without modifying any client or RP source."""
import hashlib
import ast
import importlib.util
import json
import math
import shutil
import sys
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web/site/public/models/skins"
CLIENT = ROOT / ".hotfix-src/cobblecraft_client-0.1.52/src/main"
RP = ROOT / "content/resourcepack/assets"


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def triangles(polygons, texture_size):
    positions, uv = [], []
    for vertices, coords in polygons:
        for index in (0, 1, 2, 0, 2, 3):
            positions.extend(round(float(n), 5) for n in vertices[index])
            uv.extend((round(float(coords[index][0]) / texture_size[0], 7),
                       round(1 - float(coords[index][1]) / texture_size[1], 7)))
    assert len(positions) > 100 and all(math.isfinite(n) for n in positions + uv)
    return {"format": "cobblecraft-mesh-v1", "positions": positions, "uv": uv}


def save(name, mesh, sources):
    mesh["sources"] = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    (OUT / f"{name}.json").write_text(json.dumps(mesh, separators=(",", ":")), encoding="utf-8")
    print(f"{name}: {len(mesh['positions']) // 9} triangles; source hashes included")


def armor(name, toolkit, parts, generated):
    tw, th = toolkit.pack_uv(parts)
    source = CLIENT / f"kotlin/com/cobblecraft/client/cosmetics/{name.title()}OverlayModel.kt"
    # Fail rather than publish a preview from an older generator than the actual game model.
    body = lambda text: "".join(text[text.index("    fun createBodyLayer()"):].split())
    assert body(generated(parts, tw, th)) == body(source.read_text(encoding="utf-8")), f"Generator drift: {source}"
    texture = CLIENT / f"resources/assets/cobblecraft_client/textures/cosmetics/{name}_overlay.png"
    glow = texture.with_name(f"{name}_overlay_glow.png")
    size = Image.open(texture).size
    polygons = [(v * [1, -1, -1], uv) for v, uv, _, _ in toolkit.world_polys(parts, {}, tw, th)]
    save(name, triangles(polygons, size), [source, texture, glow])
    shutil.copyfile(texture, OUT / f"{name}.png")
    shutil.copyfile(glow, OUT / f"{name}-glow.png")
    shutil.copyfile(RP / f"minecraft/textures/item/armor_{name}_helmet.png", OUT / f"{name}-icon.png")


OUT.mkdir(parents=True, exist_ok=True)
m = module("store_mewtwo", ROOT / "scripts/generate-mewtwo-armor.py")
armor("mewtwo", m, m.order_parts(m.build_parts()), m.kotlin)
g = module("store_gyarados", ROOT / "scripts/generate-gyarados-armor.py")
armor("gyarados", g.gm, g.build_parts(), g.gm.kotlin)

geo = RP / "progression_core/bedrock/pokemon/models/0006_charizard/charizard_draconico.geo.json"
texture = RP / "progression_core/textures/pokemon/0006_charizard/charizard_draconico.png"
glow = RP / "progression_core/textures/pokemon_skins/charizard_draconico_glow.png"
geometry = json.loads(geo.read_text())["minecraft:geometry"][0]
bones = {b["name"]: b for b in geometry["bones"]}
transforms = {}
jar = ROOT / "server/mods/Cobblemon-fabric-1.7.3+1.21.1.jar"
animation_path = "assets/cobblemon/bedrock/pokemon/animations/0006_charizard/charizard.animation.json"
with zipfile.ZipFile(jar) as archive:
    animations = json.loads(archive.read(animation_path))["animations"]
idle = next(value["bones"] for key, value in animations.items() if key.endswith(".ground_idle"))


def at_zero(value):
    """Evaluate only numeric arithmetic and degree sin/cos from the actual idle frame, never eval Molang."""
    if isinstance(value, (int, float)):
        return value
    node = ast.parse(value.replace("q.anim_time", "0").replace("math.sin", "sin").replace("math.cos", "cos"), mode="eval").body

    def visit(n):
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return n.value
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, (ast.USub, ast.UAdd)):
            return (-1 if isinstance(n.op, ast.USub) else 1) * visit(n.operand)
        if isinstance(n, ast.BinOp):
            a, b = visit(n.left), visit(n.right)
            if isinstance(n.op, ast.Add): return a + b
            if isinstance(n.op, ast.Sub): return a - b
            if isinstance(n.op, ast.Mult): return a * b
            if isinstance(n.op, ast.Div): return a / b
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in ("sin", "cos") and len(n.args) == 1:
            return getattr(math, n.func.id)(math.radians(visit(n.args[0])))
        raise ValueError(f"Unsupported idle expression: {value}")
    return visit(node)


def bone_transform(name):
    if name in transforms:
        return transforms[name]
    bone = bones[name]
    pose = idle.get(name, {})
    pivot = np.array(bone.get("pivot", [0, 0, 0]), dtype=float)
    angles = np.array(bone.get("rotation", [0, 0, 0])) + np.array([at_zero(v) for v in pose.get("rotation", [0, 0, 0])])
    offset = np.array([at_zero(v) for v in pose.get("position", [0, 0, 0])])
    rotation = m.rot_zyx(*np.radians(angles * [-1, -1, 1])) @ np.diag([at_zero(v) for v in pose.get("scale", [1, 1, 1])])
    if "parent" in bone:
        pr, pt, pp = bone_transform(bone["parent"])
        rotation, translation = pr @ rotation, pt + pr @ (pivot - pp + offset)
    else:
        translation = pivot + offset
    transforms[name] = rotation, translation, pivot
    return transforms[name]


m.TEX_SCALE = 1
polygons = []
for bone in geometry["bones"]:
    rotation, translation, pivot = bone_transform(bone["name"])
    # Eyelids are hidden in the game's open-eye idle pose.
    if bone["name"].startswith("eyelid"):
        continue
    for cube in bone.get("cubes", []):
        origin, size = cube["origin"], cube["size"]
        assert isinstance(cube["uv"], list), "Add per-face UV support before exporting this model"
        c = m.Cube((origin[0], -origin[1] - size[1], origin[2]), tuple(size), cube.get("inflate", 0), "skin", uv=tuple(cube["uv"]), mirror=cube.get("mirror", False))
        cr = m.rot_zyx(*(np.radians(cube.get("rotation", [0, 0, 0])) * [-1, -1, 1]))
        cp = np.array(cube.get("pivot", pivot), dtype=float)
        for vertices, uv, _ in m.cube_polys(c, 256, 128):
            vertices = vertices * [1, -1, 1]
            vertices = (vertices - cp) @ cr.T + cp
            vertices = (vertices - pivot) @ rotation.T + translation
            polygons.append((vertices * [-1, 1, -1], uv))
mesh = triangles(polygons, Image.open(texture).size)
mesh["pose"] = {"animation": "charizard.ground_idle", "time": 0, "source": animation_path}
save("charizard", mesh, [geo, texture, glow, jar])
shutil.copyfile(texture, OUT / "charizard.png")
shutil.copyfile(glow, OUT / "charizard-glow.png")
shutil.copyfile(RP / "minecraft/textures/item/cosmetic_skin_charizard_draconico.png", OUT / "charizard-icon.png")
shutil.copyfile(RP / "progression_core/bedrock/pokemon/models/0006_charizard/charizard_draconico_license", OUT / "charizard-license.txt")
