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
}

export function renderAgentReport(result: CompileResult, options: ReportOptions = {}): string {
  const lines: string[] = [];
  const { errors, warnings, infos } = result.summary;

  lines.push(`<scene3d-report ok="${result.ok}" errors="${errors}" warnings="${warnings}">`);
  lines.push(`source: ${result.source.kind} (${result.source.files.join(", ") || "none"})`);
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
    lines.push(`proof: ${result.proofImages.length} frame(s) — ${result.proofImages[0]}`);
  }
  if (result.exportedAssets.length > 0) {
    lines.push(`assets: ${result.exportedAssets.join(", ")}`);
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

  // Synthesis header: the ranked "fix first" summary an agent reads before the
  // full list. Pure curation over the same issues — most-actionable first,
  // ranked by measured overrun then reach — so the model spends its next turn
  // on what matters, not the first code it happens to see.
  appendVerdict(lines, assessVerdict(result));

  appendSection(lines, "errors", result.issues, "error");
  appendSection(lines, "warnings", result.issues, "warning");
  if (infos > 0) appendSection(lines, "info", result.issues, "info");

  if (result.ok) {
    lines.push("");
    lines.push(
      warnings > 0
        ? "verdict: compiles clean; warnings above are advisory."
        : "verdict: compiles clean.",
    );
  } else {
    lines.push("");
    lines.push("verdict: fix every error above, then compile again.");
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
  const shown = result.proofImages.slice(0, MAX_ASCII_FRAMES);
  lines.push("");
  lines.push(
    `frames (${shown.length} of ${result.proofImages.length}, ${ASCII_COLUMNS} cols, ' ' dark -> '@' lit):`,
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
function appendVerdict(lines: string[], verdict: Verdict): void {
  if (verdict.actions.length === 0 && verdict.grade === "pass") return;
  lines.push("");
  const dims = verdict.dimensions.map((d) => d.dimension).join(", ");
  lines.push(`summary: ${verdict.grade}${dims ? ` — ${dims}` : ""}`);

  const top = verdict.actions.slice(0, 3);
  if (top.length > 0) {
    lines.push("fix first:");
    top.forEach((a, i) => {
      const target = a.target ? ` [${a.target}]` : "";
      const where = a.origin ? ` (${a.origin})` : "";
      const more = a.count > 1 ? ` ×${a.count}` : "";
      // A compact magnitude tag, not prose — so it reads as metadata before the
      // message rather than colliding with the sentence ("[+563%] 'x' owns…").
      const mag = a.overrun !== undefined ? ` [+${Number((a.overrun * 100).toFixed(0))}%]` : "";
      lines.push(`  ${i + 1}. ${a.code}${target}${where}${more}${mag} ${a.message}`);
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
): void {
  const matching = issues.filter((i) => i.severity === severity);
  if (matching.length === 0) return;
  lines.push("");
  lines.push(`${title}:`);
  for (const issue of matching) {
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
    lines.push(`  ${issue.code}${target}${where} ${issue.message}`);
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
  return line.length > 400 ? `${line.slice(0, 397)}…` : line;
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
