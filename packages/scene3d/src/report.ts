import * as fs from "node:fs";
import * as path from "node:path";
import { CompileResult, Issue, Severity } from "./types.js";
import { ISSUE_CODES } from "./errors.js";
import { formatAsciiFrame, renderAsciiFrame } from "./read/ascii.js";
import { formatImpact } from "./read/impact.js";
import { solveDeltaIsEmpty } from "./read/solve-delta.js";
import { assessVerdict, type Verdict } from "./verdict.js";
import { isMover, sweptBox } from "./solve/sweep.js";

/**
 * Render a compile result as the `<scene3d-report>` block that gets spliced
 * into the generating agent's next turn.
 *
 * The block is the whole feedback channel for the loop: one compile, one
 * report, no follow-up "now check z-fighting" tool calls. It is written to
 * be read by a model, so it leads with the verdict, keeps every line
 * prefixed by its stable code, and never repeats a code's prose beyond the
 * one-line message plus the fix hint.
 *
 * Output is deterministic for a given result — no timestamps, no absolute
 * paths, no per-run durations — so an unchanged scene produces a byte-
 * identical block ONCE THE CACHE IS WARM (the steady state the promise is
 * for: a re-compiled unchanged scene reports every stage `cached`, and
 * `cached` does not vary run to run the way a millisecond count does). That
 * byte-stability is what lets the model tell "my edit was a no-op" from "my
 * edit landed", which the `delta:` line then states outright.
 */
/** Codes whose whole subject is what the frame LOOKS like. When one of these
 *  fires, prose has already failed to convey the problem — that is why the
 *  rule exists — so the report shows the frames instead of describing them. */
const PROOF_CODES: ReadonlySet<string> = new Set<string>([
  ISSUE_CODES.EMPTY_PROOF,
  ISSUE_CODES.PARTIAL_EMPTY_PROOF,
  ISSUE_CODES.OVEREXPOSED_PROOF,
  ISSUE_CODES.SPARSE_PROOF,
  ISSUE_CODES.STATIC_TURNTABLE,
]);

export interface ReportOptions {
  /** Where the proof frames live, so they can be rendered as text. Without it
   *  the report is exactly what it was; frames are an enrichment, never a
   *  dependency. */
  projectDir?: string;
  /** Show the frames even when nothing is wrong with them. */
  alwaysShowFrames?: boolean;
  /** Human title for an issue code (the contracts catalog). Injected rather
   *  than imported: this package cannot depend on `@open-design/contracts`,
   *  and duplicating the catalog here would let the two drift. */
  issueTitle?: (code: string) => string | undefined;
}

export function renderAgentReport(result: CompileResult, options: ReportOptions = {}): string {
  const lines: string[] = [];
  const { errors, warnings, infos } = result.summary;

  lines.push(`<scene3d-report ok="${result.ok}" errors="${errors}" warnings="${warnings}">`);
  lines.push(`source: ${result.source.kind} (${result.source.files.join(", ") || "none"})`);
  // What the compile DERIVED this to be. The kind gates chrome, labels and
  // export downstream; an author who meant to build a prop and produced a
  // `scene` learns it here rather than from the gallery card.
  if (result.manifest.assetKind) lines.push(`asset: ${result.manifest.assetKind}`);
  // WHAT compiled this, on the line above the findings. A stale daemon
  // enforcing a rule the checkout no longer has is indistinguishable from
  // current behaviour without it, and an agent that cannot tell those
  // apart cannot trust any finding it reads.
  const built = result.manifest.compiler;
  if (built) lines.push(`compiler: scene3d@${built.version} runner:${built.runner}`);
  // Stage status without durations: `ran`/`cached` carries the only bit the
  // agent decides on (did anything rebuild), and it stays stable across runs
  // where a millisecond count would not — see the determinism note above.
  lines.push(`stages: ${result.stages.map((s) => `${s.id} ${s.status}`).join(" · ")}`);
  appendDelta(lines, result);

  const parts = result.manifest.partTree;
  if (parts.length > 0) {
    // Count by kind, so "parts" can never mean two different numbers in
    // one report: the claims adjudicator counts MESHES, and this line used
    // to fold the camera and light into the same word 15 lines away.
    const meshCount = parts.filter((p) => p.type === "MESH").length;
    const byType = new Map<string, number>();
    for (const p of parts) {
      if (p.type === "MESH") continue;
      byType.set(p.type.toLowerCase(), (byType.get(p.type.toLowerCase()) ?? 0) + 1);
    }
    const others = [...byType.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, n]) => `${n} ${type}`)
      .join(" · ");
    const head = others ? `${meshCount} mesh · ${others}` : `${meshCount} mesh`;
    lines.push(`parts (${head}): ${parts.map(describePart).join(", ")}`);
  }
  // The solver's own output, as a table the parse loop can read. Parse runs
  // in milliseconds and resolves every relation, but "relations resolved" is
  // not eyes: an author composing a scene had to pay for a full Blender
  // build to learn where a part landed. This is that table, from the same
  // solve the build script is generated FROM — so it cannot disagree with
  // what gets built. Capped: a 500-part scene prints its first 40 rows and
  // says how many it folded away.
  if (result.solved && result.solved.parts.length > 0) {
    lines.push("");
    // "world box", not "size": every row prints the WORLD-space box — for a
    // rotated part that is the derived rotated bound, not the authored
    // size, and the old header let one column mean two things per row.
    lines.push("solved boxes (id · centre · world box · rests on):");
    const CAP = 40;
    // For a file/script part the solved box is the PLACEMENT ENVELOPE, not
    // the geometry: the asset is fitted inside it with a uniform scale, so
    // a declared aspect ratio the asset does not have leaves most of the
    // box empty. Printing the declared numbers alone read as measurement
    // and overstated a real fox 14× on one axis — so where the census
    // measured the built body, the row says both, marked, with the fit
    // factor; where it has not (parse-only), the row says `planned`.
    const builtBox = new Map(
      (result.census?.meshes ?? [])
        .filter((m) => m.spatial?.worldMin && m.spatial.worldMax)
        .map((m) => [m.object, m.spatial!] as const),
    );
    for (const part of result.solved.parts.slice(0, CAP)) {
      const centre = part.center.map((v: number) => fmtM(v)).join(", ");
      let size = part.size.map((v: number) => fmtM(v)).join(" × ");
      if (part.file || part.script) {
        const built = builtBox.get(part.id);
        if (built) {
          const dims = [0, 1, 2].map((i) => built.worldMax![i]! - built.worldMin![i]!);
          const fit = dims.map((d, i) => (part.size[i]! > 1e-9 ? d / part.size[i]! : 1));
          const worst = fit.indexOf(Math.min(...fit));
          const differs = fit.some((f) => Math.abs(1 - f) > 0.02);
          size = differs
            ? `planned ${size} → built ${dims.map((d) => fmtM(d)).join(" × ")} (fitted ${fit[worst]!.toFixed(2)}× on ${"xyz"[worst]})`
            : `${dims.map((d) => fmtM(d)).join(" × ")} (fills its box)`;
        } else {
          size = `${size} (planned — the asset is fitted inside this box at build)`;
        }
      }
      const origin = part.from ? ` (from ${part.from})` : "";
      const rests = part.restsOn ? ` · rests on ${part.restsOn}` : "";
      // The size printed above is the WORLD box (the rotated bound), so a
      // rotated part's row otherwise reads as a part the author never
      // authored. Naming the rotation is what makes the number explicable.
      const rot = part.rotate ? ` · rot ${part.rotate.axis} ${part.rotate.deg}°` : "";
      // A moving part's row shows the space its CYCLE reserves, not only
      // its rest pose — the same envelope W-108 and the cycle claims judge.
      // `isMover` is the one predicate for "has a cycle", so a motion added
      // to the language reaches this row without it learning the name.
      const env = isMover(part) ? sweptBox(part) : undefined;
      const sweepBits: string[] = [];
      if (env?.spinGrew) sweepBits.push(`⌀${fmtM(env.max[0] - env.min[0])}`);
      if (env && (env.bobRise > 0 || env.bobDip > 0)) {
        sweepBits.push(env.bobDip > 0 ? `z±${fmtM(env.bobRise)}` : `z+${fmtM(env.bobRise)}`);
      }
      if (env && env.screwRise !== 0) {
        const axis = part.screw?.axis ?? "z";
        const sign = env.screwRise > 0 ? "+" : "-";
        sweepBits.push(`${axis}${sign}${fmtM(Math.abs(env.screwRise))}/turn`);
      }
      const sweep = sweepBits.length > 0 ? ` · sweeps ${sweepBits.join(", ")}` : "";
      lines.push(`  ${part.id}${origin}: (${centre}) · ${size}${rot}${sweep}${rests}`);
    }
    const total = result.solved.parts.length;
    if (total > CAP) {
      lines.push(`  … +${total - CAP} more parts`);
    }
  }
  if (result.manifest.materials.length > 0) {
    // The measured base colour, keyed by material name from the census. Hue
    // is the single most salient thing an author asks a material for — "a red
    // lamp", "gold trim" — and the manifest carries none, so this feedback
    // channel used to confirm metallic/roughness/emission/alpha and stay
    // silent on the one property the eye reads first. Sourced from the census
    // (linear RGB → sRGB hex) rather than the manifest so no schema changes;
    // absent on a parse-only pass, where there is no build to have measured it.
    const censusColor = new Map(
      (result.census?.materials ?? []).map((m) => [m.name, m.principled?.baseColor] as const),
    );
    // Print the properties that DEFINE each material, not only the two
    // every material has: a lamp's whole purpose is its emission and a
    // glass's is its alpha, and this line used to omit both.
    lines.push(
      `materials: ${result.manifest.materials
        .map((m) => {
          const bits: string[] = [];
          const rgb = censusColor.get(m.name);
          if (rgb) bits.push(`color=${srgbHex(rgb)}`);
          bits.push(`metallic=${fmt(m.metallic)}`, `roughness=${fmt(m.roughness)}`);
          if (m.emissionStrength !== undefined && m.emissionStrength > 0) {
            bits.push(`emission×${Number(m.emissionStrength.toFixed(2))}`);
          }
          if (m.alpha !== undefined) bits.push(`alpha=${Number(m.alpha.toFixed(2))}`);
          // A texture multiplies over the base colour, so the hex above is a
          // tint, not the whole surface — say so rather than let the agent
          // read a flat colour off a mapped material.
          if (m.hasTexture) bits.push("textured");
          return `${m.name}[${bits.join(" ")}]`;
        })
        .join(", ")}`,
    );
  }
  const metrics = result.manifest.metrics;
  if (metrics) {
    const size = metrics.worldSize
      ? `world ${metrics.worldSize.map((v) => fmtM(v)).join(" × ")}`
      : null;
    const small = metrics.smallestPart
      ? `smallest ${metrics.smallestPart.name} (${fmtM(metrics.smallestPart.minDimension)})`
      : null;
    // An animated asset's rest pose is one frame of many: when the measured
    // cycle bounds exceed the rest size, say what the scene actually
    // occupies over time, on the same line the reading guide points at.
    const anim = result.census?.animation?.animatedBounds;
    let sweep: string | null = null;
    if (anim?.min && anim.max && metrics.worldSize) {
      const spans = [0, 1, 2].map((i) => anim.max![i]! - anim.min![i]!);
      if (spans.some((v, i) => v > metrics.worldSize![i]! + 0.001)) {
        sweep = `sweeps ${spans.map((v) => fmtM(v)).join(" × ")} over the cycle`;
      }
    }
    // The mirror of the tiny-size unit-slip hint: a 100km part beside a
    // 0.2m one is almost always millimetres read as metres, and "scale:"
    // exists to catch unit slips — in both directions.
    let spread: string | null = null;
    if (metrics.worldSize && metrics.smallestPart && metrics.smallestPart.minDimension > 0) {
      const ratio = Math.max(...metrics.worldSize) / metrics.smallestPart.minDimension;
      if (ratio > 10_000) {
        spread = `spread ${Math.round(ratio).toLocaleString()}:1 — verify units (millimetres read as metres?)`;
      }
    }
    const parts = [size, sweep, small, `${metrics.totalTriangles.toLocaleString()} tris`, spread].filter(
      Boolean,
    );
    lines.push(`scale: ${parts.join(" · ")}`);
  }
  if (result.proofImages.length > 0) {
    /* `cached` frames are still THIS scene's render (the hash matched); only
       a skipped/absent proof stage means the files predate the edit. Saying
       so matters: a `--stages` iteration loop used to present last week's
       render as if it photographed today's geometry. */
    const proofStage = result.stages.find((s) => s.id === "proof");
    const carried = !proofStage || proofStage.status === "skipped";
    // For an animated asset, say WHICH slice of time the frames photograph:
    // "8 frames over a 73-frame cycle" is a different fact from 8 arbitrary
    // pictures, and a reader hunting the crest deserves to know the frames
    // were spread evenly rather than guessing.
    const animRange = result.census?.animation;
    const sampled =
      animRange &&
      animRange.keyframedObjects.length > 0 &&
      typeof animRange.frameStart === "number" &&
      typeof animRange.frameEnd === "number" &&
      animRange.frameEnd > animRange.frameStart
        ? ` (turntable steps evenly across animation frames ${animRange.frameStart}–${animRange.frameEnd})`
        : "";
    /* The whole frame set, addressably.
       This line used to print ONE path and a count, which left the reader to
       infer a hash-bearing filename pattern it had never been shown — so
       "look at the back" began with a guessed path and an ENOENT. Naming the
       pattern and its index range costs one line and removes the guess. */
    const first = result.proofImages[0]!;
    const pattern = first.replace(/(\d+)(\.png)$/i, (_m, digits: string, ext: string) =>
      `${"N".repeat(digits.length)}${ext}`,
    );
    const last = String(result.proofImages.length - 1).padStart(3, "0");
    lines.push(
      `proof: ${result.proofImages.length} frame(s)${sampled} — ${pattern}, N = 000..${last}` +
        (carried ? " (carried from a previous compile — proof did not run this time)" : "") +
        " · real PNGs: open them directly if you can read images",
    );
    appendOrbit(lines, result);
  }
  if (result.exportedAssets.length > 0) {
    lines.push(`assets: ${result.exportedAssets.join(", ")}`);
  }
  /* Per-material lit-sphere previews: the cheap gear between "raw kernel
     PNG" and "full proof" for judging how strength × texture × alpha
     compose under the proof's own lighting. A field build paid four ~90s
     turntable rounds to tune one emissive material because nothing cheaper
     could show the composition. */
  if ((result.materialBalls?.length ?? 0) > 0) {
    // Skipped previews are NAMED, not just counted: a cap and a bake
    // failure look identical in a count, and the runner measured the names.
    const names = result.materialBallsSkippedNames ?? [];
    const shownNames = names.slice(0, 6).join(", ");
    const more = names.length > 6 ? ` +${names.length - 6} more` : "";
    const skipped = result.materialBallsSkipped
      ? ` (${result.materialBallsSkipped} skipped${shownNames ? `: ${shownNames}${more}` : ""})`
      : "";
    lines.push(
      `material balls: ${result.materialBalls!.length} lit-sphere preview(s) in out/materials/${skipped} — judge emission/alpha here before paying for a turntable`,
    );
    // The measured answer to "does my emission read as the colour I
    // authored": a ball that clips is a material whose product exceeds
    // display range under the shot's own lighting — the authored hue is
    // gone and only this number says so without eyes.
    const blown = (result.materialBallStats ?? []).filter((s) => s.clipped > 0.05);
    for (const s of blown.slice(0, 6)) {
      lines.push(
        `  ${s.material}: ball clips ${(s.clipped * 100).toFixed(0)}% — its output exceeds display range under this lighting (lower emissionStrength or the colour, or accept the bloom)`,
      );
    }
    if (blown.length > 6) lines.push(`  … +${blown.length - 6} more clipping`);
  }
  /* The claims ledger, in both directions. Failures already surface as
     S3D-E-701 lines; the SUCCESS was silent, so an author who declared
     claims could not tell "adjudicated and held" from "ignored". */
  const ledger = result.manifest.claims;
  if (ledger) {
    // The rate signal, not just the verdict: a claim held at 96% of its
    // bound and one held at 12% are different facts for an author about to
    // add a part. Tightest margin only — the full table rides the manifest.
    //
    // And the honesty gate: `checked` is how many claims were actually
    // adjudicated. This line used to print "3/3 held" on compiles where the
    // build never ran and the adjudicator had said, in its own words,
    // "unchecked is not passed" — the reassuring number in the friendliest
    // place was the one that lied.
    const checked = ledger.checked ?? ledger.declared;
    const tightest = ledger.margins?.[0];
    // A grounded claim held partly by licence says so on the ledger line:
    // the reader must be able to tell "everything reaches the ground" from
    // "the hovering parts were declared as hovering on purpose".
    const floats =
      ledger.licensedFloats && ledger.licensedFloats.length > 0
        ? ` · ${ledger.licensedFloats.length} declared float(s) licensed: ${ledger.licensedFloats.join(", ")}`
        : "";
    const margin =
      (ledger.failed === 0 && tightest
        ? ` — tightest: ${tightest.claim} at ${Math.round(tightest.used * 100)}% of its bound (${tightest.measured} of ${tightest.limit})`
        : "") + floats;
    if (ledger.failed > 0) {
      lines.push(
        `claims: ${Math.max(0, checked - ledger.failed)}/${ledger.declared} held — ${ledger.failed} failed (S3D-E-701 below)`,
      );
    } else if (checked === 0) {
      lines.push(
        `claims: 0/${ledger.declared} checked — nothing was measured (S3D-W-701); unchecked is not passed`,
      );
    } else if (checked < ledger.declared) {
      lines.push(
        `claims: ${checked}/${ledger.declared} checked, all checked ones held${margin} — ${ledger.declared - checked} unadjudicated (S3D-W-701)`,
      );
    } else {
      lines.push(`claims: ${ledger.declared}/${ledger.declared} held${margin}`);
    }
  }
  // What the frames MEASURED, always — not only when a rule complains.
  // These numbers already existed and reached the linter alone, so the only
  // consumer able to see them was a threshold. An author with no image input
  // could not answer "did my render work" except by the absence of
  // complaints, which is not the same question.
  const frames = result.manifest.proofFrames ?? [];
  const measured = frames.filter((f) => f.coverage !== null);
  if (measured.length > 0) {
    const mean = (pick: (f: (typeof measured)[number]) => number | null | undefined) =>
      measured.reduce((sum, f) => sum + (pick(f) ?? 0), 0) / measured.length;
    const dark = measured.filter((f) => (f.coverage ?? 0) < 0.01).length;
    // Name the WORST frame beside the mean when they diverge: a turntable
    // that clips hard on one angle averages down to a number that reads
    // fine, and a reader who trusts the visible per-frame samples (chosen
    // evenly, not adversarially) concludes there is no clipping at all.
    const meanClip = mean((f) => f.blownRatio);
    let worstClip = 0;
    let worstIdx = 0;
    measured.forEach((f, i) => {
      if ((f.blownRatio ?? 0) > worstClip) {
        worstClip = f.blownRatio ?? 0;
        worstIdx = i;
      }
    });
    const worst =
      worstClip > 0.02 && worstClip > meanClip * 1.5
        ? ` (worst ${(worstClip * 100).toFixed(1)}% on frame ${worstIdx})`
        : "";
    lines.push(
      `frames: ${measured.length} · subject ${(mean((f) => f.coverage) * 100).toFixed(0)}% of frame · ` +
        `lum ${mean((f) => f.meanLuminance).toFixed(2)} · clipped ${(meanClip * 100).toFixed(1)}%${worst}` +
        (dark > 0 ? ` · ${dark} empty` : ""),
    );
  }
  // How connected the result is. Arithmetic, not a verdict: floating is a
  // legitimate composition and the compiler has no opinion about it. But a
  // scene that came out as islands rather than one object is invisible to an
  // author who cannot see the render, and this is the only place it shows.
  const connectivity = result.manifest.connectivity;
  // Contacts are measured at the rest pose. In a scene that animates, the
  // sentence must SAY so — it used to share a report with a maxHeight
  // claim carrying overTime=true, one line scoped in time and one not,
  // with identical grammar.
  const restQualifier =
    (result.census?.animation?.keyframedObjects?.length ?? 0) > 0 ? " (rest pose)" : "";
  if (connectivity && connectivity.isolated > 0) {
    const names = connectivity.isolatedParts.join(", ");
    const more = connectivity.isolated - connectivity.isolatedParts.length;
    lines.push(
      `contact: ${connectivity.touching} part(s) touch another, ${connectivity.isolated} touch nothing${restQualifier}` +
        ` — ${names}${more > 0 ? ` +${more} more` : ""}`,
    );
  } else if (connectivity && connectivity.touching > 0) {
    // Absence used to mean good — an unstated convention a reader spent a
    // compile second-guessing ("did contacts fail to run?"). One short line
    // states the healthy case instead of implying it.
    lines.push(`contact: all ${connectivity.touching} part(s) touch another${restQualifier}`);
  }
  appendFrames(lines, result, options);

  /* The user's viewport edits, surfaced to the agent — the other half of
     the co-studio loop. A human dragging a part or restyling a material in
     the kit viewer writes tweaks.json; the compile replays it silently, so
     without this section the agent would keep reasoning about a scene the
     user has visibly changed. The note tells it what the file MEANS and
     what a real edit should do with it. */
  const baked = result.manifest.bakedTweaks;
  if (baked && Object.keys(baked).length > 0) {
    lines.push("");
    lines.push("user edits (tweaks.json, baked into this build):");
    for (const name of Object.keys(baked).sort()) {
      lines.push(`  ${name}: ${describeTweak(baked[name]!)}`);
    }
    lines.push(
      "  note: direct viewport edits by the user, replayed on every compile." +
        " Treat them as intent: when editing the scene source, fold them in" +
        " (then clear tweaks.json via the tweaks endpoint) or leave them to keep replaying.",
    );
  }

  /* Where the rest of the compile's answers live. Every one of these is
     written on every full compile and none of them used to be named here,
     so reaching the census digest cost a file read the agent had no prompt
     to make. */
  if (result.stages.some((s) => s.id === "manifest" && s.status !== "skipped")) {
    lines.push("");
    lines.push("read:");
    /* ortho.svg leads, with an instruction, not just a path. A field build
       shipped a cage whose bars stood beside their ring: the plan view
       showed it unmissably, and the author never opened the file because
       nothing named it. The turntable is a photograph; these are the
       drawings.

       Every line is gated on the file actually existing this compile: the
       block's whole worth is that following it never hits a wall, and a
       first --fast pass writes no frame player and a census-less pass no
       ortho. A read: that can name an absent file teaches the reader to
       stop following it. */
    /* The sheet leads, above even the ortho: it is the cheapest thing in the
       list to act on (one image, no parsing) and the only one that answers
       "which way am I looking" — the question every other artifact here
       silently assumes the reader has already answered. */
    if (result.manifest.contactSheet) {
      lines.push(
        `  ${result.manifest.contactSheet.path} — the whole turntable on one labelled page: compass name and azimuth per frame, an axis gnomon, numbered part badges. The fastest way to see what you built and from where`,
      );
    }
    if (result.census) {
      lines.push(
        "  out/ortho.txt — plan/front/side as ASCII box-art with a per-part legend and dimensions: the proportion and height a perspective frame can't show, read directly as text (no render needed)",
      );
      lines.push(
        "  out/ortho.svg — the same three elevations as an SVG drawing (also text-readable)",
      );
    }
    lines.push("  out/digest.md — the census in prose, with the per-part dimensions table");
    lines.push("  out/read-model.json — the full census, machine-readable");
    // The USD is the master format and technically text, but every prim is
    // buried under kilobytes of vertex arrays — so name the GRAPH beside it, the
    // one an agent can actually read to reason about the shipped stage.
    const usda = (result.exportedAssets ?? []).find((p) => p.toLowerCase().endsWith(".usda"));
    if (usda) {
      lines.push(
        `  ${usda.replace(/\.usda$/i, ".tree.txt")} — the exported USD as a legible scene GRAPH: prim tree, kinds, xforms, material bindings — without the vertex arrays that make the .usda itself unreadable`,
      );
    }
    if (result.manifest.textures.length > 0) {
      lines.push("  out/textures/ — the baked shader maps and atlases, as real pixels");
    }
    if ((result.materialBalls?.length ?? 0) > 0) {
      lines.push("  out/materials/ — lit-sphere previews, one per material, under the proof's own lighting");
    }
    if (result.proofImages.length > 0) {
      lines.push("  out/index.html (frame player) · kit.html at the project root (live viewer)");
    }
  }

  // Synthesis header: the ranked "fix first" summary an agent reads before the
  // full list. Pure curation over the same issues — most-actionable first,
  // ranked by measured overrun then reach — so the model spends its next turn
  // on what matters, not the first code it happens to see.
  appendVerdict(lines, assessVerdict(result), options);

  appendSection(lines, "errors", result.issues, "error", options);
  appendSection(lines, "warnings", result.issues, "warning", options);
  if (infos > 0) appendSection(lines, "info", result.issues, "info", options);

  /* The verdict is the last thing a blind reader sees before deciding the
     next move, so it points FORWARD — one sentence, matched to where the
     loop actually stands. Guidance lives here and at other terminal
     moments, never per-issue: an agent drowning in cheer reads none of it. */
  lines.push("");
  if (result.ok) {
    lines.push(
      warnings > 0
        ? "verdict: compiles clean; warnings above are advisory — fix what matters, or tune the named contract knob when one fights a deliberate choice."
        : "verdict: compiles clean.",
    );
    const proofRan = result.stages.some((s) => s.id === "proof" && s.status !== "skipped");
    if (!proofRan) {
      // The natural next move after a restricted pass — phrased around the
      // OUTCOME (a full compile), not any one flag, because API callers
      // restricted stages without ever holding a --fast. Suppressed when
      // Blender itself is absent: "run a full compile" is a wall there, and
      // the E-201/E-207 line above already names the real next step.
      /* Shown when a full compile is genuinely the next step: Blender ran
         this pass (the fast gear), OR no Blender-needing stage was even
         requested (a parse-only look at the solved boxes). Suppressed only
         when a Blender stage was WANTED and the runtime was absent — there,
         "run a full compile" is a wall, and the E-201/E-207 line above
         already names the real next step. */
      const blenderStageWanted = result.stages.some((s) =>
        s.id === "build" || s.id === "proof" || s.id === "export",
      );
      if (result.manifest.blender?.used || !blenderStageWanted) {
        lines.push("next: structure settled? run a full compile to photograph, export, and see the piece.");
      }
    } else {
      /* Point at the sheet when there is one: "walk one proof frame" asks
         the reader to judge the piece from a single unidentified angle,
         which is the habit this whole artifact exists to replace. */
      lines.push(
        result.manifest.contactSheet
          ? `next: before calling it done, look at ${result.manifest.contactSheet.path} and out/ortho.svg — a clean compile proves the build, not the design.`
          : "next: before calling it done, walk one proof frame and out/ortho.svg — a clean compile proves the build, not the design.",
      );
    }
    // A spec with no claims is a shape nothing re-verifies. One nudge, only
    // on success, only when the author has not already answered it.
    if (result.source.kind === "spec" && !result.manifest.claims) {
      lines.push(
        "tip: this spec declares no claims — a claims block (parts, watertight, footprint…) makes the compiler re-check your intent on every future compile, free.",
      );
    }
  } else {
    lines.push(
      "verdict: fix every error above, then compile again — the fix: lines name the change and the data: lines carry the measured numbers.",
    );
  }

  lines.push("</scene3d-report>");
  return lines.join("\n");
}

/**
 * What this edit changed since the previous compile.
 *
 * The verdict says where the scene IS; the delta says what the last edit DID
 * to get there — the other half of the feedback signal, and the half a model
 * that just made an edit reasons on first. It sits right after the stage line
 * and before the issue sections: context, then change, then what is still
 * wrong. Everything is derived from two censuses (`changeImpact`), so it costs
 * no Blender time and cannot disagree with the measurements.
 *
 * Three states, each a fixed deterministic shape:
 *   - no baseline (first compile, or a baseline too old to trust) → one line
 *   - unchanged → one line, the payoff that distinguishes a no-op edit
 *   - changed → the consequence-first impact block, capped so the broken-
 *     support lines can never be pushed below the fold
 */

/**
 * Which frame photographs which side, and where the labelled sheet is.
 *
 * The orientation half of the report, and the half that did not exist. The
 * compiler orbits its camera on a documented path and then handed back frames
 * whose only mark was a serial number, so a reader could not tell the front of
 * its own model from the back — every observation about "one side" was an
 * observation about an unidentified side, and no follow-up edit could be
 * aimed. Three lines close it: the map from index to compass point, the
 * convention that makes those names mean something, and the one artifact that
 * shows all of it at once.
 *
 * Printed only when the poses are actually known. A still through a camera
 * the author placed has no derivable azimuth, and `proofViews` is absent
 * there rather than invented — so this block is silent instead of confident.
 */
function appendOrbit(lines: string[], result: CompileResult): void {
  const views = result.manifest.proofViews;
  if (views && views.length > 0) {
    const orbit = views
      .map((v) => `[${v.index}] ${v.name} ${Math.round(v.azimuthDeg)}°`)
      .join(" · ");
    lines.push(`  orbit: ${orbit}`);
    lines.push(
      "  frame N looks from azimuth N×360/count. azimuth 0° = front = camera on -Y (Blender numpad-1)," +
        " increasing toward +X, elevated 30°. world is Z-up.",
    );
  }

  const sheet = result.manifest.contactSheet;
  if (!sheet) return;
  lines.push(
    `  contact sheet: ${sheet.path} — every frame on one page, labelled with these compass names,` +
      " an axis gnomon per frame, and a numbered badge on each part. Open this ONE image rather than the loose frames.",
  );
  if (sheet.legend.length > 0) {
    // The badge↔part mapping as text too, so the numbers on the picture are
    // resolvable by a reader who cannot open it — and so a reader who CAN is
    // not forced to squint at a 9-pixel numeral to name a part.
    lines.push(
      `  badges: ${sheet.legend.map((e) => `${e.badge}=${e.part}`).join(" · ")}`,
    );
  }
  if (sheet.neverVisible.length > 0) {
    /* A measured fact about the scene, not about the sheet: a part the whole
       orbit never shows a pixel of is enclosed by other geometry or hidden
       inside it. That is sometimes intended (an interior) and sometimes a
       part that was never placed where the author thought — and either way it
       is invisible to every review that only looks at renders. */
    lines.push(
      `  never visible: ${sheet.neverVisible.join(", ")} — no pixel from any angle of the orbit` +
        " (enclosed, or hidden inside another part)",
    );
  }
}

/**
 * The proof frames, as text, when the report is about what they look like.
 *
 * A model reading this may have no way to open a PNG — several runtimes have
 * no image input at all — so "every proof frame rendered empty" is a verdict
 * about evidence the reader cannot reach. One field run answered that by
 * writing its own luminance sampler mid-task, which then located a real defect
 * class the pixel-free report had never mentioned. This puts the same eyes in
 * the report, from the same decoder the sheet linter already uses.
 *
 * Gated on a proof finding by default, because eight ramps in every successful
 * compile is noise, and the cost is real: each frame is decoded and sampled.
 * `alwaysShowFrames` is there for a caller who has decided otherwise.
 *
 * A frame that cannot be read is SAID, not skipped — a silently absent ramp
 * would read as "the frame was fine".
 */
function appendFrames(lines: string[], result: CompileResult, options: ReportOptions): void {
  if (!options.projectDir || result.proofImages.length === 0) return;
  const wanted =
    options.alwaysShowFrames === true || result.issues.some((i) => PROOF_CODES.has(i.code));
  if (!wanted) return;

  // Bounded: a turntable is eight frames and a report is a context window.
  // Sampled EVENLY around the orbit rather than slice(0, n): the first four
  // frames of an eight-frame turntable are the front half, so the back of
  // the model was structurally invisible in text.
  const all = result.proofImages;
  const count = Math.min(MAX_ASCII_FRAMES, all.length);
  const shown = Array.from({ length: count }, (_, i) => all[Math.floor((i * all.length) / count)]!);
  // Which side each frame photographs, keyed by the frame index in its
  // filename. Without it the only mark on the ramp a text-only reader can
  // act on is an opaque hash filename, and "look at the back" stays a move
  // the reader cannot aim — the exact gap the orbit map exists to close, but
  // stated far above and never on the frame itself.
  const viewByIndex = new Map((result.manifest.proofViews ?? []).map((v) => [v.index, v]));
  lines.push("");
  lines.push(
    `frames (${shown.length} of ${all.length}, sampled evenly around the orbit; ${ASCII_COLUMNS} cols; ` +
      `ramp "${RAMP_LEGEND}" = dark→bright, a leading blank is transparent background):`,
  );
  for (const rel of shown) {
    const frameIdx = Number(/(\d+)\.png$/i.exec(rel)?.[1]);
    const view = Number.isFinite(frameIdx) ? viewByIndex.get(frameIdx) : undefined;
    // Compass name FIRST, so the reader knows which way they are looking
    // before they read a single ramp row; the filename trails for the reader
    // who wants to open the real PNG.
    const label = view
      ? `${view.name} · az ${Math.round(view.azimuthDeg)}° · ${path.basename(rel)}`
      : path.basename(rel);
    try {
      const png = fs.readFileSync(path.join(options.projectDir, rel));
      lines.push(formatAsciiFrame(label, renderAsciiFrame(png, { columns: ASCII_COLUMNS })));
    } catch (err: any) {
      lines.push(`${label}  could not be read: ${err?.message ?? String(err)}`);
    }
  }
}

const MAX_ASCII_FRAMES = 4;
const ASCII_COLUMNS = 48;
/** The printable ramp (dark → bright) shown in the frames legend. The full
 *  ramp in read/ascii.ts leads with a space that doubles as the transparent
 *  background, so the legend names the two roles separately: the blank is
 *  background, `.`…`@` is the lit gradient. */
const RAMP_LEGEND = ".:-=+*#%@";

function appendDelta(lines: string[], result: CompileResult): void {
  const impact = result.impact;
  lines.push("");
  if (!impact) {
    lines.push("delta: first compile — no baseline");
    // A first compile can still carry a solve delta in principle (a prior
    // read-model with no census); render whatever exists rather than gate.
    appendSolveDelta(lines, result.solveDelta);
    return;
  }
  if (impact.noBuild) {
    // This compile measured nothing, so no geometric diff can honestly
    // exist — say exactly that, keep the baseline, and still report the
    // issue delta (the error that stopped the build IS the change).
    lines.push("delta: no build to compare — this compile produced no measurements; baseline kept from the last successful build");
    for (const line of formatImpact(impact, { maxLines: 20 }).split("\n")) {
      if (line.trim().length > 0) lines.push(`  ${line}`);
    }
    appendSolveDelta(lines, result.solveDelta);
    return;
  }
  if (impact.unchanged) {
    lines.push("delta: unchanged since previous compile");
    // "Unchanged" is a CENSUS verdict, and the solve delta sees what the
    // census cannot: a support switch that moved no vertex, or any solve
    // change on a census-less fast-gear run (two undefined censuses read
    // as unchanged). The early return here used to swallow the residual —
    // the one signal the codec module exists to surface — precisely when
    // it was most surprising, so the solve lines render on EVERY path.
    appendSolveDelta(lines, result.solveDelta);
    return;
  }
  lines.push("delta (since previous compile):");
  for (const line of formatImpact(impact, { maxLines: 20 }).split("\n")) {
    lines.push(`  ${line}`);
  }
  appendSolveDelta(lines, result.solveDelta);
}

/**
 * The codec line under the delta: authored edits and their graph-predicted
 * propagation compress to one count line, because the author's own mental
 * model already predicts them. Only residuals — a part that moved or
 * switched support though nothing it depends on was touched — get a line
 * each, because with a deterministic solver they should not exist, and a
 * change the author cannot explain is exactly what the report is FOR.
 */
function appendSolveDelta(lines: string[], delta: CompileResult["solveDelta"]): void {
  if (!delta || solveDeltaIsEmpty(delta)) return;
  const bits: string[] = [];
  if (delta.authored.length > 0) bits.push(`${delta.authored.length} authored`);
  if (delta.added.length > 0) bits.push(`${delta.added.length} added`);
  if (delta.removed.length > 0) bits.push(`${delta.removed.length} removed`);
  if (delta.propagated.length > 0) bits.push(`${delta.propagated.length} moved with them`);
  if (bits.length > 0) lines.push(`  solve: ${bits.join(" · ")} (${delta.steady} steady)`);
  for (const residual of delta.residuals.slice(0, 6)) {
    lines.push(
      residual.kind === "support"
        ? `  residual: ${residual.id} now rests on ${residual.to ?? "nothing"}${
            residual.from ? ` (was ${residual.from})` : ""
          } — no authored cause`
        : `  residual: ${residual.id} moved with no authored cause`,
    );
  }
  if (delta.residuals.length > 6) {
    lines.push(`  residual: +${delta.residuals.length - 6} more`);
  }
}

/**
 * The synthesis block: a graded verdict, the top few findings ranked by how
 * badly they bust budget (then by reach), and honest headroom facts. It never
 * invents a score — the grade is a one-sentence function of severities, and
 * the ranking is measured. It sits ABOVE the full per-severity list, which is
 * left exactly as it was.
 */
function appendVerdict(lines: string[], verdict: Verdict, options: ReportOptions): void {
  /* The success path is as loud as the failure path — deliberately. The
     early return this replaces dropped `summary:` AND `headroom:` on a clean
     compile, so the one compile where the author most wants "what did I
     build" was the one that said the least. */
  lines.push("");
  const dims = verdict.dimensions.map((d) => d.dimension).join(", ");
  lines.push(`summary: ${verdict.grade}${dims ? ` — ${dims}` : ""}`);

  const top = verdict.actions.slice(0, 3);
  if (top.length > 0) {
    lines.push("fix first:");
    top.forEach((a, i) => {
      const title = options.issueTitle?.(a.code);
      const shown = displayCode(a.code, a.severity);
      const named = title ? `${shown} (${title})` : shown;
      const target = a.target ? ` [${a.target}]` : "";
      const where = a.origin ? ` (${a.origin})` : "";
      const more = a.count > 1 ? ` ×${a.count}` : "";
      // A compact magnitude tag, not prose — so it reads as metadata before the
      // message rather than colliding with the sentence ("[+563%] 'x' owns…").
      const mag = a.overrun !== undefined ? ` [+${Number((a.overrun * 100).toFixed(0))}%]` : "";
      lines.push(`  ${i + 1}. ${named}${target}${where}${more}${mag} ${a.message}`);
    });
  }

  const h = verdict.headroom;
  const facts: string[] = [];
  if (h.totalTriangles !== undefined) facts.push(`${h.totalTriangles.toLocaleString()} tris`);
  if (h.totalTextureBytes !== undefined) {
    facts.push(`${Number((h.totalTextureBytes / (1024 * 1024)).toFixed(1))} MiB textures`);
  }
  // "built:", not "headroom:" — with no declared budget there is nothing to
  // have headroom AGAINST, and the old label read as a remaining allowance
  // the reader should compare to something that does not exist.
  if (facts.length > 0) lines.push(`built: ${facts.join(" · ")}`);
}

/**
 * A code whose letter disagrees with the issue's ADJUDICATED severity wears
 * the demotion visibly: `S3D-E-321→info`. The code is the rule's stable
 * identity and never changes; the arrow is the reclassification (imported-
 * geometry posture, mostly) made machine-visible — a grep for `S3D-E-` on a
 * clean compile used to return hits that read as errors, and any script
 * filtering on the prefix got the wrong answer. The prose already explained
 * the posture; only the code letter lied.
 */
function displayCode(code: string, severity: Severity): string {
  const letter = /^S3D-([EWI])-/.exec(code)?.[1];
  const letterSeverity =
    letter === "E" ? "error" : letter === "W" ? "warning" : letter === "I" ? "info" : undefined;
  return letterSeverity && letterSeverity !== severity ? `${code}→${severity}` : code;
}

function appendSection(
  lines: string[],
  title: string,
  issues: Issue[],
  severity: Severity,
  options: ReportOptions,
): void {
  const matching = issues.filter((i) => i.severity === severity);
  if (matching.length === 0) return;
  lines.push("");
  lines.push(`${title}:`);
  for (const issue of matching) {
    const codeTitle = options.issueTitle?.(issue.code);
    const shown = displayCode(issue.code, issue.severity);
    const named = codeTitle ? `${shown} (${codeTitle})` : shown;
    const target = issue.target ? ` [${issue.target}]` : "";
    // attributeIssues resolves each target to the source line that
    // authored it (detail.origin, pre-formatted "scene.json:47"); the
    // report is worthless to an agent if that jump-to-definition answer
    // stays buried in JSON it never reads.
    const origin = issue.detail?.origin as Array<{ at: string }> | undefined;
    const where =
      origin && origin.length > 0
        ? ` (${[...new Set(origin.map((o) => o.at))].join(", ")})`
        : issue.file
          ? ` (${issue.file})`
          : "";
    lines.push(`  ${named}${target}${where} ${issue.message}`);
    const data = compactDetail(issue.detail);
    if (data) lines.push(`    data: ${data}`);
    if (issue.hint) lines.push(`    fix: ${issue.hint}`);
  }
}

/**
 * The measured facts behind a finding, rendered for the model.
 *
 * `detail` is where the pipeline puts what it COMPUTED — z-fight patch
 * extents and axes, float gaps, claim measured-vs-expected, driver logs.
 * Dropping it from the report forced the agent to re-derive numbers the
 * census already paid Blender time for, or worse, to guess. `origin` is
 * excluded because the issue line already carries it as jump-to-definition.
 * Deterministic: keys sorted, numbers trimmed, capped so one verbose
 * finding cannot flood the whole report.
 */
function compactDetail(detail: Record<string, unknown> | undefined): string | null {
  if (!detail) return null;
  const keys = Object.keys(detail)
    .filter((key) => key !== "origin")
    .sort();
  if (keys.length === 0) return null;
  const line = keys.map((key) => `${key}=${fmtDetailValue(detail[key])}`).join(" ");
  // A silent ellipsis reads as "the list ends here". For W-323/W-336 skip
  // lists and E-802 driver logs — exactly the payloads that overflow — the
  // reader must know it is looking at a prefix.
  return line.length > 400
    ? `${line.slice(0, 320)}… (truncated, ${line.length - 320} more chars in the manifest's issue detail)`
    : line;
}

function fmtDetailValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(Number(value.toFixed(4))) : String(value);
  }
  if (typeof value === "string") return value;
  if (value === null || value === undefined || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, (_key, v) =>
      typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(4)) : v,
    );
  } catch {
    return String(value);
  }
}

/** One tweak entry as a compact deterministic line: channels in a fixed
 *  order, numbers trimmed, nothing invented for absent channels. */
function describeTweak(tweak: {
  translate?: [number, number, number];
  quat?: [number, number, number, number];
  scale?: [number, number, number];
  material?: object;
}): string {
  const bits: string[] = [];
  const triple = (v: [number, number, number]) =>
    `[${v.map((n) => Number(n.toFixed(4))).join(", ")}]`;
  if (tweak.translate) bits.push(`moved ${triple(tweak.translate)}`);
  if (tweak.quat) {
    const angle = 2 * Math.acos(Math.min(1, Math.abs(tweak.quat[3])));
    bits.push(`turned ${Number(((angle * 180) / Math.PI).toFixed(1))}°`);
  }
  if (tweak.scale) bits.push(`scaled ${triple(tweak.scale)}`);
  if (tweak.material && Object.keys(tweak.material).length > 0) {
    const m = tweak.material as Record<string, unknown>;
    const parts = Object.keys(m)
      .sort()
      .map((key) => `${key}=${fmtDetailValue(m[key])}`);
    bits.push(`material ${parts.join(" ")}`);
  }
  return bits.join(" · ") || "(empty)";
}

function describePart(part: CompileResult["manifest"]["partTree"][number]): string {
  const mesh = part.mesh ? `:${part.mesh.verts}v/${part.mesh.faces}f` : "";
  return `${part.name}(${part.type.toLowerCase()}${mesh})`;
}

function fmt(value: number | null): string {
  return value === null ? "-" : String(value);
}

/** A linear-RGB triple as an sRGB `#rrggbb` string — the same linear→sRGB
 *  transfer the kit page's swatches use, so the hex an agent reads here is the
 *  hex a human sees on the material ball. */
function srgbHex(rgb: readonly [number, number, number]): string {
  const enc = (c: number) => {
    const v = Math.max(0, Math.min(1, c));
    const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(s * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${enc(rgb[0])}${enc(rgb[1])}${enc(rgb[2])}`;
}

/** Metres, shown in mm below 10cm so "0.002" reads as the 2mm it is. */
function fmtM(value: number): string {
  if (value < 0.1) return `${Number((value * 1000).toFixed(1))}mm`;
  return `${Number(value.toFixed(3))}m`;
}
