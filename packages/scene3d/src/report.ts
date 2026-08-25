import * as fs from "node:fs";
import * as path from "node:path";
import { CompileResult, Issue, Severity } from "./types.js";
import { ISSUE_CODES } from "./errors.js";
import { formatAsciiFrame, renderAsciiFrame } from "./read/ascii.js";
import { formatImpact } from "./read/impact.js";
import { assessVerdict, type Verdict } from "./verdict.js";

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
    lines.push(`parts (${parts.length}): ${parts.map(describePart).join(", ")}`);
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
    lines.push("solved boxes (id · centre · size · rests on):");
    const CAP = 40;
    for (const part of result.solved.parts.slice(0, CAP)) {
      const centre = part.center.map((v: number) => fmtM(v)).join(", ");
      const size = part.size.map((v: number) => fmtM(v)).join(" × ");
      const origin = part.from ? ` (from ${part.from})` : "";
      const rests = part.restsOn ? ` · rests on ${part.restsOn}` : "";
      // The size printed above is the WORLD box (the rotated bound), so a
      // rotated part's row otherwise reads as a part the author never
      // authored. Naming the rotation is what makes the number explicable.
      const rot = part.rotate ? ` · rot ${part.rotate.axis} ${part.rotate.deg}°` : "";
      lines.push(`  ${part.id}${origin}: (${centre}) · ${size}${rot}${rests}`);
    }
    const total = result.solved.parts.length;
    if (total > CAP) {
      lines.push(`  … +${total - CAP} more parts`);
    }
  }
  if (result.manifest.materials.length > 0) {
    lines.push(
      `materials: ${result.manifest.materials
        .map((m) => `${m.name}[metallic=${fmt(m.metallic)} roughness=${fmt(m.roughness)}]`)
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
    const parts = [size, small, `${metrics.totalTriangles.toLocaleString()} tris`].filter(Boolean);
    lines.push(`scale: ${parts.join(" · ")}`);
  }
  if (result.proofImages.length > 0) {
    /* `cached` frames are still THIS scene's render (the hash matched); only
       a skipped/absent proof stage means the files predate the edit. Saying
       so matters: a `--stages` iteration loop used to present last week's
       render as if it photographed today's geometry. */
    const proofStage = result.stages.find((s) => s.id === "proof");
    const carried = !proofStage || proofStage.status === "skipped";
    lines.push(
      `proof: ${result.proofImages.length} frame(s) — ${result.proofImages[0]}` +
        (carried ? " (carried from a previous compile — proof did not run this time)" : "") +
        " · real PNGs: open them directly if you can read images",
    );
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
  }
  /* The claims ledger, in both directions. Failures already surface as
     S3D-E-701 lines; the SUCCESS was silent, so an author who declared
     claims could not tell "adjudicated and held" from "ignored". */
  const ledger = result.manifest.claims;
  if (ledger) {
    lines.push(
      ledger.failed === 0
        ? `claims: ${ledger.declared}/${ledger.declared} held`
        : `claims: ${ledger.declared - ledger.failed}/${ledger.declared} held — ${ledger.failed} failed (S3D-E-701 below)`,
    );
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
    lines.push(
      `frames: ${measured.length} · subject ${(mean((f) => f.coverage) * 100).toFixed(0)}% of frame · ` +
        `lum ${mean((f) => f.meanLuminance).toFixed(2)} · clipped ${(mean((f) => f.blownRatio) * 100).toFixed(1)}%` +
        (dark > 0 ? ` · ${dark} empty` : ""),
    );
  }
  // How connected the result is. Arithmetic, not a verdict: floating is a
  // legitimate composition and the compiler has no opinion about it. But a
  // scene that came out as islands rather than one object is invisible to an
  // author who cannot see the render, and this is the only place it shows.
  const connectivity = result.manifest.connectivity;
  if (connectivity && connectivity.isolated > 0) {
    const names = connectivity.isolatedParts.join(", ");
    const more = connectivity.isolated - connectivity.isolatedParts.length;
    lines.push(
      `contact: ${connectivity.touching} part(s) touch another, ${connectivity.isolated} touch nothing` +
        ` — ${names}${more > 0 ? ` +${more} more` : ""}`,
    );
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
    if (result.census) {
      lines.push(
        "  out/ortho.svg — dimensioned plan/front/side drawings (SVG = text-readable); a 2-second look catches proportion and overlap mistakes the turntable obscures",
      );
    }
    lines.push("  out/digest.md — the census in prose, with the per-part dimensions table");
    lines.push("  out/read-model.json — the full census, machine-readable");
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
      lines.push(
        "next: before calling it done, walk one proof frame and out/ortho.svg — a clean compile proves the build, not the design.",
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
  lines.push("");
  lines.push(
    `frames (${shown.length} of ${all.length}, sampled around the orbit, ${ASCII_COLUMNS} cols, ' ' dark -> '@' lit):`,
  );
  for (const rel of shown) {
    try {
      const png = fs.readFileSync(path.join(options.projectDir, rel));
      lines.push(formatAsciiFrame(path.basename(rel), renderAsciiFrame(png, { columns: ASCII_COLUMNS })));
    } catch (err: any) {
      lines.push(`${path.basename(rel)}  could not be read: ${err?.message ?? String(err)}`);
    }
  }
}

const MAX_ASCII_FRAMES = 4;
const ASCII_COLUMNS = 48;

function appendDelta(lines: string[], result: CompileResult): void {
  const impact = result.impact;
  lines.push("");
  if (!impact) {
    lines.push("delta: first compile — no baseline");
    return;
  }
  if (impact.unchanged) {
    lines.push("delta: unchanged since previous compile");
    return;
  }
  lines.push("delta (since previous compile):");
  for (const line of formatImpact(impact, { maxLines: 20 }).split("\n")) {
    lines.push(`  ${line}`);
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
      const named = title ? `${a.code} (${title})` : a.code;
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
  if (facts.length > 0) lines.push(`headroom: ${facts.join(" · ")}`);
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
    const named = codeTitle ? `${issue.code} (${codeTitle})` : issue.code;
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

/** Metres, shown in mm below 10cm so "0.002" reads as the 2mm it is. */
function fmtM(value: number): string {
  if (value < 0.1) return `${Number((value * 1000).toFixed(1))}mm`;
  return `${Number(value.toFixed(3))}m`;
}
