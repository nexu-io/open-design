/**
 * Verdict synthesis — the third object (issues → curation).
 *
 * The compiler is `solve → census`; worldlint is `census → issues`; this is
 * `issues → verdict`: a graded, RANKED "what to fix first", plus honest
 * headroom facts. It is pure synthesis over what already exists — no new
 * measurement, no invented score. The grade is defensible in one sentence
 * (fail ⟺ an error, attention ⟺ a warning, else pass) and the ranking is by
 * MEASURED overrun where a finding carries one, else by how many parts it hits.
 * Nothing here has a weight to argue about.
 */

import { CompileResult, Issue, Severity } from "./types.js";

export type Grade = "pass" | "attention" | "fail";

export type Dimension =
  | "naming"
  | "geometry"
  | "materials"
  | "uv"
  | "intent"
  | "claims"
  | "staging"
  | "conformance"
  | "other";

export interface VerdictAction {
  code: string;
  severity: Severity;
  /** How many findings share this code (parts affected, roughly). */
  count: number;
  /** The first affected target, for a jump-to line. */
  target?: string;
  /** Worst measured overrun among this code's findings, when any carries one. */
  overrun?: number;
  /** The most-actionable single message + its origin, verbatim. */
  message: string;
  origin?: string;
  hint?: string;
}

export interface Verdict {
  grade: Grade;
  dimensions: Array<{ dimension: Dimension; grade: Grade; codes: string[] }>;
  /** Findings collapsed by code and ranked most-actionable first. */
  actions: VerdictAction[];
  headroom: {
    totalTriangles?: number;
    /** Decoded VRAM of the scene's distinct textures (bytes). */
    totalTextureBytes?: number;
  };
}

/** Map a stable code to the concern it belongs to (data, by numeric range). */
export function dimensionOf(code: string): Dimension {
  const n = Number(/-(\d+)$/.exec(code)?.[1] ?? -1);
  if (n >= 300 && n <= 319) return "naming";
  if (n >= 320 && n <= 339) return "geometry";
  if (n >= 340 && n <= 359) return "materials";
  if (n >= 360 && n <= 379) return "geometry"; // units / transforms
  if (n >= 380 && n <= 419) return "staging"; // proof + exported stage
  if (n >= 440 && n <= 459) return "uv";
  if (n >= 500 && n <= 519) return "conformance"; // glTF/USD oracles
  if (n >= 600 && n <= 619) return "materials"; // sheets
  if (n >= 700 && n <= 719) return "claims";
  if (n >= 800 && n <= 819) return "materials"; // shaders
  if (n >= 900 && n <= 919) return "conformance"; // master parity
  if (n >= 950 && n <= 969) return "intent";
  return "other";
}

const gradeOf = (issues: Issue[]): Grade =>
  issues.some((i) => i.severity === "error")
    ? "fail"
    : issues.some((i) => i.severity === "warning")
      ? "attention"
      : "pass";

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

function originOf(issue: Issue): string | undefined {
  const origin = issue.detail?.origin as Array<{ at: string }> | undefined;
  if (origin && origin.length > 0) return [...new Set(origin.map((o) => o.at))].join(", ");
  return issue.file;
}

/** Synthesise the verdict for one compile. Pure and deterministic. */
export function assessVerdict(result: CompileResult): Verdict {
  const issues = result.issues;

  // ---- dimension grades ----
  const byDimension = new Map<Dimension, Issue[]>();
  for (const issue of issues) {
    const d = dimensionOf(issue.code);
    (byDimension.get(d) ?? byDimension.set(d, []).get(d)!).push(issue);
  }
  const dimensions = [...byDimension.entries()]
    .map(([dimension, group]) => ({
      dimension,
      grade: gradeOf(group),
      codes: [...new Set(group.map((i) => i.code))].sort(),
    }))
    .filter((d) => d.grade !== "pass")
    .sort((a, b) =>
      SEVERITY_GRADE[a.grade] - SEVERITY_GRADE[b.grade] || a.dimension.localeCompare(b.dimension),
    );

  // ---- ranked actions (collapse by code) ----
  const byCode = new Map<string, Issue[]>();
  for (const issue of issues) (byCode.get(issue.code) ?? byCode.set(issue.code, []).get(issue.code)!).push(issue);

  const actions: VerdictAction[] = [...byCode.entries()].map(([code, group]) => {
    const overruns = group
      .map((i) => i.detail?.overrun)
      .filter((v): v is number => typeof v === "number");
    const worst = group[0]!;
    return {
      code,
      severity: worst.severity,
      count: group.length,
      ...(worst.target ? { target: worst.target } : {}),
      ...(overruns.length > 0 ? { overrun: Math.max(...overruns) } : {}),
      message: worst.message,
      ...(originOf(worst) ? { origin: originOf(worst) } : {}),
      ...(worst.hint ? { hint: worst.hint } : {}),
    };
  });
  actions.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || // errors first
      (b.overrun ?? -Infinity) - (a.overrun ?? -Infinity) || // then worst measured overrun
      b.count - a.count || // then most parts affected
      a.code.localeCompare(b.code), // deterministic tiebreak
  );

  // ---- headroom (facts, always safe to show) ----
  const headroom: Verdict["headroom"] = {};
  if (result.manifest.metrics) headroom.totalTriangles = result.manifest.metrics.totalTriangles;
  const bytes = totalTextureBytes(result);
  if (bytes !== undefined) headroom.totalTextureBytes = bytes;

  return { grade: gradeOf(issues), dimensions, actions, headroom };
}

const SEVERITY_GRADE: Record<Grade, number> = { fail: 0, attention: 1, pass: 2 };

function totalTextureBytes(result: CompileResult): number | undefined {
  const textures = result.census?.textures;
  if (!textures || textures.length === 0) return undefined;
  let sum = 0;
  for (const t of textures) sum += Math.max(0, t.width) * Math.max(0, t.height) * 4;
  return sum;
}
