import {
  AXES,
  Axis,
  Face,
  MAX_PARTS,
  MAX_REPEAT_COUNT,
  MIN_CONTACT,
  PartSpec,
  Relation,
  SceneSpec,
  SolveDiagnostic,
  SolvedPart,
  SolvedScene,
  Vec3,
  normalizeTurn,
  rotatedBoxSize,
} from "./types.js";
import { Rng } from "./rng.js";

/**
 * Resolve a declarative scene into world-space placements.
 *
 * The algorithm is a fixpoint over the relation graph: a relation can be
 * applied once the part it references is fully solved, and each application
 * determines one or more axes of its subject. Iterating until nothing new
 * resolves means authors never have to order their relations, and the result
 * does not depend on the order they happened to write them — the same spec
 * always solves to the same numbers, which is what lets the compiler cache
 * and diff scenes at all.
 *
 * Anything still unresolved at the fixpoint is reported rather than guessed.
 * A part placed at a plausible-looking default would be a silent wrong
 * answer, and silent wrong answers in geometry cost a whole compile round
 * trip to notice.
 */
export function solveScene(spec: SceneSpec, opts: { grid?: number } = {}): SolvedScene {
  const diagnostics: SolveDiagnostic[] = [];
  const parts = new Map<string, PartSpec>();
  for (const part of spec.parts) parts.set(part.id, part);

  // The doctrine (fable-5): AUTHORED numbers belong to the author — an off-grid
  // size the author typed is theirs, and lint (W-970) tells them. But EMERGENT
  // numbers the solver invents — a repeat instance's position, a scatter
  // sample — must satisfy the declared constraints. When the contract declares
  // a grid, that turns the solver's continuous domain into a lattice for the
  // coordinates it generates, so a voxel scene's repeats/scatter land on-grid
  // by construction instead of flooding the linter after the fact.
  const grid = opts.grid && opts.grid > 0 ? opts.grid : 0;
  const snap = grid > 0 ? (v: number) => Math.round(v / grid) * grid : (v: number) => v;

  // Working state: centre per axis, plus which axes are pinned down so far.
  const center = new Map<string, [number | null, number | null, number | null]>();
  const size = new Map<string, Vec3>();
  /** part -> what a `sits_on` placed it on. See SolvedPart.restsOn. */
  const restsOn = new Map<string, string>();

  // `around { orient: true }` makes the BASE part instance 0, turned to its
  // own start angle — so the rotation is part of the part's identity before
  // anything measures it. Composed here, ahead of the size table below,
  // because a rotated part's world box is what `sits_on` reads to find its
  // resting height: composing it later would seat the ring at the height of
  // an un-turned bar and then turn it, which is a different scene.
  // Present for every oriented base, holding `undefined` when the composed
  // angle came out a whole turn: that is a part with NO rotation, not a part
  // that falls back to the authored one it just cancelled.
  const orientedBase = new Map<string, { axis: Axis; deg: number } | undefined>();
  for (const relation of spec.relations) {
    if (relation.type !== "around" || relation.orient !== true) continue;
    const part = parts.get(relation.part);
    if (!part) continue;
    const axis = relation.axis ?? "z";
    const deg = normalizeTurn((part.rotate?.deg ?? 0) + (relation.startDeg ?? 0));
    // A composition that lands on a whole turn rotates nothing; carrying it
    // anyway would emit a rotate call for the identity and break the
    // byte-identity an un-oriented spec has always had.
    orientedBase.set(relation.part, deg === 0 ? undefined : { axis, deg });
  }
  /** The rotation a part is actually BUILT with — authored, or composed. */
  const rotationOf = (part: PartSpec): PartSpec["rotate"] =>
    orientedBase.has(part.id) ? orientedBase.get(part.id) : part.rotate;

  for (const part of spec.parts) {
    center.set(part.id, [null, null, null]);
    // The solver reasons in the WORLD box from the very first line. A
    // rotated part's authored `size` is its LOCAL box — what its shape fills
    // — and every relation below is about the space the part occupies, so
    // the rotated bound is the only box any of them may see. Splitting it
    // here rather than at each relation is what keeps `rotate` invisible to
    // sits_on, inset_from, repeat, scatter and the intersection report.
    size.set(part.id, rotatedBoxSize(part.size, rotationOf(part)));
  }

  const unknown = (id: string, relation: string): void => {
    diagnostics.push({
      code: "SOLVE-UNKNOWN-PART",
      message: `relation '${relation}' references unknown part '${id}'`,
      part: id,
    });
  };

  const solvedAxes = (id: string): boolean => center.get(id)?.every((v) => v !== null) ?? false;

  const setAxis = (id: string, axis: Axis, value: number, relation: string): void => {
    const slot = center.get(id);
    if (!slot) return;
    const index = AXES.indexOf(axis);
    const existing = slot[index];
    if (existing !== null && Math.abs(existing - value) > 1e-9) {
      diagnostics.push({
        code: "SOLVE-CONFLICT",
        message: `'${id}' ${axis} is constrained twice to different values (${existing} vs ${value}) — the later relation '${relation}' was ignored`,
        part: id,
      });
      return;
    }
    slot[index] = value;
  };

  /** Floor a contact offset so two surfaces can never land exactly flush. */
  const contact = (value: number | undefined, part: string, kind: string): number => {
    const requested = value ?? MIN_CONTACT;
    if (Math.abs(requested) >= MIN_CONTACT) return requested;
    diagnostics.push({
      code: "SOLVE-EPSILON-FLOOR",
      message: `${kind} offset ${requested} on '${part}' is below the ${MIN_CONTACT}m contact floor and was raised; coincident faces would z-fight`,
      part,
    });
    return requested < 0 ? -MIN_CONTACT : MIN_CONTACT;
  };

  const bounds = (id: string, axis: Axis): { min: number; max: number } | null => {
    const c = center.get(id);
    const s = size.get(id);
    if (!c || !s) return null;
    const index = AXES.indexOf(axis);
    const value = c[index];
    if (value === null) return null;
    const half = s[index]! / 2;
    return { min: value - half, max: value + half };
  };

  const apply = (relation: Relation): boolean => {
    switch (relation.type) {
      case "at": {
        if (!parts.has(relation.part)) return unknown(relation.part, "at"), true;
        for (const axis of AXES) {
          setAxis(relation.part, axis, relation.center[AXES.indexOf(axis)]!, "at");
        }
        return true;
      }

      case "sits_on": {
        if (!parts.has(relation.part)) return unknown(relation.part, "sits_on"), true;
        if (!parts.has(relation.on)) return unknown(relation.on, "sits_on"), true;
        if (!solvedAxes(relation.on)) return false;
        const support = bounds(relation.on, "z");
        if (!support) return false;
        const embed = contact(relation.embed, relation.part, "embed");
        const half = size.get(relation.part)![2] / 2;
        // Sink the part into its support: the faces overlap rather than touch.
        setAxis(relation.part, "z", support.max - embed + half, "sits_on");
        restsOn.set(relation.part, relation.on);
        return true;
      }

      case "above": {
        if (!parts.has(relation.part)) return unknown(relation.part, "above"), true;
        if (!parts.has(relation.over)) return unknown(relation.over, "above"), true;
        if (!solvedAxes(relation.over)) return false;
        const under = bounds(relation.over, "z");
        if (!under) return false;
        const gap = contact(relation.clearance, relation.part, "clearance");
        const half = size.get(relation.part)![2] / 2;
        setAxis(relation.part, "z", under.max + gap + half, "above");
        return true;
      }

      case "align": {
        if (!parts.has(relation.part)) return unknown(relation.part, "align"), true;
        if (!parts.has(relation.to)) return unknown(relation.to, "align"), true;
        if (!solvedAxes(relation.to)) return false;
        for (const axis of relation.axes) {
          const target = center.get(relation.to)![AXES.indexOf(axis)];
          if (target === null) return false;
          setAxis(relation.part, axis, target, "align");
        }
        return true;
      }

      case "inset_from": {
        if (!parts.has(relation.part)) return unknown(relation.part, "inset_from"), true;
        if (!parts.has(relation.from)) return unknown(relation.from, "inset_from"), true;
        if (!solvedAxes(relation.from)) return false;
        const by = contact(relation.by, relation.part, "inset");
        for (const face of relation.faces) {
          const axis = faceAxis(face);
          const outer = bounds(relation.from, axis);
          if (!outer) return false;
          const half = size.get(relation.part)![AXES.indexOf(axis)]! / 2;
          // Pull in from the reference face, so the side surfaces are never
          // flush either — flush sides z-fight exactly like flush tops.
          const value = face.endsWith("-") ? outer.min + by + half : outer.max - by - half;
          setAxis(relation.part, axis, value, "inset_from");
        }
        return true;
      }

      case "span": {
        if (!parts.has(relation.part)) return unknown(relation.part, "span"), true;
        if (!parts.has(relation.from)) return unknown(relation.from, "span"), true;
        if (!parts.has(relation.to)) return unknown(relation.to, "span"), true;
        if (!solvedAxes(relation.from) || !solvedAxes(relation.to)) return false;
        // A second span on an axis a part already spans is two authorities
        // over one extent; the first wins and the second is reported, the
        // same contract setAxis enforces for centres.
        const spanKey = `${relation.part}/${relation.axis}`;
        if (spannedAxes.has(spanKey)) {
          diagnostics.push({
            code: "SOLVE-CONFLICT",
            message: `'${relation.part}' ${relation.axis} extent is spanned twice — the later span was ignored`,
            part: relation.part,
          });
          return true;
        }
        const a = bounds(relation.from, relation.axis);
        const b = bounds(relation.to, relation.axis);
        if (!a || !b) return false;
        const embed = contact(relation.embed, relation.part, "embed");
        const lo = Math.min(a.max, b.max);
        const hi = Math.max(a.min, b.min);
        // A span bridges the GAP between two anchors. When they overlap there
        // is no gap, and the same arithmetic silently returns the overlap
        // region instead — a beam sitting inside both anchors, at roughly
        // twice the size the author was picturing, with nothing said. The
        // construction is degenerate, not merely unusual: say so.
        if (hi < lo - 1e-9) {
          diagnostics.push({
            code: "SOLVE-CONFLICT",
            message: `span '${relation.part}' has overlapping anchors on ${relation.axis}: '${relation.from}' and '${relation.to}' already intersect, so there is no gap to bridge — move them apart, or place the part directly`,
            part: relation.part,
          });
          return true;
        }
        // Reach *into* both anchors so the joint is a real intersection.
        const start = Math.min(lo, hi) - embed;
        const end = Math.max(lo, hi) + embed;
        let extent = Math.abs(end - start);
        // A large negative embed can collapse the extent below anything
        // buildable — the one place a size is recomputed post-validation,
        // so it carries the positivity floor validation gave authored
        // sizes, loudly.
        if (extent < MIN_CONTACT) {
          diagnostics.push({
            code: "SOLVE-EPSILON-FLOOR",
            message: `span extent for '${relation.part}' on ${relation.axis} collapsed to ${extent.toFixed(6)}m — floored to ${MIN_CONTACT}m; check the embed`,
            part: relation.part,
          });
          extent = MIN_CONTACT;
        }
        spannedAxes.add(spanKey);
        const next = [...size.get(relation.part)!] as Vec3;
        next[AXES.indexOf(relation.axis)] = extent;
        size.set(relation.part, next);
        setAxis(relation.part, relation.axis, (start + end) / 2, "span");
        return true;
      }

      case "around": {
        if (!parts.has(relation.part)) return unknown(relation.part, "around"), true;
        if (!parts.has(relation.center)) return unknown(relation.center, "around"), true;
        // The circle waits for its hub exactly as `sits_on` waits for its
        // support — one dependency, expressed the one way this solver has.
        if (!solvedAxes(relation.center)) return false;
        const hub = center.get(relation.center)!;
        const [u, v] = planeAxes(relation.axis ?? "z");
        // The base IS instance 0. It takes the start angle, and the clones
        // minted after the fixpoint take the rest — the same shape as
        // repeat, where the base keeps its place and the clones step off it.
        const first = ringPosition(hub as Vec3, u, v, relation.radius, relation.startDeg ?? 0);
        setAxis(relation.part, AXES[u]!, snap(first[u]!), "around");
        setAxis(relation.part, AXES[v]!, snap(first[v]!), "around");
        aroundPlans.push({ relation, hub: [hub[0]!, hub[1]!, hub[2]!] });
        return true;
      }

      case "scatter": {
        if (!parts.has(relation.part)) return unknown(relation.part, "scatter"), true;
        if (!parts.has(relation.on)) return unknown(relation.on, "scatter"), true;
        if (!solvedAxes(relation.on)) return false;
        // Scatters on one support see each other: rocks placed by an
        // earlier relation are obstacles to the shoots placed by a later
        // one, in authoring order. Without this, two independent streams
        // happily intersect their instances.
        const occupied = scatterOccupancy.get(relation.on) ?? [];
        const placements = sampleScatter(
          relation,
          size.get(relation.part)!,
          {
            x: bounds(relation.on, "x")!,
            y: bounds(relation.on, "y")!,
            z: bounds(relation.on, "z")!,
          },
          contact(relation.embed, relation.part, "embed"),
          occupied,
          diagnostics,
          snap,
        );
        if (placements === null) return true; // failed loudly; base stays unplaced
        scatterOccupancy.set(relation.on, [...occupied, ...placements]);
        const first = placements[0]!;
        size.set(relation.part, first.size);
        for (const axis of AXES) {
          setAxis(relation.part, axis, first.center[AXES.indexOf(axis)]!, "scatter");
        }
        scatterPlans.push({ relation, rest: placements.slice(1) });
        return true;
      }

      default:
        return true;
    }
  };

  /**
   * Lateral position for a part that rests on something and has been told
   * nothing else about where it sits.
   *
   * `sits_on` resolves Z alone, which is right — resting says nothing about
   * position along the surface. But a centred stack is the overwhelmingly
   * common case, and expressing it meant an `align` beside every `sits_on`.
   * Omitting one produced a cascade rather than an error: the unplaced part
   * left everything above it unplaced too, so a single missing relation could
   * report thirty failures and read as a broken scene.
   *
   * Run only when the fixpoint has STALLED, which is what makes it safe. Every
   * explicit relation that can resolve has already resolved, so this can only
   * touch an axis no relation constrains — an axis that would otherwise be
   * null, on a part the compiler is about to reject. A scene that compiles
   * today cannot reach here with anything left to inherit, and an explicit
   * relation wins by having run first rather than by outranking anything.
   */
  const inheritFromSupport = (): boolean => {
    let inherited = false;
    for (const relation of spec.relations) {
      const support =
        relation.type === "sits_on" ? relation.on
        : relation.type === "above" ? relation.over
        : null;
      if (support === null) continue;
      const c = center.get(relation.part);
      const s = center.get(support);
      if (!c || !s) continue;
      // Lateral only: inheriting Z would undo the offset `sits_on` computes,
      // and `above` leaves its gap deliberately.
      for (const axis of ["x", "y"] as const) {
        const ai = AXES.indexOf(axis);
        if (c[ai] !== null || s[ai] === null) continue;
        c[ai] = s[ai];
        inherited = true;
      }
    }
    return inherited;
  };

  /** Axes whose extent a span has already claimed, per part. */
  const spannedAxes = new Set<string>();
  /** Instances 2..N of each applied scatter, minted after the fixpoint. */
  const scatterPlans: Array<{
    relation: Extract<Relation, { type: "scatter" }>;
    rest: Array<{ center: Vec3; size: Vec3 }>;
  }> = [];
  /** Everything scatters have placed per support, so later scatters on the
   *  same support treat earlier ones as obstacles. */
  const scatterOccupancy = new Map<string, Array<{ center: Vec3; size: Vec3 }>>();
  /** Rings whose base landed, with the hub centre they were measured from. */
  const aroundPlans: Array<{
    relation: Extract<Relation, { type: "around" }>;
    hub: Vec3;
  }> = [];

  // Repeats expand a SOLVED part into instances, so they run after the
  // fixpoint rather than inside it — an instance's position is derived
  // arithmetic, not a constraint that could unblock other relations.
  const repeats = spec.relations.filter(
    (r): r is Extract<Relation, { type: "repeat" }> => r.type === "repeat",
  );

  // Fixpoint: keep sweeping while any relation newly applies. Bounded by the
  // relation count because each pass must retire at least one to continue.
  const pending = new Set<number>(
    spec.relations.map((_, index) => index).filter((index) => spec.relations[index]!.type !== "repeat"),
  );
  // Bounded by the work available, NOT by `pending.size > 0`: a relation
  // can apply successfully and still leave an axis unset — `sits_on`
  // resolves Z alone — so the queue empties while the scene is not solved.
  // Exiting on an empty queue skipped support inheritance entirely for the
  // commonest shape there is, one part resting on one placed part, and left
  // it reporting no placement on x/y. The loop ends when NEITHER mechanism
  // can make progress, which is what a fixpoint means.
  const maxPasses = spec.relations.length + spec.parts.length + 2;
  for (let pass = 0; pass < maxPasses; pass++) {
    let progressed = false;
    for (const index of [...pending]) {
      if (apply(spec.relations[index]!)) {
        pending.delete(index);
        progressed = true;
      }
    }
    // A stalled fixpoint is the only moment support inheritance may act:
    // everything explicit has had its chance, so what remains unset is
    // what nothing was said about. If it fills anything, the loop
    // continues and the newly-placed support lets its dependents solve.
    if (!progressed && !inheritFromSupport()) break;
  }

  // Post-fixpoint span defaulting (fable-5 Mechanism 3): `span from A to B` IS
  // the segment between the endpoints, and a segment has a transverse position —
  // the endpoint midpoint. Run AFTER the fixpoint settles, so any explicit
  // relation has already pinned its axis and wins by construction (not by a
  // priority flag): a still-null transverse axis of a spanned part takes the
  // midpoint of its two endpoints on that axis. This is what lets an avatar
  // limb be one `span shoulder→hand`, not span + two aligns.
  for (const relation of spec.relations) {
    if (relation.type !== "span") continue;
    const c = center.get(relation.part);
    const fromC = center.get(relation.from);
    const toC = center.get(relation.to);
    if (!c || !fromC || !toC) continue;
    for (const axis of AXES) {
      if (axis === relation.axis) continue;
      const ai = AXES.indexOf(axis);
      if (c[ai] !== null || fromC[ai] === null || toC[ai] === null) continue;
      c[ai] = (fromC[ai]! + toC[ai]!) / 2;
    }
  }

  // The parts a relation reads from before it can place its own part — the
  // same set `apply()` above checks `solvedAxes()` on. Repeat never appears
  // here: it is excluded from `pending` from the start.
  const relationRefs = (relation: Relation): string[] => {
    switch (relation.type) {
      case "sits_on": return [relation.on];
      case "above": return [relation.over];
      case "align": return [relation.to];
      case "inset_from": return [relation.from];
      case "span": return [relation.from, relation.to];
      case "scatter": return [relation.on];
      case "around": return [relation.center];
      default: return [];
    }
  };

  // For every part a still-pending relation would place, what unresolved
  // reference(s) it is blocked on — real state read off `center`/`solvedAxes`,
  // not a guess. Used to walk the actual blocking chain below.
  const blockedOn = new Map<string, string[]>();
  for (const index of pending) {
    const relation = spec.relations[index]!;
    blockedOn.set(relation.part, relationRefs(relation).filter((ref) => !solvedAxes(ref)));
  }

  // Name the specific reference a relation is waiting on, walking the chain
  // until it bottoms out at a part nothing pending places (never/partially
  // placed) or loops back on itself (a cycle). Bounded by the part count:
  // a chain that runs longer than that has necessarily repeated a part.
  const explainBlocker = (relation: Relation): string => {
    const refs = relationRefs(relation).filter((ref) => !solvedAxes(ref));
    if (refs.length === 0) {
      return "its reference is unplaced or the graph has a cycle";
    }
    const chain = [relation.part];
    const seen = new Set(chain);
    let current = refs[0]!;
    for (let hop = 0; hop <= spec.parts.length; hop++) {
      if (seen.has(current)) {
        return `cycle: ${[...chain, current].join(" → ")}`;
      }
      chain.push(current);
      seen.add(current);
      const next = blockedOn.get(current);
      if (!next || next.length === 0) {
        const c = center.get(current);
        const partial = c !== undefined && c.some((v) => v !== null);
        return partial
          ? `${chain.join(" → ")} — '${current}' is only partially placed`
          : `${chain.join(" → ")} — '${current}' was never placed`;
      }
      current = next[0]!;
    }
    return `${chain.join(" → ")} — its reference is unplaced or the graph has a cycle`;
  };

  for (const index of pending) {
    const relation = spec.relations[index]!;
    diagnostics.push({
      code: "SOLVE-UNRESOLVED",
      message: `relation '${relation.type}' on '${relation.part}' never resolved — ${explainBlocker(relation)}`,
      part: relation.part,
    });
  }

  const solved: SolvedPart[] = [];
  for (const part of spec.parts) {
    const c = center.get(part.id)!;
    if (c.some((v) => v === null)) {
      diagnostics.push({
        code: "SOLVE-UNRESOLVED",
        message: `'${part.id}' has no placement on ${AXES.filter((a) => c[AXES.indexOf(a)] === null).join("/")} — anchor it with a relation`,
        part: part.id,
      });
      continue;
    }
    solved.push({
      id: part.id,
      size: size.get(part.id)!,
      center: c as Vec3,
      shape: part.shape ?? "box",
      axis: part.axis ?? "z",
      flip: part.flip === true,
      // Shape parameters ride through untouched, exactly like role/spin/bob:
      // they say what fills the box, never where the box goes, so the
      // placement fixpoint above neither reads nor needs them.
      ...(part.tip !== undefined ? { tip: part.tip } : {}),
      ...(part.thickness !== undefined ? { thickness: part.thickness } : {}),
      ...(part.file !== undefined ? { file: part.file } : {}),
      ...(part.script !== undefined ? { script: part.script } : {}),
      ...(part.material !== undefined ? { material: part.material } : {}),
      ...(part.spin !== undefined ? { spin: part.spin } : {}),
      ...(part.bob !== undefined ? { bob: part.bob } : {}),
      // Both halves of a rotated box travel: `size` above is the world box
      // every consumer means, `localSize` is the box the emitter builds the
      // primitive at. Absent when nothing is rotated, so an unrotated scene
      // solves to exactly the object it always did.
      // `rotationOf`, not `part.rotate`: an `around { orient }` base is built
      // turned to its start angle, and the box the solver reserved above was
      // already measured with that rotation in it.
      ...(rotationOf(part) !== undefined
        ? { localSize: [...part.size] as Vec3, rotate: rotationOf(part)! }
        : {}),
      ...(part.role !== undefined ? { role: part.role } : {}),
      ...(restsOn.has(part.id) ? { restsOn: restsOn.get(part.id)! } : {}),
    });
  }

  expandRepeats(solved, repeats, new Set(parts.keys()), diagnostics, snap);
  expandArounds(solved, aroundPlans, new Set(parts.keys()), diagnostics, snap);

  // Scatter instances 2..N. The base already solved through the fixpoint;
  // clones inherit everything but centre and (jittered) size, and record
  // their base for provenance exactly like repeat instances.
  for (const plan of scatterPlans) {
    const base = solved.find((p) => p.id === plan.relation.part);
    if (!base) continue;
    const declared = new Set(parts.keys());
    // The scene-wide ceiling applies to every path that MINTS parts, not just
    // to repeat. It was checked before repeat expansion and nowhere else, so a
    // scene could pass the documented limit through scatter without a word —
    // and the limit exists precisely because a runaway generator is a bug, not
    // a world. Reported once per relation rather than per instance: the author
    // made one decision.
    const room = MAX_PARTS - solved.length;
    if (plan.rest.length > room) {
      diagnostics.push({
        code: "SOLVE-LIMIT",
        message: `scatter on '${plan.relation.part}' would grow the scene to ${solved.length + plan.rest.length} parts — the ceiling is ${MAX_PARTS}`,
        part: plan.relation.part,
      });
      continue;
    }
    plan.rest.forEach((placement, index) => {
      const id = `${plan.relation.part}_${index + 2}`;
      if (declared.has(id) || solved.some((p) => p.id === id)) {
        diagnostics.push({
          code: "SOLVE-CONFLICT",
          message: `scatter on '${plan.relation.part}' would mint '${id}', which already exists — rename the authored part or the base`,
          part: id,
        });
        return;
      }
      // sizeJitter scales the WORLD box uniformly; the local box has to
      // follow it by the same factor or the emitter would build every
      // scattered rotated instance at the un-jittered size while the solver
      // reserved the jittered one. Uniform scale commutes with rotation, so
      // one ratio is the whole correction.
      const scale = base.size[0] !== 0 ? placement.size[0]! / base.size[0]! : 1;
      solved.push({
        ...base,
        id,
        center: placement.center,
        size: placement.size,
        ...(base.localSize
          ? { localSize: base.localSize.map((v) => v * scale) as Vec3 }
          : {}),
        from: plan.relation.part,
      });
    });
  }

  // Sorted by id so a solved scene is byte-stable regardless of authoring
  // order — the property the stage cache and the compile diff both rely on.
  solved.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  reportGeneratedIntersections(solved, diagnostics);
  return { parts: solved, diagnostics };
}

/**
 * Report instances the SOLVER placed that landed inside each other.
 *
 * The language's promise is that its output is sound by construction — every
 * contact floored a millimetre off flush so z-fighting is structurally
 * impossible. That promise held for the offsets and not for the placements: a
 * `repeat every 0.5` on a 1m box shipped three boxes overlapping by half a
 * metre each, `ok: true`, diagnostics empty. The coplanar rule stayed silent
 * because interpenetrating faces are not coplanar, and no rule owned "these
 * are simply inside each other".
 *
 * Scope is deliberate: only parts the solver GENERATED (repeat clones,
 * scatter samples) are compared. Authored interpenetration is a technique —
 * overlapping a junction by a pixel is exactly how a careful modeller avoids
 * z-fighting, and flagging it would fire on every well-built blocky asset. But
 * a relation that mints N instances is ONE authored decision, and nobody
 * decides to have their own instances occupy the same space; they would have
 * authored one larger shape. So the solver owns this, and says so.
 *
 * Reported once per pair of families, carrying the deepest overlap.
 */
function reportGeneratedIntersections(parts: SolvedPart[], diagnostics: SolveDiagnostic[]): void {
  const generated = parts.filter((p) => p.from !== undefined);
  if (generated.length < 2) return;
  const worst = new Map<string, { a: string; b: string; depth: number; axis: Axis }>();

  for (let i = 0; i < generated.length; i++) {
    for (let j = i + 1; j < generated.length; j++) {
      const a = generated[i]!;
      const b = generated[j]!;
      // Overlap depth is the smallest per-axis penetration: boxes intersect
      // only when every axis overlaps, and the shallowest axis is how far one
      // would have to move to separate them.
      let depth = Infinity;
      let axis: Axis = "x";
      for (let k = 0; k < 3; k++) {
        const penetration =
          Math.min(a.center[k]! + a.size[k]! / 2, b.center[k]! + b.size[k]! / 2) -
          Math.max(a.center[k]! - a.size[k]! / 2, b.center[k]! - b.size[k]! / 2);
        if (penetration < depth) {
          depth = penetration;
          axis = AXES[k]!;
        }
      }
      // The contact floor is the boundary between "touching" and "inside".
      if (depth <= MIN_CONTACT) continue;
      // Two instances that REST ON THE SAME SUPPORT legitimately share its
      // top plane: each is embedded by MIN_CONTACT on z (the solver's own
      // floor), so their boxes interpenetrate by up to 2*MIN_CONTACT there —
      // two lamps on one pylon, four caps on one post. That embed is the
      // compiler's own arithmetic, not an authored mistake, and reporting it
      // trained agents to float parts with `above` instead of seating them.
      // The exemption is exact: same support, shallowest axis is z, depth no
      // deeper than the two deliberate embeds. Anything more is real.
      const sharedSupport =
        a.restsOn !== undefined && a.restsOn === b.restsOn;
      if (sharedSupport && axis === "z" && depth <= 2 * MIN_CONTACT + 1e-9) continue;
      const fa = a.from ?? a.id;
      const fb = b.from ?? b.id;
      const key = fa < fb ? `${fa}\u0000${fb}` : `${fb}\u0000${fa}`;
      const seen = worst.get(key);
      if (!seen || depth > seen.depth) worst.set(key, { a: a.id, b: b.id, depth, axis });
    }
  }

  for (const [key, hit] of [...worst].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const [fa, fb] = key.split("\u0000") as [string, string];
    const same = fa === fb;
    diagnostics.push({
      code: "SOLVE-INTERSECTION",
      message: same
        ? `'${fa}' instances overlap each other by ${hit.depth.toFixed(4)}m on ${hit.axis} ('${hit.a}' into '${hit.b}') — the pitch is smaller than the part`
        : `generated instances of '${fa}' and '${fb}' overlap by ${hit.depth.toFixed(4)}m on ${hit.axis} ('${hit.a}' into '${hit.b}')`,
      part: fa,
    });
  }
}

/**
 * Expand repeat relations over the solved parts, in authoring order.
 *
 * Each repeat applies to the named base part AND every instance an earlier
 * repeat minted from it, which is what makes two repeats on the same part a
 * grid rather than a surprise: `repeat along x` then `repeat along y` on one
 * post produces the colonnade the author was picturing. Instance ids number
 * sequentially from the base (`post`, `post_2`, ...), and every instance
 * records the base id in `from` so provenance and issue attribution point
 * at the one line the author actually wrote.
 *
 * The pitch is floored away from the part's own extent along the repeat
 * axis: a pitch exactly equal to the extent lands adjacent faces flush,
 * which is the z-fighting configuration every other relation is designed to
 * make impossible. The floor is reported, never silent.
 */
function expandRepeats(
  solved: SolvedPart[],
  repeats: Array<Extract<Relation, { type: "repeat" }>>,
  declaredIds: Set<string>,
  diagnostics: SolveDiagnostic[],
  /** Grid quantizer for solver-invented positions (identity off-grid). */
  snap: (v: number) => number,
): void {
  const byId = new Map(solved.map((part) => [part.id, part]));
  const counters = new Map<string, number>();

  for (const repeat of repeats) {
    if (!declaredIds.has(repeat.part)) {
      diagnostics.push({
        code: "SOLVE-UNKNOWN-PART",
        message: `relation 'repeat' references unknown part '${repeat.part}'`,
        part: repeat.part,
      });
      continue;
    }
    const base = byId.get(repeat.part);
    if (!base) {
      // The base never solved; its own SOLVE-UNRESOLVED already explains why.
      continue;
    }
    if (repeat.count > MAX_REPEAT_COUNT) {
      diagnostics.push({
        code: "SOLVE-LIMIT",
        message: `repeat on '${repeat.part}' asks for ${repeat.count} instances — the ceiling is ${MAX_REPEAT_COUNT}`,
        part: repeat.part,
      });
      continue;
    }

    const axisIndex = AXES.indexOf(repeat.along);
    const extent = base.size[axisIndex]!;
    let pitch = repeat.every;
    if (Math.abs(pitch - extent) < MIN_CONTACT) {
      pitch = extent + MIN_CONTACT;
      diagnostics.push({
        code: "SOLVE-EPSILON-FLOOR",
        message: `repeat pitch ${repeat.every} on '${repeat.part}' equals the part's ${repeat.along} extent — adjacent faces would be flush and z-fight; the pitch was raised to ${pitch}`,
        part: repeat.part,
      });
    }

    const family = solved
      .filter((part) => part.id === repeat.part || part.from === repeat.part)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const projected = solved.length + family.length * (repeat.count - 1);
    if (projected > MAX_PARTS) {
      diagnostics.push({
        code: "SOLVE-LIMIT",
        message: `repeat on '${repeat.part}' would grow the scene to ${projected} parts — the ceiling is ${MAX_PARTS}`,
        part: repeat.part,
      });
      continue;
    }

    for (const instance of family) {
      for (let step = 1; step < repeat.count; step++) {
        const next = (counters.get(repeat.part) ?? 1) + 1;
        counters.set(repeat.part, next);
        const id = `${repeat.part}_${next}`;
        if (declaredIds.has(id) || byId.has(id)) {
          diagnostics.push({
            code: "SOLVE-CONFLICT",
            message: `repeat on '${repeat.part}' would mint '${id}', which already exists — rename the authored part or the base`,
            part: id,
          });
          continue;
        }
        const center = [...instance.center] as Vec3;
        // Snap the emergent position onto the grid (identity off-grid). Each
        // instance lands on-grid by construction; an off-grid authored pitch
        // is the author's, and its consequence (uneven snapped spacing) is
        // theirs, but the game-breaking off-grid vertex never ships.
        center[axisIndex] = snap(center[axisIndex]! + pitch * step);
        // Two repeats on the SAME axis can land an instance exactly on a
        // sibling — total coincidence, worse than any coplanar face, and
        // invisible to the face check (adversarial review). Refuse it.
        const coincident = solved.find(
          (p) =>
            (p.id === repeat.part || p.from === repeat.part) &&
            Math.abs(p.center[0] - center[0]) < 1e-9 &&
            Math.abs(p.center[1] - center[1]) < 1e-9 &&
            Math.abs(p.center[2] - center[2]) < 1e-9,
        );
        if (coincident) {
          diagnostics.push({
            code: "SOLVE-CONFLICT",
            message: `repeat on '${repeat.part}' would place an instance exactly on '${coincident.id}' — two repeats along the same axis overlap; adjust counts or pitches`,
            part: repeat.part,
          });
          continue;
        }
        const clone: SolvedPart = {
          ...instance,
          id,
          center,
          size: [...instance.size] as Vec3,
          // Clones inherit the rotation: their world boxes are copies, so a
          // repeat of a canted part is a row of identically canted parts.
          // Copied, not aliased, for the same reason `size` is.
          ...(instance.localSize ? { localSize: [...instance.localSize] as Vec3 } : {}),
          from: repeat.part,
        };
        solved.push(clone);
        byId.set(id, clone);
      }
    }
  }
}

function faceAxis(face: Face): Axis {
  return face[0] as Axis;
}

/**
 * The two axis indices spanning the plane perpendicular to a normal axis, in
 * cyclic order — so the first carries the cosine and the second the sine, and
 * a positive angle turns the same way (x toward y) on every axis.
 *
 * The cyclic order is the whole content of this function: pick the pair by
 * "the two that aren't the normal" and z gives (x, y) while y gives (x, z),
 * which is a mirrored circle — a ring that winds backwards on one axis and
 * forwards on the others, with nothing to tell you.
 */
function planeAxes(normal: Axis): [number, number] {
  const k = AXES.indexOf(normal);
  return [(k + 1) % 3, (k + 2) % 3];
}

/** A point on the ring: the hub's centre, displaced in the circle's plane. */
function ringPosition(hub: Vec3, u: number, v: number, radius: number, deg: number): Vec3 {
  const theta = (deg * Math.PI) / 180;
  const out = [...hub] as Vec3;
  out[u] = hub[u]! + radius * Math.cos(theta);
  out[v] = hub[v]! + radius * Math.sin(theta);
  return out;
}

/**
 * Expand `around` relations into the rest of their ring.
 *
 * The base part is already instance 0 — the fixpoint placed it at `startDeg`
 * — so this mints instances 2..N at the remaining angles, and everything the
 * language guarantees for `repeat` clones is guaranteed here by being the
 * same code shape: ids number sequentially from the base, `from` records the
 * authored part so provenance points at the line that exists, an id that
 * collides with an authored part is refused, the part ceiling is enforced
 * before anything is minted, and two clones landing on the same point (which
 * a grid snap can cause on a small radius) is refused rather than shipped.
 *
 * Only the coordinates in the circle's PLANE come from the ring. The
 * coordinate along the normal is copied from the base, which is what makes
 * `sits_on floor` + `around hub` a ring standing on the floor: the base
 * solved its own resting height through its own relations, and every clone
 * inherits it exactly as a repeat clone inherits everything but its pitch.
 */
function expandArounds(
  solved: SolvedPart[],
  plans: Array<{ relation: Extract<Relation, { type: "around" }>; hub: Vec3 }>,
  declaredIds: Set<string>,
  diagnostics: SolveDiagnostic[],
  /** Grid quantizer for solver-invented positions (identity off-grid). */
  snap: (v: number) => number,
): void {
  const byId = new Map(solved.map((part) => [part.id, part]));

  for (const { relation, hub } of plans) {
    const base = byId.get(relation.part);
    // The base never solved; its own SOLVE-UNRESOLVED already explains why.
    if (!base) continue;
    if (relation.count > MAX_REPEAT_COUNT) {
      diagnostics.push({
        code: "SOLVE-LIMIT",
        message: `around on '${relation.part}' asks for ${relation.count} instances — the ceiling is ${MAX_REPEAT_COUNT}`,
        part: relation.part,
      });
      continue;
    }
    const minted = relation.count - 1;
    if (solved.length + minted > MAX_PARTS) {
      diagnostics.push({
        code: "SOLVE-LIMIT",
        message: `around on '${relation.part}' would grow the scene to ${solved.length + minted} parts — the ceiling is ${MAX_PARTS}`,
        part: relation.part,
      });
      continue;
    }

    const [u, v] = planeAxes(relation.axis ?? "z");
    const start = relation.startDeg ?? 0;
    const step = 360 / relation.count;
    const local = base.localSize ?? base.size;
    let counter = 1;

    for (let index = 1; index < relation.count; index++) {
      counter += 1;
      const id = `${relation.part}_${counter}`;
      if (declaredIds.has(id) || byId.has(id)) {
        diagnostics.push({
          code: "SOLVE-CONFLICT",
          message: `around on '${relation.part}' would mint '${id}', which already exists — rename the authored part or the base`,
          part: id,
        });
        continue;
      }
      const point = ringPosition(hub, u, v, relation.radius, start + index * step);
      const center = [...base.center] as Vec3;
      center[u] = snap(point[u]!);
      center[v] = snap(point[v]!);
      const coincident = solved.find(
        (p) =>
          (p.id === relation.part || p.from === relation.part) &&
          Math.abs(p.center[0] - center[0]) < 1e-9 &&
          Math.abs(p.center[1] - center[1]) < 1e-9 &&
          Math.abs(p.center[2] - center[2]) < 1e-9,
      );
      if (coincident) {
        diagnostics.push({
          code: "SOLVE-CONFLICT",
          message: `around on '${relation.part}' would place an instance exactly on '${coincident.id}' — the radius is too small for ${relation.count} distinct positions; widen the ring or lower the count`,
          part: relation.part,
        });
        continue;
      }
      // Orientation is the ONE thing a ring clone does not simply inherit:
      // its angle is its own. The world box follows the same predicate every
      // rotated part uses, so a turned bar reserves the space it occupies.
      const rotate =
        relation.orient === true
          ? (() => {
              const deg = normalizeTurn((base.rotate?.deg ?? 0) + index * step);
              return deg === 0
                ? undefined
                : { axis: relation.axis ?? "z", deg };
            })()
          : base.rotate;
      const clone: SolvedPart = {
        ...base,
        id,
        center,
        size: rotate ? rotatedBoxSize(local, rotate) : ([...local] as Vec3),
        from: relation.part,
      };
      // Both halves of the rotated box travel together or neither does — a
      // clone that kept the base's localSize with no rotation would be built
      // at the wrong box.
      if (rotate) {
        clone.localSize = [...local] as Vec3;
        clone.rotate = rotate;
      } else {
        delete clone.localSize;
        delete clone.rotate;
      }
      solved.push(clone);
      byId.set(id, clone);
    }
  }
}

/**
 * Sample a scatter relation's placements: `count` boxes on the support's
 * top face, none intersecting, none flush, every one fully on the support.
 *
 * Deterministic by construction: the stream is addressed by
 * (seed, part, on) — see rng.ts — so the layout is a pure function of the
 * relation itself. Adding parts, relations, or other scatters cannot move
 * a single rock.
 *
 * Separation is judged box-to-box: two instances must have at least
 * `minGap` of clear air on some horizontal axis, which both prevents
 * intersection and keeps their identical-height bottom faces from ever
 * overlapping — scattered instances cannot z-fight each other or float
 * into each other by construction, the same guarantee every contact
 * relation carries.
 *
 * Returns null after a loud diagnostic when the region cannot fit the
 * count: a scatter that silently placed 9 of 12 would be a claim
 * (`parts: 13`) waiting to fail with a confusing number, so the shortfall
 * is reported where it happens.
 */
function sampleScatter(
  relation: Extract<Relation, { type: "scatter" }>,
  baseSize: Vec3,
  support: { x: { min: number; max: number }; y: { min: number; max: number }; z: { min: number; max: number } },
  embed: number,
  obstacles: Array<{ center: Vec3; size: Vec3 }>,
  diagnostics: SolveDiagnostic[],
  /** Grid quantizer for solver-invented positions (identity off-grid). */
  snap: (v: number) => number,
): Array<{ center: Vec3; size: Vec3 }> | null {
  if (relation.count > MAX_REPEAT_COUNT) {
    diagnostics.push({
      code: "SOLVE-LIMIT",
      message: `scatter on '${relation.part}' asks for ${relation.count} instances — the ceiling is ${MAX_REPEAT_COUNT}`,
      part: relation.part,
    });
    return null;
  }
  const rng = new Rng(relation.seed ?? 0).at(`scatter/${relation.part}/${relation.on}`);
  const jitter = relation.sizeJitter ?? 0;
  // Same floor and the same diagnostic channel as every other contact
  // offset the solver owns (see `contact()` above): a requested minGap
  // below the 1mm z-fight floor used to be raised silently, which meant
  // `minGap: 0` looked honoured in the spec but was never the number
  // that actually separated the instances.
  const requestedMinGap = relation.minGap ?? MIN_CONTACT;
  let minGap = requestedMinGap;
  if (minGap < MIN_CONTACT) {
    diagnostics.push({
      code: "SOLVE-EPSILON-FLOOR",
      message: `minGap ${requestedMinGap} on '${relation.part}' is below the ${MIN_CONTACT}m contact floor and was raised; coincident instances would z-fight`,
      part: relation.part,
    });
    minGap = MIN_CONTACT;
  }
  const ATTEMPTS = 200;

  const placed: Array<{ center: Vec3; size: Vec3 }> = [];
  for (let i = 0; i < relation.count; i++) {
    const scale = jitter > 0 ? 1 + jitter * (2 * rng.next() - 1) : 1;
    const size: Vec3 = [baseSize[0] * scale, baseSize[1] * scale, baseSize[2] * scale];
    const hx = size[0] / 2;
    const hy = size[1] / 2;
    const loX = support.x.min + hx;
    const hiX = support.x.max - hx;
    const loY = support.y.min + hy;
    const hiY = support.y.max - hy;
    if (loX > hiX || loY > hiY) {
      diagnostics.push({
        code: "SOLVE-LIMIT",
        message: `scatter on '${relation.part}': the part does not fit on '${relation.on}' — the support is smaller than the part`,
        part: relation.part,
      });
      return null;
    }
    // The resting height snaps to the grid too, so a voxel sits flush on a
    // grid-aligned support instead of the sub-grid contact embed leaving it
    // off-grid (flush is fine — the z-fighting check is direction-aware).
    const z = snap(support.z.max - embed + size[2] / 2);
    let found = false;
    for (let attempt = 0; attempt < ATTEMPTS && !found; attempt++) {
      // Snap the sampled position onto the grid. A snap can push a candidate
      // outside the support margin; reject it and let another attempt land in
      // range, so every placed instance is BOTH on-grid and on-support.
      const x = snap(rng.uniform(loX, hiX));
      const y = snap(rng.uniform(loY, hiY));
      if (x < loX || x > hiX || y < loY || y > hiY) continue;
      const clearOf = (other: { center: Vec3; size: Vec3 }) => {
        const ox = other.size[0] / 2;
        const oy = other.size[1] / 2;
        return (
          Math.abs(x - other.center[0]) >= hx + ox + minGap ||
          Math.abs(y - other.center[1]) >= hy + oy + minGap
        );
      };
      const clear = placed.every(clearOf) && obstacles.every(clearOf);
      if (clear) {
        placed.push({ center: [x, y, z], size });
        found = true;
      }
    }
    if (!found) {
      diagnostics.push({
        code: "SOLVE-LIMIT",
        message: `scatter on '${relation.part}': placed ${placed.length} of ${relation.count} before running out of room on '${relation.on}' — enlarge the support, shrink the part or minGap, or lower the count`,
        part: relation.part,
      });
      return null;
    }
  }
  return placed;
}

/**
 * Find pairs of parts whose parallel faces sit at the same coordinate while
 * overlapping on the other two axes — the exact configuration that z-fights.
 *
 * This exists to *prove* the solver's guarantee rather than to police
 * authors: a scene built entirely from relations should return an empty list
 * every time, and the test suite asserts it. It is a property check on the
 * solver, not a lint rule the user has to satisfy.
 */
export function findCoplanarFaces(
  scene: SolvedScene,
  tolerance = MIN_CONTACT / 2,
): Array<{ a: string; b: string; axis: Axis }> {
  const hits: Array<{ a: string; b: string; axis: Axis }> = [];
  const span = (part: SolvedPart, axis: Axis) => {
    const index = AXES.indexOf(axis);
    const half = part.size[index]! / 2;
    return { min: part.center[index]! - half, max: part.center[index]! + half };
  };

  for (let i = 0; i < scene.parts.length; i++) {
    for (let j = i + 1; j < scene.parts.length; j++) {
      const a = scene.parts[i]!;
      const b = scene.parts[j]!;
      for (const axis of AXES) {
        const others = AXES.filter((other) => other !== axis);
        // Only a genuine shared surface counts: the faces must be coincident
        // AND the parts must actually overlap across the other two axes.
        const overlaps = others.every((other) => {
          const sa = span(a, other);
          const sb = span(b, other);
          return Math.min(sa.max, sb.max) - Math.max(sa.min, sb.min) > tolerance;
        });
        if (!overlaps) continue;
        const sa = span(a, axis);
        const sb = span(b, axis);
        const coincident =
          Math.abs(sa.max - sb.min) < tolerance ||
          Math.abs(sb.max - sa.min) < tolerance ||
          Math.abs(sa.max - sb.max) < tolerance ||
          Math.abs(sa.min - sb.min) < tolerance;
        if (coincident) hits.push({ a: a.id, b: b.id, axis });
      }
    }
  }
  return hits;
}
