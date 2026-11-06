/** Scoring and the three report files (results.json, table.md, baseline.json) for the edit accuracy bench. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { percentile } from "./geometry.mjs";

export const LIMIT_PX = 0.5;
/** An undo or redo whose file write lands later than this after its key fails the undo check. */
export const UNDO_WRITE_MAX_MS = 2000;
const lateUndo = (r) => Math.max(r.undo.ms ?? 0, r.undo.redoMs ?? 0) > UNDO_WRITE_MAX_MS;
// A frame over 1.5 vsyncs is dropped; raw rAF p95 stays reported so a different rule re-scores without a re-run.
const DROPPED_FRAME_MS = 25;
/** Smooth means no main-thread frame over this, and no more dropped frames than the blank-page control. */
const WORK_MS = 8;
/** A runner whose first cases take a median of over 3x their usual seconds is too slow to measure on. */
export const SLOW_RUNNER = { cases: 4, multiple: 3 };
/** First cases' median multiple of `expected` seconds if it marks a slow runner, else null; the control misses it. */
export function slowRunner(results, expected) {
  if (results.length < SLOW_RUNNER.cases) return null;
  const multiples = results.slice(0, SLOW_RUNNER.cases).map((r) => r.seconds / expected(r));
  const median = percentile(multiples, 50);
  return median > SLOW_RUNNER.multiple ? median : null;
}
export const METRICS = [
  "tracking",
  "press",
  "teleport",
  "drop",
  "reload",
  "render",
  "undo",
  "text",
  "keys",
  "css",
  "renderKey",
  "smooth",
];

/** Worst-first value per metric; undo ranks by box distance, and its byte failures are counted apart. */
const worstValue = {
  tracking: (r) => r.tracking.max,
  press: (r) => r.pressJump ?? 0,
  teleport: (r) => r.teleport?.max ?? 0,
  text: (r) => (r.text && !r.text.pass ? 1 : 0),
  drop: (r) => r.drop,
  reload: (r) => r.reload,
  render: (r) => r.render ?? 0,
  keys: (r) => r.keys?.diff ?? 0,
  css: (r) => r.css?.stray.length ?? 0,
  renderKey: (r) => r.renderKey ?? 0,
  undo: (r) => Math.max(r.undo.box, r.undo.redoBox ?? 0),
  smooth: (r) => r.smooth.dropped - r.smooth.control.dropped,
};

/** Dropped frames and the worst frame's main-thread ms, from the raw intervals and trace work a case stores. */
const frameBudget = (smooth) => ({
  ...smooth,
  dropped: smooth.intervals.filter((d) => d > DROPPED_FRAME_MS).length,
  workMax: smooth.work && Math.max(0, ...smooth.work),
});

/** The metrics each snapshot feeds; a snapshot whose preview never held still fails them. */
const FED_BY = {
  pre: ["press", "undo"],
  committed: ["drop", "reload", "undo"],
  undone: ["undo"],
  redone: ["undo"],
  reloaded: ["reload", "render", "keys", "renderKey"],
};
const unsettledMetrics = (r) => new Set(r.unsettled.flatMap((k) => FED_BY[k]));

// fallow-ignore-next-line complexity
export function score(spec, r) {
  if (r.error)
    return {
      ...spec,
      ...r,
      checks: Object.fromEntries(METRICS.map((m) => [m, false])),
      pass: false,
    };
  const smooth = { ...frameBudget(r.smooth), control: frameBudget(r.smooth.control) };
  const checks = {
    tracking: r.tracking.max <= LIMIT_PX,
    press: r.pressJump === null || r.pressJump <= LIMIT_PX,
    // Null for a key gesture; a drag whose frames could not be measured fails.
    teleport: r.teleport === null || r.teleport.pass === true,
    // Text cases only: the typed word saved and shown after a reload (and a selected word stays editable).
    text: !r.text || r.text.pass,
    // Keyframed cases only: the other keyframes keep their values, no animated property gets plain CSS,
    // and the producer matches the preview at another keyframe too.
    keys: !r.keys || r.keys.pass,
    css: !r.css || r.css.pass,
    renderKey: r.renderKey === undefined || (r.renderKey !== null && r.renderKey <= LIMIT_PX),
    drop: r.drop <= LIMIT_PX,
    reload: r.reload <= LIMIT_PX,
    render: r.render !== null && r.render <= LIMIT_PX,
    undo:
      !r.undoTimeout &&
      r.undo.groups !== false &&
      r.undo.bytes &&
      r.undo.redoBytes &&
      Math.max(r.undo.box, r.undo.redoBox) <= LIMIT_PX &&
      !lateUndo(r),
    // Only drops beyond the blank page's, driven the same way in the same Chrome, are the edit's.
    smooth:
      smooth.dropped <= smooth.control.dropped &&
      smooth.workMax !== null &&
      smooth.workMax <= WORK_MS,
  };
  for (const m of unsettledMetrics(r)) checks[m] = false;
  return { ...spec, ...r, smooth, checks, pass: METRICS.every((m) => checks[m]) };
}

const round = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v);
// Rounded up for baseline.json, so a stored value passes a limit only if the measured one did (to 1e-11).
const roundUp = (v) => (v === null ? null : Math.ceil(v * 100 - 1e-9) / 100);

const medianMax = (values) =>
  values.length ? `${round(percentile(values, 50))}/${round(Math.max(...values))}` : "-";

function smoothSummary(measured) {
  const s = measured.map((r) => r.smooth);
  return {
    unknown: s.filter((x) => x.workMax === null).length,
    dropped: medianMax(s.map((x) => x.dropped)),
    control: medianMax(s.map((x) => x.control.dropped)),
    p95: medianMax(s.map((x) => x.p95)),
    controlP95: medianMax(s.map((x) => x.control.p95)),
  };
}

// Smoothness is reported, never gated, so accuracy is every other check.
const accurateChecks = (r) => METRICS.every((m) => m === "smooth" || r.checks[m]);

function summarize(results, seconds) {
  const passing = results.filter((r) => accurateChecks(r) && r.checks.smooth).length;
  const accurate = results.filter(accurateChecks).length;
  const measured = results.filter((r) => !r.error);
  const perMetric = METRICS.map((m) => {
    const worst = measured.reduce(
      (a, r) => (!a || worstValue[m](r) > worstValue[m](a) ? r : a),
      null,
    );
    return {
      metric: m,
      pass: results.filter((r) => r.checks[m]).length,
      worst: worst && {
        id: worst.id,
        value: round(worstValue[m](worst)),
        unsettled: unsettledMetrics(worst).has(m),
      },
    };
  });
  return {
    passing,
    accurate,
    total: results.length,
    errors: results.length - measured.length,
    bytesDiffer: {
      undo: measured.filter((r) => !r.undo.bytes).length,
      redo: measured.filter((r) => !r.undo.redoBytes).length,
    },
    perMetric,
    unsettled: measured.filter((r) => r.unsettled.length).length,
    undoTimeouts: measured.filter((r) => r.undoTimeout).length,
    undoSlow: measured.filter(lateUndo).length,
    renderErrors: measured.filter((r) => r.renderError).length,
    smooth: smoothSummary(measured),
    seconds: Math.round(seconds),
  };
}

// fallow-ignore-next-line complexity
const metricRow = (m, total) =>
  `| ${m.metric} | ${m.pass}/${total} | ${m.worst?.value ?? "-"}${m.worst?.unsettled ? " (unsettled)" : ""} | ${m.worst?.id ?? "-"} |`;

function table(summary, meta, results) {
  const lines = [
    `# Edit accuracy: ${summary.accurate}/${summary.total} cases pass`,
    "",
    `Every metric counts except smoothness, which is reported against the blank-page control: ${summary.perMetric.find((m) => m.metric === "smooth").pass}/${summary.total} pass it, and ${summary.passing}/${summary.total} pass everything including it.`,
    "",
    `Studio ${meta.studio} (build ${meta.build}), bench ${meta.bench}, grid \`${meta.grid}\`, ${meta.date}, ${summary.seconds}s with ${meta.jobs} jobs, ${summary.errors} harness errors, load ${meta.load}.`,
    `Pass: tracking, press jump, teleport, drop, reload and render ≤ ${LIMIT_PX} px; undo and redo byte-identical with the box ≤ ${LIMIT_PX} px; no more frames over ${DROPPED_FRAME_MS} ms than the blank-page control, and no frame over ${WORK_MS} ms of main-thread work.`,
    "",
    `Undo or redo left different bytes in ${summary.bytesDiffer.undo} undo and ${summary.bytesDiffer.redo} redo cases.`,
    `The preview never held still within 15 s in ${summary.unsettled} cases; the metrics that snapshot feeds fail.`,
    `An undo or redo write never landed within 60 s in ${summary.undoTimeouts} cases; undo fails there.`,
    `An undo or redo write landed later than ${UNDO_WRITE_MAX_MS} ms after its key in ${summary.undoSlow} cases; undo fails there.`,
    `The producer failed to render ${summary.renderErrors} cases; render fails there.`,
    `Smoothness: ${summary.smooth.unknown} cases with unknown work; dropped frames per case (median/max) ${summary.smooth.dropped}, blank-page control ${summary.smooth.control}; raw rAF p95 (median/max) ${summary.smooth.p95} ms, control ${summary.smooth.controlP95} ms.`,
    "",
    "| Metric | Pass | Worst | Worst case |",
    "|---|---|---|---|",
    ...summary.perMetric.map((m) => metricRow(m, summary.total)),
    "",
    "| Gesture | Cases | Accurate | " + METRICS.join(" | ") + " |",
    "|---|---|---|" + METRICS.map(() => "---").join("|") + "|",
  ];
  for (const g of [...new Set(results.map((r) => r.gesture))]) {
    const rs = results.filter((r) => r.gesture === g);
    lines.push(
      `| ${g} | ${rs.length} | ${rs.filter(accurateChecks).length} | ${METRICS.map((m) => rs.filter((r) => r.checks[m]).length).join(" | ")} |`,
    );
  }
  return lines.join("\n") + "\n";
}

/** One case as baseline.json holds it; the gate reads the same projection. */
// fallow-ignore-next-line complexity
export function entry(r) {
  if (r.error) return { error: true };
  return {
    smooth: r.checks.smooth,
    tracking: roundUp(r.tracking.max),
    pressJump: roundUp(r.pressJump),
    teleport: r.checks.teleport,
    teleportPx: roundUp(r.teleport?.max ?? null),
    ...(r.text && { text: r.text.pass }),
    ...(r.keys && { keys: r.keys.pass, css: r.css.pass, renderKey: roundUp(r.renderKey ?? null) }),
    drop: roundUp(r.drop),
    reload: roundUp(r.reload),
    render: roundUp(r.render),
    undo: r.checks.undo,
    dropped: r.smooth.dropped,
    controlDropped: r.smooth.control.dropped,
    workMax: roundUp(r.smooth.workMax),
    frameP95: roundUp(r.smooth.p95),
    ...(r.unsettled.length && { unsettled: r.unsettled }),
    ...(r.undoTimeout && { undoTimeout: r.undoTimeout }),
    ...(lateUndo(r) && { undoMs: r.undo.ms, redoMs: r.undo.redoMs }),
    ...(r.renderError && { renderError: true }),
  };
}

/** One line per case, so a baseline diff reads case by case. */
function baseline(meta, results) {
  const entries = [...results]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => `    ${JSON.stringify(r.id)}: ${JSON.stringify(entry(r))}`);
  return `{\n  "studio": ${JSON.stringify(meta.studio)},\n  "build": ${JSON.stringify(meta.build)},\n  "bench": ${JSON.stringify(meta.bench)},\n  "grid": ${JSON.stringify(meta.grid)},\n  "cases": {\n${entries.join(",\n")}\n  }\n}\n`;
}

/** Writes results.json, table.md and baseline.json into `out`; returns the table. */
export function writeReport(out, meta, results, seconds) {
  const summary = summarize(results, seconds);
  writeFileSync(
    join(out, "results.json"),
    JSON.stringify({ meta, summary, cases: results }, null, 1),
  );
  writeFileSync(join(out, "table.md"), table(summary, meta, results));
  writeFileSync(join(out, "baseline.json"), baseline(meta, results));
  return table(summary, meta, results);
}
