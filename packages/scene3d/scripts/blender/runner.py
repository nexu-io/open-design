"""scene3d Blender runner.

The compile boundary of the scene3d subsystem. The daemon (or tests) writes
a job JSON, spawns this script headless, and reads ONE sentinel-framed JSON
result line from stdout:

    ###SCENE3D###<base64(json)>###

Everything else on stdout is progress chatter for humans. The runner is
deliberately dependency-free beyond Blender's own Python (bpy, bmesh,
mathutils) so it runs identically under a real Blender executable
(`blender --background --python runner.py -- <job>`) and under the pip `bpy`
module (`python runner.py <job>`).

Modes:
  build   factory-reset, run the project's build.py (or import USD/.blend),
          then dump the deterministic scene census
  proof   load the scene, auto-frame a camera, render stills or a turntable
  export  load the scene, write USD and/or GLB deliverables

Determinism rules: all lists sorted by name, all floats rounded to 6dp,
nothing reads wall-clock time, and geometry analysis happens in world space
with fixed epsilons so results are bit-stable across runs.
"""

import base64
import json
import math
import os
import re
import sys
import traceback

SENTINEL_START = "###SCENE3D###"
SENTINEL_END = "###"


def R6(v):
    """Round to 6dp; map non-finite floats to None so the payload stays
    valid JSON (json.dumps would otherwise emit bare NaN, which Node's
    JSON.parse rejects and the NaN lint rule needs to see)."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(f):
        return None
    return round(f, 6)


def emit(result):
    payload = base64.b64encode(json.dumps(result, allow_nan=False).encode("utf-8")).decode("ascii")
    sys.stdout.write(SENTINEL_START + payload + SENTINEL_END + "\n")
    sys.stdout.flush()


def fail(error_code, error):
    emit({"ok": False, "errorCode": error_code, "error": error})
    sys.exit(1)


def log(msg):
    sys.stdout.write("[scene3d] %s\n" % msg)
    sys.stdout.flush()


def find_job_file(argv):
    for arg in argv:
        if arg.endswith(".json") and os.path.exists(arg):
            return arg
    return None


def reset_scene():
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)


def apply_tweaks(job):
    """Apply user viewport edits after the build script runs.

    `tweaks.json` is the write-back channel for direct manipulation in the
    kit viewer: the user drags a part, the viewer records a delta, and every
    subsequent compile replays it here. The build script stays the source of
    truth for *what exists*; tweaks are a thin, inspectable layer of *where
    the user nudged it* that the agent can read and fold back into the
    script at any time. Unknown part names are ignored silently — a tweak
    for a part the script no longer builds is stale data, not an error.

    Deltas arrive in VIEWER space, which is glTF's Y-up convention, because
    that is the only space the viewer can measure a drag in. Blender is
    Z-up, and its glTF exporter maps Blender (x, y, z) to glTF (x, z, -y) —
    verified against a real export: a lid at Blender z=0.9 ships as glTF
    y=0.9. Inverting that mapping here is what makes "drag up" mean up.
    Without it a vertical drag silently slides the part along depth.
    """
    import bpy
    tweaks = job.get("tweaks") or {}
    if tweaks:
        # World matrices must be current before any world-space write:
        # transforms set outside operators are not flushed until a
        # depsgraph update (the same fact census() documents).
        try:
            bpy.context.view_layer.update()
        except Exception:
            pass
    for name, t in tweaks.items():
        obj = bpy.context.scene.objects.get(name)
        if obj is None:
            continue
        d = t.get("translate")
        if isinstance(d, list) and len(d) == 3:
            try:
                import mathutils
                gx, gy, gz = float(d[0]), float(d[1]), float(d[2])
                delta = mathutils.Vector((gx, -gz, gy))
                if obj.parent is None:
                    obj.location += delta
                else:
                    # The viewer measured the drag in WORLD space; writing
                    # it onto obj.location applies it in the PARENT's
                    # frame, which mis-moves any part nested under a
                    # rotated or scaled group. Route it through the world
                    # matrix so the part lands where the user put it.
                    mw = obj.matrix_world.copy()
                    mw.translation += delta
                    obj.matrix_world = mw
            except Exception:
                pass

        # Rotation, as a quaternion in the same viewer (glTF Y-up) space as
        # the translate. The viewer composes rotations as quaternions and
        # sends one, so nothing here has to reconstruct an orientation from
        # three angles — or inherit their gimbal-lock singularity.
        #
        # Axis mapping is the same as the translate: viewer (x, y, z) is
        # Blender (x, -z, y). Applying that basis change to the vector part
        # of a unit quaternion re-expresses the same rotation in Blender's
        # frame, because the mapping is a rotation itself.
        q = t.get("quat")
        if isinstance(q, list) and len(q) == 4:
            try:
                import mathutils
                gx, gy, gz, w = float(q[0]), float(q[1]), float(q[2]), float(q[3])
                delta = mathutils.Quaternion((w, gx, -gz, gy))
                delta.normalize()
                mode = obj.rotation_mode
                obj.rotation_mode = "QUATERNION"
                obj.rotation_quaternion = delta @ obj.rotation_quaternion
                if mode != "QUATERNION":
                    obj.rotation_mode = mode
            except Exception:
                pass

        # Legacy Euler channel, still honoured so a tweaks.json written by
        # an earlier viewer keeps working.
        r = t.get("rotate")
        if isinstance(r, list) and len(r) == 3:
            try:
                import mathutils
                gx, gy, gz = float(r[0]), float(r[1]), float(r[2])
                delta = mathutils.Euler((gx, -gz, gy), "XYZ").to_quaternion()
                mode = obj.rotation_mode
                obj.rotation_mode = "QUATERNION"
                obj.rotation_quaternion = delta @ obj.rotation_quaternion
                if mode != "QUATERNION":
                    obj.rotation_mode = mode
            except Exception:
                pass

        # Scale is a multiplier, not a delta: 1 means unchanged, so a
        # missing or malformed value can never silently flatten a part.
        s = t.get("scale")
        if isinstance(s, list) and len(s) == 3:
            try:
                sx, sy, sz = float(s[0]), float(s[1]), float(s[2])
                if sx > 0 and sy > 0 and sz > 0:
                    obj.scale.x *= sx
                    obj.scale.y *= sz
                    obj.scale.z *= sy
            except Exception:
                pass

        m = t.get("material")
        if isinstance(m, dict) and m:
            try:
                apply_material_tweak(obj, m)
            except Exception:
                pass


def apply_material_tweak(obj, mt):
    """Replay one part's material tweak from the viewer's material panel.

    Two composable moves, mirroring the panel's two halves:

    - ``assign``: rebind every slot of the part to an existing scene
      material by name — the picker. A name the scene no longer builds is
      stale data and is ignored, exactly like a transform tweak for a
      vanished part.
    - property overrides (baseColor/roughness/metallic/emission/
      emissionStrength/alpha): set Principled inputs on the part's bound
      material — the customizer. When that material is SHARED with other
      objects the override goes onto a per-part instance copy
      (``<material>__<part>``), Unreal's material-instance semantics, so
      tweaking one crate can never silently restyle the whole kit. A part
      that is the material's sole user keeps its material name — no copy
      litter, and claims that name the material still hold.

    Colours arrive as LINEAR floats (the viewer owns display conversion),
    which is exactly what Principled inputs take. Runs after bake_shaders,
    so assigning a shader-baked material binds its finished textures.
    """
    import bpy

    target = None
    assign = mt.get("assign")
    if isinstance(assign, str) and assign:
        target = bpy.data.materials.get(assign)
        if target is None:
            return  # stale assign: the material no longer exists

    if target is None:
        target = obj.active_material
        if target is None:
            for slot in obj.material_slots:
                if slot.material is not None:
                    target = slot.material
                    break

    props = {
        k: mt[k]
        for k in ("baseColor", "roughness", "metallic", "emission",
                  "emissionStrength", "alpha")
        if k in mt
    }

    if props:
        if target is None:
            # Overriding a part that has no material yet: author one, named
            # for the part so provenance stays readable in the census.
            target = bpy.data.materials.new("mtl_%s" % obj.name)
            target.use_nodes = True
        else:
            users = sum(
                1
                for o in bpy.context.scene.objects
                if any(s.material == target for s in o.material_slots)
            )
            shared_elsewhere = users > 1 or (
                users == 1
                and not any(s.material == target for s in obj.material_slots)
            )
            if shared_elsewhere:
                inst_name = ("%s__%s" % (target.name, obj.name))[:63]
                inst = bpy.data.materials.get(inst_name)
                if inst is None:
                    inst = target.copy()
                    inst.name = inst_name
                target = inst
        node = None
        if target.node_tree:
            node = next(
                (n for n in target.node_tree.nodes if n.type == "BSDF_PRINCIPLED"),
                None,
            )
        if node is not None:
            def set_input(name, value):
                """Override one Principled input, honestly.

                A linked input IGNORES its default_value, so writing the
                value without touching the link would silently do nothing
                — the panel showed a change, the bake shipped none. An
                explicit scalar override therefore UNLINKS the map for
                that channel: "make it this value" means this value.
                """
                if name not in node.inputs:
                    return
                inp = node.inputs[name]
                for link in list(inp.links):
                    target.node_tree.links.remove(link)
                inp.default_value = value

            def tint_input(name, rgba):
                """Colour override that RESPECTS an existing map.

                A tint on a textured material multiplies the map rather
                than replacing it — the same MULTIPLY-mix topology the
                glTF importer itself authors for baseColorFactor x
                texture, so the exporter round-trips it back into a
                factor and the map survives the tweak.
                """
                if name not in node.inputs:
                    return
                inp = node.inputs[name]
                links = list(inp.links)
                if not links:
                    inp.default_value = rgba
                    return
                nt = target.node_tree
                src = links[0].from_socket
                for link in links:
                    nt.links.remove(link)
                try:
                    mix = nt.nodes.new("ShaderNodeMix")
                    mix.data_type = "RGBA"
                    mix.blend_type = "MULTIPLY"
                    mix.inputs["Factor"].default_value = 1.0
                    # RGBA sockets on ShaderNodeMix sit at fixed indices.
                    a_sock, b_sock, out_sock = mix.inputs[6], mix.inputs[7], mix.outputs[2]
                except Exception:
                    mix = nt.nodes.new("ShaderNodeMixRGB")
                    mix.blend_type = "MULTIPLY"
                    mix.inputs["Fac"].default_value = 1.0
                    a_sock, b_sock, out_sock = (
                        mix.inputs["Color1"], mix.inputs["Color2"], mix.outputs["Color"])
                nt.links.new(src, a_sock)
                b_sock.default_value = rgba
                nt.links.new(out_sock, inp)

            c = props.get("baseColor")
            if isinstance(c, list) and len(c) == 3:
                tint_input("Base Color", [float(c[0]), float(c[1]), float(c[2]), 1.0])
            if "roughness" in props:
                set_input("Roughness", float(props["roughness"]))
            if "metallic" in props:
                set_input("Metallic", float(props["metallic"]))
            e = props.get("emission")
            if isinstance(e, list) and len(e) == 3:
                set_input("Emission Color", [float(e[0]), float(e[1]), float(e[2]), 1.0])
            if "emissionStrength" in props:
                set_input("Emission Strength", float(props["emissionStrength"]))
            if "alpha" in props:
                a = float(props["alpha"])
                set_input("Alpha", a)
                if a < 1.0:
                    # EEVEE Next names it surface_render_method; legacy EEVEE
                    # names it blend_method. Set whichever this Blender has.
                    if hasattr(target, "surface_render_method"):
                        target.surface_render_method = "BLENDED"
                    elif hasattr(target, "blend_method"):
                        target.blend_method = "BLEND"

    if target is None:
        return
    if obj.material_slots:
        for slot in obj.material_slots:
            slot.material = target
    elif obj.data is not None and hasattr(obj.data, "materials"):
        obj.data.materials.append(target)


def set_world_background(job):
    """Author the proof background from the contract, defensively.

    A factory-reset scene may have no world, no node tree, or a node tree
    with no Background node — agents were writing world-color code that
    silently no-op'd. Declaring `proof.background` in scene3d.json makes it
    the compiler's job, and the compiler builds whatever graph is missing.
    """
    import bpy
    hex_color = (job.get("proof") or {}).get("background")
    if not hex_color:
        # No declared backdrop: give the WORLD a neutral ambient anyway,
        # but render the film transparent so the backdrop stays dark in
        # the PNG and the frame statistics (empty/sparse detection against
        # a dark background) stay valid. PBR metals reflect only their
        # environment — against a black world a real metal-heavy asset
        # (the Khronos DamagedHelmet, any downloaded game prop) renders
        # near-black and reads as a broken pipeline when it is actually a
        # missing environment.
        scene = bpy.context.scene
        world = scene.world
        if world is None:
            world = bpy.data.worlds.new("S3D_World")
            scene.world = world
        world.use_nodes = True
        node = next((n for n in world.node_tree.nodes if n.type == "BACKGROUND"), None)
        if node is None:
            node = world.node_tree.nodes.new("ShaderNodeBackground")
            out = next((n for n in world.node_tree.nodes if n.type == "OUTPUT_WORLD"), None)
            if out is None:
                out = world.node_tree.nodes.new("ShaderNodeOutputWorld")
            world.node_tree.links.new(node.outputs["Background"], out.inputs["Surface"])
        node.inputs["Color"].default_value = (0.28, 0.28, 0.3, 1.0)
        scene.render.film_transparent = True
        return
    try:
        h = hex_color.lstrip("#")
        rgb = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    except Exception:
        return
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("S3D_World")
        bpy.context.scene.world = world
    world.use_nodes = True
    node = next((n for n in world.node_tree.nodes if n.type == "BACKGROUND"), None)
    if node is None:
        node = world.node_tree.nodes.new("ShaderNodeBackground")
        out = next((n for n in world.node_tree.nodes if n.type == "OUTPUT_WORLD"), None)
        if out is None:
            out = world.node_tree.nodes.new("ShaderNodeOutputWorld")
        world.node_tree.links.new(node.outputs["Background"], out.inputs["Surface"])
    node.inputs["Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)


# ------------------------------------------------------------------
# GPU shader bake pipeline
#
# Raw kernels assembled by the TS side (stdlib + kernel + dispatch main)
# are compiled here on the ACTUAL driver via gpu.shader.create_from_info,
# executed offscreen over the UV domain, scanned for non-finite pixels,
# and baked to PNGs that get wired into the scene's materials — so the
# census, the proof render, and every export see the shaded materials.
#
# Two hard-won facts this code encodes:
# - The gpu module is gated in background mode UNTIL a render initialises
#   the backend; a 8x8 EEVEE warmup on the empty scene lifts the gate in
#   well under a second. (Probed, not assumed.)
# - Blender's image save applies colorspace transforms that depend on how
#   the image datablock was created. The bake avoids that machinery
#   entirely: kernels output LINEAR values, this code applies the exact
#   sRGB transfer itself for color channels, and writes the PNG bytes
#   directly — bit-deterministic, no color-management guessing.
# ------------------------------------------------------------------

def gpu_warmup():
    """Render one 8x8 EEVEE frame to initialise the GPU backend.

    Called on the freshly reset (empty) scene, before the build script
    runs, so the render costs milliseconds. Without it every gpu.* call
    raises 'not available in background mode'.
    """
    import bpy
    scene = bpy.context.scene
    prev_engine = scene.render.engine
    prev_x, prev_y = scene.render.resolution_x, scene.render.resolution_y
    prev_path = scene.render.filepath
    cam_data = bpy.data.cameras.new("s3d_warmup_cam")
    cam = bpy.data.objects.new("s3d_warmup_cam", cam_data)
    bpy.context.collection.objects.link(cam)
    prev_cam = scene.camera
    try:
        scene.camera = cam
        scene.render.engine = "BLENDER_EEVEE"
        scene.render.resolution_x = 8
        scene.render.resolution_y = 8
        scene.render.filepath = os.path.join(bpy.app.tempdir, "s3d_warmup.png")
        bpy.ops.render.render(write_still=True)
    finally:
        scene.camera = prev_cam
        scene.render.engine = prev_engine
        scene.render.resolution_x, scene.render.resolution_y = prev_x, prev_y
        scene.render.filepath = prev_path
        bpy.data.objects.remove(cam, do_unlink=True)
        bpy.data.cameras.remove(cam_data)


def write_png(path, rgba_bytes, width, height):
    """Minimal 8-bit RGBA PNG writer (zlib + struct), no color management."""
    import struct
    import zlib

    def chunk(tag, data):
        payload = tag + data
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)

    raw = bytearray()
    stride = width * 4
    for row in range(height):
        raw.append(0)  # filter: None
        start = row * stride
        raw.extend(rgba_bytes[start:start + stride])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    data = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 6)) + chunk(b"IEND", b""))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def srgb_encode(linear):
    """Exact IEC 61966-2-1 transfer, vectorised over a numpy array."""
    import numpy as np
    lo = linear * 12.92
    hi = 1.055 * np.power(np.maximum(linear, 0.0), 1.0 / 2.4) - 0.055
    return np.where(linear <= 0.0031308, lo, hi)


def dilate_rgb(px, passes=16, threshold=0.5 / 255.0):
    """Flood visible RGB into transparent texels — edge padding / bleed.

    A texture that is transparent in places stores black (0,0,0) in those
    texels by default. Bilinear filtering and every mip level then average
    that black into the visible edge, which shows in-engine as a dark halo
    around the art. The fix is to bleed the nearest visible colour outward so
    the RGB under a zero-alpha texel matches its lit neighbour; alpha itself is
    never touched, so the silhouette is unchanged and only the fringe differs.

    Deterministic: a fixed eight-neighbour stencil in a fixed order, a fixed
    pass count. Operate in LINEAR (call before sRGB encode) or the averaged
    colours are gamma-wrong and reintroduce a fringe. Caller dilates per atlas
    cell so colour never bleeds ACROSS a flipbook cell boundary — the 2px
    inset exists precisely to keep cells apart."""
    import numpy as np
    filled = px[:, :, 3] > threshold
    if filled.all() or not filled.any():
        return px
    rgb = px[:, :, :3].copy()
    offsets = ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1))
    for _ in range(passes):
        if filled.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(px.shape[:2], dtype=np.float32)
        for dy, dx in offsets:
            shifted = np.roll(np.roll(rgb, dy, axis=0), dx, axis=1)
            sfilled = np.roll(np.roll(filled, dy, axis=0), dx, axis=1)
            acc += shifted * sfilled[:, :, None]
            cnt += sfilled
        newly = (~filled) & (cnt > 0)
        rgb[newly] = acc[newly] / cnt[newly][:, None]
        filled = filled | newly
    px[:, :, :3] = rgb
    return px


def optical_flow_atlas(frame_lum, cols, rows, size, search=4, block=3):
    """Block-matching FORWARD optical flow between consecutive flipbook frames,
    encoded as a motion-vector atlas.

    For each pixel in frame t, search a (2·search+1)² window in frame t+1 (loop-
    wrapped, so the last frame flows back to the first) for the block-match that
    minimises summed absolute luminance difference; the winning displacement is
    that pixel's flow. Flow is RG-encoded around 0.5 (0.5 = no motion, the pixel
    range maps [-search, +search] px onto [0, 1]); B is 0 and A is 1.

    Fully vectorised over pixels and deterministic — a fixed candidate order and
    fixed pass structure, no randomness — so the atlas is byte-reproducible like
    every other bake. Returns (rgba_bytes, width, height, max_flow_px)."""
    import numpy as np
    n = len(frame_lum)
    mv = np.zeros((rows * size, cols * size, 4), dtype=np.float32)
    mv[:, :, 3] = 1.0

    def box_sum(m):
        # Sum over a block×block neighbourhood via shifted accumulation. Wrap is
        # fine: a flipbook cell is a tile, and the border needs a defined block.
        s = np.zeros_like(m)
        half = block // 2
        for oy in range(-half, half + 1):
            for ox in range(-half, half + 1):
                s += np.roll(np.roll(m, oy, axis=0), ox, axis=1)
        return s

    max_flow = 0.0
    for t in range(n):
        a = frame_lum[t]
        b = frame_lum[(t + 1) % n]
        # Seed with ZERO motion, and only a STRICTLY better match displaces it.
        # A flat or featureless patch matches every shift equally, so seeding
        # at zero keeps it at "no motion" instead of drifting to whichever
        # displacement the scan happened to try first.
        best_dx = np.zeros((size, size), dtype=np.float32)
        best_dy = np.zeros((size, size), dtype=np.float32)
        best_cost = box_sum(np.abs(a - b))
        for dy in range(-search, search + 1):
            for dx in range(-search, search + 1):
                if dx == 0 and dy == 0:
                    continue
                shifted = np.roll(np.roll(b, dy, axis=0), dx, axis=1)
                cost = box_sum(np.abs(a - shifted))
                better = cost < best_cost
                best_cost = np.where(better, cost, best_cost)
                best_dx = np.where(better, float(dx), best_dx)
                best_dy = np.where(better, float(dy), best_dy)
        max_flow = max(max_flow, float(np.max(np.sqrt(best_dx * best_dx + best_dy * best_dy))))
        # Block matching finds the SOURCE shift (where a[x] is found in the next
        # frame is x - dx), so the FORWARD motion of the feature — the direction
        # a pixel travels, which is what an engine interpolates along — is the
        # negation. Encode forward flow around 0.5: a rightward-moving feature
        # reads red > 0.5, a downward one green > 0.5.
        r0 = (t // cols) * size
        c0 = (t % cols) * size
        mv[r0:r0 + size, c0:c0 + size, 0] = np.clip(0.5 - best_dx / (2.0 * search), 0.0, 1.0)
        mv[r0:r0 + size, c0:c0 + size, 1] = np.clip(0.5 - best_dy / (2.0 * search), 0.0, 1.0)

    data = (mv * 255.0 + 0.5).astype(np.uint8).tobytes()
    return data, mv.shape[1], mv.shape[0], max_flow



# Notes about what the GPU oracle could and could not see on THIS machine.
# Populated by the readback probe below; surfaced through the census so a
# platform limit is reported rather than silently narrowing a guarantee.
SHADER_NOTES = []


def probe_nonfinite_readback():
    """Can this driver deliver NaN and Inf through an RGBA32F readback?

    S3D-E-804 promises that a kernel producing non-finite pixels is caught.
    That promise is only as good as the readback: some drivers flush NaN to
    zero on write, and this one does. When that happens the scan sees a
    clean, all-zero image and reports nothing — which is indistinguishable
    from a kernel that was fine. A guarantee that silently varies by machine
    is exactly the failure this compiler exists to prevent, so the coverage
    is measured once and reported as a fact.

    Returns {"nan": bool, "inf": bool}, or None when the probe itself could
    not run (no numpy, no GPU) — also a fact, and also not a pass.
    """
    import gpu
    from gpu_extras.batch import batch_for_shader
    try:
        import numpy as np
    except ImportError:
        return None
    try:
        info = gpu.types.GPUShaderCreateInfo()
        info.vertex_in(0, "VEC2", "pos")
        info.fragment_out(0, "VEC4", "fragColor")
        # Through a uniform, so the compiler cannot fold the division away
        # and answer a question about its optimiser instead of the driver.
        info.push_constant("FLOAT", "uS3dZero")
        info.vertex_source(
            "void main() { gl_Position = vec4(pos, 0.0, 1.0); }")
        info.fragment_source(
            "void main() { float z = uS3dZero;"
            " fragColor = vec4(z / z, 1.0 / z, 0.0, 1.0); }")
        shader = gpu.shader.create_from_info(info)
        off = gpu.types.GPUOffScreen(2, 2, format="RGBA32F")
        with off.bind():
            fb = gpu.state.active_framebuffer_get()
            fb.clear(color=(0.0, 0.0, 0.0, 0.0))
            shader.bind()
            try:
                shader.uniform_float("uS3dZero", 0.0)
            except Exception:
                pass
            batch_for_shader(shader, "TRIS", {"pos": [(-1, -1), (3, -1), (-1, 3)]}).draw(shader)
            buf = fb.read_color(0, 0, 2, 2, 4, 0, "FLOAT")
        off.free()
        px = np.array(buf.to_list(), dtype=np.float32)
        return {"nan": bool(np.isnan(px[:, :, 0]).any()),
                "inf": bool(np.isinf(px[:, :, 1]).any())}
    except Exception:
        return None


def bake_shaders(job):
    """Compile, execute, scan, bake, and wire every declared shader."""
    shaders = job.get("shaders") or []
    if not shaders:
        return
    import bpy
    import gpu
    from gpu_extras.batch import batch_for_shader
    try:
        import numpy as np
    except ImportError:
        fail("S3D-E-803", "shader bake requires numpy, which this Blender python does not ship")

    project_dir = job.get("projectDir") or ""
    tex_dir = os.path.join(project_dir, "out", "textures")

    push_types = {"float": "FLOAT", "int": "INT", "vec2": "VEC2", "vec3": "VEC3", "vec4": "VEC4"}
    baked = {}  # (shader, output) -> abs png path

    # Measure the oracle's reach on this machine BEFORE trusting it.
    coverage = probe_nonfinite_readback()
    if coverage is None:
        SHADER_NOTES.append(
            "the non-finite pixel oracle (S3D-E-804) could not be probed on this "
            "machine, so NaN and Inf in a kernel are unchecked, not clean")
    else:
        missing = [k for k in ("nan", "inf") if not coverage[k]]
        if missing:
            SHADER_NOTES.append(
                "this driver flushes %s through an RGBA32F readback, so the "
                "non-finite pixel oracle (S3D-E-804) cannot see %s in a kernel "
                "here — unchecked, not clean"
                % ("/".join(m.upper() for m in missing),
                   " or ".join(m.upper() for m in missing)))

    for spec in shaders:
        name = spec["name"]
        size = int(spec["size"])
        frames = int(spec.get("frames", 1))
        want_mv = bool(spec.get("motionVectors")) and frames > 1
        try:
            info = gpu.types.GPUShaderCreateInfo()
            info.vertex_in(0, "VEC2", "pos")
            iface = gpu.types.GPUStageInterfaceInfo("s3d_bake_iface")
            iface.smooth("VEC2", "vUv")
            info.vertex_out(iface)
            info.fragment_out(0, "VEC4", "fragColor")
            info.push_constant("INT", "uS3dOutput")
            if frames > 1:
                # Time is a system uniform that exists only for flipbook
                # shaders: cell/frames in [0, 1), one cell per draw.
                info.push_constant("FLOAT", "uS3dTime")
            for u in spec.get("uniforms", []):
                info.push_constant(push_types[u["type"]], u["name"])
            info.vertex_source(spec["vertexSource"])
            info.fragment_source(spec["fragmentSource"])
            shader = gpu.shader.create_from_info(info)
        except Exception as e:
            fail("S3D-E-802", "shader '%s' failed to compile on the driver: %s" % (name, e))

        def draw_cell(out_index, t):
            """One GPU execution of the kernel; returns (size, size, 4)
            float32 in IMAGE orientation (row 0 = top), unclipped."""
            try:
                # Float target, not the RGBA8 default: an 8-bit framebuffer
                # clamps Inf/NaN to bytes before readback, silently blinding
                # the non-finite oracle. RGBA32F preserves what the kernel
                # actually computed.
                off = gpu.types.GPUOffScreen(size, size, format="RGBA32F")
                with off.bind():
                    fb = gpu.state.active_framebuffer_get()
                    fb.clear(color=(0.0, 0.0, 0.0, 0.0))
                    shader.bind()

                    def set_uniform(setter, uname, value):
                        # Drivers strip uniforms whose value provably cannot
                        # affect output (e.g. multiplied by zero); uploading
                        # to a stripped uniform raises. A stripped uniform is
                        # semantically inert, so tolerate it — the sheet and
                        # census rules judge the OUTPUT, which is the honest
                        # place to catch "this knob does nothing".
                        try:
                            setter(uname, value)
                        except Exception:
                            pass

                    set_uniform(shader.uniform_int, "uS3dOutput", out_index)
                    if t is not None:
                        set_uniform(shader.uniform_float, "uS3dTime", t)
                    for u in spec.get("uniforms", []):
                        if u["type"] == "int":
                            set_uniform(shader.uniform_int, u["name"], int(u["value"][0]))
                        elif u["type"] == "float":
                            set_uniform(shader.uniform_float, u["name"], float(u["value"][0]))
                        else:
                            set_uniform(shader.uniform_float, u["name"],
                                        tuple(float(v) for v in u["value"]))
                    batch = batch_for_shader(shader, "TRIS", {"pos": [(-1, -1), (3, -1), (-1, 3)]})
                    batch.draw(shader)
                    buf = fb.read_color(0, 0, size, size, 4, 0, "FLOAT")
                off.free()
            except Exception as e:
                fail("S3D-E-803", "shader '%s' failed to execute: %s" % (name, e))
            cell_px = np.array(buf.to_list(), dtype=np.float32)
            return cell_px[::-1, :, :]  # framebuffer bottom-up -> image top-down

        for out_index, output in enumerate(spec.get("outputs", [])):
            if frames > 1:
                # Flipbook: bake each time cell and assemble the atlas in
                # the compiler-derived power-of-two grid, row-major from
                # the top-left — the layout the sheet rules adjudicate.
                cols = 2 ** math.ceil(math.log2(math.sqrt(frames)))
                rows = frames // cols
                # The TS validator restricts frames to {2,4,8,16,32,64},
                # which always tile exactly. Anything else reaching here is
                # a broken caller and must fail as a sentence, not as a
                # numpy IndexError three stages later.
                if cols * rows != frames:
                    fail("S3D-E-801",
                         "shader '%s': %d frames do not tile a power-of-two "
                         "atlas — frames must be one of 2, 4, 8, 16, 32, 64"
                         % (name, frames))
                px = np.zeros((rows * size, cols * size, 4), dtype=np.float32)
                # Motion vectors are derived from the BEAUTY frames, so capture
                # each cell's luminance while baking baseColor.
                frame_lum = [] if (want_mv and output == "baseColor") else None
                for cell in range(frames):
                    cell_px = draw_cell(out_index, cell / float(frames))
                    bad = ~np.isfinite(cell_px)
                    if bad.any():
                        fail("S3D-E-804",
                             "shader '%s' output '%s' frame %d produced %d non-finite pixel(s)"
                             % (name, output, cell, int(bad.any(axis=2).sum())))
                    if frame_lum is not None:
                        frame_lum.append(cell_px[:, :, :3].mean(axis=2).astype(np.float32))
                    r0 = (cell // cols) * size
                    c0 = (cell % cols) * size
                    px[r0:r0 + size, c0:c0 + size, :] = cell_px
            else:
                px = draw_cell(out_index, None)
                bad = ~np.isfinite(px)
                if bad.any():
                    count = int(bad.any(axis=2).sum())
                    ys, xs = np.nonzero(bad.any(axis=2))
                    fail("S3D-E-804",
                         "shader '%s' output '%s' produced %d non-finite pixel(s); first at (%d, %d) — "
                         "check divisions and pow() domains in the kernel"
                         % (name, output, count, int(xs[0]), int(ys[0])))

            px = np.clip(px, 0.0, 1.0)
            if output in ("baseColor", "emission"):
                # Bleed RGB into transparent texels (linear space, per cell for
                # atlases) BEFORE sRGB, so no dark fringe survives filtering.
                if frames > 1:
                    for cell in range(frames):
                        r0 = (cell // cols) * size
                        c0 = (cell % cols) * size
                        dilate_rgb(px[r0:r0 + size, c0:c0 + size, :])
                else:
                    dilate_rgb(px)
                px[:, :, :3] = srgb_encode(px[:, :, :3])
            # NO flip here: draw_cell already turned each cell top-down.
            # A second flip (which this path used to carry) cancelled the
            # first — every baked texture shipped vertically mirrored, and
            # flipbook atlases had their row order reversed on top of it.
            data = (px * 255.0 + 0.5).astype(np.uint8).tobytes()
            path = os.path.join(tex_dir, "%s_%s.png" % (name, output))
            # px may be a single tile OR an assembled atlas — write what it
            # actually is, never what one cell measures.
            write_png(path, data, px.shape[1], px.shape[0])
            baked[(name, output)] = path
            log("baked %s/%s (%dpx)" % (name, output, size))

            if output == "baseColor" and want_mv and frame_lum:
                # The motion-vector companion atlas: the TS side predicts this
                # path from the shader spec and decodes it to adjudicate flow,
                # so nothing needs to be reported back — the file IS the record.
                mv_data, mvw, mvh, max_flow = optical_flow_atlas(frame_lum, cols, rows, size)
                mv_path = os.path.join(tex_dir, "%s_mv.png" % name)
                write_png(mv_path, mv_data, mvw, mvh)
                baked[(name, "mv")] = mv_path
                log("baked %s/mv (%dpx, max flow %.1fpx)" % (name, mvw, max_flow))

            if output == "height":
                # The TS validator rejects height on flipbooks (normal
                # derivation is per-tile); this mirror keeps a bypassing
                # caller from crashing three lines down in a broadcast
                # error the author cannot map back to anything.
                if frames > 1:
                    fail("S3D-E-801",
                         "shader '%s': height cannot be baked per-frame — "
                         "drop frames or height" % name)
                # The author wrote "how bumpy"; the compiler owns the
                # vector calculus: a tangent-space normal map derived from
                # the baked height field with WRAP-AWARE central
                # differences (np.roll), so tiling materials stay seamless.
                # Image space has v pointing down; OpenGL normal maps want
                # +green = up, hence the gy sign flip.
                h = px[:, :, 0].astype(np.float32)
                k = float(spec.get("normalStrength", 1.0)) * 8.0
                gx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 * k
                gy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5 * k
                nz = np.ones_like(h)
                length = np.sqrt(gx * gx + gy * gy + nz * nz)
                nrm = np.stack([-gx / length, gy / length, nz / length], axis=2)
                out_px = np.empty((size, size, 4), dtype=np.float32)
                out_px[:, :, :3] = nrm * 0.5 + 0.5
                out_px[:, :, 3] = 1.0
                ndata = (out_px * 255.0 + 0.5).astype(np.uint8).tobytes()
                npath = os.path.join(tex_dir, "%s_normal.png" % name)
                write_png(npath, ndata, size, size)
                baked[(name, "normal")] = npath
                log("derived %s/normal from height (strength %.2f)" % (name, k / 8.0))

    # Wire baked textures into the referencing materials. `height` wires
    # its DERIVED normal map (through a Normal Map node, as normals must
    # be); the raw height PNG stays on disk for engines that displace.
    socket_for = {
        "baseColor": "Base Color",
        "emission": "Emission Color",
        "roughness": "Roughness",
        "metallic": "Metallic",
    }
    for binding in job.get("shaderBindings") or []:
        mat = bpy.data.materials.get(binding["material"])
        if mat is None:
            continue
        mat.use_nodes = True
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue

        def wire_image(output_key, image_name, non_color):
            path = baked.get((binding["shader"], output_key))
            if path is None:
                return None
            image = bpy.data.images.load(path, check_existing=True)
            image.name = image_name
            if non_color:
                image.colorspace_settings.name = "Non-Color"
            node = mat.node_tree.nodes.new("ShaderNodeTexImage")
            node.image = image
            return node

        for output in binding["outputs"]:
            short = binding["shader"][4:]
            if output == "height":
                normal_node = wire_image("normal", "tex_%s_normal" % short, True)
                if normal_node is not None and "Normal" in bsdf.inputs:
                    nm = mat.node_tree.nodes.new("ShaderNodeNormalMap")
                    mat.node_tree.links.new(normal_node.outputs["Color"], nm.inputs["Color"])
                    mat.node_tree.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
                continue
            node = wire_image(output, "tex_%s_%s" % (short, output),
                              output in ("roughness", "metallic"))
            if node is not None:
                socket = socket_for[output]
                if socket in bsdf.inputs:
                    mat.node_tree.links.new(node.outputs["Color"], bsdf.inputs[socket])


"""Degraded-import facts gathered during load, surfaced as lint warnings.

The deterministic "repair" posture for broken downloads: never mutate the
file, never guess — DETECT what is missing or damaged and report it with
the fix, so the author (or the agent) repairs the source. A silent grey
import is the worst outcome; a named missing .mtl is a one-line fix."""
IMPORT_NOTES = []


def shim_fbx_importer_bugs():
    """Blender 5.0's own FBX importer still assigns
    `lamp.cycles.cast_shadow`, an RNA property Cycles removed — so ANY FBX
    containing a light crashes the import (verified against a real file).
    Until upstream fixes it, absorb the write with an inert python
    property on the settings class. Deterministic, touches no files, and a
    no-op the day the importer stops writing the dead property.
    """
    import bpy
    try:
        # The settings class is not registered under bpy.types (probed);
        # reach it through a throwaway light's own instance.
        probe = bpy.data.lights.new("s3d_fbx_shim_probe", type="SUN")
        cls = type(probe.cycles) if hasattr(probe, "cycles") else None
        bpy.data.lights.remove(probe)
        if cls is not None and not hasattr(cls, "cast_shadow"):
            cls.cast_shadow = property(lambda self: True, lambda self, value: None)
    except Exception:
        pass


def import_mesh_file(path):
    """Import one real asset file (.glb/.gltf/.obj/.fbx) as it is.

    Native scale, native names, everything it carries — the census and the
    linter then tell the truth about the asset the user actually downloaded,
    which is the whole point of pointing the compiler at a real file.
    """
    import bpy
    ext = path.rsplit(".", 1)[-1].lower()
    base = os.path.basename(path)

    # OBJ companions: a missing .mtl imports silently grey; name the gap.
    if ext == "obj":
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    if line.startswith("mtllib"):
                        mtl = line.split(None, 1)[1].strip() if " " in line else ""
                        if mtl and not os.path.exists(os.path.join(os.path.dirname(path), mtl)):
                            IMPORT_NOTES.append(
                                "%s references material library '%s', which does not exist — "
                                "faces will import with no materials" % (base, mtl))
        except OSError:
            pass

    before = {o.name for o in bpy.data.objects}
    try:
        if ext in ("glb", "gltf"):
            bpy.ops.import_scene.gltf(filepath=path)
        elif ext == "obj":
            bpy.ops.wm.obj_import(filepath=path)
        elif ext == "fbx":
            shim_fbx_importer_bugs()
            bpy.ops.import_scene.fbx(filepath=path)
        else:
            fail("S3D-E-202", "unsupported mesh source: %s" % path)
    except Exception as e:
        # A truncated or corrupt download must be a clean, named failure —
        # the importer's own reason, not a traceback soup.
        fail("S3D-E-202", "failed to import %s: %s" % (base, str(e).strip() or type(e).__name__))

    imported = [o for o in bpy.data.objects if o.name not in before]

    # The glTF importer manufactures bone custom-shape meshes (an
    # "Icosphere") to display rigs. They are importer scaffolding, not
    # asset content — the source file carries no such mesh, and the USD
    # exporter rightly skips them, which the master-parity check then
    # reports as a loss. Remove exactly the objects bones reference as
    # custom shapes; nothing heuristic, nothing else touched.
    shapes = set()
    for o in imported:
        if o.type == "ARMATURE" and o.pose:
            for pb in o.pose.bones:
                if pb.custom_shape is not None:
                    shapes.add(pb.custom_shape)
    for shape in shapes:
        try:
            bpy.data.objects.remove(shape, do_unlink=True)
            imported = [o for o in imported if o != shape]
        except Exception:
            pass

    if not any(o.type == "MESH" for o in imported):
        IMPORT_NOTES.append(
            "%s imported no mesh objects — the file may be empty, non-geometry, or damaged" % base)


def ensure_staging():
    """Give an imported bare asset a shot: a framed camera and a sun when
    the file brought neither. Derived from the scene bounds, so any asset at
    any scale is in frame; assets that DID bring staging keep their own."""
    import bpy
    scene = bpy.context.scene
    if scene.camera is None:
        cam = next((o for o in scene.objects if o.type == "CAMERA"), None)
        if cam is None:
            lo, hi = scene_bbox(scene)
            center = (lo + hi) / 2
            radius = max((hi - lo).length / 2, 0.001)
            cam_data = bpy.data.cameras.new("cam_frame_data")
            cam = bpy.data.objects.new("cam_frame", cam_data)
            # Marked as the COMPILER'S staging, measurably: the census
            # reports it so asset-kind classification can tell "the author
            # framed a scene" from "we gave a bare mesh a camera" — a
            # crate does not stop being a prop because we photographed it.
            cam["s3d_staging"] = True
            bpy.context.collection.objects.link(cam)
            aim_camera(cam, center, orbit_offset(math.pi / 4, math.pi / 6, radius * 3.2))
        scene.camera = cam
    if not any(o.type == "LIGHT" for o in scene.objects):
        light_data = bpy.data.lights.new("lgt_key_data", type="SUN")
        light_data.energy = 3.0
        lgt = bpy.data.objects.new("lgt_key", light_data)
        bpy.context.collection.objects.link(lgt)
        # Key from the camera's own quarter, elevated: a sun aimed down an
        # arbitrary fixed angle leaves the shot side of an asset in
        # shadow, which reads as "render is broken" on dark PBR assets.
        offset = orbit_offset(math.pi / 4 - 0.4, math.pi / 3, 1.0)
        lgt.rotation_euler = offset.to_track_quat("Z", "Y").to_euler()


def load_scene(job):
    import bpy
    project_dir = job.get("projectDir")
    if project_dir:
        os.chdir(project_dir)
    build_script = job.get("buildScript")
    usda_files = job.get("usdaFiles") or []
    blend_file = job.get("blendFile")
    mesh_files = job.get("meshFiles") or []
    # GPU gate: warm up on the still-empty scene (milliseconds) so the
    # shader bakes after the build have a live backend to compile against.
    if job.get("shaders"):
        gpu_warmup()
    if build_script:
        path = os.path.join(project_dir or "", build_script)
        if not os.path.exists(path):
            fail("S3D-E-202", "build script not found: %s" % path)
        source = open(path, "r", encoding="utf-8").read()
        g = {"bpy": bpy, "bmesh": __import__("bmesh"), "mathutils": __import__("mathutils"),
             "math": math, "os": os, "json": json}
        try:
            with provenance(path) as origins:
                exec(compile(source, path, "exec"), g)
            PROVENANCE.update(origins)
        except Exception:
            fail("S3D-E-202", "build script raised: %s" % traceback.format_exc(limit=8))
    elif usda_files:
        for rel in usda_files:
            abs_path = os.path.join(project_dir or "", rel)
            if os.path.exists(abs_path):
                bpy.ops.wm.usd_import(filepath=abs_path)
                log("imported %s" % rel)
            else:
                # Loudly, like the mesh loop below: a typo'd layer used to
                # skip silently and surface three stages later as an empty
                # scene and a failed master re-import — a failure chain
                # with no line pointing at the actual mistake.
                fail("S3D-E-202", "usda source not found: %s" % rel)
    elif blend_file:
        abs_path = os.path.join(project_dir or "", blend_file)
        if os.path.exists(abs_path):
            bpy.ops.wm.open_mainfile(filepath=abs_path)
        else:
            fail("S3D-E-202", "blend file not found: %s" % abs_path)
    elif mesh_files:
        for rel in mesh_files:
            abs_path = os.path.join(project_dir or "", rel)
            if not os.path.exists(abs_path):
                fail("S3D-E-202", "mesh source not found: %s" % abs_path)
            import_mesh_file(abs_path)
            log("imported %s" % rel)
        ensure_staging()
    else:
        fail("S3D-E-202", "job has no buildScript/usdaFiles/blendFile/meshFiles")
    bake_shaders(job)
    apply_tweaks(job)
    set_world_background(job)


# ------------------------------------------------------------------
# Census
# ------------------------------------------------------------------

def action_has_curves(action):
    """True when an action actually animates something.

    Blender 5 replaced the flat `Action.fcurves` with layered actions
    (layers -> strips -> channelbags -> fcurves); the legacy attribute is
    gone on actions imported from real assets. Measure through whichever
    API this action speaks — a rigged download must read as animated, not
    crash the census. Only a REAL animated asset (the Khronos Fox) could
    have exposed this; a generated fixture never imports a slotted action.
    """
    try:
        if len(action.fcurves) > 0:
            return True
    except AttributeError:
        pass
    try:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    if len(bag.fcurves) > 0:
                        return True
    except AttributeError:
        pass
    return False


def census(scene, measure_thickness=False, voxel_grid=0.0):
    import bpy
    import bmesh
    import mathutils
    from bpy_extras.object_utils import world_to_camera_view

    # Evaluate the depsgraph BEFORE measuring anything. A build script that
    # sets transforms directly (rotation_euler=, scale= on a bpy.data-made
    # object) never triggers an update, so matrix_world is stale until this
    # runs — and every world-space fact below (bounds, grounding, contacts,
    # off-camera, doubles, texel density) would be measured against where
    # objects USED to be. The proof stage already carries the same call for
    # the same reason.
    bpy.context.view_layer.update()

    objects = sorted((o for o in scene.objects if o.name != "S3D_AutoCam"), key=lambda o: o.name)
    obj_rows = []
    for o in objects:
        loc = [R6(v) for v in o.location]
        rot = [R6(v) for v in o.rotation_euler]
        scl = [R6(v) for v in o.scale]
        # RAW scale alongside the rounded one: R6 collapses a near-zero axis
        # (1e-9) to exactly 0, which both fires DEGENERATE_SCALE only by
        # accident of rounding and HIDES the true magnitude in the report. The
        # linter reads scaleRaw to judge degeneracy and to show 1e-9, not 0.
        scl_raw = [float(v) if math.isfinite(v) else None for v in o.scale]
        dims = [R6(v) for v in o.dimensions]
        try:
            visible = bool(o.visible_get())
        except Exception:
            visible = True
        # World-space bounds: grounding and budget rules need where a part
        # actually sits, which `location` (an origin, often not the base)
        # cannot answer. Measured over face-connected vertices for a mesh so a
        # loose vertex cannot inflate the box (B-11/B-15); bound_box for
        # non-meshes and as a fallback.
        world_min = None
        world_max = None
        try:
            pts = face_connected_world_points(o) if o.type == "MESH" else None
            if pts:
                world_min = [R6(min(p[i] for p in pts)) for i in range(3)]
                world_max = [R6(max(p[i] for p in pts)) for i in range(3)]
            else:
                corners = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
                world_min = [R6(min(c[i] for c in corners)) for i in range(3)]
                world_max = [R6(max(c[i] for c in corners)) for i in range(3)]
        except Exception:
            pass
        obj_rows.append({
            "name": o.name, "type": o.type, "parent": o.parent.name if o.parent else None,
            "location": loc, "rotation": rot, "scale": scl, "scaleRaw": scl_raw,
            "dimensions": dims, "visible": visible, "hasMeshData": o.type == "MESH",
            "worldMin": world_min, "worldMax": world_max,
        })

    mesh_rows = []
    uv_no_layers = []
    no_material = []
    for o in objects:
        if o.type != "MESH":
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        ngons = sum(1 for f in bm.faces if len(f.verts) > 4)
        non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
        nan_verts = any(not all(math.isfinite(c) for c in v.co) for v in bm.verts)
        # Engine hygiene, counted while the mesh is already loaded. All of
        # these are invisible in Blender's viewport and punished on import:
        # loose geometry still exports and ray-picks, doubles split normals
        # along their seam, and inconsistent winding lights one side of a
        # surface inside-out.
        # Topological counts — scale-invariant, so local space is fine.
        loose_verts = sum(1 for v in bm.verts if not v.link_faces)
        loose_edges = sum(1 for e in bm.edges if not e.link_faces)
        winding = sum(1 for e in bm.edges if e.is_manifold and not e.is_contiguous)
        slots = list(o.material_slots)
        # Count partial assignment only: a mesh with no slots at all is the
        # object-level rule's case, not a per-face one.
        faces_no_mat = 0
        if any(sl.material for sl in slots):
            faces_no_mat = sum(
                1 for poly in o.data.polygons
                if poly.material_index >= len(slots) or slots[poly.material_index].material is None)
        # Metric measurements happen in WORLD space, per the module's
        # determinism contract: the doubles merge distance and the texel
        # density are both stated in metres, and measuring them before the
        # transform would let an object's unapplied scale silently change
        # what the fixed epsilons mean.
        try:
            bm.transform(o.matrix_world)
        except Exception:
            pass
        # Zero-area is a METRIC fact (the 1e-7 threshold is m^2), so it is
        # measured after the world transform like every other epsilon-bearing
        # measurement: a healthy face on a 100x-scaled object must not read
        # as degenerate just because its local area is tiny.
        zero_area = sum(1 for f in bm.faces if f.calc_area() < 1e-7)
        # Doubles via kd-tree; capped like every other heavy measurement in
        # this file. Past the cap the field is OMITTED — "not measured",
        # which readers must never conflate with "fine".
        doubles = None
        if len(bm.verts) <= DOUBLES_VERT_CAP:
            try:
                doubles = len(bmesh.ops.find_doubles(bm, verts=bm.verts, dist=1e-6)["targetmap"])
            except Exception:
                doubles = None
        uv_block = None
        uv_active = bm.loops.layers.uv.active
        if uv_active is not None:
            try:
                slot_tex_px = [mat_texture_px(sl.material) for sl in slots]
                uv_block = uv_facts(o, bm, uv_active, slot_tex_px)
            except Exception:
                uv_block = None
        # Total world-space surface area, for triangle-density allocation.
        world_area = sum(f.calc_area() for f in bm.faces)
        # Worst triangle aspect ratio in WORLD space (the shape that ships): a
        # sliver — a long, thin triangle — passes every manifold/ngon check yet
        # shades and rasterises badly, and is the signature of AI-generated
        # slop. Measured as longest_edge^2 / (2*area) per fan triangle: ~1.15
        # for equilateral, unbounded as a triangle degenerates. Zero-area faces
        # are the ZERO_AREA_FACES rule's business and are skipped here.
        worst_aspect = 0.0
        for f in bm.faces:
            vs = [v.co for v in f.verts]
            for k in range(1, len(vs) - 1):
                a, b, c = vs[0], vs[k], vs[k + 1]
                longest = max((b - a).length, (c - b).length, (a - c).length)
                area = ((b - a).cross(c - a)).length / 2.0
                if area > 1e-9 and longest > 0.0:
                    aspect = (longest * longest) / (2.0 * area)
                    if aspect > worst_aspect:
                        worst_aspect = aspect
        # Print DfM (build direction +Z, gravity -Z). These are census FACTS;
        # only a 3d_print contract judges them, so they are cheap-always for
        # overhang and gated for the ray-cast thickness.
        overhang_area, min_thickness = dfm_facts(bm, world_area, measure_thickness)
        # Bilateral symmetry error about the mesh's own bbox-centre X plane:
        # nearest-mirror distance via kd-tree, stride-sampled. Renders hide
        # asymmetry ruthlessly (Kiln measured an 8.9mm asymmetry that looked
        # fine in every render), and generated/scanned assets are exactly
        # where lumpy halves hide. Reported as maxError/meanError in metres;
        # a deliberately asymmetric part simply reads high, which is a fact,
        # not a verdict — no lint judges it unless a contract someday does.
        symmetry = symmetry_facts(bm)
        # The oriented box, world space, before the bmesh is freed. Measured for
        # every mesh: it is a shape fact, and gating it on a target meant no
        # consumer could ask "is this a box" without the project first calling
        # itself blocky. `voxel_grid` (0 when none is declared) decides only
        # whether the grid-relative half is measured.
        voxel = voxel_facts(bm, voxel_grid)
        bm.free()
        # Triangle count as an engine would see it after triangulation —
        # the number a per-mesh budget is actually expressed in.
        tris = sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)
        mesh_rows.append({
            "object": o.name, "verts": len(o.data.vertices), "faces": len(o.data.polygons),
            "tris": tris,
            "ngons": ngons, "nonManifoldEdges": non_manifold, "zeroAreaFaces": zero_area,
            "nan": nan_verts or not all(math.isfinite(v) for row in o.matrix_world for v in row),
            "uvLayers": [l.name for l in o.data.uv_layers],
            # A colour attribute (vertex colours) is a shading source in its own
            # right — a low-poly / MagicaVoxel asset ships colour, not a material
            # — so the "no material" rule must not punish it. Blender 3.2+ uses
            # color_attributes; older meshes expose vertex_colors.
            "hasColorAttribute": (
                len(o.data.color_attributes) > 0
                if hasattr(o.data, "color_attributes")
                else len(getattr(o.data, "vertex_colors", [])) > 0
            ),
            "materials": sorted({sl.material.name for sl in slots if sl.material}),
            "uv": uv_block,
            "looseVerts": loose_verts, "looseEdges": loose_edges,
            **({} if doubles is None else {"doubleVertices": doubles}),
            # Whether the doubles pass actually RAN. Past the vert cap the count
            # is omitted, and "not measured" must never read as "clean" — the
            # linter turns doublesSampled:false into DOUBLE_VERTICES_UNCHECKED
            # (the same discipline as the z-fighting/UV caps).
            "doublesSampled": len(o.data.vertices) <= DOUBLES_VERT_CAP,
            "inconsistentWindingEdges": winding,
            "facesWithoutMaterial": faces_no_mat,
            "surfaceArea": R6(world_area),
            "worstAspectRatio": R6(worst_aspect) if worst_aspect > 0 else None,
            "overhangAreaFraction": R6(overhang_area / world_area) if world_area > 1e-9 else None,
            **({} if min_thickness is None else {"minWallThickness": R6(min_thickness)}),
            **({} if voxel is None else {"voxel": voxel}),
            # Triangles per m^2 of actual surface — the density-allocation
            # number. A 500-tri crate and a 500-tri thimble spend the same
            # budget very differently; this is the fact that says so.
            "triDensity": R6(tris / world_area) if world_area > 1e-9 else None,
            "symmetry": symmetry,
            # Spatial facts, measured in world space.
            #
            # An agent working from a rendered image is guessing at
            # proportion and contact; these are the numbers that turn the
            # guess into an answer. They cost one pass over vertices that
            # has already been loaded, and they travel in the manifest the
            # single compile call already returns — so asking "how big is
            # this, what is it resting on, is it above the floor" never
            # requires a second tool or a one-off script.
            "spatial": spatial_facts(o),
        })
        used_mats = [s.material for s in o.material_slots if s.material]
        if not used_mats:
            no_material.append(o.name)
        elif o.data.uv_layers.keys() == [] and any(mat_has_texture(m) for m in used_mats):
            uv_no_layers.append(o.name)

    mat_rows = []
    for m in sorted(bpy.data.materials, key=lambda x: x.name):
        used = sum(1 for o in objects if any(s.material == m for s in o.material_slots))
        p = principled(m)
        mat_rows.append({
            "name": m.name, "usedByObjectCount": used, "principled": p,
            "textureNames": mat_texture_names(m),
        })

    tex_rows = []
    for img in sorted(bpy.data.images, key=lambda x: x.name):
        try:
            cs = img.colorspace_settings.name
        except Exception:
            cs = ""
        # A texture is a FILE: a node graph can reference an image whose
        # path resolves to nothing, which renders magenta here and fails
        # outright on engine import. Packed and generated images always
        # have their pixels, so only a real external path can be missing.
        missing = False
        try:
            if img.filepath and img.packed_file is None and img.source == "FILE":
                missing = not os.path.exists(bpy.path.abspath(img.filepath))
        except Exception:
            missing = False
        tex_rows.append({
            "name": img.name, "filepath": img.filepath or "",
            "colorSpace": cs, "width": img.size[0], "height": img.size[1],
            "fileMissing": missing,
        })

    # Objects with a non-finite world transform are unmeasurable: every
    # geometric fact about them is NaN, which poisons pair searches (a None
    # separation once crashed the whole census sort) and fabricates
    # off-camera verdicts. They are excluded here, NOT silently dropped —
    # the NaN transform itself is an error (S3D-E-322) reported from the
    # per-object facts above, and that is the signal that owns them.
    finite_objects = [
        o for o in objects
        if all(math.isfinite(v) for row in o.matrix_world for v in row)
    ]
    zf_pairs, zf_skipped = z_fighting_pairs(finite_objects)
    contacts, contacts_skipped = contact_report(finite_objects)
    cam = scene.camera
    keyframed = sorted(
        (o.name for o in objects
         if o.animation_data and o.animation_data.action
         and action_has_curves(o.animation_data.action)))
    # Skeletons are census facts: a rigged asset's rig must be visible in
    # the report, not discovered by opening the file in a DCC.
    armature_rows = sorted(
        ({"name": o.name, "bones": len(o.data.bones)}
         for o in objects if o.type == "ARMATURE"),
        key=lambda r: r["name"])
    action_names = sorted(a.name for a in bpy.data.actions if action_has_curves(a))

    return {
        "blenderVersion": bpy.app.version_string,
        "sceneName": scene.name,
        "upAxis": "Y",
        "objects": obj_rows,
        "meshes": mesh_rows,
        "materials": mat_rows,
        "textures": tex_rows,
        "uvObjectsWithoutLayers": sorted(uv_no_layers),
        "objectsWithoutMaterial": sorted(no_material),
        "zFightingPairs": zf_pairs,
        "zFightingSkipped": zf_skipped,
        "contacts": contacts,
        "contactsSkipped": contacts_skipped,
        # Object name -> {file, line} of the build-script line that created
        # it. This is what lets a reported issue point at the code that
        # caused it instead of only at the geometry that exhibits it.
        "provenance": PROVENANCE,
        "camera": {"present": cam is not None, "name": cam.name if cam else None,
                   "staging": bool(cam is not None and cam.get("s3d_staging"))},
        "lightCount": sum(1 for o in objects if o.type == "LIGHT"),
        "animation": {
            "fps": scene.render.fps, "frameStart": scene.frame_start, "frameEnd": scene.frame_end,
            "keyframedObjects": keyframed,
            "actionNames": action_names,
        },
        "armatures": armature_rows,
        "importNotes": list(IMPORT_NOTES),
        "shaderNotes": list(SHADER_NOTES),
        "offCameraObjects": off_camera_objects(scene, finite_objects),
    }


def principled(m):
    if not m.node_tree:
        return {"present": False, "metallic": None, "roughness": None, "ior": None,
                "baseColor": None, "hasTexture": False, "untouchedDefault": False}
    node = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if node is None:
        return {"present": False, "metallic": None, "roughness": None, "ior": None,
                "baseColor": None, "hasTexture": False, "untouchedDefault": False}
    return principled_of(node)


def principled_of(node):
    def val(inp, default):
        if inp not in node.inputs:
            return default
        return node.inputs[inp].default_value

    def scalar(inp, default):
        # None when the socket is texture/procedural-DRIVEN: the default_value
        # sitting behind a link is not the rendered value, and reporting it as
        # a constant fired false METALLIC_VALUE / ROUGHNESS_RANGE / IOR errors
        # on a channel a map actually controls. The lint gates skip null.
        if inp in node.inputs and node.inputs[inp].is_linked:
            return None
        return float(val(inp, default))

    metallic = scalar("Metallic", 0.0)
    roughness = scalar("Roughness", 0.5)
    ior = scalar("IOR", 1.45)
    # Base Color reports None when a texture drives it, for the same reason.
    bc = None if ("Base Color" in node.inputs and node.inputs["Base Color"].is_linked) else val("Base Color", (0.8, 0.8, 0.8))
    base_color = [R6(v) for v in bc[:3]] if bc else None
    # A material is textured if ANY Principled input is fed by a reachable
    # TEX_IMAGE — not only Base Color. A normal/roughness/metallic-only map
    # (ORM packing is routine) still needs UVs, and the old Base-Color-only
    # test let those meshes skip the UV requirement entirely.
    has_tex = _reachable_tex_image(node)
    untouched = (not has_tex and base_color == [0.8, 0.8, 0.8]
                 and roughness is not None and abs(roughness - 0.5) < 1e-6
                 and metallic == 0.0)
    # Emission and alpha, for the viewer's material panel. Measured facts,
    # like everything else in the census: the panel's sliders start from
    # what the build actually authored, never from a guessed default.
    em = val("Emission Color", (0.0, 0.0, 0.0))
    emission = [R6(v) for v in em[:3]] if em else [0.0, 0.0, 0.0]
    emission_strength = float(val("Emission Strength", 0.0))
    alpha = float(val("Alpha", 1.0))
    return {"present": True,
            "metallic": None if metallic is None else R6(metallic),
            "roughness": None if roughness is None else R6(roughness),
            "ior": None if ior is None else R6(ior),
            "baseColor": base_color, "hasTexture": has_tex,
            "untouchedDefault": untouched,
            "emission": emission, "emissionStrength": R6(emission_strength),
            "alpha": R6(alpha)}


def _reachable_tex_image(node):
    """True when a TEX_IMAGE (with an image) feeds `node` through its input
    links, directly or through intermediate nodes (a Normal Map, a Mix, a
    Separate). Only follows input links backward from the Principled, so it
    reports texture-driven inputs and never an orphaned, disconnected image
    node the render ignores."""
    seen = set()
    stack = [node]
    while stack:
        n = stack.pop()
        if id(n) in seen:
            continue
        seen.add(id(n))
        for inp in n.inputs:
            for link in inp.links:
                src = link.from_node
                if src is None:
                    continue
                if src.type == "TEX_IMAGE" and src.image is not None:
                    return True
                stack.append(src)
    return False


def mat_has_texture(m):
    p = principled(m)
    return p["present"] and p["hasTexture"]


def mat_texture_names(m):
    """Sorted image names bound anywhere in the material's node tree."""
    if not m or not m.node_tree:
        return []
    names = {n.image.name for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image}
    return sorted(names)


def mat_texture_px(m):
    """Largest texture edge (px) bound in the material, or 0 when untextured."""
    best = 0
    if m and m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                best = max(best, n.image.size[0], n.image.size[1])
    return best


# UV grid facts are measured on a fixed occupancy raster: deterministic,
# resolution-bounded, and cheap enough for budget-linted scenes. Above the
# face cap the grid is skipped and `sampled` says so — the same "silence is
# not evidence" discipline as the z-fighting cap.
UV_GRID = 64
UV_GRID_FACE_CAP = 20000
# find_doubles is kd-tree backed and fast, but this file's rule is that
# every heavy measurement carries an explicit ceiling (z-fighting, contacts,
# the UV raster all do). Past it, doubleVertices is omitted from the census.
DOUBLES_VERT_CAP = 250000


# Symmetry probing is capped like every heavy measurement here; above the
# vert cap the block is omitted, and probes stride-sample down to this many.
SYMMETRY_VERT_CAP = 100000
SYMMETRY_PROBES = 2048


def symmetry_facts(bm):
    """Bilateral symmetry error of one WORLD-space bmesh about its own
    bbox-centre X plane: for sampled vertices, the distance from the
    mirrored point to the nearest actual vertex. Exact symmetry reads as
    ~0; a lumpy scanned or generated half reads in millimetres. Returns
    None (unmeasured, never 'fine') on empty or over-cap meshes."""
    import mathutils.kdtree
    # Face-connected vertices only (B-11): a loose vertex shifts the mirror
    # centre and reports a meaningless metres-large asymmetry. Fall back to all
    # verts for an all-loose mesh so the block is not silently dropped.
    bm.verts.ensure_lookup_table()
    verts = [v for v in bm.verts if v.link_faces] or list(bm.verts)
    n = len(verts)
    if n == 0 or n > SYMMETRY_VERT_CAP:
        return None
    try:
        lo = min(v.co.x for v in verts)
        hi = max(v.co.x for v in verts)
        cx = (lo + hi) / 2.0
        kd = mathutils.kdtree.KDTree(n)
        for i, v in enumerate(verts):
            kd.insert(v.co, i)
        kd.balance()
        stride = max(1, n // SYMMETRY_PROBES)
        total = 0.0
        worst = 0.0
        probes = 0
        for i in range(0, n, stride):
            co = verts[i].co
            mirrored = (2.0 * cx - co.x, co.y, co.z)
            found = kd.find(mirrored)
            dist = found[2] if found and found[2] is not None else None
            if dist is None:
                continue
            total += dist
            worst = max(worst, dist)
            probes += 1
        if probes == 0:
            return None
        return {
            "axis": "x",
            "maxError": R6(worst),
            "meanError": R6(total / probes),
            "sampled": stride > 1,
        }
    except Exception:
        return None


def uv_facts(o, bm, uv_layer, slot_tex_px):
    """Measured UV block for one mesh. `bm` must already be in WORLD space
    so texel density comes out in px/metre rather than px/local-unit.

    All tile-relative facts are measured after TILE NORMALISATION, because
    GPUs sample with wrap: a layout living in [0,1]x[-1,0] samples
    identically to the unit tile, and Blender's own glTF importer puts
    every imported asset exactly there (it maps glTF V to -v). Without
    normalisation a real downloaded GLB measured as "coverage 0, all UVs
    out of bounds", which is false in every way that matters. The whole
    layer shifts by the integer tile of its mean (so out-of-bounds still
    detects genuine multi-tile tiling), and each face rasterises in its
    own tile (so a tiling layout still yields honest coverage/overlap).
    """
    import mathutils
    flipped = 0
    oob_points = 0
    uv_points = 0
    densities = []
    # Sander 2001 stretch: per-triangle Jacobian singular-value ANISOTROPY
    # (σmax/σmin), area-weighted. Scale-invariant by construction — a ratio —
    # so it needs no normalisation and reads directly as "how sheared": 1.0 is
    # perfectly conformal, higher means the texture is stretched more one way
    # than the other and details smear along the stretched axis.
    stretch_vals = []  # (anisotropy, world_area)
    grid = bytearray(UV_GRID * UV_GRID) if len(bm.faces) <= UV_GRID_FACE_CAP else None
    over = bytearray(UV_GRID * UV_GRID) if grid is not None else None

    # Global integer tile shift from the layer's mean position.
    total_u = 0.0
    total_v = 0.0
    total_n = 0
    for f in bm.faces:
        for l in f.loops:
            uv = l[uv_layer].uv
            total_u += uv.x
            total_v += uv.y
            total_n += 1
    gsu = math.floor(total_u / total_n) if total_n else 0
    gsv = math.floor(total_v / total_n) if total_n else 0

    for f in bm.faces:
        uvs = [l[uv_layer].uv for l in f.loops]
        if len(uvs) < 3:
            continue
        # Signed area over the loop fan: negative means mirrored winding.
        signed = 0.0
        for i in range(1, len(uvs) - 1):
            ax, ay = uvs[0].x, uvs[0].y
            bx, by = uvs[i].x, uvs[i].y
            cx, cy = uvs[i + 1].x, uvs[i + 1].y
            signed += ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2.0
        if signed < -1e-12:
            flipped += 1
        for uv in uvs:
            uv_points += 1
            x = uv.x - gsu
            y = uv.y - gsv
            if x < -1e-4 or x > 1.0001 or y < -1e-4 or y > 1.0001:
                oob_points += 1
        world_area = f.calc_area()
        uv_area = abs(signed)
        tex_px = slot_tex_px[f.material_index] if 0 <= f.material_index < len(slot_tex_px) else 0
        if tex_px > 0 and world_area > 1e-12 and uv_area > 1e-12:
            densities.append(math.sqrt(uv_area / world_area) * tex_px)
        # Per sub-triangle stretch: map (u,v) -> 3D, take the affine Jacobian's
        # singular values. The overall 1/(2A) scale cancels in the ratio, so
        # the anisotropy is robust to UV and world scale alike.
        verts = [l.vert.co for l in f.loops]
        for i in range(1, len(uvs) - 1):
            q1, q2, q3 = verts[0], verts[i], verts[i + 1]
            s1, t1 = uvs[0].x, uvs[0].y
            s2, t2 = uvs[i].x, uvs[i].y
            s3, t3 = uvs[i + 1].x, uvs[i + 1].y
            det = (s2 - s1) * (t3 - t1) - (s3 - s1) * (t2 - t1)
            if abs(det) < 1e-12:
                continue
            ss = (q1 * (t2 - t3) + q2 * (t3 - t1) + q3 * (t1 - t2)) / det
            st = (q1 * (s3 - s2) + q2 * (s1 - s3) + q3 * (s2 - s1)) / det
            a = ss.dot(ss)
            b = ss.dot(st)
            c = st.dot(st)
            disc = math.sqrt(max(0.0, (a - c) * (a - c) + 4.0 * b * b))
            smax2 = 0.5 * ((a + c) + disc)
            smin2 = 0.5 * ((a + c) - disc)
            if smin2 <= 1e-20:
                continue
            tri_area = 0.5 * (q2 - q1).cross(q3 - q1).length
            if tri_area > 1e-12:
                stretch_vals.append((math.sqrt(smax2 / smin2), tri_area))
        if grid is not None:
            # Overlap means two different FACES claim a texel. A quad's own
            # fan triangles share a diagonal, and on axis-aligned layouts
            # that diagonal runs exactly through cell centres — counting
            # per-triangle reported the face overlapping itself along every
            # diagonal. Collect the face's cells first, then claim once.
            # Each face rasterises in its OWN tile: shift by the integer
            # part of its centroid so tiled layouts still measure honest
            # coverage and overlap.
            fcu = sum(p.x for p in uvs) / len(uvs) - gsu
            fcv = sum(p.y for p in uvs) / len(uvs) - gsv
            fsu = gsu + math.floor(fcu)
            fsv = gsv + math.floor(fcv)
            shifted = [mathutils.Vector((p.x - fsu, p.y - fsv)) for p in uvs]
            cells = set()
            for i in range(1, len(shifted) - 1):
                _uv_tri_cells(cells, shifted[0], shifted[i], shifted[i + 1])
            for idx in cells:
                if grid[idx]:
                    over[idx] = 1
                else:
                    grid[idx] = 1

    coverage = None
    overlap = None
    if grid is not None:
        covered = sum(1 for c in grid if c)
        coverage = covered / float(UV_GRID * UV_GRID)
        overlap = (sum(1 for c in over if c) / float(covered)) if covered else 0.0
    density = None
    if densities:
        density = {
            "min": R6(min(densities)),
            "max": R6(max(densities)),
            "mean": R6(sum(densities) / len(densities)),
        }
    stretch = None
    if stretch_vals:
        total_area = sum(w for _, w in stretch_vals)
        stretch = {
            "max": R6(max(v for v, _ in stretch_vals)),
            "mean": R6(sum(v * w for v, w in stretch_vals) / total_area) if total_area else R6(1.0),
        }
    return {
        "layer": uv_layer.name if hasattr(uv_layer, "name") else "UVMap",
        "coverage": R6(coverage) if coverage is not None else None,
        "overlapFraction": R6(overlap) if overlap is not None else None,
        "flippedFaces": flipped,
        "outOfBoundsFraction": R6(oob_points / float(uv_points)) if uv_points else 0,
        "texelDensity": density,
        "stretch": stretch,
        "sampled": grid is not None,
    }


def _uv_tri_cells(cells, a, b, c):
    """Collect occupancy-cell indices whose centre lies inside triangle abc."""
    min_x = max(0, int(min(a.x, b.x, c.x) * UV_GRID))
    max_x = min(UV_GRID - 1, int(max(a.x, b.x, c.x) * UV_GRID))
    min_y = max(0, int(min(a.y, b.y, c.y) * UV_GRID))
    max_y = min(UV_GRID - 1, int(max(a.y, b.y, c.y) * UV_GRID))
    d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
    if abs(d) < 1e-12:
        return
    for gy in range(min_y, max_y + 1):
        py = (gy + 0.5) / UV_GRID
        for gx in range(min_x, max_x + 1):
            px = (gx + 0.5) / UV_GRID
            w1 = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / d
            w2 = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / d
            w3 = 1.0 - w1 - w2
            if w1 >= -1e-9 and w2 >= -1e-9 and w3 >= -1e-9:
                cells.add(gy * UV_GRID + gx)


def off_camera_objects(scene, objects):
    import mathutils
    from bpy_extras.object_utils import world_to_camera_view
    cam = scene.camera
    if cam is None:
        return []
    out = []
    for o in objects:
        if o.type != "MESH":
            continue
        # Face-connected corners, like every other bound this compiler
        # reports: a loose vertex is not something the camera can see, and
        # letting one define the box makes an in-frame prop read as off-camera
        # (or the reverse) for geometry that renders as nothing.
        world = face_connected_world_points(o)
        if world:
            lo = [min(p[a] for p in world) for a in range(3)]
            hi = [max(p[a] for p in world) for a in range(3)]
            corners = [mathutils.Vector((lo[0] if x else hi[0],
                                         lo[1] if y else hi[1],
                                         lo[2] if z else hi[2]))
                       for x in (0, 1) for y in (0, 1) for z in (0, 1)]
        else:
            corners = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
        pts = [world_to_camera_view(scene, cam, c) for c in corners]
        if all(not (0.0 <= p.x <= 1.0 and 0.0 <= p.y <= 1.0 and p.z > 0.0) for p in pts):
            out.append(o.name)
    return sorted(out)


"""Object name -> the build-script line that created it."""
PROVENANCE = {}


class provenance(object):
    """Attribute every created object to the source line that made it.

    Why this exists: when a lint reports that two faces z-fight, or that a
    part floats, the reader's next question is always "which line of my
    build script produced that?". A human answers it by clicking the face in
    a viewport. An agent cannot click, so it binary-searches its own
    generator — reading code to find which loop emitted which box. That is
    the single most expensive debugging loop in this pipeline, and it is
    pure archaeology.

    Recording the answer costs almost nothing at build time. The result
    turns "S3D-E-324 between prp_lid and prp_body" into "..., both created
    at build.py:47" — archaeology becomes jump-to-definition.

    How: a line-level trace over the build script only. After each line
    executes, if the object count changed, the newly appeared objects belong
    to the line that just ran. Hooking line execution rather than any
    particular creation call means this works for bpy.ops primitives,
    bpy.data.objects.new, importers, and helper functions alike — there is
    no creation path to miss and no API to monkey-patch. The count check is
    O(1), and the set difference only runs on the lines that actually
    created something.

    The tracer is scoped to the build script's own filename, so time spent
    inside bpy or the standard library is never traced.
    """

    def __init__(self, filename):
        self.filename = filename
        self.origins = {}
        # Keyed by as_pointer(), never by name. Build scripts routinely
        # create an object and rename it a line later; a name-keyed map
        # records the throwaway name ("Cube"), then sees the real name
        # appear later and attributes it to whatever line happened to be
        # running — inventing a phantom entry and mis-blaming a real one.
        self.seen = set()
        self.by_pointer = {}
        self.count = 0
        self.previous = None
        self.last_stack = []

    def _tracked(self):
        """The datablock collections worth attributing.

        Materials earn their place: "material never touched its defaults"
        is one of the most common findings, and the reader's next question
        is always which line created it.
        """
        import bpy
        return (bpy.data.objects, bpy.data.materials)

    def __enter__(self):
        for coll in self._tracked():
            for d in coll:
                self.seen.add(d.as_pointer())
        self.count = self._total()
        self.previous = sys.gettrace()
        sys.settrace(self._global)
        return self.origins

    def _total(self):
        return sum(len(c) for c in self._tracked())

    def __exit__(self, *exc):
        sys.settrace(self.previous)
        base = os.path.basename(self.filename)
        for coll in self._tracked():
            for d in coll:
                ptr = d.as_pointer()
                if ptr in self.by_pointer:
                    # Resolved at exit, so the name recorded is the FINAL
                    # name, after any renames the script performed.
                    self.origins[d.name] = self.by_pointer[ptr]
                elif ptr not in self.seen:
                    # Appeared without a traced line — a deferred
                    # evaluation, or created after the last line ran. Still
                    # this script's work.
                    self.origins[d.name] = {"file": base, "line": None, "stack": []}
        return False

    def _global(self, frame, event, arg):
        # Only trace frames belonging to the build script itself. Time spent
        # inside bpy or the standard library is never traced.
        if frame.f_code.co_filename != self.filename:
            return None
        return self._line

    def _line(self, frame, event, arg):
        if event != "line":
            return self._line
        now = self._total()
        if now != self.count:
            self.count = now
            base = os.path.basename(self.filename)
            stack = self.last_stack
            fresh = []
            for coll in self._tracked():
                for d in coll:
                    if d.as_pointer() not in self.seen:
                        fresh.append(d)
            for d in fresh:
                ptr = d.as_pointer()
                self.seen.add(ptr)
                self.by_pointer[ptr] = {
                    "file": base,
                    # The CALL SITE, not the creation site. A shared helper
                    # like box() creates every object in the scene from one
                    # line, so blaming that line tells the reader nothing;
                    # the line they need to edit is the one that called it.
                    "line": stack[0] if stack else None,
                    # The full build-script call chain, outermost first, so
                    # the helper itself is still one step away when the bug
                    # really is in the helper.
                    "stack": list(stack),
                }
        # Build-script frames only, outermost first.
        chain = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == self.filename:
                chain.append(f.f_lineno)
            f = f.f_back
        chain.reverse()
        self.last_stack = chain
        return self._line


# Overhang steeper than 45deg from vertical needs support on an FDM/SLA
# printer; a face's downwardness is -normal.z, and sin(45deg) ~= 0.7071.
OVERHANG_COS = 0.70710678
# Thickness ray-casting is O(faces) BVH queries; capped like every heavy pass.
THICKNESS_FACE_CAP = 40000


def voxel_facts(bm, grid):
    """The ORIENTED BOX a mesh occupies, WORLD space (bm already transformed).

    Measured for EVERY mesh, like symmetry_facts beside it, because "is this a
    single cuboid, and what is its un-rotated extent and orientation" is an
    intrinsic fact about a shape - not a Minecraft opinion. It used to be
    gated on the voxel contract, which put the compiler's own doctrine
    ("measure in Blender, judge in the contract") the wrong way round: a scene
    had to declare itself blocky before the compiler would tell it what shape
    its meshes were. Nothing downstream could use box recovery unless the
    author had already decided they were making Minecraft models.

    Every value is a FACT; the contract does the judging.

    Boxness is measured on the mesh's unique vertex POSITIONS, not on its
    topology. The old test demanded exactly 8 vertices and 6 quad faces, which
    is how a spec-built cube arrives and is not how anything else does: a real
    MagicaVoxel/Qubicle OBJ exports triangulated (8 positions, 12 triangles)
    and was reported "not a single cuboid" for a visually perfect block, then
    skipped by the exporter. Face count is a fact about somebody's exporter;
    being a cuboid is a fact about where the corners are.

    Grid deviation is likewise measured in the frame the FORMAT defines: for a
    recovered box, against its un-rotated corners. A legally rotated element
    (Java permits 22.5 degrees) necessarily puts its world-space vertices off
    the axis-aligned grid, so measuring there reported "it will shimmer in
    engine - snap the vertices to the grid" about exactly the rotations the
    format legalises, with advice that cannot be followed. Grid alignment and
    rotation legality are two different questions, asked separately."""
    import math
    import mathutils

    bm.verts.ensure_lookup_table()
    nf = len(bm.faces)

    # Unique corner positions, quantised so per-face duplicated vertices (the
    # common OBJ/FBX spelling of a cube) collapse onto the corners they share.
    # A cuboid has exactly eight, so the scan STOPS at the ninth: that early
    # exit is what makes measuring this for every mesh in every scene free —
    # a 14k-vertex helmet is disqualified within its first nine vertices.
    seen = {}
    too_many = False
    for v in bm.verts:
        co = v.co
        key = (round(co.x, 6), round(co.y, 6), round(co.z, 6))
        if key in seen:
            continue
        if len(seen) == 8:
            too_many = True
            break
        seen[key] = co.copy()
    uniq = [] if too_many else list(seen.values())

    is_box = False
    axis_aligned = False
    rot_axis = None
    rot_deg = None
    box_edges = None

    # A closed cuboid needs at least six faces however it is triangulated;
    # eight points alone could be two loose tetrahedra.
    if len(uniq) == 8 and nf >= 6:
        p0 = uniq[0]
        offs = [p - p0 for p in uniq[1:]]
        # From one corner of a cuboid the seven offsets are the three edges,
        # the three face diagonals (edge + edge) and the body diagonal (all
        # three). So an offset is an EDGE exactly when it is not the sum of two
        # others. Taking the three SHORTEST offsets instead is wrong the moment
        # the box is elongated: for a 0.2 x 0.2 x 1.0 post the 0.283 face
        # diagonal is shorter than the 1.0 edge, and the box stops being one.
        def is_edge(i):
            v = offs[i]
            for a in range(len(offs)):
                if a == i:
                    continue
                for b in range(len(offs)):
                    if b == i or b == a:
                        continue
                    if (offs[a] + offs[b] - v).length < 1e-6:
                        return False
            return True

        cand = [offs[i] for i in range(len(offs)) if is_edge(i)]
        lens = [e.length for e in cand] if len(cand) == 3 else []
        if len(cand) == 3 and all(l > 1e-6 for l in lens):
            u = [e / l for e, l in zip(cand, lens)]
            orth = (abs(u[0].dot(u[1])) < 2e-3
                    and abs(u[0].dot(u[2])) < 2e-3
                    and abs(u[1].dot(u[2])) < 2e-3)
            if orth:
                # The eight points must be exactly the eight corners spanned by
                # those three edges - that is what makes it a cuboid, rather
                # than eight points that merely include one right corner.
                want = [p0 + cand[0] * a + cand[1] * b + cand[2] * c
                        for a in (0, 1) for b in (0, 1) for c in (0, 1)]
                if all(any((w - p).length < 1e-5 for p in uniq) for w in want):
                    is_box = True
                    box_edges = cand

    if is_box:
        bases = (mathutils.Vector((1.0, 0.0, 0.0)),
                 mathutils.Vector((0.0, 1.0, 0.0)),
                 mathutils.Vector((0.0, 0.0, 1.0)))
        u = [e / e.length for e in box_edges]

        def axis_of(vec):
            for ax, base in enumerate(bases):
                if abs(abs(vec.dot(base)) - 1.0) < 2e-3:
                    return ax
            return None

        axes = [axis_of(ui) for ui in u]
        if all(a is not None for a in axes) and len(set(axes)) == 3:
            axis_aligned = True
        else:
            # A single-axis-rotated box keeps ONE edge parallel to a world axis
            # (the spin axis); recover another edge's angle in the
            # perpendicular plane, folded into (-45, 45] because a box repeats
            # every 90 degrees. If no edge is world-parallel the box is
            # multi-axis rotated (rot_axis stays None while is_box is True) - a
            # state the Java rule reads as "not representable".
            ra = None
            ra_i = None
            for i, ui in enumerate(u):
                a = axis_of(ui)
                if a is not None:
                    ra, ra_i = a, i
                    break
            if ra is not None:
                other = next(j for j in range(3) if j != ra_i)
                vec = u[other]
                if ra == 0:
                    ang = math.degrees(math.atan2(vec.z, vec.y))
                elif ra == 1:
                    ang = math.degrees(math.atan2(vec.x, vec.z))
                else:
                    ang = math.degrees(math.atan2(vec.y, vec.x))
                ang = ((ang + 45.0) % 90.0) - 45.0
                rot_axis = "xyz"[ra]
                rot_deg = round(ang, 3)

    # Centre + UN-ROTATED size of the box (world frame). For an oriented cube
    # the world AABB is the rotated bounding box, not the element - so every
    # element-space question (extent, bounds, grid) needs the box's own frame:
    # un-rotate the corners about the centre by -angle. Axis-aligned boxes just
    # get their world extent. Emitted only for a box; the exporter maps it to
    # MC space and the linter judges in the same frame.
    center_out = None
    local_size = None
    if is_box:
        cen = mathutils.Vector((
            sum(c.x for c in uniq) / len(uniq),
            sum(c.y for c in uniq) / len(uniq),
            sum(c.z for c in uniq) / len(uniq),
        ))
        center_out = [round(cen.x, 6), round(cen.y, 6), round(cen.z, 6)]
        if rot_axis is not None and rot_deg is not None:
            axis_vec = {"x": mathutils.Vector((1, 0, 0)),
                        "y": mathutils.Vector((0, 1, 0)),
                        "z": mathutils.Vector((0, 0, 1))}[rot_axis]
            unrot = mathutils.Matrix.Rotation(math.radians(-rot_deg), 4, axis_vec)
            pts = [unrot @ (c - cen) for c in uniq]
        else:
            pts = [c - cen for c in uniq]
        xs = [p.x for p in pts]
        ys = [p.y for p in pts]
        zs = [p.z for p in pts]
        local_size = [round(max(xs) - min(xs), 6),
                      round(max(ys) - min(ys), 6),
                      round(max(zs) - min(zs), 6)]

    # Grid deviation is the one fact here that is NOT intrinsic: it is measured
    # against a grid somebody declared, and means nothing without one. So it is
    # gated on the VALUE existing — the same "is there a threshold that will
    # read this" test dfm_facts applies to its thickness ray-cast — and reports
    # null, not zero, when no grid was declared. Zero would read as "perfectly
    # on-grid", which is a verdict nobody measured.
    #
    # It is also the only O(verts) part, which is why gating it and not the box
    # recovery is what keeps this affordable for every mesh in every scene.
    grid_dev = None
    if grid and grid > 0:
        grid_dev = 0.0
        if center_out is not None and local_size is not None:
            # The ELEMENT's corners: a rotated box is authored un-rotated, so
            # its grid alignment is a question about the un-rotated corners.
            probe = [
                mathutils.Vector((
                    center_out[0] + sx * local_size[0] / 2.0,
                    center_out[1] + sy * local_size[1] / 2.0,
                    center_out[2] + sz * local_size[2] / 2.0,
                ))
                for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)
            ]
        else:
            probe = [v.co for v in bm.verts]
        for co in probe:
            for comp in co:
                grid_dev = max(grid_dev, abs(comp - round(comp / grid) * grid))

    return {
        "isBox": is_box,
        "axisAligned": axis_aligned,
        "rotationAxis": rot_axis,
        "rotationDeg": rot_deg,
        "gridDeviation": None if grid_dev is None else round(grid_dev, 7),
        **({} if center_out is None else {"center": center_out}),
        **({} if local_size is None else {"localSize": local_size}),
    }


def dfm_facts(bm, world_area, measure_thickness):
    """Design-for-manufacture facts for 3D printing, in WORLD space.

    Overhang: the area of downward-facing faces steeper than 45deg from
    vertical, EXCLUDING the faces resting on the build plate (the object's
    lowest band) — those are supported by the plate, not an overhang. This is
    the same normal-angle metric a slicer shades, returned as an area so the
    contract can judge a fraction.

    Thickness: the thinnest wall, found by casting a ray from just inside each
    face straight into the material (-normal) and taking the nearest hit on a
    genuinely OPPOSITE wall (its normal anti-parallel to the cast, which filters
    the adjacent/corner hits a raw nearest-hit would mistake for a thin wall).
    An open surface with no wall behind it contributes nothing. Deterministic:
    face centroids, no random sampling. Returns (overhang_area, min_thickness),
    min_thickness None when unmeasured.
    """
    if not bm.faces:
        return 0.0, None
    min_z = min((v.co.z for v in bm.verts), default=0.0)
    max_z = max((v.co.z for v in bm.verts), default=0.0)
    # The plate band: a slice above the lowest point, scaled to the object so a
    # tall print and a coaster both exempt only their true footprint.
    plate_eps = max(1e-4, (max_z - min_z) * 0.01)

    overhang_area = 0.0
    for f in bm.faces:
        n = f.normal
        if n.length_squared < 1e-12 or -n.z < OVERHANG_COS:
            continue
        if f.calc_center_median().z <= min_z + plate_eps:
            continue  # resting on the plate — supported, not an overhang
        overhang_area += f.calc_area()

    min_thickness = None
    if measure_thickness and len(bm.faces) <= THICKNESS_FACE_CAP:
        try:
            from mathutils.bvhtree import BVHTree
            bvh = BVHTree.FromBMesh(bm)
            for f in bm.faces:
                n = f.normal
                if n.length_squared < 1e-12:
                    continue
                origin = f.calc_center_median() - n * 1e-5
                hit = bvh.ray_cast(origin, -n)
                if hit[0] is None or hit[3] is None or hit[3] <= 1e-6:
                    continue
                # Keep only a genuinely opposite wall: its face normal points
                # back against the cast direction (anti-parallel to -n, i.e.
                # hit_normal . n < 0). A corner/adjacent hit fails this.
                if hit[1] is not None and hit[1].dot(n) < -0.5:
                    # Add back the 1e-5 the origin was pushed inside, so a 0.5mm
                    # wall reads 0.5mm, not 0.49mm.
                    thick = hit[3] + 1e-5
                    if min_thickness is None or thick < min_thickness:
                        min_thickness = thick
        except Exception:
            min_thickness = None
    return overhang_area, min_thickness


def face_connected_world_points(o):
    """World-space positions of the vertices that belong to at least one face.

    A stray LOOSE vertex — one no face references — otherwise defines the
    object's bounds: generated assets routinely carry a vert far from the
    geometry, and a single one at (100,100,100) makes a 1m cube measure 100m,
    which then wrecks worldSize, symmetry, grounding and proof auto-framing.
    Loose geometry is still reported by LOOSE_GEOMETRY; it just no longer sets
    the box. A mesh with NO faces at all (an intentional point cloud, or a
    broken all-loose mesh) falls back to every vertex so it still reports a
    box — T-3 / LOOSE_GEOMETRY flag that case separately. Returns [] for a
    non-mesh or an empty mesh.
    """
    import mathutils
    if o.type != "MESH" or not o.data.vertices:
        return []
    mw = o.matrix_world
    verts = o.data.vertices
    used = set()
    for p in o.data.polygons:
        used.update(p.vertices)
    idxs = sorted(used) if used else range(len(verts))
    return [mw @ mathutils.Vector(verts[i].co) for i in idxs]


def spatial_facts(o):
    """World-space measurements of one object.

    Everything here comes from transformed vertices, not from local data or
    the object's origin — an object whose origin sits far from its geometry
    would otherwise report a position it does not occupy. Measured over
    face-connected vertices so a loose vertex cannot inflate the box (B-11).

    `centroid` is the mean vertex position, which is the honest thing to
    report: a true centre of mass needs uniform density and a closed
    manifold, and this pipeline can guarantee neither. It is named for what
    it is rather than borrowing a term it has not earned.
    """
    import mathutils
    points = face_connected_world_points(o)
    if not points:
        return None
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    acc = mathutils.Vector((0.0, 0.0, 0.0))
    for p in points:
        acc += p
        for a in range(3):
            if p[a] < lo[a]:
                lo[a] = p[a]
            if p[a] > hi[a]:
                hi[a] = p[a]
    n = len(points)
    centroid = acc / n
    return {
        "worldMin": [R6(c) for c in lo],
        "worldMax": [R6(c) for c in hi],
        "size": [R6(hi[a] - lo[a]) for a in range(3)],
        "bboxCenter": [R6((hi[a] + lo[a]) / 2) for a in range(3)],
        "centroid": [R6(c) for c in centroid],
        # Blender is Z-up, so this is the height above the ground plane.
        # Negative means the part is buried; a large positive value on a
        # part that should be grounded means it is floating.
        # One number, one name: the height of the lowest vertex above the
        # z=0 ground plane. worldMin/worldMax already carry the raw z
        # extremes, so the old lowestZ/highestZ mirrors said nothing new
        # under different names.
        "groundGap": R6(lo[2]),
    }


def contact_report(objects, limit=60):
    """Axis-wise separation between every nearby pair of meshes.

    Positive gap on an axis means a clear space; negative means the two
    overlap along it. A pair that overlaps on all three axes intersects.
    This is the measurement behind questions an agent otherwise answers by
    eye — "does the rail actually touch the lip it leans on", "is this
    bracing clear of the walkway" — and by eye is exactly where it gets
    those wrong.
    """
    import mathutils
    meshes = [o for o in objects if o.type == "MESH"]
    skipped = []
    if len(meshes) > limit:
        return [], ["scene has %d meshes, above the %d-mesh contact limit" % (len(meshes), limit)]

    def world_aabb(o):
        # The SAME box the census reports for this object. bound_box includes
        # loose vertices, which the rest of the compiler deliberately excludes
        # (see face_connected_world_points) — a single stray vert would
        # otherwise invent contacts with everything nearby and quote gap
        # numbers measured against a point that renders as nothing.
        pts = face_connected_world_points(o)
        if pts:
            return (
                [min(p[a] for p in pts) for a in range(3)],
                [max(p[a] for p in pts) for a in range(3)],
            )
        corners = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
        return (
            [min(c[a] for c in corners) for a in range(3)],
            [max(c[a] for c in corners) for a in range(3)],
        )

    boxes = {o.name: world_aabb(o) for o in meshes}
    out = []
    for i, a in enumerate(meshes):
        alo, ahi = boxes[a.name]
        for b in meshes[i + 1:]:
            blo, bhi = boxes[b.name]
            # Separation per axis: negative where the spans overlap.
            gap = [max(blo[k] - ahi[k], alo[k] - bhi[k]) for k in range(3)]
            widest = max(gap)
            # Only report pairs near enough to be a relationship rather than
            # two unrelated parts of the scene.
            if widest > 0.05:
                continue
            out.append({
                "a": a.name, "b": b.name,
                "gap": [R6(g) for g in gap],
                # The controlling number: <=0 on every axis means they
                # intersect, and the largest gap is the distance apart.
                "separation": R6(widest),
                "intersects": widest <= 0.0,
            })
    out.sort(key=lambda r: r["separation"])
    return out, skipped


# The coplanar search is O(tris_a * tris_b); above this many pairs it is not
# run. The cap is enforced by the CALLER so the skip can be reported — see the
# note there.
COPLANAR_TRI_PRODUCT_CAP = 200000


def tri_count(o):
    """Triangles an ngon-fanned mesh contributes, without building them."""
    return sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)


def z_fighting_pairs(objects):
    """Coplanar-overlap search, with an honest account of what it skipped.

    The search is quadratic in meshes and linear in faces, so it has caps.
    Reporting an empty list when a cap was hit would tell the caller "no
    z-fighting" when the truth is "not looked for" — the one failure mode a
    measured contract cannot afford. Returns the pairs plus the reason any
    part of the scene went unexamined.
    """
    meshes = [o for o in objects if o.type == "MESH"]
    skipped = []
    if len(meshes) > 40:
        return [], ["scene has %d meshes, above the %d-mesh search limit" % (len(meshes), 40)]

    pairs = []
    truncated = False
    heavy = set()
    dense = set()
    for i, a in enumerate(meshes):
        if len(pairs) >= 20:
            truncated = True
            break
        for b in meshes[i + 1:]:
            if not aabb_overlap(a, b):
                continue
            if len(a.data.polygons) > 1500 or len(b.data.polygons) > 1500:
                # Name BOTH when both are over: reporting one hides half the
                # reason the pair went unexamined.
                if len(a.data.polygons) > 1500:
                    heavy.add(a.name)
                if len(b.data.polygons) > 1500:
                    heavy.add(b.name)
                continue
            # The triangulated-face-product cap lives HERE, where there is a
            # caller to tell. coplanar_overlap used to apply it internally and
            # return "no overlaps" — indistinguishable from a clean result, so
            # two exactly coincident meshes could ship a textbook z-fight with
            # an empty pairs list AND an empty skipped list. A cap that cannot
            # be reported is a cap that lies.
            cost = tri_count(a) * tri_count(b)
            if cost > COPLANAR_TRI_PRODUCT_CAP:
                dense.add((a.name, b.name, cost))
                continue
            count, area, worst = coplanar_overlap(a, b)
            if count > 0:
                pairs.append({
                    "a": a.name, "b": b.name, "faceCount": count, "area": R6(area),
                    **({"worst": worst} if worst else {}),
                })
    if truncated:
        skipped.append("stopped after %d reported pairs" % 20)
    for name in sorted(heavy):
        skipped.append("%s exceeds the %d-face per-mesh limit" % (name, 1500))
    for a_name, b_name, cost in sorted(dense):
        skipped.append(
            "%s vs %s is %d triangle pairs, above the %d-pair comparison limit"
            % (a_name, b_name, cost, COPLANAR_TRI_PRODUCT_CAP)
        )
    return pairs, skipped


def aabb_overlap(a, b):
    import mathutils
    def world_aabb(o):
        corners = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
        lo = mathutils.Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
        hi = mathutils.Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
        return lo, hi
    la, ha = world_aabb(a)
    lb, hb = world_aabb(b)
    return (la.x <= hb.x and lb.x <= ha.x and la.y <= hb.y and lb.y <= ha.y
            and la.z <= hb.z and lb.z <= ha.z)


def world_tris(o):
    import mathutils
    mw = o.matrix_world
    verts = [mw @ mathutils.Vector(v.co) for v in o.data.vertices]
    tris = []
    for f in o.data.polygons:
        vs = [verts[i] for i in f.vertices]
        for k in range(1, len(vs) - 1):
            tris.append((vs[0], vs[k], vs[k + 1]))
    return tris


def coplanar_overlap(a, b):
    """Count coplanar overlapping face pairs and KEEP the geometry of the
    worst one: which world axis the shared plane faces, where along that
    axis it sits, and the overlap's 2D bounding extent. "These two z-fight"
    is a verdict; "they share a +z plane at z=0.90 over a 0.4x0.3m patch"
    is a fix."""
    import mathutils
    ta = world_tris(a)
    tb = world_tris(b)
    count = 0
    max_area = 0.0
    worst = None
    for fa in ta:
        na = (fa[1] - fa[0]).cross(fa[2] - fa[0]).normalized()
        for fb in tb:
            nb = (fb[1] - fb[0]).cross(fb[2] - fb[0]).normalized()
            # SAME-facing only (dot ~= +1), not merely parallel. Two coincident
            # faces pointing OPPOSITE ways (a cube resting flush on another,
            # any block stacked on a block) do not flicker under backface
            # culling — which every target here uses, Minecraft included — so
            # flagging them is a false positive that punishes normal blocky
            # stacking. A real z-fight is two faces at one plane facing the
            # same way (duplicates, overlapping coplanar plates): both draw.
            if na.dot(nb) < 0.999:
                continue
            if abs(na.dot(fa[0] - fb[0])) > 1e-4:
                continue
            p2a, p2b = project_2d(fa, na), project_2d(fb, na)
            if not tri_overlap_2d(p2a, p2b):
                continue
            clipped = clip_poly(p2a, p2b)
            area = shoelace(clipped)
            if area > 1e-9:
                count += 1
                if area > max_area:
                    max_area = area
                    axis = max(range(3), key=lambda i: abs(na[i]))
                    xs = [p[0] for p in clipped]
                    ys = [p[1] for p in clipped]
                    worst = {
                        "axis": "xyz"[axis],
                        "at": R6(fa[0][axis]),
                        "extent": [R6(max(xs) - min(xs)), R6(max(ys) - min(ys))],
                    }
    return count, max_area, worst


def project_2d(tri, normal):
    axis = max(range(3), key=lambda i: abs(normal[i]))
    u = (axis + 1) % 3
    v = (axis + 2) % 3
    return [(p[u], p[v]) for p in tri]


def tri_overlap_2d(a, b):
    for poly in (a, b):
        for i in range(3):
            p1, p2 = poly[i], poly[(i + 1) % 3]
            axis = (-(p2[1] - p1[1]), p2[0] - p1[0])
            da = [axis[0] * p[0] + axis[1] * p[1] for p in a]
            db = [axis[0] * p[0] + axis[1] * p[1] for p in b]
            if max(da) < min(db) or max(db) < min(da):
                return False
    return True


def clip_poly(subject, clip):
    out = list(subject)
    for i in range(len(clip)):
        if not out:
            break
        a, b = clip[i], clip[(i + 1) % len(clip)]
        ex, ey = b[0] - a[0], b[1] - a[1]
        def side(p):
            return ex * (p[1] - a[1]) - ey * (p[0] - a[0])
        new = []
        for j in range(len(out)):
            cur, prev = out[j], out[j - 1]
            sc, sp = side(cur), side(prev)
            if sc >= 0:
                if sp < 0:
                    t = sp / (sp - sc)
                    new.append((prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])))
                new.append(cur)
            elif sp >= 0:
                t = sp / (sp - sc)
                new.append((prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])))
        out = new
    return out


def shoelace(poly):
    if len(poly) < 3:
        return 0.0
    s = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


# ------------------------------------------------------------------
# Proof
# ------------------------------------------------------------------

def ensure_camera(scene):
    import bpy
    import mathutils
    auto = next((o for o in scene.objects if o.name == "S3D_AutoCam"), None)
    if auto is None:
        cam_data = bpy.data.cameras.new("S3D_AutoCamData")
        auto = bpy.data.objects.new("S3D_AutoCam", cam_data)
        scene.collection.objects.link(auto)
    auto.data.angle = math.radians(45)
    scene.camera = auto
    return auto, True


def scene_bbox(scene):
    # Face-connected bounds (B-11): a single loose vertex would otherwise pull
    # the proof camera back to frame a 100m-wide empty box around a 1m subject,
    # rendering the asset a speck (or losing it entirely).
    import mathutils
    lo = None
    hi = None
    for o in scene.objects:
        if o.type != "MESH":
            continue
        for wc in face_connected_world_points(o):
            if lo is None:
                lo = mathutils.Vector(wc)
                hi = mathutils.Vector(wc)
            else:
                for i in range(3):
                    lo[i] = min(lo[i], wc[i])
                    hi[i] = max(hi[i], wc[i])
    if lo is None:
        lo = mathutils.Vector((-1, -1, -1))
        hi = mathutils.Vector((1, 1, 1))
    return lo, hi


def aim_camera(cam, center, offset):
    """Place `cam` at `center + offset` and point it at `center`.

    Two things here are easy to get wrong and both render a black frame that
    still writes a plausible-looking PNG:

    1. A Blender camera looks down its LOCAL -Z. `to_track_quat` aligns the
       named local axis WITH the given vector, and `offset` points from the
       subject TOWARDS the camera — so the axis to align is `Z`, not `-Z`.
       Using `-Z` aims the camera directly away from the subject.
    2. Assigning `.location` does not refresh `matrix_world`; the render
       operator reads the evaluated transform, so without an explicit
       `view_layer.update()` every frame renders from the camera's previous
       (or initial) position and a turntable emits N identical images.
    """
    import bpy
    import mathutils
    cam.location = center + offset
    cam.rotation_euler = offset.to_track_quat("Z", "Y").to_euler()
    bpy.context.view_layer.update()


def orbit_offset(azimuth, elevation, distance):
    """Camera offset on a Z-up turntable.

    Blender is Z-up: the orbit sweeps the XY plane and elevation lifts along
    Z. Azimuth 0 sits on -Y, which is Blender's own front view, so frame 000
    of a turntable matches what a user sees when they press Numpad-1.
    """
    import mathutils
    return mathutils.Vector((
        math.cos(elevation) * math.sin(azimuth),
        -math.cos(elevation) * math.cos(azimuth),
        math.sin(elevation),
    )) * distance


def frame_stats(filepath):
    """Deterministic coverage statistics for one rendered frame.

    A proof image is the loop's vision feedback, so an empty render must be
    detectable rather than silently accepted. Pixels are sampled on a fixed
    stride so the numbers are stable across runs and the cost stays flat as
    resolution grows.
    """
    import bpy
    try:
        img = bpy.data.images.load(filepath, check_existing=False)
    except Exception:
        return {"path": filepath, "meanLuminance": None, "coverage": None}
    try:
        width, height = img.size
        if width == 0 or height == 0:
            return {"path": filepath, "meanLuminance": None, "coverage": None}
        pixels = list(img.pixels)
        stride = max(1, (width * height) // 4096)
        total = 0.0
        lit = 0
        blown = 0
        samples = 0
        for index in range(0, width * height, stride):
            base = index * 4
            r, g, b = pixels[base], pixels[base + 1], pixels[base + 2]
            luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
            total += luminance
            if luminance > 0.01:
                lit += 1
                if luminance > 0.92:
                    blown += 1
            samples += 1
        if samples == 0:
            return {"path": filepath, "meanLuminance": None, "coverage": None, "blownRatio": None}
        return {
            "path": filepath,
            "meanLuminance": R6(total / samples),
            "coverage": R6(lit / samples),
            # Fraction of LIT pixels near pure white. A frame can pass the
            # black-frame rule and still be exposure mush — this is the
            # number that catches "pale, shadowless, blown out".
            "blownRatio": R6((blown / lit) if lit else 0.0),
        }
    finally:
        try:
            bpy.data.images.remove(img)
        except Exception:
            pass


def proof(job):
    import bpy
    import mathutils
    opts = job.get("proof", {})
    scene = bpy.context.scene
    engine = opts.get("engine", "BLENDER_EEVEE")
    try:
        scene.render.engine = engine
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    res = int(opts.get("resolution", 1024))
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    filepaths = opts.get("filepaths") or []
    respect = bool(opts.get("respectSceneCamera", False))
    turntable_on = bool(opts.get("turntable", True))

    has_scene_cam = scene.camera is not None
    if respect and has_scene_cam:
        # The caller asked for the AUTHORED framing: one still through the
        # scene's own camera, turntable overridden — an orbit through a
        # camera the author positioned would be neither. This flag used to
        # be parsed and then never consulted, which made it silently inert.
        auto_cam, is_auto = scene.camera, False
        steps = 1
        turntable_on = False
    elif turntable_on or not has_scene_cam:
        auto_cam, is_auto = ensure_camera(scene)
        steps = int(opts.get("turntableSteps", 8)) if turntable_on else 1
    else:
        auto_cam, is_auto = scene.camera, False
        steps = 1
    if not filepaths:
        fail("S3D-E-206", "proof job has no filepaths")
    if len(filepaths) < steps:
        fail("S3D-E-206", "proof job filepaths (%d) < steps (%d)" % (len(filepaths), steps))

    lo, hi = scene_bbox(scene)
    center = (lo + hi) / 2.0
    diag = (hi - lo).length
    cam_data = auto_cam.data
    dist = max((diag / 2.0) / math.tan(cam_data.angle / 2.0) * 1.25, 0.1)
    elevation = math.radians(30.0)

    frames = []
    for i in range(steps):
        if turntable_on:
            aim_camera(auto_cam, center, orbit_offset(2.0 * math.pi * i / steps, elevation, dist))
        elif is_auto:
            aim_camera(auto_cam, center, orbit_offset(0.0, elevation, dist))
        scene.render.filepath = filepaths[i]
        bpy.ops.render.render(write_still=True)
        frames.append(frame_stats(filepaths[i]))
        log("rendered %s" % filepaths[i])
    emit({"ok": True, "data": {"images": filepaths[:steps], "frames": frames}})


# ------------------------------------------------------------------
# Export
# ------------------------------------------------------------------

def name_mesh_data():
    """Give every mesh data block its object's name.

    Blender exports the DATA name as the Mesh prim, not the object name, so
    an object carefully named `prp_crate_lid` ships a prim called `Cube.008`.
    The naming rule checks objects and passes; the USD a consumer opens is
    full of exporter defaults. Renaming the data block before export is the
    fix at the source — see S3D-E-404.
    """
    import bpy
    for obj in bpy.context.scene.objects:
        if obj.data is None or not hasattr(obj.data, "name"):
            continue
        if obj.data.users > 1:
            # Shared data legitimately has its own identity; renaming it
            # after the first user would just rename it repeatedly.
            continue
        try:
            obj.data.name = obj.name
        except Exception:
            pass


def author_model_hierarchy(job):
    """Author the USD model metadata Blender's exporter does not write.

    Without `kind` the exported stage is loose geometry rather than an
    addressable component, and without `assetInfo` nothing downstream can
    resolve or version it. Both are deterministic — derived from the scene
    and the job, never guessed — so the compiler fills them in rather than
    handing the author another issue code to clear by hand.
    """
    import bpy
    root = None
    for obj in bpy.context.scene.objects:
        if obj.parent is None:
            root = obj
            break
    asset_name = job.get("assetName") or bpy.context.scene.name or "asset"
    return {"assetName": asset_name, "rootObject": root.name if root else None}


def post_process_usda(path, info, job):
    """Deliberately does nothing to the stage's semantics.

    `kind` and `assetInfo` used to be patched in here by regex. That was the
    wrong side of the boundary twice over: this process has no USDA parser,
    so it matched on raw text, and it has no idea whether the thing it just
    exported is one asset or an arrangement of several, so it wrote
    `kind = "component"` onto everything unconditionally.

    Authoring now happens in TypeScript after export, where the real parser
    lives and where the deliverable's shape is already known. Nothing is
    patched twice; there is one author.
    """
    return

def usd_orientation_kwargs(job):
    """Exporter options that honour the contract's declared up-axis.

    Both USD containers ship the same stage, so both must be oriented the
    same way — otherwise the .usda and the .usdz of one compile disagree
    about which way is up, which is the kind of difference nobody notices
    until an import lands on its side.
    """
    up_axis = (job.get("upAxis") or "").upper()
    if up_axis not in ("X", "Y", "Z"):
        return {}
    return {
        "convert_orientation": True,
        "export_global_up_selection": up_axis,
        # Forward must not be parallel to up; -Z is USD's convention for a
        # Y-up stage, and -Y for a Z-up one.
        "export_global_forward_selection": "NEGATIVE_Z" if up_axis == "Y" else "NEGATIVE_Y",
    }


def scene_fingerprint():
    """A compact identity of what the current scene CONTAINS — the facts
    the master-parity check compares. Names and counts, not geometry: the
    question is "did everything reach the stage", not "is it identical to
    the float"."""
    import bpy
    meshes = {}
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and o.data:
            meshes[o.name] = sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)
    # Ordered bone names per armature and ordered morph-target (shape key)
    # names per mesh. Counts alone cannot see a REORDER: a joint/morph list
    # that keeps every name but shuffles their positions still misaligns any
    # animation that binds by index. Basis (index 0) is not a morph target,
    # so it is dropped from the morph order.
    bone_order = {o.name: [b.name for b in o.data.bones]
                  for o in bpy.context.scene.objects if o.type == "ARMATURE"}
    morphs = {}
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and o.data and o.data.shape_keys:
            names = [k.name for k in o.data.shape_keys.key_blocks[1:]]
            if names:
                morphs[o.name] = names
    return {
        "meshes": meshes,
        "materials": sorted(m.name for m in bpy.data.materials if m.users > 0),
        "armatures": {o.name: len(o.data.bones)
                      for o in bpy.context.scene.objects if o.type == "ARMATURE"},
        "boneOrder": bone_order,
        "morphs": morphs,
        # Only actions BOUND to scene objects: an orphan datablock (say, a
        # deleted rig's leftover clips) is not scene content, cannot reach
        # any exporter, and must not read as a master loss.
        "actions": sorted({o.animation_data.action.name
                           for o in bpy.context.scene.objects
                           if o.animation_data and o.animation_data.action
                           and action_has_curves(o.animation_data.action)}),
    }


def animated_object_names():
    """Objects the CURRENT scene animates, by name — the authoritative set."""
    import bpy
    return {o.name for o in bpy.context.scene.objects
            if o.animation_data and o.animation_data.action
            and action_has_curves(o.animation_data.action)}


def rebuild_object_animation(known=None):
    """Bake timeSampled USD transforms back into Blender keyframes.

    `known` is the set of object names the BUILD scene animated, captured
    before the master was authored. It is the authority, because probing
    cannot be one: the fallback samples three frames (start, middle, end)
    and calls an object a mover if its matrix differs between them, and a
    periodic animation can be at rest at exactly those three instants. A
    `bob` is: its sine is keyed 0, +A, 0, -A, 0 across the range, so the
    three probes land on the three zeroes, the part reads as static, no
    keyframes are rebuilt, and the clip vanishes from the master — while
    a `spin` (0, 180, 360 degrees) survives because its midpoint differs.
    The result was that every bobbing scene failed its own parity check
    with S3D-E-901 while the identical scene spinning passed.

    Probing is kept for stages whose animation never existed in Blender
    (a USDA-authored source), where there is no known set to trust.

    Each mover gets loc/rot/scale keys on every frame of the stage's
    range. Deterministic: fixed frame walk, no interpolation guessing —
    the samples ARE the animation.
    """
    import bpy
    scene = bpy.context.scene
    start, end = scene.frame_start, scene.frame_end
    if end <= start:
        return
    present = {o.name for o in scene.objects if o.type in ("MESH", "EMPTY")}
    movers = sorted(present & set(known)) if known else []
    if not movers:
        probes = sorted({start, (start + end) // 2, end})
        snapshots = {}
        for frame in probes:
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            for o in scene.objects:
                if o.type not in ("MESH", "EMPTY"):
                    continue
                snapshots.setdefault(o.name, []).append(tuple(
                    round(v, 6) for row in o.matrix_world for v in row))
        movers = [name for name, mats in snapshots.items() if len(set(mats)) > 1]
    if not movers:
        return
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for name in movers:
            o = scene.objects.get(name)
            if o is None:
                continue
            o.keyframe_insert("location", frame=frame)
            o.keyframe_insert("rotation_euler", frame=frame)
            o.keyframe_insert("scale", frame=frame)
    scene.frame_set(start)
    log("rebaked %d animated object(s) across frames %d-%d" % (len(movers), start, end))


def transcode_stage_textures(master_path):
    """Rewrite textures the stage references into a format its readers accept.

    `export_textures_mode: NEW` materialises every referenced image beside the
    stage, and Blender picks the format from the image — which for the ones it
    synthesises during the export (a flat world or material colour) is OpenEXR.
    The USDZ package then stores whatever the stage references, and USDZ's
    readers do not read EXR: Apple Quick Look and AR Quick Look take png and
    jpeg only, so the packaged asset renders untextured in the one place the
    format exists to serve. Nothing warned, because from the compiler's side
    the reference resolved perfectly.

    The images this catches are flat colour swatches, so 8-bit PNG holds them
    exactly. Conversion happens after the export because that is the only
    moment they exist: they are the writer's own output, not scene data, and
    reformatting them beforehand has nothing to reformat.

    Returns the [(old, new)] basenames rewritten.
    """
    import bpy
    tex_dir = os.path.join(os.path.dirname(master_path), "textures")
    if not os.path.isdir(tex_dir):
        return []
    converted = []
    for name in sorted(os.listdir(tex_dir)):
        stem, ext = os.path.splitext(name)
        if ext.lower() in (".png", ".jpg", ".jpeg"):
            continue
        src = os.path.join(tex_dir, name)
        dst = os.path.join(tex_dir, stem + ".png")
        image = None
        try:
            image = bpy.data.images.load(src)
            image.file_format = "PNG"
            image.save(filepath=dst)
        except Exception:
            # An image that will not convert keeps its original file and its
            # reference; a half-rewritten stage would be worse than an EXR.
            if image is not None:
                try:
                    bpy.data.images.remove(image)
                except Exception:
                    pass
            continue
        try:
            bpy.data.images.remove(image)
        except Exception:
            pass
        try:
            os.remove(src)
        except Exception:
            pass
        converted.append((name, stem + ".png"))

    if converted:
        try:
            with open(master_path, "r", encoding="utf-8") as handle:
                text = handle.read()
            for old, new in converted:
                text = text.replace(old, new)
            with open(master_path, "w", encoding="utf-8", newline="") as handle:
                handle.write(text)
        except Exception:
            pass
        log("transcoded %d stage texture(s) to png" % len(converted))
    return converted


def master_usd_kwargs(job, animated):
    """The master stage carries EVERYTHING the writer can author: USD is
    the core format and the only ceiling allowed here is the writer's own.
    Animation is gated on the scene actually animating (the exporter walks
    the whole frame range), everything else is maxed. Keys unknown to an
    older exporter are dropped by the caller's retry."""
    kwargs = {
        "export_animation": bool(animated),
        "export_armatures": True,
        "export_shapekeys": True,
        "export_hair": True,
        "export_uvmaps": True,
        "export_normals": True,
        "export_materials": True,
        # A portable UsdPreviewSurface AND a MaterialX network on the same
        # material — the multi-render-context idiom the master exists for.
        "generate_materialx_network": True,
        # Materialise every referenced texture beside the stage so the
        # master is self-contained (imported GLBs carry packed images that
        # otherwise exist nowhere on disk).
        "export_textures_mode": "NEW",
        "overwrite_textures": True,
        "relative_paths": True,
    }
    kwargs.update(usd_orientation_kwargs(job))
    return kwargs


def usd_export_resilient(target, kwargs):
    """Export with the richest kwargs this Blender accepts: on TypeError
    (unknown keyword on an older exporter) drop the named key and retry,
    so capability degrades one flag at a time instead of all at once."""
    import bpy
    attempt = dict(kwargs)
    for _ in range(len(kwargs) + 1):
        try:
            bpy.ops.wm.usd_export(filepath=target, **attempt)
            return sorted(set(kwargs) - set(attempt))
        except TypeError as exc:
            match = re.search(r'keyword "(\w+)" unrecognized', str(exc))
            if match and match.group(1) in attempt:
                del attempt[match.group(1)]
                continue
            raise
    return sorted(set(kwargs) - set(attempt))


def export_lods(out_dir, ratios):
    """Author decimated GLB level-of-detail variants: scene.lod1.glb, ….

    Blender cannot write USD variantSets, so LODs ship as SEPARATE GLB
    deliverables (a legitimate delivery shape — an engine picks the level by
    distance). Each level duplicates every mesh, applies a Quadric-Error
    (COLLAPSE) decimate at the requested ratio to the COPIES, exports only
    those, then removes them — the master scene is left exactly as every other
    format saw it, which is why this runs LAST, after parity is measured.

    Returns [(path, ratio, faces)] for each level authored; a level whose
    export fails is skipped, never fatal to the real deliverables."""
    import bpy
    produced = []
    level = 0  # numbers files by what is actually PRODUCED, so a rejected
    # ratio never leaves a gap (scene.lod2.glb with no lod1); the TS side
    # already filters, but the runner stays self-consistent regardless.
    for ratio in ratios:
        r = float(ratio)
        if not (0.0 < r < 1.0):
            continue  # a LOD must REDUCE; 1.0 is the base, and >1 is nonsense
        level += 1
        bpy.ops.object.select_all(action="DESELECT")
        originals = [o for o in list(bpy.context.scene.objects) if o.type == "MESH"]
        copies = []
        for o in originals:
            c = o.copy()
            c.data = o.data.copy()
            bpy.context.scene.collection.objects.link(c)
            # Shape keys (glTF morph targets) are per-vertex deltas that cannot
            # survive a vertex-count change, so BOTH modifier_apply and the glTF
            # exporter refuse to apply a topology-changing DECIMATE to a mesh
            # that has them — the LOD would silently ship at FULL resolution. A
            # distance LOD does not carry morphs anyway, so clear them on the
            # copy; decimation then actually reduces the mesh for every input.
            if c.data.shape_keys:
                c.shape_key_clear()
            mod = c.modifiers.new("s3d_lod", "DECIMATE")
            mod.decimate_type = "COLLAPSE"
            mod.ratio = r
            bpy.context.view_layer.objects.active = c
            c.select_set(True)
            try:
                bpy.ops.object.modifier_apply(modifier="s3d_lod")
            except Exception:
                pass  # fall back to export-time apply below
            copies.append(c)
        for o in bpy.context.scene.objects:
            o.select_set(o in copies)
        # Count faces on the DEPSGRAPH-EVALUATED mesh: shape keys are cleared
        # above so modifier_apply normally succeeds (evaluated == c.data), but
        # reading the evaluated mesh keeps the stat correct even if apply fell
        # back to export-time application, where the decimate is still a live
        # modifier that `c.data.polygons` would not reflect.
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        faces = sum(len(c.evaluated_get(depsgraph).data.polygons) for c in copies)
        target = os.path.join(out_dir, "scene.lod%d.glb" % level)
        bpy.ops.export_scene.gltf(filepath=target, export_format="GLB",
                                  use_selection=True, export_apply=True)
        produced.append((target, r, faces))
        log("exported LOD%d (ratio %.2f, %d faces) %s" % (level, r, faces, target))
        for c in copies:
            data = c.data
            bpy.data.objects.remove(c, do_unlink=True)
            try:
                bpy.data.meshes.remove(data)
            except Exception:
                pass
    return produced


def export_scene(job):
    import bpy
    formats = job.get("formats") or ["usda"]
    out_dir = job.get("outDir") or "."
    os.makedirs(out_dir, exist_ok=True)
    name_mesh_data()
    info = author_model_hierarchy(job)
    assets = []
    # Formats that could not be written, with the reason. One exporter
    # missing from a Blender build must not cost the user every other
    # deliverable — losing the GLB because the FBX add-on is absent is a
    # far worse outcome than shipping without the FBX.
    skipped = []

    # ---- Phase 1: author the MASTER -------------------------------------
    # USD is the core format. The stage is authored FIRST, with the full
    # payload, from the built scene — and every delivery container below is
    # produced from a re-import of this stage, never from the build scene
    # directly. A capability our writer failed to author into the master
    # therefore cannot silently survive into a deliverable: the parity
    # fingerprint reports it and the lint fails the compile.
    build_print = scene_fingerprint()
    animated = len(build_print["actions"]) > 0
    # WHICH objects animate, not just whether any do — the re-import cannot
    # rediscover this reliably (see rebuild_object_animation).
    animated_names = animated_object_names()
    lowering = {"buildFingerprint": build_print, "master": None,
                "masterFingerprint": None, "droppedExportOptions": []}

    source_usda = job.get("usdaFiles") or []
    if source_usda and "usda" not in formats:
        # A USDA-authored scene IS its own master; lower from the source.
        master_path = os.path.join(job.get("projectDir") or "", source_usda[0])
    else:
        master_path = os.path.join(out_dir, "scene.usda")
        try:
            dropped = usd_export_resilient(master_path, master_usd_kwargs(job, animated))
            lowering["droppedExportOptions"] = dropped
            transcode_stage_textures(master_path)
            post_process_usda(master_path, info, job)
            assets.append(master_path)
            log("authored master %s" % master_path)
        except Exception as exc:
            # No master, no deliverables: emit the failure for every
            # requested format rather than silently falling back to
            # direct exports that would hide the master's absence.
            for fmt in formats:
                skipped.append({"format": fmt,
                                "reason": "master stage failed to author: %s" % exc})
            emit({"ok": True, "data": {"assets": [], "skipped": skipped,
                                       "lowering": lowering}})
            return
    lowering["master"] = os.path.basename(master_path)

    # ---- Phase 2: re-import the master, measure parity ------------------
    reset_scene()
    try:
        bpy.ops.wm.usd_import(filepath=master_path)
    except Exception as exc:
        for fmt in formats:
            if fmt != "usda":
                skipped.append({"format": fmt,
                                "reason": "master could not be re-imported: %s" % exc})
        emit({"ok": True, "data": {
            "assets": [r for r in (rel_to_project(a, job) for a in assets) if r is not None],
            "skipped": skipped, "lowering": lowering}})
        return
    # Blender's USD importer applies timeSampled transforms per frame but
    # does NOT reconstruct actions/fcurves (probed: animation_data stays
    # None) — so a lowered GLB would silently lose the object animation
    # the master demonstrably carries. Rebuild it: sample the frame range,
    # bake keyframes onto every object that actually moves. The lowered
    # exporters then read real fcurves, and the parity fingerprint sees
    # the clips restored rather than reporting a phantom loss.
    if animated:
        rebuild_object_animation(animated_names)
    # Material tweaks must be REAPPLIED on the reimported scene: the tint
    # construct (a Mix-MULTIPLY between a texture and Base Color) has no
    # UsdPreviewSurface translation, so the round trip strips it — the
    # lowered GLB shipped a tint-less wood the build had visibly tinted.
    # Names survive the round trip, so replaying just the material channel
    # restores assigns and overrides for every lowered format. The
    # transforms are NOT replayed (they are baked into the master's
    # placements; replaying would double them). The usda master itself
    # keeps the texture without the tint — a known UsdPreviewSurface
    # expressiveness limit, carried here rather than hidden.
    material_tweaks = {
        name: {"material": t["material"]}
        for name, t in (job.get("tweaks") or {}).items()
        if isinstance(t, dict) and isinstance(t.get("material"), dict) and t["material"]
    }
    if material_tweaks:
        for name, t in material_tweaks.items():
            obj = bpy.context.scene.objects.get(name)
            if obj is None:
                continue
            try:
                apply_material_tweak(obj, t["material"])
            except Exception:
                pass
    lowering["masterFingerprint"] = scene_fingerprint()

    # ---- Phase 3: lower the delivery containers FROM the master ---------
    for fmt in formats:
      try:
        if fmt == "usda":
            # The master was authored in phase 1, before the re-import.
            pass
        elif fmt == "glb":
            target = os.path.join(out_dir, "scene.glb")
            bpy.ops.export_scene.gltf(filepath=target, export_format="GLB")
            assets.append(target)
            log("exported %s" % target)
        elif fmt == "obj":
            target = os.path.join(out_dir, "scene.obj")
            try:
                bpy.ops.wm.obj_export(filepath=target)
            except AttributeError:
                bpy.ops.export_scene.obj(filepath=target)
            assets.append(target)
            mtl = os.path.splitext(target)[0] + ".mtl"
            if os.path.exists(mtl):
                assets.append(mtl)
            log("exported %s" % target)
        elif fmt == "usdz":
            # USDZ is packaged PIPELINE-SIDE (src/usd/usdz.ts), after the
            # kind/purpose/assetInfo authoring that happens over there — a
            # package built here would predate those semantics and ship a
            # stage disagreeing with the file it claims to contain.
            pass
        elif fmt == "fbx":
            # FBX carries no PBR the way glTF does, so this is the
            # interchange path for DCC tools rather than the delivery path
            # for engines. Animation bakes when the scene animates.
            target = os.path.join(out_dir, "scene.fbx")
            # Embed textures: an FBX that references images by absolute
            # local path is broken the moment it leaves this machine, and
            # the round-trip test proves the loss (three missing-texture
            # errors on re-import without this).
            bpy.ops.export_scene.fbx(filepath=target, use_selection=False,
                                     bake_anim=bool(animated),
                                     path_mode="COPY", embed_textures=True)
            assets.append(target)
            log("exported %s" % target)
        elif fmt == "stl":
            target = os.path.join(out_dir, "scene.stl")
            try:
                bpy.ops.wm.stl_export(filepath=target)
            except AttributeError:
                bpy.ops.export_mesh.stl(filepath=target)
            assets.append(target)
            log("exported %s" % target)
        elif fmt == "ply":
            target = os.path.join(out_dir, "scene.ply")
            try:
                bpy.ops.wm.ply_export(filepath=target)
            except AttributeError:
                bpy.ops.export_mesh.ply(filepath=target)
            assets.append(target)
            log("exported %s" % target)
        else:
            skipped.append({"format": fmt, "reason": "unknown format"})
      except Exception as exc:
        # Report rather than raise: the remaining formats still get written,
        # and the pipeline turns this into a warning naming what is missing.
        skipped.append({"format": fmt, "reason": "%s: %s" % (type(exc).__name__, exc)})
        log("export %s failed: %s" % (fmt, exc))

    # ---- Phase 4: decimated LOD GLBs (opt-in, isolated, last) -----------
    # Runs after parity is measured and every real format is written, on
    # throwaway copies, so it can touch nothing the deliverables depend on.
    lod_ratios = job.get("lodRatios") or []
    lods_info = []
    if lod_ratios and "glb" in formats:
        try:
            for target, ratio, faces in export_lods(out_dir, lod_ratios):
                assets.append(target)
                lods_info.append({"ratio": ratio, "faces": faces,
                                  "file": os.path.basename(target)})
        except Exception as exc:
            skipped.append({"format": "glb-lod",
                            "reason": "%s: %s" % (type(exc).__name__, exc)})
            log("LOD export failed: %s" % exc)

    rel_assets = [r for r in (rel_to_project(a, job) for a in assets) if r is not None]
    emit({"ok": True, "data": {"assets": rel_assets, "skipped": skipped,
                               "lowering": lowering, "lods": lods_info}})


def rel_to_project(asset_path, job):
    if job.get("projectDir") and os.path.abspath(asset_path).startswith(
            os.path.abspath(job["projectDir"])):
        return os.path.relpath(os.path.abspath(asset_path),
                               job["projectDir"]).replace("\\", "/")
    return None


# ------------------------------------------------------------------
# Entry
# ------------------------------------------------------------------

def main(argv):
    job_file = find_job_file(argv)
    if job_file is None:
        emit({"ok": False, "errorCode": "S3D-E-202", "error": "no job file in argv: %r" % argv})
        sys.exit(1)
    job = json.load(open(job_file, "r", encoding="utf-8"))
    mode = job.get("mode")
    try:
        reset_scene()
        if mode == "build":
            load_scene(job)
            emit({"ok": True, "data": census(
                bpy.context.scene,
                bool(job.get("measureThickness")),
                float(job.get("voxelGrid") or 0.0),
            )})
        elif mode == "proof":
            load_scene(job)
            proof(job)
        elif mode == "export":
            load_scene(job)
            export_scene(job)
        else:
            fail("S3D-E-202", "unknown mode %r" % mode)
    except SystemExit:
        raise
    except Exception:
        exc = sys.exc_info()
        fail("S3D-E-202", "%s: %s\n%s" % (exc[0].__name__, exc[1], traceback.format_exc(limit=10)))


if __name__ == "__main__":
    import bpy
    main(sys.argv[1:])