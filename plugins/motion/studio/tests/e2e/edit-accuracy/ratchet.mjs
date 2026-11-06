#!/usr/bin/env node
// Edit accuracy gate against the base branch's baseline.json; smoothness is reported, never gated.
// `flipped <base> <results>` lists cases to re-run twice; `gate [--shards n] <base> <head> <out> <results...>`
// judges 2 of 3. A case whose runs disagree is listed as unstable. A newly passing case is reported, never gated.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LIMIT_PX, entry, writeReport } from "./report.mjs";

const GATED_PX = ["tracking", "pressJump", "drop", "reload", "render", "renderKey"];
const LISTED = 30;

/** Passes every gated metric; an unsettled preview fails the metrics it fed, all of them gated. */
// fallow-ignore-next-line complexity
export const accurate = (e) =>
  Boolean(e) &&
  !e.error &&
  !e.unsettled &&
  !e.renderError &&
  e.undo === true &&
  // A pass/fail value, so an unmeasured drag fails; base entries from before the metric hold none.
  e.teleport !== false &&
  // A text case's edit opened, and its word saved and shown (and a word selected, for select).
  e.text !== false &&
  // Keyframed cases: other keyframes unchanged, no stray CSS, and a measured second render.
  e.keys !== false &&
  e.css !== false &&
  e.renderKey !== null &&
  GATED_PX.every((m) => !(e[m] > LIMIT_PX));

/** Cases whose verdict here differs from the base branch, either way: each is re-run twice before the gate. */
export const flipped = (base, results) =>
  results.filter((r) => accurate(base.cases[r.id]) !== accurate(entry(r))).map((r) => r.id);

const summary = (e) =>
  e.error
    ? "error"
    : `${GATED_PX.map((m) => `${m} ${e[m] ?? "-"}`).join(", ")}, undo ${e.undo}, teleport ${e.teleport ?? "-"}`;

/** The gate's verdict on one case's runs: it passes when fewer than half fail. */
const passes = (entries) => entries.filter((e) => !accurate(e)).length * 2 < entries.length;
/** Reported, never gated: most runs had no extra dropped frame and no frame over the work budget. */
const mostlySmooth = (entries) => entries.filter((e) => e.smooth).length * 2 > entries.length;

/** One run per case that agrees with the gate's verdict, so a banked baseline.json matches the gate. */
export function bankable(runs) {
  const byId = Map.groupBy(runs, (r) => r.id);
  return [...byId.values()].map((rs) => {
    const verdict = passes(rs.map(entry));
    return rs.find((r) => accurate(entry(r)) === verdict);
  });
}

/**
 * Cases a real Studio race flips run to run, with the PR fixing it: measured and listed every run, never gated.
 * The fixing PR deletes its own ids here and re-banks them in the same PR.
 */
export const QUARANTINED = {
  // Undo or redo of a keyframed plain element restores the bytes but sometimes leaves the box 230-400px off.
  "seqplainkeys-none-center-r0-nested-z100": "#6989",
  "seqplainkeys-none-center-r0-root-z100": "#6989",
  "seqplainkeys-none-center-r30-root-z100": "#6989",
  "seqplainkeys-none-pct-r0-root-z100": "#6989",
  "seqplainkeys-none-pct-r30-root-z100": "#6989",
  "seqplainkeys-none-px-r0-nested-z100": "#6989",
  "seqplainkeys-none-px-r30-nested-z100": "#6989",
  "seqplainkeys-none-px-r30-root-z100": "#6989",
};

/**
 * Every run of every case: each shard's run plus the re-runs of the cases it flipped. `scope`, for a run of
 * part of the grid, limits the base branch's passing count to the cases that ran. A case removed from the grid
 * on purpose leaves the head's baseline.json in the same change: it is listed as retired and no longer counted.
 */
// fallow-ignore-next-line complexity
export function gate(base, head, runs, quarantine = QUARANTINED, scope = null) {
  const counted = (id) => Object.hasOwn(head.cases, id) && (!scope || scope.has(id));
  const seen = new Map();
  for (const r of runs) seen.set(r.id, [...(seen.get(r.id) ?? []), entry(r)]);
  const all = [...seen].map(([id, entries]) => {
    return {
      id,
      entries,
      passed: passes(entries),
      basePassed: accurate(base.cases[id]),
    };
  });
  const cases = all.filter((c) => !Object.hasOwn(quarantine, c.id));
  const passing = cases.filter((c) => c.passed);
  const result = {
    quarantined: Object.entries(quarantine).map(([id, fixer]) => {
      const c = all.find((x) => x.id === id);
      return { id, fixer, passed: c?.passed ?? null, runs: c?.entries.map(accurate) ?? [] };
    }),
    basePassing: Object.entries(base.cases).filter(
      ([id, e]) => !Object.hasOwn(quarantine, id) && counted(id) && accurate(e),
    ).length,
    headPassing: passing.length,
    headSmooth: passing.filter((c) => mostlySmooth(c.entries)).length,
    regressed: cases.filter((c) => c.basePassed && !c.passed).map((c) => c.id),
    unstable: cases
      .filter((c) => new Set(c.entries.map(accurate)).size > 1)
      .map((c) => ({ id: c.id, runs: c.entries.map(summary) })),
    newlyPassing: passing.filter((c) => !c.basePassed).map((c) => c.id),
    unbanked: passing.filter((c) => !accurate(head.cases[c.id])).map((c) => c.id),
    overclaimed: cases.filter((c) => !c.passed && accurate(head.cases[c.id])).map((c) => c.id),
    missing: Object.keys(base.cases).filter((id) => counted(id) && !seen.has(id)),
    retired: Object.keys(base.cases).filter((id) => !Object.hasOwn(head.cases, id)),
  };
  const reasons = [
    result.regressed.length &&
      `${result.regressed.length} case(s) that pass on the base branch fail here`,
    result.headPassing < result.basePassing &&
      `the passing count fell from ${result.basePassing} to ${result.headPassing}`,
    result.overclaimed.length &&
      `baseline.json marks ${result.overclaimed.length} failing case(s) as passing`,
  ].filter(Boolean);
  return { ...result, ok: reasons.length === 0, reasons };
}

const list = (title, ids) =>
  ids.length
    ? [
        `**${title}** (${ids.length})`,
        ...ids.slice(0, LISTED).map((id) => `- ${id}`),
        ids.length > LISTED ? `- ...` : "",
        "",
      ]
    : [];

export function comment(g) {
  return [
    "<!-- edit-accuracy -->",
    `### Edit accuracy: accurate ${g.headPassing} (base branch ${g.basePassing}), smooth ${g.headSmooth} of those`,
    "",
    g.ok ? "The gate passes." : `The gate fails: ${g.reasons.join("; ")}.`,
    "Smoothness is reported in the artifact, not gated. A case fails only if it fails 2 of 3 runs.",
    "",
    ...list("Regressed", g.regressed),
    ...list("Newly passing", g.newlyPassing),
    ...list(
      "Not banked yet, reported and not gated (bank a full-grid run's baseline.json)",
      g.unbanked,
    ),
    ...list("Marked passing in baseline.json but failing", g.overclaimed),
    ...list("In the base grid but not run", g.missing),
    ...list("Retired: removed from baseline.json with the grid, not counted", g.retired),
    `**Quarantined, measured but not gated** (${g.quarantined.length})`,
    ...g.quarantined.map(
      (q) =>
        `- ${q.id} (fixed by ${q.fixer}): ${q.runs.map((ok) => (ok ? "pass" : "fail")).join(" / ") || "not run"}${q.passed === null ? "" : q.passed ? ", passes" : ", fails"}`,
    ),
    "",
    ...(g.unstable.length
      ? [
          `**Unstable** (${g.unstable.length})`,
          ...g.unstable.slice(0, LISTED).map((u) => `- ${u.id}: ${u.runs.join(" / ")}`),
          "",
        ]
      : []),
  ].join("\n");
}

// Strict: CI writes {"cases":{}} for a missing base, so a file that does not parse is broken, not empty.
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** The grid a shard ran, from its first run's meta ("pr shard 2/5"); re-runs record their filter instead. */
const gridOf = (results) => results.find((r) => !r.meta.rerun)?.meta.grid.split(" ")[0];

const VERDICTS = {
  0: "Edit accuracy holds against the base branch.",
  1: "Edit accuracy fell against the base branch; see the PR comment.",
};
const notRun = (reported) => `Edit accuracy did not run: ${reported}; see the shard jobs.`;

/** Writes what the workflow posts and prints; the verdict is the only text it shows for a failed gate. */
function report(out, markdown, g) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "comment.md"), markdown);
  writeFileSync(join(out, "gate.json"), JSON.stringify(g, null, 1));
  console.log(markdown);
}

// fallow-ignore-next-line complexity
function main(argv) {
  const shardsAt = argv.indexOf("--shards");
  const shards = shardsAt === -1 ? null : Number(argv.splice(shardsAt, 2)[1]);
  const [command, basePath, ...rest] = argv;
  const base = readJson(basePath);
  if (command === "flipped") {
    for (const id of flipped(base, readJson(rest[0]).cases)) console.log(id);
    return 0;
  }
  const [headPath, out, ...resultPaths] = rest;
  const runs = resultPaths.map((p) => readJson(p));
  if (!runs.length) {
    const verdict = notRun(`0 of ${shards ?? "the"} shards reported results`);
    report(
      out,
      `<!-- edit-accuracy -->\n### ${verdict}\n\nNothing was compared with the base branch.\n`,
      {
        ok: false,
        verdict,
      },
    );
    return 2;
  }
  const cases = runs.flatMap((r) => r.cases);
  const full = gridOf(runs) === "full";
  const g = gate(
    base,
    readJson(headPath),
    cases,
    QUARANTINED,
    full ? null : new Set(cases.map((c) => c.id)),
  );
  // A shard that died uploads nothing, so the count of first runs is what shows it.
  const firstRuns = runs.filter((r) => !r.meta.rerun).length;
  const shortfall =
    shards !== null && firstRuns !== shards && `${firstRuns} of ${shards} shards reported results`;
  // A case that ran and fell is a drop; a shard that did not report is not one.
  const code = g.ok ? (shortfall ? 2 : 0) : 1;
  if (shortfall) g.reasons.push(shortfall);
  g.ok = code === 0;
  g.verdict = code === 2 ? notRun(shortfall) : VERDICTS[code];
  report(out, comment(g), g);
  // A baseline.json to commit when cases newly pass; only a full grid holds every case.
  if (full) writeReport(out, { ...runs[0].meta, grid: "full (CI)" }, bankable(cases), 0);
  if (g.unbanked.length && process.env.GITHUB_ACTIONS)
    console.log(
      `::notice title=Edit accuracy::${g.unbanked.length} newly passing case(s) are not banked in baseline.json; not gated.`,
    );
  return code;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2));
