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

import array
import base64
import json
import math
import os
import re
import struct
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
            except Exception as exc:
                TWEAK_NOTES.append(
                    "'%s' %s could not be applied: %s" % (name, "translate", exc))

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
            except Exception as exc:
                TWEAK_NOTES.append(
                    "'%s' %s could not be applied: %s" % (name, "quat", exc))

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
            except Exception as exc:
                TWEAK_NOTES.append(
                    "'%s' %s could not be applied: %s" % (name, "rotate", exc))

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
            except Exception as exc:
                TWEAK_NOTES.append(
                    "'%s' %s could not be applied: %s" % (name, "scale", exc))

        m = t.get("material")
        if isinstance(m, dict) and m:
            try:
                apply_material_tweak(obj, m)
            except Exception as exc:
                TWEAK_NOTES.append(
                    "'%s' %s could not be applied: %s" % (name, "material", exc))


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


DRIVER_LOG_LINES = 20


def capture_native_output(call):
    """Run `call`, returning (result, error, text-the-process-printed).

    Blender's GPU module compiles shaders in C and prints the DRIVER's log —
    the line numbers, the actual GLSL error — to the process's stdout. The
    Python exception that surfaces says only "Shader Compile Error, see
    console", so a rejected kernel reported nothing an author could act on:
    the one thing that would identify the fault was written to a console
    nobody was reading, and the report carried the useless half.

    Captured at the FILE DESCRIPTOR, not sys.stdout, because the writer is
    native code that never touches Python's stream objects. The runner's own
    result payload also travels on fd 1, so the redirect is scoped tightly
    around the call and restored in a finally — a leaked redirect would eat
    the compile's output entirely.
    """
    import tempfile
    saved_out = os.dup(1)
    saved_err = os.dup(2)
    sink = tempfile.TemporaryFile()
    result = None
    error = None
    try:
        sys.stdout.flush()
        sys.stderr.flush()
        os.dup2(sink.fileno(), 1)
        os.dup2(sink.fileno(), 2)
        try:
            result = call()
        except Exception as exc:
            error = exc
        finally:
            sys.stdout.flush()
            sys.stderr.flush()
            os.dup2(saved_out, 1)
            os.dup2(saved_err, 2)
    finally:
        os.close(saved_out)
        os.close(saved_err)
    try:
        sink.seek(0)
        text = sink.read().decode("utf-8", "replace")
    except Exception:
        text = ""
    finally:
        sink.close()
    return result, error, text


def driver_log_tail(text):
    """The part of a driver log worth putting in a report.

    Tail, not head: GLSL logs lead with the source dump and END with the
    diagnosis. Bounded because a driver can emit the whole shader back."""
    lines = [ln.rstrip() for ln in (text or "").splitlines() if ln.strip()]
    if not lines:
        return ""
    return "\n".join(lines[-DRIVER_LOG_LINES:])


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
            # Compiled WITHOUT the capture: redirecting the process's file
            # descriptors is cheap but not free, and a scene with many shaders
            # (or a fuzz run driving hundreds of compiles) would pay for it on
            # every success to serve a log only failures need.
            try:
                shader = gpu.shader.create_from_info(info)
            except Exception:
                # It failed, so the log is now worth having: compile a second
                # time with the driver's own output captured. The retry costs
                # a rejected compile on a path that was already failing, and
                # it is the only way to reach a message the C layer prints to
                # a console rather than raising.
                _retry, _err, driver_log = capture_native_output(
                    lambda: gpu.shader.create_from_info(info))
                raise
        except Exception as e:
            tail = driver_log_tail(locals().get("driver_log", ""))
            fail("S3D-E-802",
                 "shader '%s' failed to compile on the driver: %s%s"
                 % (name, e, ("\n" + tail) if tail else
                    " (the driver printed no log; the kernel dialect allows "
                    "straight-line math and the injected s3d_* helpers only — "
                    "no user-defined functions, no loops)"))

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
                if (output == "emission" and "Emission Strength" in bsdf.inputs
                        and bsdf.inputs["Emission Strength"].default_value == 0.0):
                    # Emission Color is a COLOUR; Emission Strength decides
                    # whether any of it leaves the surface, and Blender
                    # defaults it to 0. A baked emission atlas wired into a
                    # zero-strength socket is multiplied away: it did not glow
                    # in the proof, the USD writer correctly declined to author
                    # an inert emissiveColor, and the shipped glTF carried
                    # neither an emissive texture nor a factor. Declaring
                    # `outputs: ["emission"]` bought a bake, a wire, and no
                    # light.
                    #
                    # Only when it is still 0, so a material that declared its
                    # own strength keeps it — this supplies a missing value,
                    # it does not overrule one.
                    bsdf.inputs["Emission Strength"].default_value = 1.0


"""Degraded-import facts gathered during load, surfaced as lint warnings.

The deterministic "repair" posture for broken downloads: never mutate the
file, never guess — DETECT what is missing or damaged and report it with
the fix, so the author (or the agent) repairs the source. A silent grey
import is the worst outcome; a named missing .mtl is a one-line fix."""
IMPORT_NOTES = []

# Viewer edits that could not be replayed. The bare `except: pass` around
# each channel below is right — a stale part name or a value this Blender
# will not take must never wedge a compile — but silence is not: the same
# catch also hides a malformed tweaks.json and an API break, and this file
# already has IMPORT_NOTES and SHADER_NOTES for exactly this "detect and
# name" job.
TWEAK_NOTES = []


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
    """Load whatever the job names, with the project directory as cwd ONLY
    while the author's build script runs.

    The chdir exists for that script: a hand-written `build.py` refers to its
    own assets by relative path, and the generated `spec.build.py` inherits
    the convention. It used to be permanent, and that made every runner
    process hold the project directory open as its cwd for the whole job and
    for as long as the process object survived afterwards.

    On Windows that is not a theoretical cost. A directory whose cwd handle is
    held cannot be removed while its FILES delete perfectly well — which is
    exactly the signature of the "working directory is still locked" setup
    failures this suite kept producing: every file in the tree deleted, every
    directory node refused, and the whole thing cleared minutes later once the
    process was finally reaped. Blaming the scanner, the harness, and a
    long-dead zombie process all missed that the compiler itself was the one
    standing in the doorway.

    So the cwd is restored the moment the script is done, in a finally. Every
    other path in this file is already absolute (`os.path.join(project_dir,
    ...)`), so nothing else depended on it.
    """
    import bpy
    project_dir = job.get("projectDir")
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
        # The one place the project directory has to BE the cwd, and only for
        # as long as the author's script is running — see this function's docs.
        previous_cwd = os.getcwd()
        try:
            if project_dir:
                os.chdir(project_dir)
            try:
                with provenance(path) as origins:
                    exec(compile(source, path, "exec"), g)
                PROVENANCE.update(origins)
            except Exception:
                fail("S3D-E-202", "build script raised: %s" % traceback.format_exc(limit=8))
        finally:
            try:
                os.chdir(previous_cwd)
            except Exception:
                # Nowhere to go back to is survivable; holding the project
                # directory open is the thing worth avoiding, and any cwd
                # other than the project's achieves it.
                pass
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


# A face whose area is below this fraction of its own longest edge squared
# has effectively collinear vertices. Equilateral is ~0.43; a millionth of
# that is unambiguously degenerate and cannot be reached by honest
# tessellation. Lives here, beside census(), which is its only consumer.
ZERO_AREA_RATIO = 1e-6


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
        # Degenerate means "this face has no area FOR ITS OWN SIZE", which is
        # a shape fact, not a metric one. The threshold used to be an absolute
        # 1e-7 m^2 (0.1 mm^2) — so every face of any small part was degenerate
        # by definition: a 3mm sphere reported all 1152 of its faces, and any
        # miniature, jewellery piece or small mechanical part flooded. Being
        # measured in world space made that worse, not better; it is scale
        # dependence that is wrong here, and world space is where scale lives.
        #
        # Compared against the face's own longest edge instead. A healthy
        # triangle has area ~0.43*e^2 (equilateral); a collinear one has area
        # that vanishes while its edges stay finite. The ratio is dimensionless,
        # so it says the same thing about a 3mm part and a 300m one — the same
        # discipline `worstAspectRatio` twenty lines below already applies, and
        # the two now agree about what a degenerate triangle is.
        zero_area = 0
        for f in bm.faces:
            longest = max((e.calc_length() for e in f.edges), default=0.0)
            if longest <= 0.0:
                zero_area += 1
            elif f.calc_area() < ZERO_AREA_RATIO * longest * longest:
                zero_area += 1
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
        # How the surface resolves alpha. Two materials identical in every
        # Principled input still render completely differently if one masks
        # and the other blends, so this is part of the LOOK, not a setting —
        # calibration against Khronos AlphaBlendModeTest, whose whole purpose
        # is to vary exactly this, had the duplicate-material rule calling its
        # five deliberately-different materials identical and advising a merge
        # that would have visibly broken the asset.
        # EEVEE Next names it surface_render_method; legacy EEVEE names it
        # blend_method. Report whichever this Blender has.
        blend = ""
        try:
            if hasattr(m, "surface_render_method"):
                blend = str(m.surface_render_method)
            elif hasattr(m, "blend_method"):
                blend = str(m.blend_method)
        except Exception:
            blend = ""
        mat_rows.append({
            "name": m.name, "usedByObjectCount": used, "principled": p,
            "textureNames": mat_texture_names(m),
            "blendMethod": blend,
            "alphaCutoff": alpha_clip_threshold(m),
            "graph": material_graph_signature(m),
        })

    tex_rows = []
    # Blender's own viewer buffers are not scene content. Rendering the proof
    # creates a `Render Result` datablock, and it was being reported as a
    # texture — 0x0, no filepath — so a flipbook scene's manifest listed one
    # "texture" that was the render, and none of the atlases it had baked.
    VIEWER_IMAGE_TYPES = ("RENDER_RESULT", "COMPOSITING")
    for img in sorted(bpy.data.images, key=lambda x: x.name):
        if getattr(img, "type", "IMAGE") in VIEWER_IMAGE_TYPES:
            continue
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
        "tweakNotes": list(TWEAK_NOTES),
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
    """Largest texture edge (px) REACHABLE from the Principled BSDF, or 0.

    Reachable, not merely present: a disconnected TEX_IMAGE samples nothing
    (the same argument `hasTexture` already makes), yet this used to size
    the texel-density formula off exactly such a node — a 512 albedo with a
    stray 4K node in the tree reported 8x the density any shader reads.
    Falls back to any bound image only when the material has no Principled
    to walk from (a bare emission graph still textures its mesh).
    """
    if not m or not m.node_tree:
        return 0
    root = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    best = 0
    if root is not None:
        seen = set()
        stack = [root]
        while stack:
            n = stack.pop()
            if id(n) in seen:
                continue
            seen.add(id(n))
            if n.type == "TEX_IMAGE" and n.image is not None:
                best = max(best, n.image.size[0], n.image.size[1])
            for inp in n.inputs:
                for link in inp.links:
                    if link.from_node is not None:
                        stack.append(link.from_node)
        return best
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
            # Carried with the face's world area so the mean below can be
            # area-weighted, like stretch.mean already is.
            densities.append((math.sqrt(uv_area / world_area) * tex_px, world_area))
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
        # Mean is AREA-weighted, matching stretch.mean: an unweighted
        # per-face mean let a hundred tiny bevel faces outvote the one big
        # visible slab, so the reported number was not the density a viewer
        # perceives. min/max stay per-face extremes — "does any face miss
        # the band" is genuinely a per-face question.
        density_area = sum(w for _, w in densities)
        density = {
            "min": R6(min(v for v, _ in densities)),
            "max": R6(max(v for v, _ in densities)),
            "mean": R6(
                (sum(v * w for v, w in densities) / density_area)
                if density_area > 1e-12
                else sum(v for v, _ in densities) / len(densities)
            ),
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


def principled_node(m):
    """The Principled BSDF node itself. `principled()` returns its measured
    facts; capability probing needs the node to walk backward from."""
    tree = getattr(m, "node_tree", None)
    if tree is None:
        return None
    return next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def _image_behind_socket(socket):
    """The image feeding a socket, through whatever nodes sit between it and
    the texture.

    Parity cares about the ROLE — "an image drives base colour" — not the
    topology that delivers it. A Normal Map, a Separate Color splitting a
    packed ORM, a Mix carrying a tint are all legitimate ways to reach the
    same binding, and the USD round trip rebuilds them differently even when
    nothing was lost. Walking back to the image is the comparison that
    survives a re-author.
    """
    if socket is None or not socket.is_linked:
        return None
    seen = set()
    stack = [l.from_node for l in socket.links]
    while stack:
        n = stack.pop()
        if id(n) in seen:
            continue
        seen.add(id(n))
        if n.type == "TEX_IMAGE" and n.image:
            return n.image
        for i in n.inputs:
            for l in i.links:
                stack.append(l.from_node)
    return None


IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".exr", ".tga", ".tif", ".tiff",
                    ".bmp", ".webp")


def image_identity(image):
    """A texture's identity ACROSS a round trip.

    The master materialises packed images to disk, so `Image_3` on the build
    side arrives as `Image_3.png` on the master side. The extension records
    that the texture was written down, not that it is a different texture."""
    if image is None:
        return None
    name = image.name
    lowered = name.lower()
    for ext in IMAGE_EXTENSIONS:
        if lowered.endswith(ext):
            return name[: -len(ext)]
    return name


# The importer's side channel: glTF channels Blender's Principled has no
# socket for (occlusion, thickness) are routed into this group node.
GLTF_EXTRAS_GROUP = "glTF Material Output"


def gltf_extras_node(mat):
    tree = getattr(mat, "node_tree", None)
    if tree is None:
        return None
    for n in tree.nodes:
        if n.type == "GROUP" and n.node_tree and GLTF_EXTRAS_GROUP in n.node_tree.name:
            return n
    return None


# Principled input -> the role name parity speaks in.
TEXTURE_ROLE_INPUTS = (
    ("baseColor", "Base Color"),
    ("metallic", "Metallic"),
    ("roughness", "Roughness"),
    ("normal", "Normal"),
    ("emission", "Emission Color"),
    ("alpha", "Alpha"),
)


def material_capability(mat):
    """What a material DOES, in terms a round trip can be held to.

    Distinct from `material_graph_signature`, which hashes node TOPOLOGY to
    find duplicates within one scene. Topology legitimately changes when the
    USD importer re-authors a graph, so a structural hash cannot answer "did
    the round trip lose anything" — it would answer "yes" every time and
    therefore never be consulted. This reports the bindings and the surface
    flags instead: which image drives which role, and whether the surface is
    one- or two-sided.

    Both were being lost silently. Occlusion lives in the extras group, which
    the USD writer does not traverse, so the map and its binding vanished from
    every glTF asset that had one. Backface culling is a plain material flag
    the round trip resets, which flipped every closed mesh to two-sided. The
    census measured neither, so the parity check had nothing to compare.
    """
    node = principled_node(mat)
    roles = {}
    if node is not None:
        for role, socket_name in TEXTURE_ROLE_INPUTS:
            if socket_name in node.inputs:
                ident = image_identity(_image_behind_socket(node.inputs[socket_name]))
                if ident:
                    roles[role] = ident
    extras = gltf_extras_node(mat)
    if extras is not None and "Occlusion" in extras.inputs:
        ident = image_identity(_image_behind_socket(extras.inputs["Occlusion"]))
        if ident:
            roles["occlusion"] = ident
    # Emission STRENGTH, not just the binding. UsdPreviewSurface has no
    # concept of it, so a surface authored to glow at 4 comes back at 1 with
    # every role still present — a loss no binding comparison can see.
    strength = None
    if node is not None and "Emission Strength" in node.inputs:
        if not node.inputs["Emission Strength"].is_linked:
            strength = R6(float(node.inputs["Emission Strength"].default_value))
    return {"roles": roles,
            "backfaceCulling": bool(getattr(mat, "use_backface_culling", False)),
            "emissionStrength": strength}


def reachable_actions():
    """Every action the scene can actually deliver, by name.

    NOT just the action bound to an object. Blender's glTF importer binds one
    clip and files the rest as NLA strips, so a three-clip character reads as
    one bound action — which is what the parity fingerprint used to compare,
    on both sides of the round trip, agreeing with itself while two of the
    three clips were dropped. An action in an NLA strip is scene content: it
    reaches the exporters and it is what the author shipped.

    Orphan datablocks are still excluded. A deleted rig's leftover clip is
    reachable from nothing and must not read as a master loss.
    """
    import bpy
    names = set()
    for o in bpy.context.scene.objects:
        ad = o.animation_data
        if not ad:
            continue
        if ad.action and action_has_curves(ad.action):
            names.add(ad.action.name)
        for track in ad.nla_tracks:
            for strip in track.strips:
                if strip.action and action_has_curves(strip.action):
                    names.add(strip.action.name)
    return names


def material_graph_signature(mat):
    """A structural fingerprint of a material's whole node graph.

    The duplicate-material rule compares a hand-picked list of Principled
    inputs, and that list can never be complete: a Blender material is an
    arbitrary node graph, and every glTF extension the importer supports adds
    a distinction the list does not carry. Calibration against the Khronos
    corpus caught the same bug three times in a row wearing different clothes —
    alphaMode (MASK vs OPAQUE), then alphaCutoff (0.25 vs 0.75), then
    iridescence — each time proposing a merge that would visibly change the
    asset. Enumerating properties loses that race by construction.

    So compare the GRAPH. Two materials that shade differently have different
    graphs; two that are genuine duplicates have the same one. Structure only —
    node types, operations, unlinked input values and the link topology —
    deliberately excluding names and screen positions, which differ for
    reasons that never reach a pixel.

    A false negative here (two duplicates whose graphs differ cosmetically)
    costs a missed draw call. A false positive costs an author merging two
    materials that looked identical only to us. They are not the same mistake.
    """
    import hashlib
    tree = getattr(mat, "node_tree", None)
    if tree is None:
        return ""
    parts = []
    try:
        for n in sorted(tree.nodes, key=lambda x: (x.type, x.name)):
            vals = []
            for i in n.inputs:
                if i.links:
                    vals.append("L")
                    continue
                dv = getattr(i, "default_value", None)
                try:
                    vals.append(",".join("%.6g" % float(v) for v in dv))
                except TypeError:
                    vals.append("%.6g" % dv if isinstance(dv, (int, float)) else str(dv))
                except Exception:
                    vals.append("?")
            op = str(getattr(n, "operation", "") or getattr(n, "blend_type", "") or "")
            parts.append("%s|%s|%s" % (n.type, op, ";".join(vals)))
        for l in sorted(
            tree.links,
            key=lambda x: (x.from_node.type, x.from_socket.name, x.to_node.type, x.to_socket.name),
        ):
            parts.append("%s.%s>%s.%s" % (l.from_node.type, l.from_socket.name,
                                          l.to_node.type, l.to_socket.name))
    except Exception:
        return ""
    return hashlib.sha256(chr(10).join(parts).encode("utf-8")).hexdigest()[:16]


def alpha_clip_threshold(mat):
    """The alpha CUTOFF a masked material clips at, or None.

    glTF's alphaMode MASK survives import as a node chain rather than a
    material property: Principled Alpha <- MATH(SUBTRACT) <- MATH(LESS_THAN,
    cutoff) <- the alpha source. Blender's own exporter reads it back, so the
    cutoff is real and ships in the GLB — but nothing measured it, and the
    duplicate-material rule therefore called Khronos AlphaBlendModeTest's
    OPAQUE and three MASK variants identical and advised merging them. Verified
    by exporting that asset and reading the result: alphaMode and alphaCutoff
    round-trip exactly, so those materials genuinely differ in what we ship.

    Walks a few hops back from Alpha and takes the comparison operand of the
    first threshold node it meets. Absent chain, absent verdict: None."""
    try:
        tree = mat.node_tree
        if tree is None:
            return None
        bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            return None
        socket = bsdf.inputs.get("Alpha")
        if socket is None or not socket.links:
            return None
        node = socket.links[0].from_node
        for _ in range(4):
            if node is None:
                return None
            if node.type == "MATH" and node.operation in ("LESS_THAN", "GREATER_THAN"):
                return R6(float(node.inputs[1].default_value))
            nxt = None
            for i in node.inputs:
                if i.links:
                    nxt = i.links[0].from_node
                    break
            node = nxt
    except Exception:
        return None
    return None


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
                # R6, not round(): a non-finite value must become None here
                # or json.dumps(allow_nan=False) kills the whole compile as
                # an undiagnosable S3D-E-202. This is the file's rule for
                # every float that reaches emit(); these were plain round().
                rot_deg = R6(ang)

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
        center_out = [R6(cen.x), R6(cen.y), R6(cen.z)]
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
        local_size = [R6(max(xs) - min(xs)),
                      R6(max(ys) - min(ys)),
                      R6(max(zs) - min(zs))]

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
        "gridDeviation": None if grid_dev is None else R6(grid_dev),
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
    # 40 here against contact_report's 60, because the two searches cost
    # different things at the same mesh count: contacts compare AABBs (a
    # handful of floats per pair), this compares TRIANGLES within every
    # overlapping pair. The asymmetry is the cost difference, not an accident —
    # and either way the cap reports itself rather than reading as "clean".
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


# The colour written UNDER a transparent proof background.
#
# The film is rendered transparent so the alpha channel is an exact subject
# mask — which is what the coverage measurement below reads, and what lets a
# viewer composite the asset over anything. But Blender leaves RGB at zero
# beneath those transparent pixels, and most things that touch a PNG drop
# alpha: converters, thumbnailers, model runtimes that accept images. All of
# them then show a BLACK frame, and a dark asset on black reads as a broken
# render rather than a dark asset. Every agent using this harness reported it.
#
# So the transparency stays and the black goes: RGB under the backdrop is
# filled with a neutral studio grey, alpha left at zero. Alpha-aware consumers
# see exactly what they saw before; everything else sees a grey backdrop
# instead of a void. Slightly cool and mid-dark, so neither a white ceramic
# nor a black hull disappears into it.
PROOF_MATTE = (0.16, 0.17, 0.19)


def frame_stats(filepath):
    """Coverage statistics for one rendered frame, and its backdrop matte.

    Both here because both need the pixels, and loading a 1024^2 PNG twice to
    do one job each is a second of every compile for nothing.

    Coverage comes from ALPHA, not from brightness. Reading it as
    "luminance > 0.01" only worked because the backdrop was pure black, and it
    conflates two different questions the moment anything else is true: a matte
    black hull is subject that is not bright, and a grey backdrop is bright
    without being subject. Alpha answers "is this the asset" exactly, at any
    albedo, against any backdrop — and mean luminance is then measured over the
    covered pixels only, so exposure findings describe the ASSET rather than
    the average of the asset and the void around it.
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
        count = width * height * 4
        # foreach_get into a stdlib float array: numpy is not a dependency of
        # every scene (only shader bakes require it), and `list(img.pixels)`
        # on a 1024^2 frame is four million Python floats.
        buf = array.array("f", bytes(count * 4))
        try:
            img.pixels.foreach_get(buf)
        except Exception:
            buf = array.array("f", img.pixels)

        stride = max(1, (width * height) // 4096)
        total = 0.0
        covered = 0
        blown = 0
        samples = 0
        for index in range(0, width * height, stride):
            base = index * 4
            alpha = buf[base + 3]
            samples += 1
            if alpha <= 0.02:
                continue
            covered += 1
            luminance = 0.2126 * buf[base] + 0.7152 * buf[base + 1] + 0.0722 * buf[base + 2]
            total += luminance
            if luminance > 0.92:
                blown += 1

        matte_transparent_pixels(img, buf, count)

        if samples == 0:
            return {"path": filepath, "meanLuminance": None, "coverage": None, "blownRatio": None}
        return {
            "path": filepath,
            # Mean over the SUBJECT. An empty frame has no subject, so it
            # reports 0 and the empty rule still fires on it.
            "meanLuminance": R6((total / covered) if covered else 0.0),
            "coverage": R6(covered / samples),
            # Fraction of covered pixels near pure white. A frame can pass the
            # black-frame rule and still be exposure mush — this is the
            # number that catches "pale, shadowless, blown out".
            "blownRatio": R6((blown / covered) if covered else 0.0),
        }
    finally:
        try:
            bpy.data.images.remove(img)
        except Exception:
            pass


def matte_transparent_pixels(img, buf, count):
    """Write PROOF_MATTE under every fully transparent pixel, in place.

    Alpha is untouched, so nothing that reads the mask changes. Failure is
    survivable and silent by design: a frame that could not be matted is still
    a correct render, just one with a black backdrop, and refusing the compile
    over a cosmetic pass would be the worse trade.
    """
    try:
        changed = False
        for base in range(0, count, 4):
            if buf[base + 3] > 0.02:
                continue
            buf[base] = PROOF_MATTE[0]
            buf[base + 1] = PROOF_MATTE[1]
            buf[base + 2] = PROOF_MATTE[2]
            changed = True
        if not changed:
            return
        img.pixels.foreach_set(buf)
        img.save()
    except Exception as exc:
        log("proof matte skipped for %s: %s" % (getattr(img, "name", "?"), exc))


# The band EEVEE actually resolves a subject in, measured by bisection: below
# ~2mm and above ~200m it returns black frames for geometry that is present,
# framed and lit. Outside it, the proof renders a uniformly rescaled COPY of
# the scene (see render_scale_guard) rather than reporting a limitation.
PROOF_RENDERABLE_MIN = 0.002
PROOF_RENDERABLE_MAX = 200.0
# What an out-of-band scene is rescaled to. Mid-band, so neither a 200-micron
# part nor a 2km site lands near an edge.
PROOF_RENDER_TARGET = 1.0


def render_scale_guard(scene):
    """Put the scene inside the renderer's resolvable band, reversibly.

    A proof frame is a picture of SHAPE. Scaling the geometry, the camera and
    the lights by one factor produces the same image — the subject fills the
    same pixels, lit the same way — so the renderer's floor and ceiling stop
    being the compiler's floor and ceiling. A 200-micron part and a 2km site
    both get a real turntable instead of eight black frames.

    Reversible because the export stage runs after this one and must see the
    scene the author built: every world matrix and every lamp power is
    snapshotted and restored, rather than re-derived by scaling back (which
    would leave float residue on every transform in the file).

    Lamp power scales with k^2. Distances scale by k, so irradiance falls by
    k^2; without the compensation a rescaled scene renders at a completely
    different exposure than the one the lighting was calibrated for.

    Lamp SHAPE needs no compensation, which is worth recording because it
    reads like an omission: an area light's `data.size` is unchanged by the
    matrix below, so the solid angle it subtends looks like it should shift
    and harden every shadow. Blender applies the object's scale to the
    light's shape at render time, so it does not. Measured rather than
    assumed - the same scene at 1m and at 0.5mm (where the guard fires and
    rescales by 2000x) renders to mean luminance 0.9169 vs 0.9089 with
    identical lit-pixel fraction and shadow-gradient coverage matching to
    0.0003. Scaling data.size as well would DOUBLE-apply the factor.

    Returns a callable that undoes everything, or None when the scene already
    sits inside the band and nothing was touched.
    """
    import bpy
    import mathutils

    lo, hi = scene_bbox(scene)
    size = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    if not math.isfinite(size) or size <= 0:
        return None
    if PROOF_RENDERABLE_MIN <= size <= PROOF_RENDERABLE_MAX:
        return None

    k = PROOF_RENDER_TARGET / size
    center = (lo + hi) / 2.0
    objects = list(scene.objects)
    saved_matrices = [(o, o.matrix_world.copy()) for o in objects]
    saved_energies = [(o, o.data.energy) for o in objects
                      if o.type == "LIGHT" and hasattr(o.data, "energy")]

    about_centre = (mathutils.Matrix.Translation(center)
                    @ mathutils.Matrix.Scale(k, 4)
                    @ mathutils.Matrix.Translation(-center))
    for obj in objects:
        # Roots only: children follow their parent's matrix, and scaling both
        # would apply the factor twice down every branch of the hierarchy.
        if obj.parent is None:
            obj.matrix_world = about_centre @ obj.matrix_world
    for obj, energy in saved_energies:
        obj.data.energy = energy * (k * k)
    bpy.context.view_layer.update()
    log("proof: scene is %g m across, rendered at %gx to stay inside the "
        "renderer's %g-%g m band" % (size, k, PROOF_RENDERABLE_MIN, PROOF_RENDERABLE_MAX))

    def restore():
        for obj, matrix in saved_matrices:
            obj.matrix_world = matrix
        for obj, energy in saved_energies:
            obj.data.energy = energy
        bpy.context.view_layer.update()

    return restore


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

    # Inside the renderer's band before anything is measured from the scene:
    # the camera distance, the orbit radius and the lamp compensation all read
    # the bounds below, and they must read the bounds being RENDERED.
    restore_scale = render_scale_guard(scene)
    saved_clip = (auto_cam.data.clip_start, auto_cam.data.clip_end)
    try:
        return _proof_frames(job, scene, opts, auto_cam, is_auto, steps,
                             filepaths, turntable_on)
    finally:
        auto_cam.data.clip_start, auto_cam.data.clip_end = saved_clip
        if restore_scale is not None:
            restore_scale()


def _srgb_encode(u):
    """Forward sRGB transfer, so an emission colour chosen here lands as an
    exact predictable byte once the Standard view transform encodes it."""
    return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4


# The id-map channel quantisation: 8 well-separated steps per channel, so a
# web-side nearest-step decode survives dithering, mild filtering and any
# codec rounding with ±18 of headroom. 8^3 - 1 = 511 addressable parts;
# index 0 is reserved for "background / nothing".
ID_STEPS = [round(k * 255 / 7) for k in range(8)]


def _proof_id_pass(scene, subjects, aim_for_step, steps, filepaths):
    """Render one object-index map per proof frame.

    The proof frames are prerendered pixels, and a rect can only say where a
    part's bounding box landed — not which pixels ARE the part. The id map
    answers that exactly: every subject is re-shaded with a flat emission
    colour encoding its index, the same camera renders the same frames, and
    the viewer can then apply a per-pixel, occlusion-correct effect (the
    x-ray energize) to precisely the pixels the part occupies.

    No restoration: this runs after every beauty render in a process that
    rebuilds the scene from source on each invocation and exits right after
    the emit — the mutations die with the process.
    """
    import bpy

    ordered = sorted(subjects, key=lambda o: o.name)
    capacity = len(ID_STEPS) ** 3 - 1
    if len(ordered) > capacity:
        log("id maps cover the first %d of %d parts (encoding capacity)"
            % (capacity, len(ordered)))
        ordered = ordered[:capacity]
    for index, obj in enumerate(ordered):
        code = index + 1
        r = ID_STEPS[(code // 64) % 8]
        g = ID_STEPS[(code // 8) % 8]
        b = ID_STEPS[code % 8]
        mat = bpy.data.materials.new("S3D_IDX_%d" % code)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()
        emit_node = nodes.new("ShaderNodeEmission")
        emit_node.inputs["Color"].default_value = (
            _srgb_encode(r / 255.0), _srgb_encode(g / 255.0), _srgb_encode(b / 255.0), 1.0,
        )
        emit_node.inputs["Strength"].default_value = 1.0
        out_node = nodes.new("ShaderNodeOutputMaterial")
        links.new(emit_node.outputs["Emission"], out_node.inputs["Surface"])
        if not obj.material_slots:
            obj.data.materials.append(mat)
        for slot in obj.material_slots:
            slot.link = "OBJECT"
            slot.material = mat

    # Flat colours must arrive as flat bytes: no AA spread, no dither, no
    # filmic look, alpha-0 background so "nothing" decodes as nothing.
    scene.render.filter_size = 0.01
    scene.render.dither_intensity = 0.0
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = "RGBA"
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except Exception:
        pass
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    written = []
    for i in range(steps):
        aim_for_step(i)
        target = filepaths[i][:-4] + ".idx.png" if filepaths[i].lower().endswith(".png") else filepaths[i] + ".idx.png"
        scene.render.filepath = target
        bpy.ops.render.render(write_still=True)
        written.append(target)
    return written, [o.name for o in ordered]


def _proof_frames(job, scene, opts, auto_cam, is_auto, steps, filepaths, turntable_on):
    import bpy
    import mathutils
    from bpy_extras.object_utils import world_to_camera_view
    lo, hi = scene_bbox(scene)
    center = (lo + hi) / 2.0
    diag = (hi - lo).length
    cam_data = auto_cam.data
    # Framing distance is the subject's, with no floor. A fixed 0.1m minimum
    # used to sit here: for anything smaller than about a hand it parked the
    # camera further away than the framing asked for, so a 2mm part rendered
    # as a speck and a 200-micron one as nothing at all — a constant metre
    # value inside the one calculation whose entire job is to scale with the
    # subject. A degenerate (zero-extent) scene has no distance to derive, and
    # only that case falls back to a fixed one.
    span = (diag / 2.0) / math.tan(cam_data.angle / 2.0) * 1.25
    dist = span if span > 0 else 1.0
    elevation = math.radians(30.0)

    # Clip planes derived from the framing distance, for the same reason the
    # distance itself is derived: Blender's defaults are 0.1m and 100m, two
    # absolute metre values in a shot whose every other quantity scales with
    # the subject. They were invisible while the distance floor above held the
    # camera at 0.1m — removing that floor let the camera reach the framing it
    # had always asked for, and put every subject under ~4cm INSIDE the near
    # plane. The two constants were covering for each other.
    #
    # Restored afterwards: the proof owns how it renders, not what the file
    # says about the author's camera.
    cam_data.clip_start = max(dist * 1e-3, 1e-7)
    cam_data.clip_end = max(dist * 1e3, diag * 10.0)

    frames = []
    # An animated scene plays its clip across the turntable: frame i of the
    # orbit also samples timeline position i/steps, so the proof frames show
    # the MOTION the census reported instead of one frozen instant. Without
    # this, an asset the manifest labels `animation` proved as N identical
    # poses — the player scrubbed a static object, which read as a broken
    # export rather than a camera choice. i/steps (not i/(steps-1)) keeps
    # the last frame one step short of the first, so looped playback cycles
    # without a doubled pose. Single stills keep the current frame: one
    # image cannot show motion, and the authored pose is the honest one.
    anim_start, anim_end = scene.frame_start, scene.frame_end
    animate_proof = (
        turntable_on
        and steps > 1
        and anim_end > anim_start
        and any(
            o.animation_data is not None
            and o.animation_data.action is not None
            and action_has_curves(o.animation_data.action)
            for o in scene.objects
        )
    )
    saved_frame = scene.frame_current
    if animate_proof:
        log("proof samples animation frames %d-%d across %d turntable steps"
            % (anim_start, anim_end, steps))
    # Meshes the census will judge for framing, minus the rig itself. The
    # per-frame check below is the honest version of the off-camera fact:
    # the census measures against ONE camera pose, but a turntable renders
    # N, and a part that clears the hero still can fall out of orbit frame 3
    # — which is exactly the case that made W-382 read as nonsense ("it's
    # right there in the render!") and cost an author two compiles to
    # diagnose as a camera-tuning problem rather than geometry.
    subjects = [
        o for o in scene.objects
        if o.type == "MESH" and o.name != "S3D_AutoCam"
    ]
    off_by_frame = []
    screen_rects = []

    def aim_for_step(i):
        """One definition of "frame i" — timeline sample plus camera pose —
        shared by the beauty loop and the id-map pass, so the index map is
        pixel-registered with the frame it describes."""
        if animate_proof:
            span = anim_end - anim_start
            scene.frame_set(anim_start + int(round(span * i / float(steps))))
            bpy.context.view_layer.update()
        if turntable_on:
            aim_camera(auto_cam, center, orbit_offset(2.0 * math.pi * i / steps, elevation, dist))
        elif is_auto:
            aim_camera(auto_cam, center, orbit_offset(0.0, elevation, dist))

    for i in range(steps):
        aim_for_step(i)
        scene.render.filepath = filepaths[i]
        bpy.ops.render.render(write_still=True)
        frames.append(frame_stats(filepaths[i]))
        log("rendered %s" % filepaths[i])
        # One projection pass serves two consumers: the off-camera fact
        # (below, auto-framed shots only) and the per-part SCREEN RECTS the
        # viewer's click-to-highlight reads. The frames are prerendered
        # pixels, so the only way a click on the picture can name a part is
        # if the render records where each part landed — normalized
        # [x0,y0,x1,y1], y down, clamped to the frame, one dict per frame.
        # Captured for every camera mode: an authored-camera still deserves
        # the same pick-and-reticle the turntable gets.
        rects = {}
        gone = []
        for o in subjects:
            world = face_connected_world_points(o)
            pts = [world_to_camera_view(scene, auto_cam, p) for p in world]
            if world and all(
                not (0.0 <= p.x <= 1.0 and 0.0 <= p.y <= 1.0 and p.z > 0.0) for p in pts
            ):
                gone.append(o.name)
            visible = [p for p in pts if p.z > 0.0]
            if visible:
                xs = [p.x for p in visible]
                ys = [p.y for p in visible]
                # Camera space is y-up; images are y-down.
                x0 = max(0.0, min(xs)); x1 = min(1.0, max(xs))
                y0 = max(0.0, 1.0 - max(ys)); y1 = min(1.0, 1.0 - min(ys))
                if x1 > x0 and y1 > y0:
                    rects[o.name] = [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)]
        screen_rects.append(rects)
        if (turntable_on or is_auto) and gone:
            off_by_frame.append({"frame": i, "objects": sorted(gone)})
    # Id maps after every beauty frame: the pass re-shades objects with
    # OBJECT-level slot overrides and brand-new materials, so the real
    # material datablocks (which the material-ball stage below reads) are
    # never touched. An enhancement, not a deliverable — a failure here is
    # reported and the proof still ships.
    id_maps = []
    id_parts = []
    try:
        id_maps, id_parts = _proof_id_pass(scene, subjects, aim_for_step, steps, filepaths)
    except Exception:
        log("id-map pass skipped: %s" % traceback.format_exc(limit=4))
    if animate_proof:
        scene.frame_set(saved_frame)
        bpy.context.view_layer.update()

    # Material balls last: the turntable is the product, and a preview that
    # could cost the shot is not worth having. Everything below is contained
    # — its own scene, its own try/except — so a ball that will not render
    # reports itself and the proof still ships its frames.
    balls = {"paths": [], "skipped": []}
    ball_dir = opts.get("materialBallDir")
    if ball_dir:
        try:
            balls = render_material_balls(scene, scene.render.engine, ball_dir)
        except Exception:
            log("material balls skipped entirely: %s" % traceback.format_exc(limit=4))
            balls = {"paths": [], "skipped": [
                {"material": "*", "reason": "material ball stage raised"},
            ]}

    emit({
        "ok": True,
        "data": {
            "images": filepaths[:steps],
            "frames": frames,
            "offByFrame": off_by_frame,
            "screenRects": screen_rects,
            "idMaps": id_maps,
            "idParts": id_parts,
            "materialBalls": balls["paths"],
            # The caller owns the cap, so the caller is told what it cost.
            "materialBallsSkipped": len(balls["skipped"]),
            "materialBallNotes": balls["skipped"],
        },
    })


# ------------------------------------------------------------------
# Material balls
#
# A proof frame answers "does the ASSET look right". It cannot answer "does
# this MATERIAL look right": emission strength, alpha, metallic and a baked
# texture only compose into a photograph at the far end of a full turntable,
# which is a ~90s round per guess. A field report spent four of them moving
# one ember from "dark orb" to "glowing relic" while the baked PNG had been
# correct since round one.
#
# So: one small sphere per distinct bound material, rendered right after the
# frames, in a scene of its OWN that borrows this scene's world, engine, film
# and colour management. The lighting mirrors ensure_staging's key (a sun
# from the camera's quarter, elevated) for the same reason: the ball has to
# PREDICT the photograph, not be a second renderer's opinion of the material.
#
# Nothing here touches the proof scene. The alternative — hiding every object
# and swapping materials in place — mutates the graph that just produced the
# frames, and the restore path is exactly where that goes wrong.
# ------------------------------------------------------------------

MATERIAL_BALL_LIMIT = 24
MATERIAL_BALL_RES = 128
# Long material names make long paths; the dedupe below keeps the truncation
# from ever silently merging two balls into one file.
MATERIAL_BALL_STEM_MAX = 64


def safe_filename(name):
    """The filename sanitiser this file already uses for baked images.

    Alphanumerics, dot, underscore and dash survive; everything else becomes
    an underscore. Deterministic, and collision-prone by design — callers
    that need uniqueness resolve it themselves.
    """
    return "".join(c if (c.isalnum() or c in "._-") else "_" for c in name)


def _material_ball_uvs(mesh):
    """Spherical UVs, seam-corrected, for a sphere that came without any.

    A material ball with no UV layer shows a baked texture as one flat sample
    — which is the exact question the ball exists to answer, so the fallback
    is worth its twenty lines.
    """
    uv = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        loops = []
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            radius = max(co.length, 1e-9)
            u = 0.5 + math.atan2(co.y, co.x) / (2.0 * math.pi)
            v = 0.5 + math.asin(max(-1.0, min(1.0, co.z / radius))) / math.pi
            loops.append((li, u, v))
        # A face straddling the u=0/1 seam otherwise runs the WHOLE texture
        # backwards across one column of quads.
        span = max(u for _, u, _ in loops) - min(u for _, u, _ in loops)
        for li, u, v in loops:
            if span > 0.5 and u < 0.5:
                u += 1.0
            uv.data[li].uv = (u, v)


def _material_ball_mesh():
    import bmesh
    import bpy
    mesh = bpy.data.meshes.new("S3D_MaterialBallMesh")
    bm = bmesh.new()
    try:
        kwargs = {"u_segments": 32, "v_segments": 16, "radius": 0.5}
        try:
            bmesh.ops.create_uvsphere(bm, calc_uvs=True, **kwargs)
        except TypeError:
            # Older bmesh ops name the size `diameter` and have no calc_uvs.
            try:
                bmesh.ops.create_uvsphere(bm, **kwargs)
            except TypeError:
                bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, diameter=1.0)
        bm.to_mesh(mesh)
    finally:
        bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    if not mesh.uv_layers:
        _material_ball_uvs(mesh)
    return mesh


def _material_ball_scene(src_scene, engine):
    """A one-sphere studio that borrows the proof's photographic conventions.

    Returns (scene, sphere_object, cleanup) — cleanup removes everything this
    made and nothing it borrowed (the world belongs to the proof scene).
    """
    import bpy
    ball = bpy.data.scenes.new("S3D_MaterialBall")
    ball.world = src_scene.world
    try:
        ball.render.engine = engine
    except Exception:
        ball.render.engine = "BLENDER_EEVEE"
    ball.render.image_settings.file_format = "PNG"
    ball.render.resolution_x = MATERIAL_BALL_RES
    ball.render.resolution_y = MATERIAL_BALL_RES
    ball.render.resolution_percentage = 100
    ball.render.film_transparent = src_scene.render.film_transparent
    # Same view transform, look and exposure, or the ball is photographed
    # under different rules than the thing it is predicting.
    for attr in ("view_transform", "look", "exposure", "gamma"):
        try:
            setattr(ball.view_settings, attr, getattr(src_scene.view_settings, attr))
        except Exception:
            pass
    try:
        ball.display_settings.display_device = src_scene.display_settings.display_device
    except Exception:
        pass

    mesh = _material_ball_mesh()
    sphere = bpy.data.objects.new("S3D_MaterialBall", mesh)
    ball.collection.objects.link(sphere)
    sphere.data.materials.append(None)

    cam_data = bpy.data.cameras.new("S3D_MaterialBallCamData")
    cam_data.angle = math.radians(45)
    cam = bpy.data.objects.new("S3D_MaterialBallCam", cam_data)
    ball.collection.objects.link(cam)
    ball.camera = cam
    azimuth = math.pi / 4.0
    # The sphere subtends 80% of the frame's half-angle: room for the rim
    # highlight that reads metallic, no crop at the silhouette.
    dist = 0.5 / math.sin(cam_data.angle / 2.0 * 0.8)
    offset = orbit_offset(azimuth, math.radians(15.0), dist)
    cam.location = offset
    cam.rotation_euler = offset.to_track_quat("Z", "Y").to_euler()

    light_data = bpy.data.lights.new("S3D_MaterialBallKeyData", type="SUN")
    light_data.energy = 3.0
    key = bpy.data.objects.new("S3D_MaterialBallKey", light_data)
    ball.collection.objects.link(key)
    key.rotation_euler = orbit_offset(
        azimuth - 0.4, math.pi / 3.0, 1.0
    ).to_track_quat("Z", "Y").to_euler()

    # Background bpy does not refresh matrix_world for transforms assigned
    # outside operators — the same reason census() and the proof both carry
    # an explicit update. Without it the render reads the camera's origin
    # pose and every ball comes back black.
    ball.view_layers[0].update()

    def cleanup():
        for obj, data, remover in (
            (sphere, mesh, bpy.data.meshes),
            (cam, cam_data, bpy.data.cameras),
            (key, light_data, bpy.data.lights),
        ):
            try:
                bpy.data.objects.remove(obj, do_unlink=True)
            except Exception:
                pass
            try:
                remover.remove(data)
            except Exception:
                pass
        try:
            ball.world = None
            bpy.data.scenes.remove(ball)
        except Exception:
            pass

    return ball, sphere, cleanup


def render_material_balls(scene, engine, out_dir):
    """Render one lit sphere per distinct material bound to a mesh.

    Returns {"paths": [absolute png paths], "skipped": [{material, reason}]}.
    Every material that does NOT produce a file appears in `skipped` with a
    reason — over the cap, or the exception that stopped it. A bounded search
    that reports nothing about its bound is a search that lies.
    """
    import bpy
    bound = {}
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            if slot.material is not None:
                bound[slot.material.name] = slot.material
    names = sorted(bound)
    skipped = []
    if len(names) > MATERIAL_BALL_LIMIT:
        for name in names[MATERIAL_BALL_LIMIT:]:
            skipped.append({
                "material": name,
                "reason": "over the %d-ball cap" % MATERIAL_BALL_LIMIT,
            })
        names = names[:MATERIAL_BALL_LIMIT]
    if not names:
        return {"paths": [], "skipped": skipped}

    try:
        os.makedirs(out_dir)
    except OSError:
        if not os.path.isdir(out_dir):
            raise

    ball_scene, sphere, cleanup = _material_ball_scene(scene, engine)
    paths = []
    try:
        # Alphabetical, so the ordinal a collision picks up is a property of
        # the material set and not of iteration order.
        used = {}
        for name in names:
            stem = safe_filename(name)[:MATERIAL_BALL_STEM_MAX] or "material"
            seen = used.get(stem, 0)
            used[stem] = seen + 1
            if seen:
                stem = "%s-%d" % (stem, seen + 1)
            target = os.path.join(out_dir, "ball-%s.png" % stem)
            try:
                sphere.data.materials[0] = bound[name]
                ball_scene.render.filepath = target
                bpy.ops.render.render(write_still=True, scene=ball_scene.name)
                if not os.path.exists(target):
                    raise RuntimeError("renderer wrote no file")
                # Called for its MATTE, not its statistics: the ball is
                # rendered on the same transparent film as the proof, and
                # every consumer that drops alpha would otherwise show a
                # black square. The stats are the proof's question, not this
                # one's.
                frame_stats(target)
                paths.append(target)
                log("material ball %s -> %s" % (name, target))
            except Exception as exc:
                skipped.append({"material": name, "reason": str(exc)[:200]})
                log("material ball skipped for %s: %s" % (name, exc))
    finally:
        cleanup()
    return {"paths": paths, "skipped": skipped}


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
    kwargs = {}
    scale = job.get("metersPerUnit")
    if isinstance(scale, (int, float)) and scale > 0 and abs(scale - 1.0) > 1e-9:
        # The stage's declared unit. Blender works in metres, so a stage that
        # must read as millimetres is the same geometry with metersPerUnit
        # 0.001 — the exporter's own scale option, not a resize of the scene.
        # Without this the contract could ASK for millimetres and nothing
        # could answer: S3D-E-403 fired on every compile of every project
        # that declared anything but metres, and no authoring path existed.
        kwargs["convert_scene_units"] = "CUSTOM"
        kwargs["meters_per_unit"] = float(scale)
    up_axis = (job.get("upAxis") or "").upper()
    if up_axis not in ("X", "Y", "Z"):
        return kwargs
    kwargs.update({
        "convert_orientation": True,
        "export_global_up_selection": up_axis,
        # Forward must not be parallel to up; -Z is USD's convention for a
        # Y-up stage, and -Y for a Z-up one.
        "export_global_forward_selection": "NEGATIVE_Z" if up_axis == "Y" else "NEGATIVE_Y",
    })
    return kwargs


def scene_fingerprint():
    """A compact identity of what the current scene CONTAINS — the facts
    the master-parity check compares.

    Mostly names and counts: the question is "did everything reach the stage",
    not "is it identical to the float". But counts alone cannot see the scene
    arriving ROTATED or RESCALED — every mesh, material, bone and clip is
    present, so a round trip that turned the asset on its side passes. So the
    world-space bounds travel too, rounded coarsely enough that float drift
    through a text stage is not a finding while a 90 degree turn or a unit slip
    is. Calibration against the Khronos corpus found the current round trip
    sound on all 23 assets; this is what keeps it that way."""
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
    # World-space bounds of all renderable geometry, face-connected like every
    # other bound this compiler reports. R3 (millimetre at metre scale) is well
    # under anything an author can see and well over the drift of writing a
    # float to text and reading it back.
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        for p in face_connected_world_points(o):
            for i in range(3):
                if p[i] < lo[i]:
                    lo[i] = p[i]
                if p[i] > hi[i]:
                    hi[i] = p[i]
    bounds = None
    if lo[0] != float("inf"):
        bounds = [round(hi[i] - lo[i], 3) for i in range(3)]

    return {
        "meshes": meshes,
        "bounds": bounds,
        "materials": sorted(m.name for m in bpy.data.materials if m.users > 0),
        "armatures": {o.name: len(o.data.bones)
                      for o in bpy.context.scene.objects if o.type == "ARMATURE"},
        "boneOrder": bone_order,
        "morphs": morphs,
        # Every action the scene can DELIVER, not merely the one bound to an
        # object — see reachable_actions(). Orphans are still excluded.
        "actions": sorted(reachable_actions()),
        # What each material does, so a lost texture binding or a flipped
        # sidedness is a finding rather than a surprise in the shipped file.
        # Keyed by material name, which survives the round trip.
        "materialCaps": {m.name: material_capability(m)
                         for m in bpy.data.materials if m.users > 0},
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


def _save_image_copy(image, scratch):
    """Write an image to disk without disturbing the scene that owns it.

    The occlusion map is usually PACKED inside an imported GLB, so it exists
    nowhere on disk — and the master materialises only the textures its own
    graph references, which by definition excludes this one. Copy the
    datablock, save the copy, drop it: the build scene is untouched and the
    pixels survive the scene reset."""
    import bpy
    safe = safe_filename(image.name)
    target = os.path.join(scratch, "%s.png" % safe)
    tmp = image.copy()
    try:
        tmp.filepath_raw = target
        tmp.file_format = "PNG"
        tmp.save()
    finally:
        try:
            bpy.data.images.remove(tmp)
        except Exception:
            pass
    return target


def capture_carry(scratch):
    """Everything the USD round trip demonstrably cannot carry, saved so the
    lowered containers can be made whole again.

    This is the same shape as `rebuild_object_animation` and the material
    tweak replay: the master is still the only source the deliverables are
    lowered FROM, and anything the writer could author is authored. What is
    collected here is strictly what was MEASURED to be lost — probe results,
    not assumptions:

      - actions   3 clips in, 1 out. Blender's glTF importer binds one clip
                  and files the rest as NLA strips; USD carries a single
                  baked timeline, so the strips are gone after the re-import.
      - occlusion the importer routes it into a `glTF Material Output` group
                  node, which the USD writer does not traverse. Both the
                  binding and the image vanish.
      - sidedness `use_backface_culling` is a plain material flag that comes
                  back False, turning every closed mesh two-sided.

    Nothing here is silent: `restore_carry` returns what it put back, and the
    caller reports it.
    """
    import bpy
    carry = {"materials": {}, "objects": {}, "blend": None}

    for m in bpy.data.materials:
        if m.users == 0:
            continue
        cap = material_capability(m)
        entry = {"backfaceCulling": bool(getattr(m, "use_backface_culling", False)),
                 "emissionStrength": cap.get("emissionStrength"),
                 "occlusion": None}
        extras = gltf_extras_node(m)
        if extras is not None and "Occlusion" in extras.inputs:
            img = _image_behind_socket(extras.inputs["Occlusion"])
            if img is not None:
                try:
                    entry["occlusion"] = {"file": _save_image_copy(img, scratch),
                                          "name": img.name}
                except Exception as exc:
                    entry["occlusion"] = {"file": None, "name": img.name,
                                          "error": str(exc)}
        # Only a strength that actually EMITS and differs from the round
        # trip's own answer of 1. Zero is the absence of emission, not a
        # value to restore: carrying it put a "restored emission strength"
        # note on every ordinary material in the scene, which is both untrue
        # and noisy — a report of a repair that repaired nothing.
        keeps_strength = (entry["emissionStrength"] is not None
                          and entry["emissionStrength"] > 0.0
                          and abs(entry["emissionStrength"] - 1.0) > 1e-6)
        if entry["backfaceCulling"] or entry["occlusion"] or keeps_strength:
            carry["materials"][m.name] = entry

    # Which clips belong to which object, and which one was active. Recorded
    # by NAME: the datablocks themselves cannot survive the scene reset, so
    # they ride in a .blend and are appended back by name afterwards.
    for o in bpy.context.scene.objects:
        ad = o.animation_data
        if not ad:
            continue
        names = []
        for track in ad.nla_tracks:
            for strip in track.strips:
                if strip.action and action_has_curves(strip.action):
                    names.append(strip.action.name)
        active = ad.action.name if (ad.action and action_has_curves(ad.action)) else None
        if active and active not in names:
            names.append(active)
        if len(names) > 1 or (names and active is None):
            # One clip that is simply the active action needs no carrying —
            # the master holds it and rebuild_object_animation restores it.
            carry["objects"][o.name] = {"actions": names, "active": active}

    if carry["objects"]:
        blend = os.path.join(scratch, "carry.blend")
        try:
            bpy.ops.wm.save_as_mainfile(filepath=blend, copy=True, check_existing=False)
            carry["blend"] = blend
        except Exception as exc:
            carry["blendError"] = str(exc)
            carry["objects"] = {}
    return carry


def ensure_gltf_extras_group():
    """The node group the glTF exporter reads occlusion out of.

    Recreated rather than assumed: after the round trip the group does not
    exist, because the importer that made it is not the importer that ran."""
    import bpy
    ng = bpy.data.node_groups.get(GLTF_EXTRAS_GROUP)
    if ng is not None:
        return ng
    ng = bpy.data.node_groups.new(GLTF_EXTRAS_GROUP, "ShaderNodeTree")
    try:
        ng.interface.new_socket("Occlusion", in_out="INPUT",
                                socket_type="NodeSocketFloat")
    except AttributeError:
        ng.inputs.new("NodeSocketFloat", "Occlusion")
    ng.nodes.new("NodeGroupInput")
    return ng


def _restore_occlusion(mat, spec):
    """Rebuild the occlusion binding exactly as the glTF importer builds it:
    image -> Separate Color -> Red -> the extras group's Occlusion input. The
    exporter recognises that shape; a direct image link is not guaranteed to
    round-trip through it."""
    import bpy
    if not spec or not spec.get("file") or not os.path.exists(spec["file"]):
        return False
    tree = getattr(mat, "node_tree", None)
    if tree is None:
        return False
    img = bpy.data.images.load(spec["file"], check_existing=True)
    img.colorspace_settings.name = "Non-Color"
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (-900, -600)
    sep = tree.nodes.new("ShaderNodeSeparateColor")
    sep.location = (-650, -600)
    grp = tree.nodes.new("ShaderNodeGroup")
    grp.node_tree = ensure_gltf_extras_group()
    grp.location = (-400, -600)
    tree.links.new(sep.inputs["Color"], tex.outputs["Color"])
    if "Occlusion" in grp.inputs:
        tree.links.new(grp.inputs["Occlusion"], sep.outputs["Red"])
    return True


def restore_carry(carry):
    """Put back what `capture_carry` saved, and say what was put back."""
    import bpy
    # `clipObjects` is the caller's exclusion set for the animation rebuild.
    # It must be what was RESTORED, not what was planned: a restore that
    # throws half way leaves some objects with their clips back and the rest
    # without, and either reading of the plan is wrong for one of those
    # groups — bake everything and the restored clips gain a duplicate, bake
    # nothing and the unrestored objects lose their animation entirely.
    notes = {"materials": [], "occlusion": [], "clips": [], "emission": [],
             "clipObjects": []}
    if not carry:
        return notes

    for name, entry in (carry.get("materials") or {}).items():
        mat = bpy.data.materials.get(name)
        if mat is None:
            continue
        if entry.get("backfaceCulling"):
            try:
                mat.use_backface_culling = True
                notes["materials"].append(name)
            except Exception:
                pass
        if entry.get("occlusion"):
            try:
                if _restore_occlusion(mat, entry["occlusion"]):
                    notes["occlusion"].append(name)
            except Exception:
                pass
        strength = entry.get("emissionStrength")
        if strength is not None and abs(strength - 1.0) > 1e-6:
            try:
                node = principled_node(mat)
                if (node is not None and "Emission Strength" in node.inputs
                        and not node.inputs["Emission Strength"].is_linked):
                    node.inputs["Emission Strength"].default_value = float(strength)
                    notes["emission"].append(name)
            except Exception:
                pass

    plan = carry.get("objects") or {}
    blend = carry.get("blend")
    if plan and blend and os.path.exists(blend):
        wanted = set()
        for spec in plan.values():
            wanted.update(spec.get("actions") or [])
        # Free the names first. The USD importer rebuilds the master's single
        # baked timeline as an action carrying the ACTIVE clip's name, so
        # appending the real clip of that name collided and arrived as
        # `Survey.001` — and the exporter then wrote both, shipping a phantom
        # fourth animation that was a lower-fidelity copy of the third. The
        # baked action is exactly what is being restored in full, so it has no
        # claim on the name.
        for name in sorted(wanted):
            existing = bpy.data.actions.get(name)
            if existing is None:
                continue
            for o in bpy.context.scene.objects:
                ad = o.animation_data
                if ad and ad.action == existing:
                    ad.action = None
            try:
                bpy.data.actions.remove(existing)
            except Exception:
                pass
        try:
            with bpy.data.libraries.load(blend, link=False) as (src, dst):
                dst.actions = [n for n in src.actions if n in wanted]
        except Exception:
            return notes
        for obj_name, spec in plan.items():
            obj = bpy.context.scene.objects.get(obj_name)
            if obj is None:
                continue
            if obj.animation_data is None:
                obj.animation_data_create()
            ad = obj.animation_data
            # Rebuilt as one track per clip, mirroring what the glTF importer
            # produces — that is the arrangement the exporter turns back into
            # one glTF animation per clip.
            for action_name in spec.get("actions") or []:
                action = bpy.data.actions.get(action_name)
                if action is None:
                    continue
                if any(s.action == action for t in ad.nla_tracks for s in t.strips):
                    continue
                track = ad.nla_tracks.new()
                track.name = action_name
                try:
                    track.strips.new(action_name, int(action.frame_range[0]), action)
                except Exception:
                    continue
                notes["clips"].append(action_name)
                if obj_name not in notes["clipObjects"]:
                    notes["clipObjects"].append(obj_name)
            active = spec.get("active")
            if active and bpy.data.actions.get(active) is not None and ad.action is None:
                ad.action = bpy.data.actions.get(active)
    return notes


# STL is unitless by format and millimetres by universal convention.
MM_PER_METRE = 1000.0
# How far the written STL may differ from the scene's own bounds before the
# file is judged wrongly scaled. Generous: this is catching factor-of-1000
# errors, not float drift.
STL_SCALE_TOLERANCE = 0.01


def stl_bbox_mm(path):
    """Extents of an STL, in whatever unit its numbers are written in.

    Read back rather than assumed, because the only thing an export flag
    proves is that the exporter accepted the keyword.

    BOTH encodings. The check was binary-only, and the legacy exporter this
    falls back to can write ASCII — where the reader returned None, the
    caller skipped the comparison, and the scale guarantee this function
    exists to enforce quietly stopped applying on exactly the Blender builds
    that need it most."""
    try:
        with open(path, "rb") as fh:
            head = fh.read(84)
            if len(head) < 84:
                return None
            if head[:5].lower() == b"solid" and b"facet" in head[:84].lower():
                return _stl_bbox_ascii(path)
            count = struct.unpack("<I", head[80:84])[0]
            if count <= 0:
                return _stl_bbox_ascii(path)
            lo = [float("inf")] * 3
            hi = [float("-inf")] * 3
            for _ in range(count):
                tri = fh.read(50)
                if len(tri) < 50:
                    break
                for v in range(3):
                    xyz = struct.unpack("<fff", tri[12 + v * 12:24 + v * 12])
                    for axis in range(3):
                        lo[axis] = min(lo[axis], xyz[axis])
                        hi[axis] = max(hi[axis], xyz[axis])
            if lo[0] == float("inf"):
                return None
            return [hi[i] - lo[i] for i in range(3)]
    except Exception:
        return None


def _stl_bbox_ascii(path):
    """Same extents, for the ASCII encoding the legacy exporter may emit."""
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                parts = line.split()
                if len(parts) != 4 or parts[0] != "vertex":
                    continue
                for axis in range(3):
                    v = float(parts[axis + 1])
                    lo[axis] = min(lo[axis], v)
                    hi[axis] = max(hi[axis], v)
    except Exception:
        return None
    if lo[0] == float("inf"):
        return None
    return [hi[i] - lo[i] for i in range(3)]


def cleanup_carry(carry_dir):
    """Delete the carry scratch once every container has been written.

    The scratch holds a copy of the pre-master .blend and any occlusion maps
    that had to be unpacked — hundreds of KB for a small scene and far more
    for a rigged one, written into `out/` on EVERY compile. Leaving it there
    grows a project's output without bound and puts a stray .blend beside the
    deliverables, which is exactly the kind of thing somebody later mistakes
    for an artifact.

    Safe at this point: the lowered containers embed their textures and the
    clips are already fcurves in the scene, so nothing still reads these
    files. Failure to delete is not worth failing an otherwise complete
    export over, but it IS worth saying, so it lands in the log.
    """
    if not carry_dir or not os.path.isdir(carry_dir):
        return
    import shutil
    try:
        shutil.rmtree(carry_dir)
    except Exception as exc:
        log("could not remove carry scratch %s: %s" % (carry_dir, exc))


def export_scene(job):
    """Author the master, lower every container from it, and never
    leave the carry scratch behind — including on a path nobody
    predicted. The three explicit cleanups cover the returns this
    function makes on purpose; this wrapper covers the ones it does
    not, because a scratch directory that survives an exception grows
    the project every time the failure repeats."""
    carry_dir_ref = []
    try:
        return _export_scene(job, carry_dir_ref)
    finally:
        if carry_dir_ref:
            cleanup_carry(carry_dir_ref[0])


def _export_scene(job, carry_dir_ref):
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
    # Save what the round trip is KNOWN to drop, before authoring the master.
    # Measured losses only — see capture_carry.
    carry_dir = os.path.join(out_dir, ".carry")
    os.makedirs(carry_dir, exist_ok=True)
    carry_dir_ref.append(carry_dir)
    try:
        carry = capture_carry(carry_dir)
    except Exception as exc:
        carry = None
        # Distinct keys for the two halves. Both used to write
        # `carryError`, so a compile where capture failed AND restore
        # then raised reported only the second — and the second is the
        # less informative one, since a restore given nothing to
        # restore fails for a reason that is really the first failure.
        lowering["captureError"] = str(exc)

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
            # USDZ is consumed by AR Quick Look and Scene Viewer, and both
            # read a package as Y-up. A Z-up contract — every Unreal and every
            # 3d_print project — therefore produced an AR file that arrives on
            # its back, and the only choices on offer were to ship it wrong or
            # to stop shipping it. Both are avoidable: the package gets its own
            # stage, authored Y-up by the exporter's own conversion, while the
            # master keeps the axis the contract asked for.
            #
            # An intermediate, not a deliverable: it is packaged and deleted,
            # and never joins `assets`.
            if "usdz" in formats and (job.get("upAxis") or "Y").upper() != "Y":
                ar_path = os.path.join(out_dir, "scene.ar.usda")
                ar_kwargs = master_usd_kwargs(job, animated)
                ar_kwargs.update({
                    "convert_orientation": True,
                    "export_global_up_selection": "Y",
                    "export_global_forward_selection": "NEGATIVE_Z",
                })
                try:
                    usd_export_resilient(ar_path, ar_kwargs)
                    transcode_stage_textures(ar_path)
                    post_process_usda(ar_path, info, job)
                    lowering["arMaster"] = rel_to_project(ar_path, job)
                    log("authored Y-up AR stage %s" % ar_path)
                except Exception as exc:
                    # The package still gets built from the master below; it
                    # will be the wrong way up and W-905 will say so, which is
                    # the outcome this block exists to improve on, not a new
                    # failure introduced by it.
                    lowering["arMasterError"] = str(exc)
        except Exception as exc:
            # No master, no deliverables: emit the failure for every
            # requested format rather than silently falling back to
            # direct exports that would hide the master's absence.
            for fmt in formats:
                skipped.append({"format": fmt,
                                "reason": "master stage failed to author: %s" % exc})
            cleanup_carry(carry_dir)
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
        cleanup_carry(carry_dir)
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
    # Put back the clips, occlusion maps and sidedness the master could not
    # hold. Reported, never silent: `carried` reaches the manifest and the
    # lint so the master's real ceiling stays visible.
    #
    # BEFORE the rebuild, and the rebuild then skips whatever was carried.
    # An object whose clips came back in full does not also want the master's
    # single baked timeline: baking it produced a fourth animation that was a
    # duplicate of the active clip under a `.001` name.
    carried_objects = set()
    try:
        carried = restore_carry(carry)
        lowering["carried"] = carried
        # What actually came back, so a partial restore excludes exactly the
        # objects it repaired and the rebuild still covers the others.
        carried_objects = set(carried.get("clipObjects") or [])
    except Exception as exc:
        lowering["carryError"] = str(exc)
    if animated:
        rebuild_object_animation(animated_names - carried_objects)
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
            # STL carries NO unit declaration, and every slicer in use — Cura,
            # PrusaSlicer, Bambu, Simplify3D — reads the numbers as
            # millimetres. Blender works in metres, so writing coordinates
            # straight out shipped an 80mm part as 0.08mm: a speck, silently,
            # from a compile that reported success.
            #
            # Millimetres unconditionally, therefore, rather than following
            # the contract's metersPerUnit. That is not this rule ignoring the
            # contract: metersPerUnit says how to READ the stage's numbers,
            # and STL has no field to record the answer in. The only way the
            # geometry survives the trip is to write the unit the reader is
            # guaranteed to assume.
            # If NEITHER exporter takes the scale, the file is not written.
            # The bare call used to be the last fallback, and it shipped the
            # metre-scale geometry this rule exists to prevent — a green
            # compile handing a slicer a 0.1%-size object, which is the exact
            # failure the comment above describes. A missing deliverable with
            # a reason beats a present one that is silently wrong by 1000x.
            scaled = False
            for op in (getattr(bpy.ops.wm, "stl_export", None),
                       getattr(bpy.ops.export_mesh, "stl", None)):
                if op is None:
                    continue
                try:
                    op(filepath=target, global_scale=MM_PER_METRE)
                    scaled = True
                    break
                except (AttributeError, TypeError):
                    continue
            if not scaled:
                skipped.append({"format": fmt,
                                "reason": "this Blender's STL exporter does not accept "
                                          "global_scale, and STL carries no unit; writing "
                                          "it would ship metres where every slicer reads "
                                          "millimetres"})
                continue
            # Measure the file, do not trust the flag. `global_scale` was
            # ACCEPTED, which is not the same as applied the way this rule
            # needs — a build whose exporter interpreted it differently would
            # ship a part wrong by three orders of magnitude with a green
            # compile, which is the failure this whole branch exists to stop.
            # The scene's own bounds are known, so the answer is checkable.
            wrote = stl_bbox_mm(target)
            lo, hi = scene_bbox(bpy.context.scene)
            expect = [(hi[i] - lo[i]) * MM_PER_METRE for i in range(3)]
            # `default=None` rather than a bare max(): a scene whose every
            # extent is under a picometre yields an empty generator and the
            # guard above lets it through, which raised ValueError out of the
            # whole export instead of degrading to the skipped path.
            measurable = [i for i in range(3) if expect[i] > 1e-9]
            if wrote is None:
                # Unreadable, therefore UNVERIFIED — not verified-clean. The
                # comment above promises the file is measured; when it cannot
                # be, that has to be visible rather than assumed away.
                log("stl scale unverified: could not read back %s" % target)
            elif measurable:
                worst = max(abs(wrote[i] - expect[i]) / expect[i] for i in measurable)
                if worst > STL_SCALE_TOLERANCE:
                    try:
                        os.remove(target)
                    except Exception:
                        pass
                    skipped.append({
                        "format": fmt,
                        "reason": "STL wrote %s mm for a %s mm subject — this Blender's "
                                  "exporter does not apply global_scale as millimetres, "
                                  "and a wrongly scaled print file is worse than none"
                                  % ([round(v, 3) for v in wrote],
                                     [round(v, 3) for v in expect])})
                    continue
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
    cleanup_carry(carry_dir)
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
    # Local, like every other function here. This used to read a module-level
    # `bpy` that existed only because the import sits under __main__ below, so
    # main() alone would NameError the moment this file was imported as a
    # module rather than run as a script.
    import bpy
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


def _exit_now(code):
    """Leave the process, deterministically.

    A job that has emitted its payload is finished, and `emit` flushes before
    returning — but returning from main() hands control to the interpreter's
    shutdown, and bpy's teardown (GPU context, worker threads, its own atexit
    hooks) can take seconds or hang outright. A runner that lingers still owns
    every handle it opened, which on Windows keeps the project directory
    undeletable long after the compile the user was waiting for has finished:
    the next build then fails to clear a working directory whose owner is a
    process with no work left to do.

    os._exit rather than sys.exit for the same reason — sys.exit unwinds and
    runs those hooks, which is the part that hangs. Nothing is lost: stdout is
    already flushed, and every artifact this runner produces is written and
    closed before the payload announcing it goes out.
    """
    try:
        sys.stdout.flush()
        sys.stderr.flush()
    except Exception:
        pass
    os._exit(code)


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except SystemExit as exc:
        _exit_now(exc.code if isinstance(exc.code, int) else 0)
    _exit_now(0)