import {
  AUTOFIT_DISTANCE,
  CAMERA_HALF_FOV,
  CAMERA_LENS_MM,
  CAMERA_SENSOR_MM,
  CameraSpec,
  MaterialSpec,
  SolvedScene,
} from "./types.js";
import { sweptBox } from "./sweep.js";
import { MATERIAL_CHANNELS, type ChannelDef } from "./channels.js";
import type { EmitMesh } from "../kernel/mesh.js";

/**
 * Backend adapter: solved scene → Blender Python.
 *
 * This is the only file in the solve layer that knows Blender exists. The
 * solver produces plain numbers, so swapping the executor — authoring USD
 * prims directly, emitting three.js for a live preview, driving a different
 * DCC — means writing a sibling of this file, not touching the language
 * authors write in. That is what "engine-agnostic" has to mean concretely:
 * the relations are portable, the emitter is disposable.
 *
 * The emitted script is deterministic: parts come out in the solver's sorted
 * order and every number is fixed-precision, so an unchanged spec produces a
 * byte-identical script and the pipeline's content-hash cache hits.
 *
 * Every shape is authored to fill its solved box exactly — the same AABB
 * semantics the solver reasoned with — by creating a unit primitive,
 * rotating it onto its axis, applying the rotation, then scaling to the box
 * and applying the scale. Applying both transforms is deliberate: the
 * census sees identity transforms and clean world-space geometry, so the
 * unapplied-scale and non-uniform-scale rules can never fire on generated
 * output. The exceptions are the shapes carrying a second, independent
 * length — the torus's ring vs tube, the tube's diameter vs wall, the
 * capsule's length vs radius — which no uniform scale of a unit primitive
 * can produce, so those are authored at their real radii and skip the
 * scale step. The wedge is the other kind of exception: its axis names a
 * slope direction rather than a long axis, so the direction lives in its
 * vertex coordinates instead of in a rotation.
 */
export interface EmitOptions {
  /** false suppresses the camera entirely; a CameraSpec steers the framing. */
  camera?: boolean | CameraSpec;
  lights?: boolean;
  /** Lighting style: derived studio key (default) or an outdoor sun. */
  light?: import("./types.js").LightPreset | import("./types.js").LightSpec;
  /** Named material definitions from the spec's `materials` block. */
  materials?: Record<string, MaterialSpec>;
  /** How finely curved primitives are emitted. See TESSELLATION_DEFAULTS. */
  tessellation?: Tessellation;
  /** Keyframe rate for compiler-owned motion, from
   *  `conventions.animation.fps`. Absent keeps the 24fps default. */
  fps?: number;
  /** The project's clip budget (`conventions.animation.maxFrames`; 0/absent =
   *  undeclared). When the loop-closing length fits it — or fits the default
   *  ceiling when undeclared — the clip bakes that long; see clipPlan. */
  maxFrames?: number;
  /**
   * Evaluated kernel meshes, keyed by part id, for every `recipe:` part. The
   * emitter is pure and cannot run a recipe (that is I/O the pipeline owns), so
   * the already-evaluated, already-rounded geometry is handed in — its
   * presence for each recipe part is a pipeline invariant the emitter asserts.
   */
  kernelMeshes?: Record<string, EmitMesh>;
  /**
   * Morph targets per recipe part, each already fitted into the box in the
   * same transform as the base (so it stays a blendshape). Emitted as Blender
   * shape keys.
   */
  kernelShapes?: Record<string, Array<{ name: string; verts: Array<[number, number, number]> }>>;
}

/**
 * Tessellation as a physical tolerance rather than a segment count.
 *
 * `chordToleranceM` is the greatest distance an emitted surface may sit from
 * the ideal primitive, in metres. Segment counts follow from it and the part's
 * own radius (n = pi*sqrt(r/2e)), so a 12m dome and an 8mm bead each get the
 * count their size earns instead of the same 48.
 *
 * 0.5mm sits just under the 1mm contact floor: a facet cannot deviate far
 * enough to make two parts the solver placed flush look separated. The clamps
 * are the two things a tolerance alone cannot express — a silhouette stays
 * round at any size, and no single primitive runs away with the budget.
 */
export interface Tessellation {
  chordToleranceM: number;
  minSegments: number;
  maxSegments: number;
}

export const TESSELLATION_DEFAULTS: Tessellation = {
  chordToleranceM: 0.0005,
  minSegments: 12,
  maxSegments: 96,
};

/** A channel value that names a shader rather than stating a number. The one
 *  predicate both the emitter and the binding collector read, so a value can
 *  never be treated as a constant here and a binding there. */
export function isChannelBinding(v: unknown): v is { shader: string; output?: string } {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "shader" in v;
}

/**
 * When the author declares no `conventions.animation.maxFrames`, how long the
 * emitter may stretch a clip to CLOSE its loop, in frames. Resource-
 * denominated (frames are keyframe, bake and export cost), raisable (declare
 * maxFrames), and reported (a clip that cannot close within it warns with the
 * measured seam jump). 1200 frames is 50 seconds at the default rate — room
 * for any tasteful period combination, refusal for lcm explosions like
 * coprime 97- and 89-frame cycles.
 */
export const DEFAULT_CLIP_CEILING_FRAMES = 1200;

/** One motion's period in integer frames — THE expressions the emitter
 *  keys with, so the plan and the keyframes can never disagree. */
function motionPeriods(
  part: SolvedScene["parts"][number],
  fps: number,
): Array<{ motion: string; frames: number }> {
  const out: Array<{ motion: string; frames: number }> = [];
  if (part.spin) out.push({ motion: "spin", frames: Math.max(2, Math.round((part.spin.seconds ?? 4) * fps)) });
  if (part.bob) out.push({ motion: "bob", frames: Math.max(4, Math.round((part.bob.seconds ?? 3) * fps)) });
  if (part.screw) out.push({ motion: "screw", frames: Math.max(2, Math.round((part.screw.seconds ?? 4) * fps)) });
  return out;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export interface ClipSeam {
  id: string;
  motion: string;
  periodFrames: number;
  /** Fraction of this motion cycle left dangling at the clip end. */
  fraction: number;
  /** Approximate world jump at the seam, metres (bob, or a screw rise). */
  jumpM?: number;
  /** Angular jump at the seam, degrees (spin, or a screw turn). */
  jumpDeg?: number;
}

export interface ClipPlan {
  /** The frame count the clip actually bakes. */
  clipFrames: number;
  /** The length at which EVERY motion loop closes (lcm of the periods). */
  loopFrames: number;
  /** True when clipFrames closes every loop — no seam exists. */
  loopCloses: boolean;
  /** The ceiling that decided; names the lever when the loop did not fit. */
  ceilingFrames: number;
  /** Every motion the baked clip cuts mid-cycle, with its measured jump. */
  seams: ClipSeam[];
}

/**
 * How long the baked clip is, and what that length cuts.
 *
 * A clip that is merely the LONGEST period catches every other period
 * mid-stride: a 3s bob inside a 4s clip completes one and a third cycles and
 * snaps back 42mm at every loop seam — in the viewer, and in every engine
 * that loops the clip. The loop-closing length is the lcm of the periods, so
 * the clip bakes that long whenever it fits the budget (declared maxFrames,
 * or the default ceiling). When it does not fit, the clip keeps the longest
 * single period and every cut motion is returned as a SEAM with its measured
 * jump, for the pipeline to say out loud (S3D-W-105).
 *
 * One derivation: the emitter takes clipFrames from here and keys with the
 * same per-motion frame counts, so the warning and the bake cannot drift.
 */
export function clipPlan(
  parts: SolvedScene["parts"],
  fps: number,
  maxFrames?: number,
): ClipPlan | undefined {
  const motions: Array<{
    id: string;
    motion: string;
    frames: number;
    part: SolvedScene["parts"][number];
  }> = [];
  for (const part of parts) {
    for (const m of motionPeriods(part, fps)) {
      motions.push({ id: part.id, motion: m.motion, frames: m.frames, part });
    }
  }
  if (motions.length === 0) return undefined;
  const ceilingFrames = maxFrames && maxFrames > 0 ? maxFrames : DEFAULT_CLIP_CEILING_FRAMES;
  let loopFrames = 1;
  for (const m of motions) loopFrames = (loopFrames / gcd(loopFrames, m.frames)) * m.frames;
  const longest = Math.max(...motions.map((m) => m.frames));
  const clipFrames = loopFrames <= ceilingFrames ? loopFrames : longest;
  const seams: ClipSeam[] = [];
  if (clipFrames !== loopFrames) {
    for (const m of motions) {
      if (clipFrames % m.frames === 0) continue;
      const fraction = (clipFrames % m.frames) / m.frames;
      const phase = 2 * Math.PI * fraction;
      const seam: ClipSeam = { id: m.id, motion: m.motion, periodFrames: m.frames, fraction };
      if (m.motion === "bob" && m.part.bob) {
        // The bob curve is quarter-keyed with smooth easing; the cosine
        // model is that curve shape, so the jump it predicts is the one the
        // seam shows. A grounded part anchors at its trough, a hoverer at
        // mid-swing; the seam jump is the offset the cut leaves standing.
        const amplitude = m.part.bob.amplitude;
        seam.jumpM = m.part.restsOn
          ? Math.abs(amplitude * (1 - Math.cos(phase)))
          : Math.abs(amplitude * Math.sin(phase));
      }
      if (m.motion === "spin") seam.jumpDeg = 360 * fraction;
      if (m.motion === "screw" && m.part.screw) {
        seam.jumpDeg = 360 * fraction;
        seam.jumpM = Math.abs(m.part.screw.rise * fraction);
      }
      seams.push(seam);
    }
  }
  return { clipFrames, loopFrames, loopCloses: clipFrames === loopFrames, ceilingFrames, seams };
}

export function emitBlenderScript(scene: SolvedScene, options: EmitOptions = {}): string {
  const tessellation = options.tessellation ?? TESSELLATION_DEFAULTS;
  const lines: string[] = [
    "# Generated by @open-design/scene3d from a declarative scene spec.",
    "# Do not hand-edit: edit scene.json and recompile. Coordinates here are",
    "# solved output, not authored input — the relations are the source.",
    "import bpy, math",
    "",
    "_materials = {}",
    "",
    "",
    "def _material(name):",
    '    """One Principled material per name, authored entirely from the',
    "    spec's materials block — a spec-built scene can never contain an",
    '    untouched default material."""',
    "    if name in _materials:",
    "        return _materials[name]",
    "    mat = bpy.data.materials.new(name)",
    "    mat.use_nodes = True",
    '    bsdf = mat.node_tree.nodes["Principled BSDF"]',
    "    spec = _MATERIAL_SPECS.get(name)",
    "    if spec is not None:",
    '        bsdf.inputs["Base Color"].default_value = spec["base_color"]',
    '        bsdf.inputs["Roughness"].default_value = spec["roughness"]',
    '        bsdf.inputs["Metallic"].default_value = spec["metallic"]',
    '        if spec.get("emission") is not None:',
    '            bsdf.inputs["Emission Color"].default_value = spec["emission"]',
    "        # Strength is applied whether or not a COLOUR was declared. A",
    "        # material lit by a baked emission map declares the strength and",
    "        # gets its colour from the texture, and gating both on the colour",
    "        # meant `emissionStrength: 4` was read, carried through the spec,",
    "        # and then dropped on the floor — leaving Blender's default of 0,",
    "        # which is a surface that emits nothing. The atelier's lava orb",
    "        # declared 4 and had never once glowed.",
    '        if spec.get("emission") is not None or spec.get("emission_strength") is not None:',
    "        # .get with a default, not [\"...\"]: the two keys are written together",
    "        # today, but this script is DATA that a cache can hand back from an",
    "        # older writer, and a KeyError here kills the Blender job with a",
    "        # traceback instead of a diagnostic.",
    '            bsdf.inputs["Emission Strength"].default_value = spec.get("emission_strength", 1.0)',
    '        if spec.get("alpha") is not None and spec["alpha"] < 1.0:',
    '            bsdf.inputs["Alpha"].default_value = spec["alpha"]',
    "        # Every other channel the author stated, applied by SOCKET NAME.",
    "        # The compiler ships the candidate names with the value because the",
    "        # Principled BSDF renamed its inputs between versions (Coat Weight",
    "        # was Clearcoat, Transmission Weight was Transmission); the first",
    "        # name this build actually has wins, and a channel that matched",
    "        # none is reported rather than silently dropped — a material that",
    "        # quietly did not bind is a material that shipped wrong.",
    '        _unbound = []',
    '        for _chan, _spec in (spec.get("channels") or {}).items():',
    '            _socket = next((s for s in _spec["sockets"] if s in bsdf.inputs), None)',
    "            if _socket is None:",
    "                _unbound.append(_chan)",
    "                continue",
    "            try:",
    '                bsdf.inputs[_socket].default_value = _spec["value"]',
    "            except Exception:",
    "                _unbound.append(_chan)",
    "        if _unbound:",
    '            print("[scene3d] material %s: this Blender has no socket for %s"',
    '                  % (name, ", ".join(sorted(_unbound))))',
    "        # How the surface is READ, which is not the same question as what",
    "        # its alpha IS. `mask` is a hard cut-out at a threshold and sorts",
    "        # correctly in every engine; `blend` is true translucency. Both",
    "        # names are set: EEVEE Next reads surface_render_method, and the",
    "        # glTF exporter reads blend_method, so setting only one exports a",
    "        # cut-out as a blended surface.",
    '        _mode = spec.get("alpha_mode") or "opaque"',
    '        _cut = spec.get("alpha_cutoff", 0.5)',
    '        if hasattr(mat, "blend_method"):',
    '            mat.blend_method = {"blend": "BLEND", "mask": "CLIP"}.get(_mode, "OPAQUE")',
    '        if hasattr(mat, "surface_render_method"):',
    '            mat.surface_render_method = "BLENDED" if _mode == "blend" else "DITHERED"',
    '        if _mode == "mask" and hasattr(mat, "alpha_threshold"):',
    "            mat.alpha_threshold = _cut",
    "        # Backface culling is set EXPLICITLY either way. Blender leaves it",
    "        # off, which exports every material as double-sided — so a surface",
    "        # that never asked to be two-sided shipped that way, and inside-out",
    "        # geometry stayed invisible instead of showing as a hole.",
    '        if hasattr(mat, "use_backface_culling"):',
    '            mat.use_backface_culling = not spec.get("double_sided", False)',
    "    _materials[name] = mat",
    "    return mat",
    "",
    "",
    "# Chord tolerance: how far an emitted curved surface may sit from the",
    "# ideal one, in metres. A physical tolerance, beside the 1mm contact",
    "# floor — not a segment count, which would be a number with no units",
    "# and no meaning at any other scale.",
    `_CHORD_EPS = ${num(tessellation.chordToleranceM)}`,
    "# Floor keeps a silhouette round at any size; ceiling caps what a",
    "# single primitive may spend.",
    `_SEG_MIN = ${tessellation.minSegments}`,
    `_SEG_MAX = ${tessellation.maxSegments}`,
    "",
    "_AXIS_ROT = {",
    '    "z": None,',
    "    # Local z onto world x / world y; symmetric shapes make sign moot.",
    '    "x": (0.0, math.pi / 2, 0.0),',
    '    "y": (math.pi / 2, 0.0, 0.0),',
    "}",
    "",
    "",
    "",
    "# Segment count for a curved surface of radius r, from the CHORD ERROR the",
    "# contract allows: the greatest distance the emitted polygon may sit from",
    "# the ideal surface. For a circle, sagitta ~ r*pi^2/(2n^2), so",
    "# n = pi*sqrt(r/(2*eps)) — segments grow as sqrt(radius), which is the",
    "# shape of the visual invariant rather than a number somebody picked.",
    "#",
    "# Fixed counts (48 around, 24 rings) were the alternative, and they spend a",
    "# 12m dome and an 8mm bead identically: the bead carries a thousand",
    "# triangles nobody can see, trips the triangle-pair comparison cap, and",
    "# reads as a density outlier in the very advisory that asked for it. A knob",
    "# would have been a mode and a 50mm cutoff an invented threshold; a",
    "# tolerance in metres is a physical quantity that lives beside the 1mm",
    "# contact floor and is judged in the contract like every other threshold.",
    "#",
    "# Deliberately NOT camera-derived: geometry that changes with the shot is",
    "# not an asset, and the same part must compile identically in every scene",
    "# that imports it.",
    "def _segments(radius, minimum, maximum, epsilon):",
    "    if radius <= 0.0 or epsilon <= 0.0:",
    "        return minimum",
    "    n = int(math.ceil(math.pi * math.sqrt(radius / (2.0 * epsilon))))",
    "    # Even counts only: an odd ring leaves a seam vertex off the pole axis",
    "    # on a UV sphere, and mirrored parts stop matching.",
    "    if n % 2:",
    "        n += 1",
    "    return max(minimum, min(maximum, n))",
    "",
    "",
    "def _cross_extent(size, axis):",
    '    """The box extent ALONG a part\'s axis and the one ACROSS it.',
    "",
    "    The round shapes have a circular cross-section, which the validator",
    "    has already proven — so the two across-extents are the same number",
    '    and either one of them is the diameter."""',
    "    _sizes = {axis_name: size[i] for i, axis_name in enumerate((\"x\", \"y\", \"z\"))}",
    "    return _sizes[axis], [v for k, v in _sizes.items() if k != axis][0]",
    "",
    "",
    "def _mesh_object(name, verts, faces, center):",
    '    """Author a mesh from explicit vertices, the way the ops-based',
    "    primitives leave the scene: linked, active, and the only thing",
    "    selected — because the transform_apply calls that follow act on the",
    "    SELECTION, and a stale selection would bake this part's scale into",
    '    whatever else was still highlighted."""',
    "    mesh = bpy.data.meshes.new(name)",
    "    mesh.from_pydata(list(verts), [], list(faces))",
    "    mesh.update()",
    "    obj = bpy.data.objects.new(name, mesh)",
    "    bpy.context.collection.objects.link(obj)",
    '    bpy.ops.object.select_all(action="DESELECT")',
    "    obj.select_set(True)",
    "    bpy.context.view_layer.objects.active = obj",
    "    obj.location = center",
    "    _uv_unwrap(obj)",
    "    return obj",
    "",
    "",
    "def _uv_unwrap(obj):",
    '    """Author a UV layer for a hand-built mesh.',
    "",
    "    The ops-based primitives (cube, cylinder, cone, sphere, torus) come out",
    "    of Blender already unwrapped; a mesh authored from explicit vertices",
    "    does not. Without this, every tube, wedge and kernel part reached the",
    "    linter with no UV layer and failed the compiler's OWN S3D-E-441 with a",
    "    fix — unwrap the mesh — that this language has no word for. The",
    "    compiler authored the geometry, so the compiler owes it coordinates.",
    "",
    "    Smart-project is the floor E-441's own hint names. It is skipped when",
    "    UVs already exist, so a script that authored its own layout keeps it.",
    '    """',
    '    if obj.type != "MESH" or obj.data.uv_layers:',
    "        return",
    "    prev_mode = bpy.context.object.mode if bpy.context.object else \"OBJECT\"",
    "    if prev_mode != \"OBJECT\":",
    '        bpy.ops.object.mode_set(mode="OBJECT")',
    '    bpy.ops.object.select_all(action="DESELECT")',
    "    obj.select_set(True)",
    "    bpy.context.view_layer.objects.active = obj",
    '    bpy.ops.object.mode_set(mode="EDIT")',
    '    bpy.ops.mesh.select_all(action="SELECT")',
    "    # 66 degrees, Blender's own smart-project default, in radians.",
    "    bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=0.02)",
    '    bpy.ops.object.mode_set(mode="OBJECT")',
    "    # Restore the selection contract _mesh_object documents: this object",
    "    # alone selected and active, because transform_apply acts on the",
    "    # SELECTION and a stale one bakes this part's scale into another.",
    '    bpy.ops.object.select_all(action="DESELECT")',
    "    obj.select_set(True)",
    "    bpy.context.view_layer.objects.active = obj",
    "",
    "",
    "def _wedge_verts(axis, flip):",
    '    """A unit right triangular prism: the full box footprint, with the top',
    "    face rising from zero height at the axis- end to full height at the",
    "    axis+ end. Coordinates are the literals +/-0.5 and nothing else, so",
    "    two compiles of one spec cannot disagree in the last bit.",
    "",
    "    The slope direction is baked into the COORDINATES rather than reached",
    "    by a rotation. _AXIS_ROT tips local z onto a world horizontal, which is",
    "    what a long-axis shape wants and would lay a ramp on its side; the",
    "    generic flip spins a part 180 degrees about x, which turns a ramp",
    '    upside down instead of reversing which end is high."""',
    "    s = -1.0 if flip else 1.0",
    '    u = 0 if axis == "x" else 1',
    "    def p(along, across, z):",
    "        v = [0.0, 0.0, z]",
    "        v[u] = along * s",
    "        v[1 - u] = across",
    "        return tuple(v)",
    "    verts = [",
    "        p(-0.5, -0.5, -0.5), p(0.5, -0.5, -0.5), p(0.5, 0.5, -0.5),",
    "        p(-0.5, 0.5, -0.5), p(0.5, -0.5, 0.5), p(0.5, 0.5, 0.5),",
    "    ]",
    "    # Bottom quad, tall-end quad, sloped top quad, two triangular sides —",
    "    # wound outward for the axis=x, unflipped case.",
    "    faces = [(0, 3, 2, 1), (1, 2, 5, 4), (0, 4, 5, 3), (0, 1, 4), (3, 5, 2)]",
    "    # Each of the two coordinate remappings above is orientation-REVERSING:",
    "    # negating the slope axis mirrors the prism, and sending the slope to y",
    "    # swaps two axes. One of them alone turns every face inward (the winding",
    "    # rule would call the part inside-out); both together cancel.",
    '    if (s < 0.0) != (axis == "y"):',
    "        faces = [tuple(reversed(f)) for f in faces]",
    "    return verts, faces",
    "",
    "",
    "def _tube_verts(outer, inner, length, segments):",
    '    """A hollow cylinder along local z, at REAL radii: four rings of',
    "    vertices (outer top/bottom, inner top/bottom) closed by outer wall",
    "    quads, inner wall quads wound the other way, and flat ring caps that",
    "    join outer to inner at each end.",
    "",
    "    Every edge lands on exactly two faces, so the part is watertight, and",
    "    every face is a quad, so no cap needs a TRIFAN and no ngon exists to",
    '    report."""',
    "    verts = []",
    "    for radius in (outer, inner):",
    "        for z in (length / 2.0, -length / 2.0):",
    "            for i in range(segments):",
    "                a = 2.0 * math.pi * i / segments",
    "                verts.append((radius * math.cos(a), radius * math.sin(a), z))",
    "    ot, ob, it, ib = 0, segments, 2 * segments, 3 * segments",
    "    faces = []",
    "    for i in range(segments):",
    "        j = (i + 1) % segments",
    "        faces.append((ob + i, ob + j, ot + j, ot + i))   # outer wall, facing out",
    "        faces.append((it + i, it + j, ib + j, ib + i))   # inner wall, facing in",
    "        faces.append((ot + i, ot + j, it + j, it + i))   # top ring cap, +z",
    "        faces.append((ib + i, ib + j, ob + j, ob + i))   # bottom ring cap, -z",
    "    return verts, faces",
    "",
    "def _fit_box(obj, size):",
    '    """Make the box contract literally true: scale and shift the mesh DATA',
    "    so its axis-aligned bounds equal the declared box exactly, centred on",
    "    the origin.",
    "",
    "    An n-gon's flats sit cos(pi/n) inside its circle, so every revolution",
    "    shape used to ship up to half a percent smaller than the box the",
    "    solver placed — flush boxes with small measurable gaps between the",
    "    actual meshes, which is exactly the kind of phantom the census then",
    "    reports and an author cannot explain from their own numbers. Data-",
    "    level, not an object transform, so the transform-hygiene rules stay",
    '    quiet by construction."""',
    "    me = obj.data",
    "    if not me.vertices:",
    "        return",
    "    lo = [min(v.co[i] for v in me.vertices) for i in range(3)]",
    "    hi = [max(v.co[i] for v in me.vertices) for i in range(3)]",
    "    scale = [1.0, 1.0, 1.0]",
    "    shift = [0.0, 0.0, 0.0]",
    "    for i in range(3):",
    "        extent = hi[i] - lo[i]",
    "        if extent > 1e-9:",
    "            scale[i] = size[i] / extent",
    "        shift[i] = -((hi[i] + lo[i]) / 2.0) * scale[i]",
    "    if all(abs(scale[i] - 1.0) < 1e-12 and abs(shift[i]) < 1e-12 for i in range(3)):",
    "        return",
    "    for v in me.vertices:",
    "        v.co = (",
    "            v.co[0] * scale[0] + shift[0],",
    "            v.co[1] * scale[1] + shift[1],",
    "            v.co[2] * scale[2] + shift[2],",
    "        )",
    "",
    "def _part(name, shape, size, center, axis, flip, material=None, tip=0.0, thickness=0.0):",
    '    """Author a part filling its solved box exactly. Rotation and scale',
    "    are applied immediately so the exported transform is identity and",
    '    the transform-hygiene rules stay quiet by construction."""',
    '    if shape == "box":',
    "        bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)",
    '    elif shape == "cylinder":',
    "        # TRIFAN caps: an ngon cap would trip the ngon rule on every",
    "        # column — generated output must lint clean by construction.",
    "        _r = max(size[0], size[1]) / 2.0",
    '        bpy.ops.mesh.primitive_cylinder_add(vertices=_segments(_r, _SEG_MIN, _SEG_MAX, _CHORD_EPS), radius=0.5, depth=1.0, end_fill_type="TRIFAN", location=center)',
    '    elif shape == "sphere":',
    "        _r = max(size) / 2.0",
    "        _n = _segments(_r, _SEG_MIN, _SEG_MAX, _CHORD_EPS)",
    "        # Rings span half the turn the segments do, so half the count holds",
    "        # the same chord error in both directions.",
    "        bpy.ops.mesh.primitive_uv_sphere_add(segments=_n, ring_count=max(3, _n // 2), radius=0.5, location=center)",
    '    elif shape == "cone":',
    "        # radius2 is the frustum: `tip` is the top diameter as a fraction",
    "        # of the base, so 0 keeps the point and 0.6 cuts a bucket. Unit",
    "        # space, so the scale step below still owns the real size.",
    "        _r = max(size[0], size[1]) / 2.0",
    '        bpy.ops.mesh.primitive_cone_add(vertices=_segments(_r, _SEG_MIN, _SEG_MAX, _CHORD_EPS), radius1=0.5, radius2=0.5 * tip, depth=1.0, end_fill_type="TRIFAN", location=center)',
    '    elif shape == "wedge":',
    "        _verts, _faces = _wedge_verts(axis, flip)",
    "        _mesh_object(name, _verts, _faces, center)",
    '    elif shape == "tube":',
    "        # Real radii, like the torus: diameter and wall thickness are two",
    "        # independent lengths, and no uniform scale of a unit pipe reaches",
    "        # both. Segments come off the OUTER radius, the silhouette a viewer",
    "        # actually sees.",
    "        _len, _across = _cross_extent(size, axis)",
    "        _outer = _across / 2.0",
    "        _inner = _outer - thickness",
    "        _verts, _faces = _tube_verts(_outer, _inner, _len, _segments(_outer, _SEG_MIN, _SEG_MAX, _CHORD_EPS))",
    "        _mesh_object(name, _verts, _faces, center)",
    '    elif shape == "capsule":',
    "        # A UV sphere at the real radius, pulled apart at the equator: every",
    "        # vertex above z=0 rises by the half-shift and every one below drops,",
    "        # so the band of faces that straddled the equator stretches into the",
    "        # cylindrical wall. Topology is untouched, so a closed sphere stays a",
    "        # closed capsule.",
    "        _len, _across = _cross_extent(size, axis)",
    "        _r = _across / 2.0",
    "        _n = _segments(_r, _SEG_MIN, _SEG_MAX, _CHORD_EPS)",
    "        _rings = max(3, _n // 2)",
    "        # ODD ring count, deliberately. A UV sphere's rings sit at latitudes",
    "        # pi*i/rings, so an EVEN count puts one ring exactly on the equator —",
    "        # and those are precisely the vertices the shift below leaves where",
    "        # they are. The wall would then be pinched to zero height along that",
    "        # ring: degenerate faces, a waist, and a silhouette that is not a",
    "        # capsule. An odd count places every ring strictly above or below",
    "        # z=0, so the whole equatorial band becomes wall. _segments forces",
    "        # EVEN counts (for the sphere's seam), so the parity is derived here",
    "        # rather than inherited.",
    "        if _rings % 2 == 0:",
    "            _rings += 1",
    "        bpy.ops.mesh.primitive_uv_sphere_add(segments=_n, ring_count=_rings, radius=_r, location=center)",
    "        _shift = _len / 2.0 - _r",
    "        for _v in bpy.context.object.data.vertices:",
    "            if _v.co.z > 1e-9:",
    "                _v.co.z += _shift",
    "            elif _v.co.z < -1e-9:",
    "                _v.co.z -= _shift",
    '    elif shape == "torus":',
    "        # size is (ring, ring, tube) in axis-local terms; radii are real,",
    "        # not a unit scale, because ring and tube scale independently.",
    "        _sizes = {axis_name: size[i] for i, axis_name in enumerate((\"x\", \"y\", \"z\"))}",
    "        tube = _sizes[axis] / 2.0",
    '        across = [v for k, v in _sizes.items() if k != axis][0]',
    "        _major = across / 2.0 - tube",
    "        bpy.ops.mesh.primitive_torus_add(",
    "            major_radius=_major, minor_radius=tube,",
    "            major_segments=_segments(_major, _SEG_MIN, _SEG_MAX, _CHORD_EPS),",
    "            minor_segments=_segments(tube, _SEG_MIN, _SEG_MAX, _CHORD_EPS),",
    "            location=center)",
    "    else:",
    '        raise ValueError("unknown shape: %s" % shape)',
    "    obj = bpy.context.object",
    "    obj.name = name",
    "    rot = _AXIS_ROT[axis]",
    "    # A wedge already carries its axis and its flip in its vertices: its",
    "    # axis names a SLOPE direction, not a long axis, so rotating it here",
    "    # would tip the ramp onto its side and flip it upside down.",
    '    if shape != "wedge":',
    "        if flip:",
    "            obj.rotation_euler = (math.pi, 0.0, 0.0)",
    "            bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)",
    "        if rot is not None:",
    "            obj.rotation_euler = rot",
    "            bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)",
    "    # Shapes authored at their real radii are already the right size; the",
    "    # rest are unit primitives waiting for their box.",
    '    if shape not in ("torus", "tube", "capsule"):',
    "        obj.scale = size",
    "        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)",
    "    # Enforce the box exactly — n-gon flats, primitive phase quirks and",
    "    # real-radius construction rounding all corrected in one place.",
    "    _fit_box(obj, size)",
    '    if shape in ("sphere", "torus", "capsule"):',
    "        bpy.ops.object.shade_smooth()",
    "    if material:",
    "        obj.data.materials.append(_material(material))",
    "    return obj",
    "",
    "",
    "def _static_rotate(obj, axis_index, radians, pivot):",
    '    """Turn a finished part about one world axis, at a given pivot, and',
    "    BAKE it — so the exported transform stays identity and the",
    "    transform-hygiene rules stay quiet by construction, exactly like the",
    "    axis/flip/scale steps above.",
    "",
    "    Runs after everything else that shapes the part, so it applies",
    "    identically to unit-scaled primitives and to the shapes authored at",
    "    real radii (torus, tube, capsule) that skip the scale step — and to",
    "    imported and scripted parts, which is why the pivot is a parameter",
    "    rather than the object's own origin: a fitted asset rests on its",
    "    box's bottom, so its origin is not the box centre the solver rotated",
    '    the world box about."""',
    "    from mathutils import Matrix, Vector",
    "    if obj is None or radians == 0.0:",
    "        return obj",
    "    # Background bpy does not refresh matrix_world for a location set",
    "    # outside an operator, and this composes ONTO matrix_world — reading",
    "    # a stale one would rotate about where the part used to be.",
    "    bpy.context.view_layer.update()",
    '    p = Vector(pivot)',
    '    rot = Matrix.Rotation(radians, 4, ("X", "Y", "Z")[axis_index])',
    "    obj.matrix_world = Matrix.Translation(p) @ rot @ Matrix.Translation(-p) @ obj.matrix_world",
    "    # transform_apply acts on the SELECTION; claim it explicitly rather",
    "    # than trusting whatever the creating branch happened to leave.",
    '    bpy.ops.object.select_all(action="DESELECT")',
    "    obj.select_set(True)",
    "    bpy.context.view_layer.objects.active = obj",
    "    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)",
    "    bpy.context.view_layer.update()",
    "    return obj",
    "",
    "",
    "def _animate_spin(name, axis_index, period_frames):",
    '    """One full turn per period, linear, looped forever via the cycles',
    '    modifier — the compiler owns the keyframes, the author owns intent."""',
    "    obj = bpy.data.objects[name]",
    "    obj.rotation_mode = \"XYZ\"",
    "    obj.keyframe_insert(\"rotation_euler\", frame=1)",
    "    obj.rotation_euler[axis_index] = 6.283185307179586",
    "    obj.keyframe_insert(\"rotation_euler\", frame=1 + period_frames)",
    "    obj.rotation_euler[axis_index] = 0.0",
    "    _loop_fcurves(obj, \"rotation_euler\", linear=True)",
    "",
    "",
    "def _animate_bob(name, amplitude, period_frames, rests_on_ground):",
    '    """Vertical sine bob, looped, anchored by whether the part is grounded.',
    "",
    "    A grounded part takes the solved position as the TROUGH and rises to",
    "    +2A; anything else oscillates around it, +/-A. Both travel the same",
    "    peak-to-peak distance, so an authored amplitude means what it always",
    "    meant; only the anchor moves.",
    "",
    "    Centring a grounded part's bob made the compiler author motion that",
    "    breached a claim the compiler itself adjudicates: the trough dipped a",
    "    full amplitude below the contact the solver had just floored at 1mm,",
    "    and every bobbing beacon reported that its grounding had only been",
    "    checked at rest. Lint-clean-by-construction is not only about what the",
    "    linter says — the compiler must not emit motion that violates its own",
    "    contracts.",
    "",
    "    Nothing new is authored to choose between them. A part that claims to",
    "    be grounded has already said which one it wants; a hoverer, with no",
    "    ground to breach, keeps the centred swing that reads as hovering.",
    '    """',
    "    obj = bpy.data.objects[name]",
    "    base_z = obj.location.z",
    "    # FLOAT quarters — Blender keyframes accept fractional frames, and",
    "    # integer flooring warped every period not divisible by four (a",
    "    # 22-frame request cycled in 20; anything under 4 was forced to 4).",
    "    # The cycle span IS the period now, exactly, at any legal seconds.",
    "    quarter = max(0.25, period_frames / 4.0)",
    "    low = base_z if rests_on_ground else base_z - amplitude",
    "    mid = low + amplitude",
    "    high = low + 2.0 * amplitude",
    "    # The FIRST keyframe is the anchor, because frame 1 is where the",
    "    # census measures: an animated object's evaluated pose comes from",
    "    # its fcurves, so writing obj.location after keying changes nothing.",
    "    # A grounded part's anchor is its trough (the solved contact — the",
    "    # cycle only rises from it); a hoverer's is the middle of the swing",
    "    # (mid == base_z for the centred case). Starting a grounded part at",
    "    # mid measured it a full amplitude off the contact the solver had",
    "    # just floored: phantom W-337, false grounded failures.",
    "    cycle = (low, mid, high, mid, low) if rests_on_ground else (mid, high, mid, low, mid)",
    "    for step, z in enumerate(cycle):",
    "        obj.location.z = z",
    "        obj.keyframe_insert(\"location\", index=2, frame=1 + step * quarter)",
    "    _loop_fcurves(obj, \"location\", linear=False)",
    "",
    "",
    "def _loop_fcurves(obj, data_path, linear):",
    "    action = obj.animation_data.action if obj.animation_data else None",
    "    if action is None:",
    "        return",
    "    try:",
    "        curves = list(action.fcurves)",
    "    except AttributeError:",
    "        # Blender 5 layered actions",
    "        curves = [fc for layer in action.layers for strip in layer.strips",
    "                  for bag in strip.channelbags for fc in bag.fcurves]",
    "    for fc in curves:",
    "        if fc.data_path != data_path:",
    "            continue",
    "        if linear:",
    "            for kp in fc.keyframe_points:",
    "                kp.interpolation = \"LINEAR\"",
    "        fc.modifiers.new(\"CYCLES\")",
    "",
    "",
    "def _import_part(name, filepath, size, center, material=None):",
    '    """Fill a solved box with a REAL asset: import, join its meshes into',
    "    one named part, drop non-mesh scaffolding it carried, and fit it",
    "    INSIDE the box — uniform scale, centred on x/y, resting on the box's",
    "    bottom — so relations behave exactly as for primitives. The asset's",
    '    own materials and textures are kept untouched."""',
    "    from mathutils import Vector, Matrix",
    "    before = set(o.name for o in bpy.data.objects)",
    "    # Provenance is MEASURED, not guessed from names: the materials this",
    "    # import brings in are recorded as imported (by the runner registry, via",
    "    # _od_note_imported) so the census reports them. The author's own",
    "    # materials never pass through here, so they read as authored = enforced;",
    "    # a `material:` override's orphaned originals were still imported and stay",
    "    # so, because they are recorded here before the override replaces them.",
    "    mats_before = set(bpy.data.materials)",
    "    acts_before = set(bpy.data.actions)",
    "    ext = filepath.rsplit(\".\", 1)[-1].lower()",
    '    if ext in ("glb", "gltf"):',
    "        bpy.ops.import_scene.gltf(filepath=filepath)",
    '    elif ext == "obj":',
    "        bpy.ops.wm.obj_import(filepath=filepath)",
    '    elif ext == "fbx":',
    "        bpy.ops.import_scene.fbx(filepath=filepath)",
    "    else:",
    '        raise ValueError("unsupported asset: %s" % filepath)',
    "    _od_note_imported(m.name for m in set(bpy.data.materials) - mats_before)",
    "    imported = [o for o in bpy.data.objects if o.name not in before]",
    '    meshes = [o for o in imported if o.type == "MESH"]',
    "    if not meshes:",
    '        raise ValueError("no mesh objects in %s" % filepath)',
    "    # A rig cannot survive the join: fitting an asset INSIDE its box is a",
    "    # static placement by design. Losing it is defensible; losing it",
    "    # SILENTLY is not — measure what the asset carried and say so",
    "    # (importNotes -> S3D-W-207), with the path that keeps it named.",
    '    _rig_arms = [o for o in imported if o.type == "ARMATURE"]',
    "    _rig_clips = sorted(a.name for a in set(bpy.data.actions) - acts_before)",
    "    if _rig_arms or _rig_clips:",
    "        _od_note_dropped_rig(",
    "            name, len(_rig_arms),",
    "            sum(len(a.data.bones) for a in _rig_arms), _rig_clips)",
    "    # Static placement: unparent meshes (keeping their world transform),",
    "    # strip rig modifiers, and remove imported cameras/lights/empties —",
    "    # a part is geometry, not a stowaway scene.",
    "    for o in meshes:",
    "        mw = o.matrix_world.copy()",
    "        o.parent = None",
    "        o.matrix_world = mw",
    "        for mod in list(o.modifiers):",
    '            if mod.type == "ARMATURE":',
    "                o.modifiers.remove(mod)",
    "    for o in imported:",
    '        if o.type != "MESH":',
    "            bpy.data.objects.remove(o, do_unlink=True)",
    "    bpy.ops.object.select_all(action=\"DESELECT\")",
    "    mesh_names = [o.name for o in meshes]",
    "    selectable = []",
    "    for o in meshes:",
    "        try:",
    "            o.select_set(True)",
    "            selectable.append(o)",
    "        except RuntimeError:",
    "            # Not in the view layer (importer scaffolding like bone",
    "            # custom-shape meshes); join cannot absorb it — the sweep",
    "            # below removes it by name instead.",
    "            pass",
    "    if not selectable:",
    "        raise ValueError(\"no mesh in %s is reachable in the view layer\" % filepath)",
    "    # Active must be a mesh the view layer can SEE: meshes[0] may be the",
    "    # scaffolding the except above skipped, and assigning an off-layer",
    "    # object as active fails exactly when an asset leads with one.",
    "    bpy.context.view_layer.objects.active = selectable[0]",
    "    if len(meshes) > 1:",
    "        bpy.ops.object.join()",
    "    obj = bpy.context.view_layer.objects.active",
    "    obj.name = name",
    "    # Sweep any imported mesh the join did not absorb: rig visualisation",
    "    # icospheres and other importer scaffolding must not become parts.",
    "    for nm in mesh_names:",
    "        stray = bpy.data.objects.get(nm)",
    "        if stray is not None and stray != obj:",
    "            bpy.data.objects.remove(stray, do_unlink=True)",
    "    # transform_apply acts on the SELECTION, and each importer leaves",
    "    # its own selection state behind (formats differ). Claim it",
    "    # explicitly rather than trusting the importer, as _static_rotate does.",
    '    bpy.ops.object.select_all(action="DESELECT")',
    "    obj.select_set(True)",
    "    bpy.context.view_layer.objects.active = obj",
    "    # Bake whatever transform the importer authored, then fit the box.",
    "    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)",
    "    bpy.context.view_layer.update()",
    "    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]",
    "    lo = [min(c[i] for c in corners) for i in range(3)]",
    "    hi = [max(c[i] for c in corners) for i in range(3)]",
    "    dim = [max(hi[i] - lo[i], 1e-9) for i in range(3)]",
    "    s = min(size[i] / dim[i] for i in range(3))",
    "    obj.scale = (obj.scale[0] * s, obj.scale[1] * s, obj.scale[2] * s)",
    "    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)",
    "    bpy.context.view_layer.update()",
    "    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]",
    "    lo = [min(c[i] for c in corners) for i in range(3)]",
    "    hi = [max(c[i] for c in corners) for i in range(3)]",
    "    obj.location = (",
    "        obj.location[0] + center[0] - (lo[0] + hi[0]) / 2.0,",
    "        obj.location[1] + center[1] - (lo[1] + hi[1]) / 2.0,",
    "        obj.location[2] + (center[2] - size[2] / 2.0) - lo[2],",
    "    )",
    "    bpy.context.view_layer.update()",
    "    # Rotation pivots at the object ORIGIN, and the language's contract",
    "    # is that a part IS its declared box — so the origin must be the box",
    "    # centre, not wherever the importer left its pivot. Without this,",
    "    # spin/screw/rotate on a file part orbit an arbitrary point while the",
    "    # kinematic sweep and the claims adjudicate the box-centred motion.",
    "    # Data-level, like _fit_box: geometry stays where the fit put it;",
    "    # only the pivot moves. matrix_world is translation-only here",
    "    # (rotation and scale were applied above), so world delta == local.",
    "    delta = Vector(center) - obj.location",
    "    obj.data.transform(Matrix.Translation(-delta))",
    "    obj.location = (center[0], center[1], center[2])",
    "    bpy.context.view_layer.update()",
    "    if material:",
    "        # Deliberate override: replace the asset's own materials.",
    "        obj.data.materials.clear()",
    "        obj.data.materials.append(_material(material))",
    "    return obj",
    "",
  ];

  /* ---- kernel-backed parts ------------------------------------------ */
  // Gated on a recipe part existing, so a scene that never uses one emits the
  // byte-identical script it always did (the cache key is the script bytes).
  if (scene.parts.some((p) => p.recipe !== undefined)) {
    lines.push(...KERNEL_PART_HELPER, "");
  }

  /* ---- script-backed parts ------------------------------------------ */
  //
  // Freeform as a shape kind: an agent-authored Python file fills one
  // declared box, inside the same deterministic build. The runner executes
  // each script ONCE per part with a fixed contract (ctx.size, ctx.material)
  // and then applies the SAME fit as _import_part — uniform scale into the
  // box, centred on x/y, resting on its bottom — so relations, contacts and
  // claims behave identically over script geometry and primitives. The
  // script must define build(ctx) and create exactly one mesh object; that
  // is checked here, loudly, not assumed.
  const scripted = scene.parts.filter((p) => p.script !== undefined);
  if (scripted.length > 0) {
    lines.push(
      "def _run_script(filepath, size):",
      '    """Execute one part-filling script in a fresh namespace.',
      "",
      "    The script sees ctx.size (the declared box, metres) and",
      "    ctx.material(name) to bind a declared material. It must define",
      "    build(ctx) and leave exactly one mesh object behind; anything else",
      "    is a loud failure, never a silent partial fill.",
      '    """',
      "    import importlib.util",
      "    before = set(o.name for o in bpy.data.objects)",
      "    mod_name = \"scene3d_part_script_%d\" % _SCRIPT_SEQ[0]",
      "    _SCRIPT_SEQ[0] += 1",
      "    spec = importlib.util.spec_from_file_location(mod_name, filepath)",
      "    if spec is None or spec.loader is None:",
      '        raise ValueError("cannot load script: %s" % filepath)',
      "    module = importlib.util.module_from_spec(spec)",
      "    def material(name):",
      "        obj = bpy.context.object",
      "        obj.data.materials.append(_material(name))",
      "    class _Ctx:",
      '        """ctx.size / ctx.material(name) — the documented contract — and',
      "        ctx['size'] item access, which early scripts used. Both are true:",
      "        the contract was promised as attributes while a plain dict was",
      "        passed, so every script written FROM the docs raised",
      "        AttributeError on its first line.\"\"\"",
      "        def __init__(self, size, material):",
      "            self.size = size",
      "            self.material = material",
      "        def __getitem__(self, key):",
      "            return getattr(self, key)",
      "    ctx = _Ctx(tuple(size), material)",
      "    # A script author's exception arrives as a SENTENCE that carries the",
      "    # contract and their own line number — never a bare runner traceback.",
      "    # The contract was previously only learnable by deliberately raising",
      "    # exceptions and reading the stack frames, which a field audit did,",
      "    # three crashes deep.",
      "    def _script_error(phase, exc):",
      "        import traceback as _tb",
      "        line = None",
      "        for frame in _tb.extract_tb(exc.__traceback__):",
      "            if frame.filename == filepath:",
      "                line = frame.lineno",
      "        where = (\" at line %d\" % line) if line is not None else \"\"",
      "        return ValueError(",
      "            \"part script %s raised %s during %s%s: %s -- the script contract: \"",
      "            \"define build(ctx); ctx.size is the declared box (metres, tuple), \"",
      "            \"ctx.material(name) binds a declared material to the active object; \"",
      "            \"build must create exactly one mesh object\"",
      "            % (filepath, type(exc).__name__, phase, where, exc))",
      "    try:",
      "        spec.loader.exec_module(module)",
      "    except Exception as exc:",
      '        raise _script_error("import", exc)',
      "    if not hasattr(module, \"build\") or not callable(module.build):",
      '        raise ValueError("script %s must define build(ctx) — ctx.size is the declared box (metres, tuple), ctx.material(name) binds a declared material; create exactly one mesh object" % filepath)',
      "    try:",
      "        module.build(ctx)",
      "    except Exception as exc:",
      '        raise _script_error("build(ctx)", exc)',
      "    made = [o for o in bpy.data.objects if o.name not in before]",
      "    meshes = [o for o in made if o.type == \"MESH\"]",
      "    if len(meshes) != 1 or len(made) != 1:",
      '        raise ValueError("script %s must create exactly one mesh object; it created %d object(s), %d mesh(es)" % (filepath, len(made), len(meshes)))',
      "    return meshes[0]",
      "",
      "_SCRIPT_SEQ = [0]",
      "",
      "def _script_part(name, filepath, size, center, material=None):",
      '    """Fill a solved box from an agent-authored script, then fit it',
      "    exactly like an imported asset: uniform scale, centred on x/y,",
      "    resting on the box's bottom. The box is the placement envelope;",
      "    the script only decides what fills it.",
      '    """',
      "    from mathutils import Vector, Matrix",
      "    obj = _run_script(filepath, size)",
      "    obj.name = name",
      "    # transform_apply acts on the SELECTION, and the script just ran",
      "    # arbitrary bpy: it may have deselected its mesh or selected other",
      "    # scene objects, which would fit nothing and transform bystanders.",
      "    # Claim the selection explicitly, as _static_rotate does.",
      '    bpy.ops.object.select_all(action="DESELECT")',
      "    obj.select_set(True)",
      "    bpy.context.view_layer.objects.active = obj",
      "    # Bake whatever transform the script authored, then fit the box.",
      "    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)",
      "    bpy.context.view_layer.update()",
      "    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]",
      "    lo = [min(c[i] for c in corners) for i in range(3)]",
      "    hi = [max(c[i] for c in corners) for i in range(3)]",
      "    dim = [max(hi[i] - lo[i], 1e-9) for i in range(3)]",
      "    s = min(size[i] / dim[i] for i in range(3))",
      "    obj.scale = (obj.scale[0] * s, obj.scale[1] * s, obj.scale[2] * s)",
      "    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)",
      "    bpy.context.view_layer.update()",
      "    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]",
      "    lo = [min(c[i] for c in corners) for i in range(3)]",
      "    hi = [max(c[i] for c in corners) for i in range(3)]",
      "    obj.location = (",
      "        obj.location[0] + center[0] - (lo[0] + hi[0]) / 2.0,",
      "        obj.location[1] + center[1] - (lo[1] + hi[1]) / 2.0,",
      "        obj.location[2] + (center[2] - size[2] / 2.0) - lo[2],",
      "    )",
      "    bpy.context.view_layer.update()",
      "    # Same origin normalisation as _import_part, for the same reason:",
      "    # the script may have built its mesh about any pivot, and rotation",
      "    # (spin/screw/rotate) must orbit the box centre the language means.",
      "    delta = Vector(center) - obj.location",
      "    obj.data.transform(Matrix.Translation(-delta))",
      "    obj.location = (center[0], center[1], center[2])",
      "    bpy.context.view_layer.update()",
      "    if material:",
      "        # Deliberate override: replace whatever the script bound.",
      "        obj.data.materials.clear()",
      "        obj.data.materials.append(_material(material))",
      "    return obj",
      "",
    );
  }

  /* ---- material table --------------------------------------------- */
  const referenced = [...new Set(scene.parts.map((p) => p.material).filter(Boolean))] as string[];
  lines.push("_MATERIAL_SPECS = {");
  for (const name of referenced.sort()) {
    const spec = options.materials?.[name];
    if (spec) {
      /* Constants travel as `channels`, keyed by the SOCKET names the runner
         will try; bindings travel separately in `shaderBindings`. The split
         is what lets one material pin roughness to a number while a kernel
         drives its base colour — the two are the same field answered
         differently, so neither can shadow the other by accident. */
      const constants: string[] = [];
      const pushConst = (chan: ChannelDef, value: unknown): void => {
        if (typeof value === "number") {
          constants.push(`${py(chan.name)}: {"sockets": [${chan.sockets.map(py).join(", ")}], "value": ${num(value)}}`);
        } else if (Array.isArray(value) && value.length === 3) {
          const v = value as [number, number, number];
          const packed = chan.kind === "color" ? [...v, 1] : v;
          constants.push(
            `${py(chan.name)}: {"sockets": [${chan.sockets.map(py).join(", ")}], "value": (${packed.map(num).join(", ")})}`,
          );
        }
      };
      for (const chan of MATERIAL_CHANNELS) {
        const raw = (spec as Record<string, unknown>)[chan.name];
        if (raw === undefined || isChannelBinding(raw)) continue;
        pushConst(chan, raw);
      }
      // A shader material has no authored base colour — the bake owns the
      // surface. Neutral grey placeholder until the runner wires textures.
      const baseRaw = (spec as Record<string, unknown>).baseColor;
      const base = Array.isArray(baseRaw) ? (baseRaw as [number, number, number]) : [0.8, 0.8, 0.8];
      const alphaRaw = (spec as Record<string, unknown>).alpha;
      const alphaConst = typeof alphaRaw === "number" ? alphaRaw : undefined;
      const entries = [
        `"base_color": (${[...base, alphaConst ?? 1].map(num).join(", ")})`,
        `"roughness": ${num(typeof spec.roughness === "number" ? spec.roughness : 0.5)}`,
        `"metallic": ${num(typeof spec.metallic === "number" ? spec.metallic : 0)}`,
      ];
      const emissionRaw = (spec as Record<string, unknown>).emission;
      if (Array.isArray(emissionRaw)) {
        entries.push(`"emission": (${[...(emissionRaw as number[]), 1].map(num).join(", ")})`);
      }
      // Strength travels whenever the author asked for emission by EITHER
      // means, so a material lit by a baked emission map — which declares a
      // strength and takes its colour from the texture — still emits.
      const strengthRaw = (spec as Record<string, unknown>).emissionStrength;
      if (emissionRaw !== undefined || strengthRaw !== undefined) {
        entries.push(`"emission_strength": ${num(typeof strengthRaw === "number" ? strengthRaw : 1)}`);
      }
      if (alphaConst !== undefined && alphaConst < 1) {
        entries.push(`"alpha": ${num(alphaConst)}`);
      }
      /* How the surface is READ, distinct from what it is. `blend` is the
         historical meaning of an authored alpha below 1, so it stays the
         default; stating a mode is how a cut-out stops being a blended
         surface that sorts wrong in every engine. */
      const alphaMode =
        typeof spec.alphaMode === "string"
          ? spec.alphaMode
          : alphaConst !== undefined && alphaConst < 1
            ? "blend"
            : // An alpha driven by a TEXTURE is still an alpha. Leaving the
              // material opaque wires a map into a socket the renderer then
              // ignores, so a cut-out or a fade silently does nothing.
              isChannelBinding(alphaRaw)
              ? "blend"
              : undefined;
      if (alphaMode) entries.push(`"alpha_mode": ${py(alphaMode)}`);
      if (typeof spec.alphaCutoff === "number") {
        entries.push(`"alpha_cutoff": ${num(spec.alphaCutoff)}`);
      }
      if (spec.doubleSided === true) entries.push('"double_sided": True');
      if (constants.length > 0) entries.push(`"channels": {${constants.join(", ")}}`);
      lines.push(`    ${py(name)}: {${entries.join(", ")}},`);
    } else {
      // A referenced-but-undeclared material still gets deliberate, visibly
      // placeholder values — never Blender's untouched defaults.
      lines.push(
        `    ${py(name)}: {"base_color": (0.55, 0.35, 0.15, 1.0), "roughness": 0.7, "metallic": 0.0},`,
      );
    }
  }
  lines.push("}", "");

  /* ---- parts ------------------------------------------------------- */
  for (const part of scene.parts) {
    // The shape is built at the part's OWN box. `part.size` is the world box
    // the solver placed — for a rotated part that is the rotated bound, and
    // building at it would inflate the geometry by the same factor the bound
    // grew. `localSize` is present exactly when they differ.
    const size = `(${(part.localSize ?? part.size).map(num).join(", ")})`;
    const center = `(${part.center.map(num).join(", ")})`;
    const material = part.material ? `, ${py(part.material)}` : "";
    // A pure rotation about the world-box centre — which is also the local
    // box's centre — keeps the part inside the bound the solver reserved.
    const rotate = part.rotate;
    const open = rotate
      ? `_static_rotate(`
      : "";
    const close = rotate
      ? `, ${{ x: 0, y: 1, z: 2 }[rotate.axis]}, ${num((rotate.deg * Math.PI) / 180)}, ${center})`
      : "";
    if (part.file !== undefined) {
      lines.push(`${open}_import_part(${py(part.id)}, ${py(part.file)}, ${size}, ${center}${material})${close}`);
    } else if (part.script !== undefined) {
      lines.push(`${open}_script_part(${py(part.id)}, ${py(part.script)}, ${size}, ${center}${material})${close}`);
    } else if (part.recipe !== undefined) {
      // The recipe already ran (I/O the pipeline owns); its evaluated, once-
      // rounded mesh is handed in through options. Its absence is a pipeline
      // bug, not a valid emit — say so rather than shipping an empty box.
      const mesh = options.kernelMeshes?.[part.id];
      if (!mesh) {
        throw new Error(
          `emit: recipe part '${part.id}' has no evaluated kernel mesh — the pipeline must run the recipe before emit`,
        );
      }
      const verts = `[${mesh.verts.map((v) => `(${v.map(num).join(", ")})`).join(", ")}]`;
      const faces = `[${mesh.faces.map((f) => `(${f.join(", ")})`).join(", ")}]`;
      // The geometry is already fitted into the box in TS (Blender refuses
      // transform_apply on a mesh with shape keys), so _kernel_part just
      // builds it at the solved centre and attaches morph targets as keys.
      const shapeDefs = options.kernelShapes?.[part.id];
      const shapesArg =
        shapeDefs && shapeDefs.length > 0
          ? `, shapes=[${shapeDefs
              .map((sh) => `{"name": ${py(sh.name)}, "verts": [${sh.verts.map((v) => `(${v.map(num).join(", ")})`).join(", ")}]}`)
              .join(", ")}]`
          : "";
      lines.push(
        `${open}_kernel_part(${py(part.id)}, ${verts}, ${faces}, ${center}${material}${shapesArg})${close}`,
      );
    } else {
      // Shape parameters ride as KEYWORDS, and only when the author set
      // them: a part that has no tip and no wall emits exactly the call it
      // always did, so adding these words cannot invalidate a cached build
      // of a spec that never used them.
      const tip = part.tip !== undefined ? `, tip=${num(part.tip)}` : "";
      const thickness =
        part.thickness !== undefined ? `, thickness=${num(part.thickness)}` : "";
      lines.push(
        `${open}_part(${py(part.id)}, ${py(part.shape)}, ${size}, ${center}, ${py(part.axis)}, ${part.flip ? "True" : "False"}${material}${tip}${thickness})${close}`,
      );
    }
  }
  lines.push("");

  /* ---- animation ---------------------------------------------------- */
  // Declarative motion, compiler-owned keyframes at 24fps. The scene's
  // frame range covers the longest single cycle; every curve loops via a
  // cycles modifier, so any playhead position is valid.
  // `conventions.animation.fps` decides this. It was validated, cache-keyed,
  // and then overridden by a constant here, so a project that asked for 30
  // silently got 24 keyframes per second and a clip a third too slow.
  const FPS = options.fps && options.fps > 0 ? options.fps : 24;
  const animated = scene.parts.filter((p) => p.spin || p.bob || p.screw);
  if (animated.length > 0) {
    // The clip length comes from the ONE plan (loop-closing lcm when it
    // fits the budget), and the per-motion frame counts below come from the
    // same motionPeriods the plan read — the seam warning and the bake
    // cannot disagree about a single frame.
    const plan = clipPlan(scene.parts, FPS, options.maxFrames)!;
    // The screw helper is authored only when a screw exists, the same
    // keyword-gating the shape parameters use at their call sites: a scene
    // that never screws must emit the byte-identical script it always did,
    // because the cache key and every determinism pin are the script bytes.
    if (animated.some((p) => p.screw)) lines.push(...SCREW_HELPER, "");
    for (const part of animated) {
      if (part.spin) {
        const frames = motionPeriods(part, FPS).find((m) => m.motion === "spin")!.frames;
        const axisIndex = { x: 0, y: 1, z: 2 }[part.spin.axis ?? "z"];
        lines.push(`_animate_spin(${py(part.id)}, ${axisIndex}, ${frames})`);
      }
      if (part.bob) {
        const frames = motionPeriods(part, FPS).find((m) => m.motion === "bob")!.frames;
        // Whether this part RESTS on something decides where the swing is
        // anchored, and the author already said so by writing `sits_on`. A
        // resting part must not sink into its support; a hoverer has nothing
        // to sink into and keeps the centred swing that reads as hovering.
        // Repeat/scatter instances inherit their base part's relation, which
        // is the same rule applied to the part the author actually wrote.
        lines.push(
          `_animate_bob(${py(part.id)}, ${num(part.bob.amplitude)}, ${frames}, ${part.restsOn ? "True" : "False"})`,
        );
      }
      if (part.screw) {
        // One turn AND one rise share the period: they are one motion, and
        // splitting them across two frame counts would be a screw whose
        // thread slips.
        const frames = motionPeriods(part, FPS).find((m) => m.motion === "screw")!.frames;
        const axisIndex = { x: 0, y: 1, z: 2 }[part.screw.axis ?? "z"];
        lines.push(
          `_animate_screw(${py(part.id)}, ${axisIndex}, ${frames}, ${num(part.screw.rise)})`,
        );
      }
    }
    lines.push(
      // The RATE, not just the count. Frames are computed at this fps, so a
      // scene left at Blender's default plays them at the wrong speed: two
      // seconds authored at 30 becomes 60 frames played at 24, a clip that
      // runs 2.5s. The count and the rate have to travel together or the
      // duration is wrong in every export.
      `bpy.context.scene.render.fps = ${Math.max(1, Math.round(FPS))}`,
      "bpy.context.scene.render.fps_base = 1.0",
      `bpy.context.scene.frame_end = ${1 + plan.clipFrames}`,
      "bpy.context.scene.frame_set(1)",
      "",
    );
  }

  /* ---- camera ------------------------------------------------------ */
  if (options.camera !== false) {
    const spec = typeof options.camera === "object" ? options.camera : {};
    const framing = frameScene(scene, spec);
    lines.push(
      "# Hero camera framed from the solved bounds — derived, not guessed.",
      `bpy.ops.object.camera_add(location=(${framing.location.map(num).join(", ")}))`,
      "cam = bpy.context.object",
      'cam.name = "cam_hero"',
      // Authored, not inherited: the distance above was DERIVED from this
      // lens (see AUTOFIT_DISTANCE), so leaving it to whatever the host's
      // default happens to be would leave the framing formula reading a
      // number the scene does not actually carry.
      `cam.data.lens = ${num(CAMERA_LENS_MM)}`,
      `cam.data.sensor_width = ${num(CAMERA_SENSOR_MM)}`,
      `cam.rotation_euler = (${framing.rotation.map(num).join(", ")})`,
      "bpy.context.scene.camera = cam",
      "",
    );
  }

  /* ---- lights ------------------------------------------------------ */
  if (options.lights !== false) {
    const framing = frameScene(scene, typeof options.camera === "object" ? options.camera : {});
    // A preset word and a spec are the same rig; the spec only scales it.
    const lightSpec = typeof options.light === "object" && options.light !== null ? options.light : {};
    const preset = typeof options.light === "string" ? options.light : lightSpec.preset ?? "studio";
    const keyScale = lightSpec.key ?? 1;
    // The world is authored here rather than left to the runner's neutral
    // default whenever the author states one: a dim key against a bright world
    // is an overcast afternoon, so a night shot has to be able to reach BOTH.
    if (lightSpec.ambient !== undefined) {
      const a = lightSpec.ambient;
      const rgb = typeof a === "number" ? [a, a, a] : a;
      lines.push(
        "# Authored world light. This is what everything not directly lit gets,",
        "# so it is the difference between a dark scene and a subject in a void.",
        "world = bpy.context.scene.world",
        'if world is None:',
        '    world = bpy.data.worlds.new("S3D_World")',
        "    bpy.context.scene.world = world",
        "world.use_nodes = True",
        '_bg = next((n for n in world.node_tree.nodes if n.type == "BACKGROUND"), None)',
        "if _bg is None:",
        '    _bg = world.node_tree.nodes.new("ShaderNodeBackground")',
        '    _out = next((n for n in world.node_tree.nodes if n.type == "OUTPUT_WORLD"), None)',
        "    if _out is None:",
        '        _out = world.node_tree.nodes.new("ShaderNodeOutputWorld")',
        '    world.node_tree.links.new(_bg.outputs["Background"], _out.inputs["Surface"])',
        `_bg.inputs["Color"].default_value = (${num(rgb[0]!)}, ${num(rgb[1]!)}, ${num(rgb[2]!)}, 1.0)`,
        "# Marked as AUTHORED so the runner's neutral-world default does not",
        "# overwrite it. The default runs after the build script and would",
        "# otherwise silently replace this value with its own grey, which makes",
        "# an authored ambient reach nothing.",
        'world["s3d_authored_world"] = True',
        "",
      );
    }
    // A key scaled to zero is not a lamp at 0W — it is NO lamp, so the scene
    // is lit by its world and its own emissive surfaces alone. Emitting a
    // dead light object would leave a part in the census that lights nothing.
    if (keyScale <= 0) {
      lines.push(
        "# light.key = 0: no key at all. The world and any emissive materials",
        "# are the only light in this scene.",
        "",
      );
    } else if (preset === "sun") {
      lines.push(
        "# Outdoor sun: parallel light, so energy is irradiance and does not",
        "# need to scale with the subject.",
        `bpy.ops.object.light_add(type="SUN", location=(${num(framing.center[0] + framing.radius)}, ${num(framing.center[1] - framing.radius)}, ${num(framing.center[2] + framing.radius * 2)}))`,
        "key = bpy.context.object",
        'key.name = "lgt_key"',
        `key.data.energy = ${num(3.0 * keyScale)}`,
        "key.rotation_euler = (0.6, 0.2, 0.8)",
        "",
      );
    } else {
      const key = framing.radius * KEY_DISTANCE_RADII;
      // Where the key stands. Omitted, it sits on the camera's own quarter
      // (+X, -Y, up) — the flattering default that keeps a derived shot from
      // ever looking unlit. Stated, it uses the ONE pose convention the camera
      // and the proof orbit already speak, so "the key is behind it" means the
      // same thing here as everywhere else: azimuth 0 is the front (-Y),
      // increasing toward +X.
      const keyPos =
        lightSpec.azimuthDeg !== undefined || lightSpec.elevationDeg !== undefined
          ? (() => {
              const az = ((lightSpec.azimuthDeg ?? 45) * Math.PI) / 180;
              const el = ((lightSpec.elevationDeg ?? 35) * Math.PI) / 180;
              return [
                framing.center[0] + Math.cos(el) * Math.sin(az) * key,
                framing.center[1] - Math.cos(el) * Math.cos(az) * key,
                framing.center[2] + Math.sin(el) * key,
              ] as const;
            })()
          : (() => {
              /* The default quarter, placed at the SAME distance an authored
                 angle gets. It used to be `key` on each axis, which puts the
                 lamp at key·sqrt(3) — so writing out the angles the default
                 already implies (az 45, el 35.26) moved the lamp from 4.33 to
                 2.5 radii and made the scene three times brighter. Stating a
                 default must reproduce it. */
              const d = key / Math.sqrt(3);
              return [
                framing.center[0] + d,
                framing.center[1] - d,
                framing.center[2] + d,
              ] as const;
            })();
      lines.push(
        "# Key light scaled to the subject so exposure does not depend on how",
        "# large the model happens to be.",
        "#",
        "# Power goes as radius SQUARED, and neither term is floored. Both of",
        "# those were wrong before and in the same direction: the lamp sat at",
        "# a distance proportional to the radius, so irradiance falls as",
        "# radius^2, while power rose only linearly — leaving the subject lit",
        "# as 1/radius. Small subjects were therefore lit HARDER, exactly",
        "# inverting the promise this comment makes. The floors then finished",
        "# the job: a 1m minimum lamp physically envelops anything under half",
        "# a metre. Every prop, printed part, product shot and miniature",
        "# rendered pure white, and the proof reported the frame as EMPTY",
        "# rather than blown, sending the reader after a framing bug that was",
        "# not there.",
        "#",
        "# Squared power makes irradiance constant, so one calibration holds",
        "# at every scale: 4000W at a 1m radius, which is what the sizes that",
        "# always looked right were already getting.",
        `bpy.ops.object.light_add(type="AREA", location=(${num(keyPos[0])}, ${num(keyPos[1])}, ${num(keyPos[2])}))`,
        "key = bpy.context.object",
        'key.name = "lgt_key"',
        `key.data.energy = ${num(KEY_WATTS_AT_ONE_METRE * framing.radius * framing.radius * keyScale)}`,
        `key.data.size = ${num(framing.radius * 2)}`,
        // An area lamp is directional: it emits along its own -Z. The default
        // quarter happened to face the subject; any authored angle does not,
        // so the lamp is aimed the same way the camera is.
        `key.rotation_euler = __import__("mathutils").Vector((${num(keyPos[0] - framing.center[0])}, ${num(keyPos[1] - framing.center[1])}, ${num(keyPos[2] - framing.center[2])})).to_track_quat("Z", "Y").to_euler()`,
        "",
      );
    }
  }

  return lines.join("\n");
}

/**
 * Where the key stands, in bounding radii. One constant for both the default
 * quarter and an authored azimuth/elevation, so the two cannot disagree about
 * exposure — and so writing out the angles the default already implies
 * changes nothing.
 */
const KEY_DISTANCE_RADII = 2.5 * Math.sqrt(3);

/**
 * Key-light power for a subject of one metre radius, in watts. Every other
 * size scales from here by radius squared, which is what keeps the subject's
 * illumination — not the lamp's number — the thing that stays constant.
 *
 * The number answers one physical question: what power makes a pixel read as
 * the ALBEDO that produced it? A Lambertian surface of albedo 1 facing the key
 * must land just under clipping, so every real albedo below it maps to a
 * distinct value and nothing saturates. The neutral world contributes 0.28 of
 * that budget on its own (an environment of radiance L lights an albedo-1
 * surface to exactly L, measured at 0.2805), which leaves the key 0.62 — the
 * value this constant delivers, with the remainder held as headroom for
 * indirect bounce.
 *
 * That target is what makes the render legible rather than merely bright:
 * a mid-grey 0.18 card lands at 0.44 sRGB, close to the 0.47 that photographic
 * middle grey is defined as.
 *
 * Measured, not fitted to the corpus: an albedo-1 sphere under this rig reads
 * its peak lit pixel at 0.90, and `tests/exposure.test.ts` re-measures that on
 * every run. A corpus fit would make the fixtures the authority on exposure —
 * the next scene with a brighter albedo would break it again, which is exactly
 * what happened when the previous value was carried across a change in light
 * transport with only a docstring claiming it still held.
 */
const KEY_WATTS_AT_ONE_METRE = 100;

/**
 * Camera placement derived from the solved bounding box.
 *
 * Framing is arithmetic on numbers the solver already produced, so it does
 * not need a model call and cannot drift from the geometry: the shot always
 * contains the subject, at any scale, without anyone typing a distance. The
 * optional spec steers the derivation (orbit angle, elevation, distance in
 * bounding radii) without ever replacing it with absolute coordinates.
 */
export function frameScene(
  scene: SolvedScene,
  spec: CameraSpec = {},
): {
  center: [number, number, number];
  radius: number;
  location: [number, number, number];
  rotation: [number, number, number];
  /**
   * What fraction of the frame's HALF-HEIGHT the bounding radius covers at
   * this distance — the thing the derivation is actually for, reported so it
   * can be checked rather than trusted. 1.0 is a subject touching the frame
   * edge; the default framing lands at CAMERA_FILL.
   */
  fill: number;
} {
  if (scene.parts.length === 0) {
    return {
      center: [0, 0, 0],
      radius: 1,
      location: [4, -4, 3],
      rotation: [1.1, 0, 0.785],
      fill: 1 / (Math.hypot(4, 4, 3) * Math.tan(CAMERA_HALF_FOV)),
    };
  }
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const part of scene.parts) {
    // Frame the CYCLE, not the rest pose: a bobbing lamp or a screwing bit
    // leaves its rest box every second of playback, and a camera fitted to
    // rest cropped it mid-cycle. The swept box is the same envelope W-108
    // and the cycle claims judge — one predicate, another consumer.
    const env = sweptBox(part);
    for (let axis = 0; axis < 3; axis++) {
      const half = part.size[axis]! / 2;
      lo[axis] = Math.min(lo[axis]!, env ? env.min[axis]! : part.center[axis]! - half);
      hi[axis] = Math.max(hi[axis]!, env ? env.max[axis]! : part.center[axis]! + half);
    }
  }
  const center: [number, number, number] = [
    (lo[0]! + hi[0]!) / 2,
    (lo[1]! + hi[1]!) / 2,
    (lo[2]! + hi[2]!) / 2,
  ];
  const radius =
    Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) / 2 || 1;
  // Defaults give a three-quarter view at 30° elevation: the angle that
  // reads a box as a box.
  const azimuth = ((spec.azimuthDeg ?? 45) * Math.PI) / 180;
  const elevation = ((spec.elevationDeg ?? 30) * Math.PI) / 180;
  // Omitting `distance` AUTO-FITS: the default is not a literal but the
  // solution of "fill CAMERA_FILL of the frame height" for the lens the
  // emitter authors — d = r / (tan(fov/2) · fill). An authored distance keeps
  // its existing meaning, a multiple of the bounding radius, untouched.
  const distance = radius * (spec.distance ?? AUTOFIT_DISTANCE);
  const location: [number, number, number] = [
    center[0] + distance * Math.cos(elevation) * Math.sin(azimuth),
    center[1] - distance * Math.cos(elevation) * Math.cos(azimuth),
    center[2] + distance * Math.sin(elevation),
  ];
  // Blender cameras look down local -Z; pitch down from level by elevation.
  const rotation: [number, number, number] = [Math.PI / 2 - elevation, 0, azimuth];
  return {
    center,
    radius,
    location,
    rotation,
    fill: radius / (distance * Math.tan(CAMERA_HALF_FOV)),
  };
}

/** Fixed precision keeps the emitted script byte-stable for the cache. */
/**
 * The screw keyframer, authored into the script only when a scene screws.
 *
 * It does its own fcurve looping rather than calling `_loop_fcurves`, because
 * that helper filters by data path alone: a part that screws about x while
 * bobbing shares the `location` path with the bob, and looping the path
 * wholesale would flatten the bob's sine to LINEAR and hang a second CYCLES
 * modifier on it. The array-index filter below is sufficient precisely
 * because of the exclusivity the validator enforces — a screw about z cannot
 * coexist with a bob, and no part both spins and screws — so the only curve
 * on this index is the one this function just authored.
 */
/**
 * Build a recipe part's exact kernel mesh from explicit vertices and fit it
 * into the declared box, exactly like `_import_part` fits an asset. Authored
 * into the script only when a scene uses a recipe, so non-recipe scenes stay
 * byte-identical. No `bpy.ops` builds the geometry — `from_pydata` places the
 * compiler's exact topology verbatim, which is what lets the census Blender
 * measures be adjudicated against the kernel's exact prediction.
 */
const KERNEL_PART_HELPER: readonly string[] = [
  "def _kernel_part(name, verts, faces, center, material=None, shapes=None):",
  '    """Build an exact kernel mesh from explicit vertices — already fitted',
  "    into its box in TS — place it at its solved centre, and attach any morph",
  "    targets as shape keys. No transform_apply: Blender refuses it on a mesh",
  '    with shape keys, which is exactly why the fit happened in TS."""',
  "    obj = _mesh_object(name, verts, faces, center)",
  "    obj.name = name",
  "    if shapes:",
  "        # The Basis key is the built geometry; each named key carries a",
  "        # morph target's absolute positions (same vertex order as the base).",
  '        obj.shape_key_add(name="Basis")',
  "        for shp in shapes:",
  '            key = obj.shape_key_add(name=shp["name"])',
  '            data = shp["verts"]',
  "            for idx in range(len(data)):",
  "                key.data[idx].co = data[idx]",
  "    if material:",
  "        obj.data.materials.append(_material(material))",
  "    bpy.context.view_layer.update()",
  "    return obj",
];

const SCREW_HELPER: readonly string[] = [
  "def _animate_screw(name, axis_index, period_frames, rise):",
  '    """One full turn per period about a world axis, composed with a straight',
  "    advance of `rise` metres along that SAME axis — Chasles' screw, the",
  "    general rigid motion, of which _animate_spin is the pitch-zero case.",
  "",
  "    The turn loops seamlessly because a full turn is congruent to none; the",
  "    advance does not. Its curve REPEATS rather than mirrors, so the part",
  "    drives from 0 to rise and then snaps back to start the next thread.",
  "    That snap is the honest reading of a screw that KEEPS driving — a bit",
  "    boring in, an auger lifting grain — and it is why a screw is not a lid",
  "    that unscrews once and stops: this language emits looped clips only,",
  "    and a one-shot advance is not one.",
  "",
  "    The solved pose is the START of the cycle, not its middle: the census",
  "    measures where the solver placed the part, and the sweep envelope is",
  '    written from that same anchor."""',
  "    obj = bpy.data.objects[name]",
  '    obj.rotation_mode = "XYZ"',
  "    base = obj.location[axis_index]",
  '    obj.keyframe_insert("rotation_euler", frame=1)',
  '    obj.keyframe_insert("location", index=axis_index, frame=1)',
  "    obj.rotation_euler[axis_index] = 6.283185307179586",
  "    obj.location[axis_index] = base + rise",
  '    obj.keyframe_insert("rotation_euler", frame=1 + period_frames)',
  '    obj.keyframe_insert("location", index=axis_index, frame=1 + period_frames)',
  "    obj.rotation_euler[axis_index] = 0.0",
  "    obj.location[axis_index] = base",
  "    action = obj.animation_data.action if obj.animation_data else None",
  "    if action is None:",
  "        return",
  "    try:",
  "        curves = list(action.fcurves)",
  "    except AttributeError:",
  "        # Blender 5 layered actions",
  "        curves = [fc for layer in action.layers for strip in layer.strips",
  "                  for bag in strip.channelbags for fc in bag.fcurves]",
  "    for fc in curves:",
  '        if fc.data_path not in ("rotation_euler", "location"):',
  "            continue",
  "        # A bob on this object owns location index 2 and must keep its",
  "        # sine; only the screw's own axis is linearised and cycled here.",
  '        if fc.data_path == "location" and fc.array_index != axis_index:',
  "            continue",
  "        for kp in fc.keyframe_points:",
  '            kp.interpolation = "LINEAR"',
  '        fc.modifiers.new("CYCLES")',
];

function num(value: number): string {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function py(value: string): string {
  // Belt and braces under the validator's charset gates: even if a string
  // with control characters ever reached here, it must emit as a legal
  // single-line Python literal, never as a SyntaxError inside the
  // generated script.
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, (ch) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`);
  return `"${escaped}"`;
}
