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
  for (const part of spec.parts) {
    center.set(part.id, [null, null, null]);
    size.set(part.id, [...part.size] as Vec3);
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
  for (let pass = 0; pass <= spec.relations.length && pending.size > 0; pass++) {
    let progressed = false;
    for (const index of [...pending]) {
      if (apply(spec.relations[index]!)) {
        pending.delete(index);
        progressed = true;
      }
    }
    if (!progressed) break;
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

  for (const index of pending) {
    const relation = spec.relations[index]!;
    diagnostics.push({
      code: "SOLVE-UNRESOLVED",
      message: `relation '${relation.type}' on '${"part" in relation ? relation.part : "?"}' never resolved — its reference is unplaced or the graph has a cycle`,
      part: "part" in relation ? relation.part : undefined,
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
      ...(part.file !== undefined ? { file: part.file } : {}),
      ...(part.material !== undefined ? { material: part.material } : {}),
      ...(part.spin !== undefined ? { spin: part.spin } : {}),
      ...(part.bob !== undefined ? { bob: part.bob } : {}),
      ...(part.role !== undefined ? { role: part.role } : {}),
    });
  }

  expandRepeats(solved, repeats, new Set(parts.keys()), diagnostics, snap);

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
      solved.push({
        ...base,
        id,
        center: placement.center,
        size: placement.size,
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
  const minGap = Math.max(relation.minGap ?? MIN_CONTACT, MIN_CONTACT);
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
