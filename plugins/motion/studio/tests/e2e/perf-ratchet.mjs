#!/usr/bin/env node
/**
 * Work-count ratchet: each gated counter has a ceiling in perf-ceilings.json that may only go
 * down. A journey fails when a counter rises above its ceiling or falls below it (bank the
 * improvement), or when a ceiling was raised or removed against the base branch's file. A raise
 * passes only when the journey's `raised` map gives that counter a reason the base did not have.
 *
 *   node perf-ratchet.mjs check <ceilings.json> <journey> <evidence.json> [<base-ceilings.json>]
 *   node perf-ratchet.mjs lower <ceilings.json> <journey> <evidence.json>
 *   node perf-ratchet.mjs correlate <variant>=<evidence.json> ...
 *
 * Ceilings: `{ <journey>: { browser: "<Chrome major>", counts: { <counter>: n },
 *   raised?: { <counter>: "<why this ceiling went up>" } } }`.
 * Evidence is a journey's JSON output: `workCounts`, `wallMs` and the browser it ran in.
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// A counter gates only if it tracks wall-clock across variants and repeats exactly within
// one: a ceiling on a counter that wobbles fails at random.
const MIN_CORRELATION = 0.7;
const MAX_SPREAD_RATIO = 0;

const raisedAgainst = (ceiling, base) => Number.isFinite(base) && ceiling > base;

function measuredStatus(ceiling, value) {
  if (!Number.isFinite(value)) return "missing";
  if (value === ceiling) return "at";
  return value > ceiling ? "rose" : "below";
}

function ceilingRow(counter, ceiling, value, base, accepted) {
  if (raisedAgainst(ceiling, base) && !accepted.has(counter)) {
    return { counter, ceiling, base, status: "raised" };
  }
  return { counter, ceiling, value, status: measuredStatus(ceiling, value) };
}

/** Passes only when every gated counter sits exactly at a ceiling no higher than the base's. */
export function checkCeilings(ceilings, counts, baseCeilings = {}, accepted = new Set()) {
  const rows = Object.entries(ceilings).map(([counter, ceiling]) =>
    ceilingRow(counter, ceiling, counts[counter], baseCeilings[counter], accepted),
  );
  if (rows.length === 0)
    throw new Error("no gated counters: a ratchet that checks nothing passes nothing");
  for (const [counter, base] of Object.entries(baseCeilings)) {
    if (!(counter in ceilings)) rows.push({ counter, base, status: "removed" });
  }
  return { passed: rows.every((row) => row.status === "at"), rows };
}

/** `, +67%`: a rise as a share of its ceiling, or nothing for a zero ceiling. */
const riseShare = (rise, ceiling) =>
  ceiling === 0 ? "" : `, +${Math.round((rise / ceiling) * 100)}%`;

const ROW_TEXT = {
  at: ({ counter, value }) => `ok   ${counter} ${value}`,
  missing: ({ counter, ceiling }) => `FAIL ${counter}: not measured (ceiling ${ceiling})`,
  rose: ({ counter, ceiling, value }) =>
    `FAIL ${counter} rose ${ceiling} -> ${value} (+${round(value - ceiling)}${riseShare(value - ceiling, ceiling)})`,
  below: ({ counter, ceiling, value }) =>
    `FAIL ${counter} fell ${ceiling} -> ${value}: bank it by setting its ceiling to ${value} (perf-ratchet.mjs lower)`,
  raised: ({ counter, ceiling, base }) =>
    `FAIL ${counter}: ceiling raised ${base} -> ${ceiling} against the base branch; a raise needs a new reason under "raised" in perf-ceilings.json`,
  removed: ({ counter, base }) =>
    `FAIL ${counter}: ceiling ${base} removed against the base branch; ceilings only go down`,
};

export function formatRow(row) {
  return ROW_TEXT[row.status](row);
}

/** New ceilings: each gated counter drops to what was measured, never rises. */
export function lowerCeilings(ceilings, counts) {
  return Object.fromEntries(
    Object.entries(ceilings).map(([counter, ceiling]) => [
      counter,
      Number.isFinite(counts[counter]) ? Math.min(ceiling, counts[counter]) : ceiling,
    ]),
  );
}

/**
 * For each counter over runs `{ variant, wallMs, counts }`: Pearson r against
 * wall-clock across all runs, and the worst spread between runs of one variant.
 */
export function correlate(runs) {
  const counters = [...new Set(runs.flatMap((run) => Object.keys(run.counts)))].sort();
  return counters.map((counter) => {
    const points = runs.filter((run) => Number.isFinite(run.counts[counter]));
    const r = pearson(
      points.map((run) => run.counts[counter]),
      points.map((run) => run.wallMs),
    );
    let spreadRatio = 0;
    for (const variant of new Set(points.map((run) => run.variant))) {
      const values = points
        .filter((run) => run.variant === variant)
        .map((run) => run.counts[counter]);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      spreadRatio = Math.max(
        spreadRatio,
        (Math.max(...values) - Math.min(...values)) / Math.max(1, mean),
      );
    }
    return {
      counter,
      r,
      spreadRatio,
      gateable: Number.isFinite(r) && r >= MIN_CORRELATION && spreadRatio <= MAX_SPREAD_RATIO,
    };
  });
}

function pearson(xs, ys) {
  const n = xs.length;
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / n;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? Number.NaN : sxy / Math.sqrt(sxx * syy);
}

const round = (value) => Math.round(value * 100) / 100;
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const versionOf = (evidence) => String(evidence.browser ?? evidence.environment?.browser);

/** Chrome's major version from a journey's evidence, e.g. "153" from "HeadlessChrome/153.0.1.2". */
export function browserMajor(evidence) {
  const match = /\/(\d+)\./.exec(versionOf(evidence));
  return match ? match[1] : null;
}

/** The whole ceilings file, the journey named in it, and that journey's evidence. */
function journeyInputs([ceilingsPath, journey, evidencePath]) {
  const all = readJson(ceilingsPath);
  if (!all[journey]) throw new Error(`${ceilingsPath} has no journey "${journey}"`);
  const evidence = readJson(evidencePath);
  return { all, ceilingsPath, journey, evidence, counts: evidence.workCounts ?? {} };
}

const isObject = (value) => typeof value === "object" && value !== null;

/**
 * The base branch's ceilings for `journey`, and the base journeys this file no longer has. A
 * base file in a shape this script does not write throws: an unreadable base must not pass.
 */
export function readBase(base, all, journey) {
  assertBaseShape(base);
  return {
    counts: base[journey]?.counts,
    raised: base[journey]?.raised,
    removedJourneys: Object.keys(base).filter((name) => !Object.hasOwn(all, name)),
  };
}

const normalized = (text) => (typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "");
const isNewReason = (reason, baseReason) =>
  normalized(reason) !== "" && normalized(reason) !== normalized(baseReason);

/** Counters raised above the base on purpose: a reason in `raised` the base branch did not give. */
export function acceptedRaises(entry, base) {
  const reasons = entry.raised ?? {};
  const onPurpose = (counter) =>
    raisedAgainst(entry.counts[counter], base.counts?.[counter]) &&
    isNewReason(reasons[counter], base.raised?.[counter]);
  return new Set(Object.keys(reasons).filter(onPurpose));
}

function assertBaseShape(base) {
  for (const [name, entry] of Object.entries(base)) {
    if (!isObject(entry?.counts)) throw new Error(`base ceilings: "${name}" has no counts object`);
  }
}

/** Absent while the base branch has no ceilings file yet (and on runs without a base). */
function loadBase(path, all, journey) {
  if (!path || !existsSync(path)) return { counts: undefined, removedJourneys: [] };
  return readBase(readJson(path), all, journey);
}

function printNotes(recorded, evidence, rows) {
  const measuredOn = browserMajor(evidence);
  if (measuredOn !== recorded.browser) {
    console.log(
      `[perf-ratchet]   note: measured on Chrome ${measuredOn}, ceilings recorded on Chrome ${recorded.browser}`,
    );
  }
  if (rows.some((row) => row.status === "rose")) {
    console.log(
      "[perf-ratchet]   If this change should not add that work, confirm the counter still repeats " +
        "exactly: run the journey a few times and compare with perf-ratchet.mjs correlate.",
    );
  }
}

function printResult(journey, ok, rows, removedJourneys) {
  console.log(`[perf-ratchet] ${journey}: ${ok ? "PASS" : "FAIL"}`);
  for (const row of rows) console.log(`[perf-ratchet]   ${formatRow(row)}`);
  for (const name of removedJourneys) {
    console.log(
      `[perf-ratchet]   FAIL journey ${name} removed against the base branch; ceilings only go down`,
    );
  }
}

function runCheck(args) {
  const { all, journey, evidence, counts } = journeyInputs(args);
  const base = loadBase(args[3], all, journey);
  const accepted = acceptedRaises(all[journey], base);
  const { passed, rows } = checkCeilings(all[journey].counts, counts, base.counts, accepted);
  const ok = passed && base.removedJourneys.length === 0;
  printResult(journey, ok, rows, base.removedJourneys);
  printNotes(all[journey], evidence, rows);
  for (const counter of accepted) {
    console.log(
      `[perf-ratchet]   note: ${counter} raised on purpose: ${all[journey].raised[counter]}`,
    );
  }
  return ok ? 0 : 1;
}

function runLower(args) {
  const { all, ceilingsPath, journey, evidence, counts } = journeyInputs(args);
  const measuredOn = browserMajor(evidence);
  if (measuredOn !== all[journey].browser) {
    throw new Error(
      `evidence is from Chrome ${measuredOn} but ${journey}'s ceilings were recorded on Chrome ` +
        `${all[journey].browser}: take the evidence from the CI job, which runs that browser`,
    );
  }
  all[journey].counts = lowerCeilings(all[journey].counts, counts);
  writeFileSync(ceilingsPath, `${JSON.stringify(all, null, 2)}\n`);
  return 0;
}

function runCorrelate(args) {
  const runs = args.map((arg) => {
    const [variant, path] = arg.split("=");
    const evidence = readJson(path);
    return { variant, wallMs: evidence.wallMs, counts: evidence.workCounts };
  });
  console.log("counter\tr\tspread\tgate");
  for (const row of correlate(runs)) {
    const gate = row.gateable ? "yes" : "no";
    console.log(`${row.counter}\t${round(row.r)}\t${round(row.spreadRatio * 100)}%\t${gate}`);
  }
  return 0;
}

const COMMANDS = { check: runCheck, lower: runLower, correlate: runCorrelate };

function main([command, ...args]) {
  if (Object.hasOwn(COMMANDS, command)) return COMMANDS[command](args);
  console.error(
    "usage: perf-ratchet.mjs check|lower <ceilings.json> <journey> <evidence.json> [<base-ceilings.json>]",
  );
  console.error("       perf-ratchet.mjs correlate <variant>=<evidence.json> ...");
  return 2;
}

// Real paths on both sides: a symlinked path (macOS /var, /tmp) must still run the CLI.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
