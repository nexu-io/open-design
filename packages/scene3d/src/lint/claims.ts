import { Census, Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import type { ClaimsSpec, SolvedPart } from "../solve/types.js";
import { isExempt } from "./exempt.js";
import { groundVerdict, groundedSupport, nearestSupportBelow } from "../solve/contact.js";
import { sweptSceneFacts, type SweptSceneFacts } from "../solve/sweep.js";
import { triangleTotals, trianglesAreExact } from "./triangles.js";

/**
 * Adjudicate a spec's `claims` block against the measured census.
 *
 * The Kiln inversion, adopted whole: the author (a model, usually) is never
 * the authority on whether the build succeeded — it will claim "7 parts
 * within 20k triangles, grounded" having produced something else, and the
 * wrongness must surface immediately and specifically. So every claim is
 * checked against what Blender actually measured, never against the spec
 * that made the claim, and a failed claim is a compile ERROR: the artifact
 * is not what it says it is.
 *
 * The other half of the discipline: a claim the census cannot adjudicate is
 * reported as UNCHECKED, never silently passed. A check that silently did
 * not run is worse than a check that does not exist.
 *
 * Spatial claims are adjudicated across TIME, not at one pose: when the
 * census carries `animation.animatedBounds` the envelope below is the union
 * of rest pose and the sampled frame range (evaluated, deformed geometry —
 * an imported walk cycle counts, not just compiler-owned spin/bob). A
 * sampled breach is a hard failure naming the frame; a STRIDED sample that
 * passed earns W-701 naming the stride, because the frames between samples
 * were never visited and "unchecked is not passed" applies to time too.
 *
 * The INTERVAL CALCULUS over compiler-owned motion (spin/bob/screw), the
 * layer that closed the false-pass a field report proved: integer-frame
 * samples of a fast spin never land on the widest angle, so the sampled
 * envelope UNDER-measures — a 1.4m plate at 6 frames/rev samples 1.9124m of
 * a true 1.9799m sweep and a 1.95m footprint claim "held". Samples are only
 * ever LOWER bounds; the analytic swept envelope (solve/sweep.ts) is an
 * UPPER bound, exact for boxes and pure translations. So:
 *
 *   sampled breach            → proven FAILURE (a real visited pose)
 *   exact swept-box breach    → proven FAILURE (closed form, no sample)
 *   swept envelope within     → proven PASS over ALL time (no stride caveat)
 *   conservative bound over   → honestly UNPROVEN (W-701, says so)
 *
 * The verdict is owned by whichever oracle can PROVE its answer, never by
 * the weaker one printed more politely.
 */
export function lintClaims(
  claims: ClaimsSpec,
  census: Census | undefined,
  issues: Issue[],
  options: {
    /**
     * Forgiven sink below z=0 for the `grounded` claim, in metres. Comes
     * from the contract's grounding convention — contact embeds
     * legitimately dip a part below its support by design, and how much is
     * the project's call, not this module's.
     */
    groundTolerance?: number;
    /**
     * Parts the grounding convention exempts (bedded rocks, mounts, skyboxes).
     * lintWorld already skips these; without the same list here a deliberately
     * bedded, exempted part would still fail a scene-level `grounded` claim as
     * a hard error — the two grounding authorities disagreeing about the same
     * part. Matched with the shared segment-boundary predicate.
     */
    groundExempt?: readonly string[];
    /**
     * The solved scene, when the source is a spec. Powers the analytic layer:
     * swept envelopes for the interval calculus, and it works with NO census
     * at all — a provable breach is a provable breach on the fast gear too.
     */
    solved?: ReadonlyArray<SolvedPart>;
    /**
     * Parts the AUTHOR declared as floating — placed by an `above` relation,
     * the language's way of saying "this hovers on purpose". The two-sided
     * `grounded` claim treats them (and anything hanging from them) as
     * supported: a declared float is a composition, not a defect.
     */
    declaredFloating?: readonly string[];
  } = {},
): void {
  const fail = (claim: string, message: string, detail: Record<string, unknown>, hint?: string): void => {
    issues.push({
      code: ISSUE_CODES.CLAIM_FAILED,
      severity: "error",
      message: `claim ${claim} failed: ${message}`,
      hint: hint ?? "the built scene is not what the spec claims — fix the scene or fix the claim",
      // Per-part claim failures name the part, so provenance attribution
      // points the reader at the line that authored it.
      ...(typeof detail.target === "string" ? { target: detail.target } : {}),
      detail: { claim, ...detail },
    });
  };
  /**
   * A claim the adjudicator could not judge AT ALL. `detail.unadjudicated`
   * is the machine-readable bit the claims ledger counts, so the report can
   * print `0/3 checked` instead of the `3/3 held` that used to appear on
   * compiles where the build never ran — the one number a reader scans
   * must never lie loudest exactly when nothing was measured.
   */
  const unchecked = (claim: string, reason: string): void => {
    issues.push({
      code: ISSUE_CODES.CLAIM_UNCHECKED,
      severity: "warning",
      message: `claim ${claim} could not be adjudicated: ${reason} — unchecked is not passed`,
      detail: { claim, unadjudicated: true },
    });
  };
  /** An adjudicated claim that carries an honest caveat (stride gaps, a
   *  conservative bound). Checked, not unchecked — the ledger counts it. */
  const caveat = (claim: string, message: string, detail: Record<string, unknown> = {}): void => {
    issues.push({
      code: ISSUE_CODES.CLAIM_UNCHECKED,
      severity: "warning",
      message,
      detail: { claim, ...detail },
    });
  };

  /* Geometric slack for boundary claims: a claim of "2.4m tall" must not
     fail on a 2.4000000001m measurement. 1e-6 m is far below anything an
     author can express and far above float error at scene scale. */
  const EPS = 1e-6;

  /* The analytic layer's facts — available with or without a census,
     because they are closed-form arithmetic over the SOLVED boxes. The
     language's own rule (every shape fills its AABB exactly) is what makes
     a rest box a measurement rather than a plan. */
  const swept: SweptSceneFacts | undefined = options.solved
    ? sweptSceneFacts(options.solved)
    : undefined;
  const motionSwept = swept?.animates ? swept : undefined;

  if (!census) {
    // No build measurements — but the analytic layer can still PROVE a
    // spatial breach from the solved boxes alone (the fast gear catches a
    // spinning plate's footprint before anyone pays for Blender). What it
    // cannot prove stays honestly unchecked.
    const analyticallyFailed = new Set<string>();
    if (motionSwept) adjudicateSweptBreaches(claims, motionSwept, fail, EPS, analyticallyFailed);
    for (const claim of Object.keys(claims)) {
      if (analyticallyFailed.has(claim)) continue;
      unchecked(claim, "no census — the build stage did not produce measurements");
    }
    return;
  }

  /* ---- time ----------------------------------------------------------
     A spatial claim is a claim about the asset, and an animated asset
     occupies different space every frame. The census now measures the
     envelope over the frame range (deformed, evaluated geometry — imported
     clips included), so the adjudication below runs against the union of
     rest pose and cycle rather than against one pose.

     Union, not replacement: a sampled extreme is a real measured extreme,
     and the rest pose is one more real sample. Union makes the animated
     path a strict SUPERSET of the rest-pose path, which is what licenses
     the single code path below — there is no second, rest-pose-only
     adjudication left to double-report from.

     What the stride costs is reported, never absorbed: `timeCaveat` is the
     sentence the reader gets when the measurement was partial, and it is
     emitted as W-701 for any claim that PASSED what was sampled. A claim
     that failed a sampled frame is already a real failure and needs no
     caveat about the frames that might also have failed. */
  const envelope = spatialEnvelope(census);
  const anim = census.animation?.animatedBounds;
  const animParts = new Map((anim?.parts ?? []).map((p) => [p.object, p]));
  const timeCaveat: string | null = (() => {
    if (!anim) return null; // nothing animates: the rest pose is the whole truth
    if (anim.skipped) {
      return `the scene animates but its bounds over time were not measured (${anim.skipped}) — only the rest pose was checked`;
    }
    const step = anim.frameStep ?? 1;
    if (step > 1) {
      return `bounds over time were sampled every ${step}th frame (${anim.framesSampled ?? 0} frames of ${anim.frameStart ?? 0}–${anim.frameEnd ?? 0}) — extremes between samples are unmeasured`;
    }
    // A partial WALK is as inexact as a strided one: a mesh the sampler
    // could not evaluate is absent from the envelope entirely, and "exact
    // across time" must never be said about a walk with holes in it.
    if (anim.skippedParts && anim.skippedParts.length > 0) {
      return `bounds over time could not include ${anim.skippedParts.length} part(s) (${anim.skippedParts.join(", ")}) — their motion is unmeasured`;
    }
    return null; // every frame, every part sampled: exact across time
  })();
  /** Name the frame an animated extreme came from, when it is the binding one. */
  const atFrame = (frame: number | undefined): string =>
    frame === undefined ? "" : ` (at frame ${frame})`;

  if (claims.parts !== undefined) {
    const actual = census.meshes.length;
    if (actual !== claims.parts) {
      fail("parts", `the built scene has ${actual} mesh parts, not ${claims.parts}`, {
        expected: claims.parts,
        actual,
      });
    }
  }

  if (claims.maxTriangles !== undefined) {
    // A CLAIM is the strongest statement a compile makes, so unlike the budget
    // rule it will not adjudicate on an approximation — but both now ask the
    // same shared computation whether one was needed (lint/triangles.ts).
    if (!trianglesAreExact(census)) {
      unchecked("maxTriangles", "this census does not carry triangle counts");
    } else {
      const total = triangleTotals(census).total;
      if (total > claims.maxTriangles) {
        fail("maxTriangles", `the built scene has ${total} triangles, over the claimed ${claims.maxTriangles}`, {
          expected: claims.maxTriangles,
          actual: total,
        });
      }
    }
  }

  if (claims.grounded === true) {
    const TOLERANCE = options.groundTolerance ?? 0.005;
    const exempt = options.groundExempt ?? [];
    const floats = options.declaredFloating ?? [];
    let groundedFailed = false;
    for (const mesh of census.meshes) {
      // Honour the same exemptions lintWorld does, so a bedded/mounted part
      // the project declared exempt does not fail the scene-level claim.
      if (isExempt(mesh.object, exempt)) continue;
      if (!mesh.spatial) {
        unchecked("grounded", `'${mesh.object}' has no spatial measurements`);
        continue;
      }
      // Direction one: nothing may sink THROUGH the floor.
      //
      // The cycle's worst dip, not the rest pose's. A walk cycle's foot
      // plants below the pose it was authored in; a bob's trough is a frame
      // the rest pose never shows. Where the animated sampling measured a
      // lower minimum for THIS part, that measurement is the binding one —
      // and because it is a union with the rest gap, this single check
      // supersedes the rest-pose one instead of duplicating it.
      const restGap = mesh.spatial.groundGap;
      const animPart = animParts.get(mesh.object);
      const animLower = animPart !== undefined && animPart.minZ < restGap;
      const gap = animLower ? animPart!.minZ : restGap;
      if (groundVerdict(gap, TOLERANCE) === "sunk") {
        groundedFailed = true;
        // Name what is under it. A grounding verdict without the neighbouring
        // surface tells the author THAT the arithmetic failed and nothing
        // about which pair produced it, so the next step is reading the
        // solver's own source to learn what the support predicate even is.
        // The census already measured every contact; `nearestSupportBelow` is
        // the one predicate both this and the world linter's S3D-W-325 ask,
        // so the two agree about what "under" means by construction.
        const support = nearestSupportBelow(census, mesh.object);
        const beneath = support
          ? ` — nearest surface below is '${support.name}', ${support.gap >= 0 ? "a" : "an overlap of"} ${Math.abs(support.gap).toFixed(4)}m ${support.gap >= 0 ? "clear" : "deep"}`
          : " — nothing measured beneath it";
        fail(
          "grounded",
          `'${mesh.object}' sinks ${(-gap).toFixed(4)}m below the ground plane${animLower ? ` at its animated worst${atFrame(animPart!.minZFrame)}` : ""}${beneath}`,
          {
            target: mesh.object,
            groundGap: gap,
            ...(animLower
              ? { overTime: true, restGroundGap: restGap, frame: animPart!.minZFrame }
              : {}),
            ...(support ? { supportBelow: support.name, supportGap: support.gap } : {}),
          },
        );
      }
    }

    /* Direction one, analytically: the exact swept envelope catches a dip
       the sampler visited only near — a bob's trough, a left-hand screw's
       descent, a box spinning about a horizontal axis. Closed form, so a
       breach is a real failure, not an advisory. Skipped for parts the
       sampled path already failed (one violation, one report). */
    if (motionSwept) {
      const failedAlready = new Set(
        issues
          .filter((i) => i.code === ISSUE_CODES.CLAIM_FAILED && i.detail?.claim === "grounded")
          .map((i) => i.target),
      );
      for (const mover of motionSwept.exactParts) {
        if (failedAlready.has(mover.id)) continue;
        // A declared float licenses FLOATING (direction two), never
        // SINKING: a hoverer whose motion provably dips below the floor is
        // as sunk as anything else. Only the full grounding exemption —
        // the author's explicit total opt-out — silences this direction.
        if (isExempt(mover.id, exempt)) continue;
        if (mover.min[2]! < -TOLERANCE) {
          groundedFailed = true;
          fail(
            "grounded",
            `'${mover.id}' (${mover.motion}) provably sinks ${(-mover.min[2]!).toFixed(4)}m below the ground plane mid-cycle — closed form over the whole motion, no frame sample needed`,
            { target: mover.id, sweptBottom: mover.min[2], overTime: true },
          );
        }
      }
    }

    /* Direction two: everything must be SUPPORTED — resting on the ground,
       or transitively in contact with something that is. This is what the
       word "grounded" asserts, and an author who writes `grounded: true`
       has explicitly asked for it; a scene where the contact line says
       "2 touch nothing" must not answer that assertion with "held".
       Deliberate floats are the author's to declare, and the language
       already has the sentence for it: a part placed by `above` (or listed
       in conventions.grounding.exempt) hovers on purpose, and everything
       hanging from a declared float inherits its licence. */
    {
      const assumed = new Set<string>();
      for (const mesh of census.meshes) {
        if (isExempt(mesh.object, exempt) || isExempt(mesh.object, floats)) assumed.add(mesh.object);
      }
      // Declared floats seed the SAME flood fill as the ground contacts —
      // groundedSupport owns what a support edge is ("one predicate per
      // physical relation"); a second adjacency+BFS here is how the two
      // authorities last drifted.
      const support = groundedSupport(census, TOLERANCE, assumed);
      const unsupported = census.meshes.filter(
        (m) => m.spatial && !support.supported.has(m.object),
      );
      if (unsupported.length > 0 && !support.verified) {
        // The oracle that would trace the chain was over budget or absent:
        // unverifiable is UNCHECKED, never failed.
        unchecked(
          "grounded",
          `${unsupported.length} part(s) have no traced support and the contact scan did not fully run`,
        );
      } else {
        /* Attribute the failure to the BREAK, not to every part above it.
           A chock resting 1mm on an unsupported plinth used to read
           "'prp_chock' floats with nothing supporting it — nearest surface
           below is 'prp_plinth', 0.0010m clear": the sentence contradicts
           itself, and an agent who fixes the named part fixes nothing. A
           part standing on another UNSUPPORTED part is a chain member; the
           chain's lowest member — the one whose own underside really has no
           support — is the root, and it carries the failure with its
           riders named. */
        const unsupportedSet = new Set(unsupported.map((m) => m.object));
        const touch = 0.001 + TOLERANCE;
        const restsOnUnsupported = new Map<string, string>();
        for (const mesh of unsupported) {
          const below = nearestSupportBelow(census, mesh.object);
          if (below && unsupportedSet.has(below.name) && below.gap <= touch) {
            restsOnUnsupported.set(mesh.object, below.name);
          }
        }
        const ridersOf = new Map<string, string[]>();
        for (const [rider, root] of restsOnUnsupported) {
          // Follow the chain to its lowest unsupported member.
          let base = root;
          const seen = new Set([rider]);
          while (restsOnUnsupported.has(base) && !seen.has(base)) {
            seen.add(base);
            base = restsOnUnsupported.get(base)!;
          }
          (ridersOf.get(base) ?? ridersOf.set(base, []).get(base)!).push(rider);
        }
        for (const mesh of unsupported) {
          if (restsOnUnsupported.has(mesh.object)) continue; // a rider, named on its root
          groundedFailed = true;
          const height = mesh.spatial!.groundGap;
          const below = nearestSupportBelow(census, mesh.object);
          const riders = (ridersOf.get(mesh.object) ?? []).sort();
          const chain =
            riders.length > 0
              ? ` — and ${riders.length} part(s) standing on it inherit the break: ${riders.join(", ")}`
              : below
                ? ` — nearest surface below is '${below.name}', ${Math.abs(below.gap).toFixed(4)}m clear`
                : "";
          fail(
            "grounded",
            `'${mesh.object}' floats ${height.toFixed(4)}m above the ground plane with nothing supporting it${chain}`,
            {
              target: mesh.object,
              groundGap: height,
              ...(below ? { supportBelow: below.name, supportGap: below.gap } : {}),
              ...(riders.length > 0 ? { chainRiders: riders } : {}),
            },
            "rest it on something, place it with an 'above' relation (a declared float), or exempt it via conventions.grounding.exempt",
          );
        }
      }
    }
    if (!groundedFailed && timeCaveat) caveat("grounded", `claim grounded held at every sampled frame — ${timeCaveat}`);
  }

  if (claims.minHeight !== undefined || claims.minFootprint !== undefined) {
    /* The FLOOR claims — the author's signature of real-world magnitude.
       A uniform unit slip has no intra-scene outliers, so no relative
       check can see it; a declared minimum can. Judged against the
       measured envelope (rest ∪ sampled frames): that union is the
       LARGEST the scene ever measurably is, so a floor even the union
       misses is a definite failure, and no conservative swept bound is
       consulted — an over-reserving bound could only fake a pass. */
    if (!envelope) {
      if (claims.minHeight !== undefined) unchecked("minHeight", "no spatial measurements in the census");
      if (claims.minFootprint !== undefined) unchecked("minFootprint", "no spatial measurements in the census");
    } else {
      const { min, max } = envelope;
      if (claims.minHeight !== undefined && max[2]! < claims.minHeight - EPS) {
        fail(
          "minHeight",
          `the built scene only reaches ${max[2]!.toFixed(4)}m, under the claimed minimum of ${claims.minHeight}m — a scene this much smaller than its own claim usually means a unit slip (millimetres authored as metres)`,
          { expected: claims.minHeight, actual: max[2] },
        );
      }
      if (claims.minFootprint !== undefined) {
        const extent: [number, number] = [max[0]! - min[0]!, max[1]! - min[1]!];
        for (const [i, axisName] of (["x", "y"] as const).entries()) {
          if (extent[i]! < claims.minFootprint[i]! - EPS) {
            fail(
              "minFootprint",
              `the built scene only spans ${extent[i]!.toFixed(4)}m on ${axisName}, under the claimed minimum of ${claims.minFootprint[i]}m`,
              { axis: axisName, expected: claims.minFootprint[i], actual: extent[i] },
            );
          }
        }
      }
    }
  }

  if (claims.maxHeight !== undefined || claims.footprint !== undefined) {
    // Scope: RENDERABLE mesh geometry only. Non-mesh objects (lights, empties,
    // armatures) are intentionally excluded — their AABBs are default-sized
    // gizmos, not silhouette, and folding them in would fail a height/footprint
    // claim on a light's icon rather than the asset. A tall armature that
    // genuinely breaks an envelope surfaces through its skinned mesh's spatial.
    if (!envelope) {
      if (claims.maxHeight !== undefined) unchecked("maxHeight", "no spatial measurements in the census");
      if (claims.footprint !== undefined) unchecked("footprint", "no spatial measurements in the census");
    } else {
      const { min, max, maxFrame, minFrame, overTime } = envelope;
      let heightFailed = false;
      let footprintFailed = false;
      if (claims.maxHeight !== undefined && max[2]! > claims.maxHeight + EPS) {
        heightFailed = true;
        // The frame is only named when an animated sample — not the rest
        // pose — is what breaches the claim; naming a frame for a static
        // breach would invent precision the measurement does not have.
        const animated = overTime[1]![2]!;
        fail(
          "maxHeight",
          `the built scene reaches ${max[2]!.toFixed(4)}m${animated ? ` at its animated crest${atFrame(maxFrame?.[2])}` : ""}, over the claimed ${claims.maxHeight}m`,
          {
            expected: claims.maxHeight,
            actual: max[2],
            ...(animated ? { overTime: true, frame: maxFrame?.[2] } : {}),
          },
        );
      }
      if (claims.footprint !== undefined) {
        const extent: [number, number] = [max[0]! - min[0]!, max[1]! - min[1]!];
        for (const [i, axisName] of (["x", "y"] as const).entries()) {
          if (extent[i]! > claims.footprint[i]! + EPS) {
            footprintFailed = true;
            const animated = overTime[0]![i]! || overTime[1]![i]!;
            fail(
              "footprint",
              `the built scene spans ${extent[i]!.toFixed(4)}m on ${axisName}${animated ? " across its animation" : ""}, over the claimed ${claims.footprint[i]}m`,
              {
                axis: axisName,
                expected: claims.footprint[i],
                actual: extent[i],
                ...(animated
                  ? { overTime: true, minFrame: minFrame?.[i], maxFrame: maxFrame?.[i] }
                  : {}),
              },
            );
          }
        }
      }
      /* ---- the interval calculus over compiler-owned motion ----------
         Samples are lower bounds; the exact swept boxes are the truth for
         boxes and translations; the full envelope is an upper bound. The
         three-way verdict below is what stops a fast spin's aliased
         samples from awarding "held" to a claim the part provably
         exceeds (the D1 false pass), and equally stops a stride caveat
         from nagging about frames the envelope already covers. */
      const failedKeys = new Set<string>();
      if (heightFailed) failedKeys.add("maxHeight");
      if (footprintFailed) failedKeys.add("footprint");
      const provenOverTime = new Set<string>();
      if (motionSwept) {
        // A claim the SAMPLED oracle already failed still deserves the true
        // cycle number: samples are lower bounds, so the measured breach can
        // under-state how far over the part really goes (1.9124m sampled of
        // a 1.9799m sweep). Rides the existing issue's detail — one
        // violation, one report, both numbers.
        for (const issue of issues) {
          if (issue.code !== ISSUE_CODES.CLAIM_FAILED) continue;
          const claim = issue.detail?.claim;
          if (claim !== "maxHeight" && claim !== "footprint") continue;
          const measured = typeof issue.detail?.actual === "number" ? issue.detail.actual : undefined;
          if (measured === undefined || issue.detail?.analytic) continue;
          let exactValue = -Infinity;
          for (const p of motionSwept.exactParts) {
            exactValue = Math.max(
              exactValue,
              claim === "maxHeight"
                ? p.max[2]!
                : issue.detail?.axis === "y"
                  ? p.max[1]! - p.min[1]!
                  : p.max[0]! - p.min[0]!,
            );
          }
          if (exactValue > measured + EPS) {
            issue.detail = { ...issue.detail, trueCycleExtent: r6(exactValue) };
          }
        }
        adjudicateSweptBreaches(claims, motionSwept, fail, EPS, failedKeys);
        if (claims.maxHeight !== undefined && !failedKeys.has("maxHeight")) {
          const bound = motionSwept.envelope.max[2]!;
          if (bound <= claims.maxHeight + EPS && motionSwept.procedural) {
            provenOverTime.add("maxHeight"); // no instant of the cycle can breach
          } else if (bound > claims.maxHeight + EPS) {
            caveat(
              "maxHeight",
              `claim maxHeight held at every sampled frame, but the conservative swept bound reaches ${bound.toFixed(4)}m over the cycle — the bound over-reserves for round shapes, so this is unproven either way, not failed`,
              { sweptBound: r6(bound), claimed: claims.maxHeight },
            );
            provenOverTime.add("maxHeight"); // the caveat subsumes the stride note
          }
        }
        if (claims.footprint !== undefined && !failedKeys.has("footprint")) {
          const spans: [number, number] = [
            motionSwept.envelope.max[0]! - motionSwept.envelope.min[0]!,
            motionSwept.envelope.max[1]! - motionSwept.envelope.min[1]!,
          ];
          const within =
            spans[0] <= claims.footprint[0]! + EPS && spans[1] <= claims.footprint[1]! + EPS;
          if (within && motionSwept.procedural) {
            provenOverTime.add("footprint");
          } else if (!within) {
            caveat(
              "footprint",
              `claim footprint held at every sampled frame, but the conservative swept bound reaches ${spans[0].toFixed(4)} × ${spans[1].toFixed(4)}m over the cycle — unproven either way, not failed`,
              { sweptBound: [r6(spans[0]), r6(spans[1])], claimed: claims.footprint },
            );
            provenOverTime.add("footprint");
          }
        }
      }
      if (timeCaveat) {
        if (
          claims.maxHeight !== undefined &&
          !failedKeys.has("maxHeight") &&
          !provenOverTime.has("maxHeight")
        ) {
          unchecked("maxHeight", timeCaveat);
        }
        if (
          claims.footprint !== undefined &&
          !failedKeys.has("footprint") &&
          !provenOverTime.has("footprint")
        ) {
          unchecked("footprint", timeCaveat);
        }
      }
    }
  }

  if (claims.watertight === true) {
    for (const mesh of census.meshes) {
      if (mesh.nonManifoldEdges > 0) {
        fail("watertight", `'${mesh.object}' has ${mesh.nonManifoldEdges} non-manifold edges — it is not a closed solid`, {
          target: mesh.object,
          nonManifoldEdges: mesh.nonManifoldEdges,
        });
      }
    }
  }

  if (claims.materialsUsed !== undefined) {
    // If NO mesh carries a material list, the census could not measure bindings
    // at all — reporting every claimed material as FAILED would be the exact
    // "silently turned couldn't-measure into failed" mistake unchecked() exists
    // to prevent. An empty list on a mesh that HAS the field is a real "no
    // material bound" and still fails below.
    const anyMeasured = census.meshes.some((m) => m.materials !== undefined);
    if (!anyMeasured && census.meshes.length > 0) {
      unchecked("materialsUsed", "this census does not carry per-mesh material bindings");
    } else {
      const bound = new Set(census.meshes.flatMap((m) => m.materials ?? []));
      for (const name of claims.materialsUsed) {
        if (!bound.has(name)) {
          fail("materialsUsed", `material '${name}' is not bound to any part in the built scene`, {
            target: name,
          });
        }
      }
    }
  }
}

/**
 * How much of each numeric claim's budget the BUILT scene uses — the
 * rate-distortion signal pass/fail cannot carry. A claim that holds at 96%
 * of its bound and one that holds at 12% are different facts, and the
 * author about to add a part deserves to know which one they are near.
 *
 * Lives in this module so the measurements are THE adjudicator's own
 * (triangleTotals, the same spatial scan) — one predicate per physical
 * relation, never a sibling re-derivation that can drift.
 */
export function claimMargins(
  claims: ClaimsSpec,
  census: Census | undefined,
  /** The solved scene, when the source is a spec — folds the EXACT swept
   *  extents into the spatial margins, so the margin line can never say
   *  "98% of its bound" about a claim the part provably exceeds (the same
   *  interval calculus the adjudicator runs; see D1 in the field notes). */
  solved?: ReadonlyArray<SolvedPart>,
): Array<{ claim: string; measured: number; limit: number; used: number }> {
  if (!census) return [];
  const margins: Array<{ claim: string; measured: number; limit: number; used: number }> = [];
  const push = (claim: string, measured: number, limit: number) => {
    if (limit > 0 && Number.isFinite(measured)) {
      margins.push({ claim, measured: r6(measured), limit, used: r6(measured / limit) });
    }
  };

  if (claims.maxTriangles !== undefined && trianglesAreExact(census)) {
    push("maxTriangles", triangleTotals(census).total, claims.maxTriangles);
  }

  // The SAME envelope the adjudicator judges against — including time. A
  // margin computed from the rest pose while the verdict came from the cycle
  // would report 60% of budget for a claim that just failed at 104%. The
  // exact swept extents union in for the same reason: sampled frames are
  // lower bounds, and the margin must be the adjudicated number.
  const envelope = spatialEnvelope(census);
  const swept = solved ? sweptSceneFacts(solved) : undefined;
  const exactTop = swept?.animates
    ? swept.exactParts.reduce((best, p) => Math.max(best, p.max[2]!), -Infinity)
    : -Infinity;
  const exactSpan = (i: 0 | 1): number =>
    swept?.animates
      ? swept.exactParts.reduce((best, p) => Math.max(best, p.max[i]! - p.min[i]!), -Infinity)
      : -Infinity;
  if (envelope) {
    const { min, max } = envelope;
    if (claims.maxHeight !== undefined) {
      push("maxHeight", Math.max(max[2]!, exactTop), claims.maxHeight);
    }
    if (claims.footprint !== undefined) {
      push("footprint.x", Math.max(max[0]! - min[0]!, exactSpan(0)), claims.footprint[0]!);
      push("footprint.y", Math.max(max[1]! - min[1]!, exactSpan(1)), claims.footprint[1]!);
    }
    // Floor claims invert the ratio: `used` is how much of the measured
    // extent the floor consumes, so 96% again means "close to the bound"
    // and the tightest-first sort keeps one meaning across both kinds.
    if (claims.minHeight !== undefined && max[2]! > 0) {
      margins.push({
        claim: "minHeight",
        measured: r6(max[2]!),
        limit: claims.minHeight,
        used: r6(claims.minHeight / max[2]!),
      });
    }
    if (claims.minFootprint !== undefined) {
      for (const [i, axis] of (["x", "y"] as const).entries()) {
        const span = max[i]! - min[i]!;
        if (span > 0) {
          margins.push({
            claim: `minFootprint.${axis}`,
            measured: r6(span),
            limit: claims.minFootprint[i]!,
            used: r6(claims.minFootprint[i]! / span),
          });
        }
      }
    }
  }

  margins.sort((a, b) => b.used - a.used);
  return margins;
}

/**
 * The scene's world envelope as the claims adjudicate it: rest-pose mesh
 * spatials UNIONED with the animated bounds the census measured over the
 * frame range, plus which frame set each animated extreme.
 *
 * One predicate, two consumers (the verdict and the margin), for the reason
 * every other physical relation in this pipeline has one: the last time a
 * sibling re-derivation existed, the two disagreed.
 *
 * Scope note carried over from the rest-pose scan it replaces: RENDERABLE
 * mesh geometry only. Lights, empties and armatures have gizmo-sized AABBs,
 * not silhouette, and folding them in would fail a height claim on a light's
 * icon. The animated bounds are measured over meshes for the same reason.
 *
 * Union rather than "animated wins": a sampled extreme is a real measurement
 * and so is the rest pose, so the union is the honest envelope, and it makes
 * the animated path a strict superset — which is what lets the adjudicator
 * run ONE check instead of a rest-pose check plus an animated check that
 * would double-report the same violation. `overTime[which][axis]` says
 * whether an animated sample, rather than the rest pose, set that extreme.
 */
function spatialEnvelope(census: Census):
  | {
      min: [number, number, number];
      max: [number, number, number];
      minFrame?: [number, number, number];
      maxFrame?: [number, number, number];
      /** [minSetByAnimation, maxSetByAnimation] per axis. */
      overTime: [boolean[], boolean[]];
    }
  | undefined {
  const spatials = census.meshes
    .map((m) => m.spatial)
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const anim = census.animation?.animatedBounds;
  const animMin = anim?.min;
  const animMax = anim?.max;
  if (spatials.length === 0 && !(animMin && animMax)) return undefined;

  const min: number[] = [Infinity, Infinity, Infinity];
  const max: number[] = [-Infinity, -Infinity, -Infinity];
  for (const s of spatials) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, s.worldMin[i]!);
      max[i] = Math.max(max[i]!, s.worldMax[i]!);
    }
  }
  const overTime: [boolean[], boolean[]] = [
    [false, false, false],
    [false, false, false],
  ];
  if (animMin && animMax) {
    for (let i = 0; i < 3; i++) {
      if (animMin[i]! < min[i]!) {
        min[i] = animMin[i]!;
        overTime[0]![i] = true;
      }
      if (animMax[i]! > max[i]!) {
        max[i] = animMax[i]!;
        overTime[1]![i] = true;
      }
    }
  }
  if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) return undefined;
  return {
    min: min as [number, number, number],
    max: max as [number, number, number],
    ...(anim?.minFrame ? { minFrame: anim.minFrame } : {}),
    ...(anim?.maxFrame ? { maxFrame: anim.maxFrame } : {}),
    overTime,
  };
}

const r6 = (v: number): number => Number(v.toFixed(6));

/**
 * The PROVEN-FAILURE half of the interval calculus: any single part whose
 * EXACT swept box breaches a spatial claim fails it — the scene's extent is
 * at least any one part's extent, and an exact envelope is attained, not
 * bounded. Closed form, so it needs no census and no frame sample; this is
 * what runs on the fast gear and what catches the extreme integer-frame
 * sampling structurally cannot visit (a 6-frames-per-revolution spin never
 * lands on 45°).
 *
 * `failed` is both input (claims a stronger/sampled oracle already failed —
 * one violation, one report) and output (claims failed here).
 */
function adjudicateSweptBreaches(
  claims: ClaimsSpec,
  swept: SweptSceneFacts,
  fail: (claim: string, message: string, detail: Record<string, unknown>, hint?: string) => void,
  eps: number,
  failed: Set<string>,
): void {
  if (claims.maxHeight !== undefined && !failed.has("maxHeight")) {
    let worst: { id: string; motion: string; v: number } | undefined;
    for (const p of swept.exactParts) {
      const v = p.max[2]!;
      if (v > claims.maxHeight + eps && (!worst || v > worst.v)) {
        worst = { id: p.id, motion: p.motion, v };
      }
    }
    if (worst) {
      failed.add("maxHeight");
      fail(
        "maxHeight",
        `'${worst.id}' (${worst.motion}) provably crests at ${worst.v.toFixed(4)}m over its motion cycle — closed form, no frame sample required — over the claimed ${claims.maxHeight}m`,
        {
          target: worst.id,
          expected: claims.maxHeight,
          actual: r6(worst.v),
          overTime: true,
          analytic: true,
        },
      );
    }
  }
  if (claims.footprint !== undefined) {
    if (!failed.has("footprint")) {
      let any = false;
      for (const [i, axisName] of (["x", "y"] as const).entries()) {
        let worst: { id: string; motion: string; v: number } | undefined;
        for (const p of swept.exactParts) {
          const v = p.max[i]! - p.min[i]!;
          if (v > claims.footprint[i]! + eps && (!worst || v > worst.v)) {
            worst = { id: p.id, motion: p.motion, v };
          }
        }
        if (worst) {
          any = true;
          fail(
            "footprint",
            `'${worst.id}' (${worst.motion}) provably sweeps ${worst.v.toFixed(4)}m on ${axisName} over its motion cycle — closed form (a full turn carries the box corners) — over the claimed ${claims.footprint[i]}m`,
            {
              target: worst.id,
              axis: axisName,
              expected: claims.footprint[i],
              actual: r6(worst.v),
              overTime: true,
              analytic: true,
            },
          );
        }
      }
      if (any) failed.add("footprint");
    }
  }
}
