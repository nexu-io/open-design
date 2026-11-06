#!/usr/bin/env bun
// Edit accuracy bench: real gestures in the built CLI Studio (build core, parsers, lint, studio-server first).
// bun run --cwd packages/studio test:edit-accuracy -- --grid full|pr --jobs N [--shard i/n] [--filter re]
//   [--lock path: the suite lock, taken per chunk] [--rerun: a confirmation run for the gate, with screenshots]
//   [--shots: screenshots on a first run too]
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadavg, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { execSync, spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { resolveHeadlessShellPath } from "../../../../engine/src/index.ts";
import { buildGrid, expectedSeconds, shardCases, writeFixture } from "./grid.mjs";
import { killServers, runCase, startServer, stopServer } from "./case.mjs";
import { runSequence } from "./sequences.mjs";
import { METRICS, SLOW_RUNNER, score, slowRunner, writeReport } from "./report.mjs";
import { holdProducerBrowser, renderBox } from "./render.mjs";
import { aabb, boxDistance } from "./geometry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../../..");

const { values: opt } = parseArgs({
  options: {
    grid: { type: "string", default: "full" },
    shard: { type: "string", default: "1/1" },
    jobs: { type: "string", default: "1" },
    filter: { type: "string", default: "" },
    out: { type: "string" },
    port: { type: "string", default: "5800" },
    cli: { type: "string", default: join(REPO, "packages/cli/dist/cli.js") },
    lock: { type: "string" },
    // Marks a confirmation run of cases that regressed, so the gate keeps it out of the banked baseline.
    rerun: { type: "boolean", default: false },
    shots: { type: "boolean", default: false },
  },
});
const [shard, shards] = opt.shard.split("/").map(Number);
const filter = new RegExp(opt.filter);
const cases = shardCases(
  buildGrid(opt.grid).filter((c) => filter.test(c.id)),
  shard,
  shards,
);
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const out = resolve(opt.out ?? join(HERE, "../evidence/edit-accuracy", runId));
const chrome = resolveHeadlessShellPath();
if (!chrome) throw new Error("no chrome-headless-shell: run `npx hyperframes browser ensure`");
mkdirSync(out, { recursive: true });

/** Evidence for a failing case only: the Studio screens at each stage and the saved files. */
// fallow-ignore-next-line complexity
function saveEvidence(id, evidence) {
  const caseDir = join(out, "cases", id);
  mkdirSync(caseDir, { recursive: true });
  for (const [name, jpeg] of Object.entries(evidence.shots ?? {}))
    writeFileSync(join(caseDir, `${name}.jpg`), jpeg);
  for (const [name, text] of Object.entries(evidence.files ?? {}))
    writeFileSync(join(caseDir, `saved-${name.replace("/", "-")}`), text);
  if (evidence.renderFailed && evidence.frame)
    writeFileSync(join(caseDir, "producer.jpg"), evidence.frame);
}

function verdict(r) {
  const fails = r.error ? "ERROR" : METRICS.filter((m) => !r.checks[m]).join(",");
  return `${r.pass ? "PASS" : "FAIL"} ${r.id} ${r.seconds.toFixed(1)}s ${fails}`;
}

// fallow-ignore-next-line complexity
const errorResult = (error, log) => ({
  error: `${error?.message ?? error}\n${error?.stack ?? ""}`.slice(0, 1200),
  serverLog: log.join("").slice(-600),
});

const liveRoots = new Set();

/** Render drift: the reloaded preview's visible box against the target's pixel box in a producer frame. */
async function withRender(dir, decoder, { reloaded, ...measured }, evidence, time) {
  const expected = aabb(reloaded.visible);
  const render = await renderBox(dir, decoder, time).catch((error) => ({ error }));
  // A producer failure fails render alone; the case's other metrics still count.
  if (render.error)
    return {
      ...measured,
      render: null,
      renderError: `${render.error?.message ?? render.error}`.slice(0, 600),
    };
  evidence.frame = render.jpeg;
  return {
    ...measured,
    render: boxDistance(render.box, expected),
    diag: {
      ...measured.diag,
      previewBox: expected,
      pixelBox: render.box,
      producerDomRect: render.domRect,
    },
  };
}

/** A keyframed case also matches the producer at another keyframe; one it could not render stays null and fails. */
async function renderKeyframe(dir, decoder, { time, visible }) {
  const other = await renderBox(dir, decoder, time).catch(() => null);
  return other && boxDistance(other.box, aabb(visible));
}

// fallow-ignore-next-line complexity
async function runOne(spec, browser, decoder, port) {
  const started = Date.now();
  const root = mkdtempSync(join(tmpdir(), "hf-edit-accuracy-"));
  liveRoots.add(root);
  const dir = join(root, "case");
  const files = writeFixture(spec, dir);
  const evidence = {};
  const log = [];
  let result;
  let server;
  try {
    const served = await startServer(opt.cli, dir, port, log, join(root, "home"));
    server = served.child;
    const { keyRender, ...measured } = await (spec.steps ? runSequence : runCase)({
      browser,
      spec,
      dir,
      files,
      url: `http://127.0.0.1:${served.port}/#project/case`,
      evidence,
      shots: opt.rerun || opt.shots,
    });
    await stopServer(server);
    server = null;
    const at = measured.reloaded?.time ?? spec.playhead;
    result = await withRender(dir, decoder, measured, evidence, at);
    if (keyRender) result.renderKey = await renderKeyframe(dir, decoder, keyRender);
  } catch (error) {
    result = errorResult(error, log);
  } finally {
    if (server) await stopServer(server);
  }
  const scored = { ...score(spec, result), seconds: (Date.now() - started) / 1000 };
  if (!scored.pass) saveEvidence(spec.id, { ...evidence, renderFailed: !scored.checks.render });
  rmSync(root, { recursive: true, force: true });
  liveRoots.delete(root);
  console.log(verdict(scored));
  return scored;
}

/** Holds an flock on `path` until the returned release is called; flock(1) owns the lock, so it dies with us. */
function acquireLock(path) {
  const child = spawn("flock", [path, "-c", "echo locked; exec cat"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`flock ${path} exited ${code}`)));
    child.stdout.once("data", () => resolve(() => child.stdin.end()));
  });
}

// Set once the first cases show a slow runner: no new case starts, and the run exits 75 (see the end).
let slow = null;

// The suite lock is taken per chunk, so a full grid never holds it for its whole run.
const LOCK_CHUNK = 8;

// fallow-ignore-next-line complexity
async function runChunks(queue, browsers, decoders, results) {
  for (
    let start = 0;
    start < queue.length && slow === null;
    start += opt.lock ? LOCK_CHUNK : queue.length
  ) {
    const chunk = queue.slice(start, opt.lock ? start + LOCK_CHUNK : queue.length);
    const release = opt.lock ? await acquireLock(opt.lock) : () => undefined;
    try {
      await Promise.all(
        browsers.map(async (browser, i) => {
          for (let spec = chunk.shift(); spec && slow === null; spec = chunk.shift()) {
            results.push(await runOne(spec, browser, decoders[i], Number(opt.port) + i));
            slow = slowRunner(results, expectedSeconds);
          }
        }),
      );
    } finally {
      release();
    }
  }
}

function cleanup() {
  killServers();
  for (const root of liveRoots) rmSync(root, { recursive: true, force: true });
}
process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(130);
  });
}
// Stamped at start from the CLI that runs: its tree's commit and a hash of the CLI and Studio bundles.
// cli.js alone does not change with Studio; the Studio index.html names its hashed assets.
const git = (args) => execSync(`git ${args}`, { cwd: REPO }).toString().trim();
const studio = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: dirname(opt.cli), stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    return "outside git"; // An extracted CLI artifact; the build hash still identifies it.
  }
})();
const build = createHash("sha256")
  .update(readFileSync(opt.cli))
  .update(readFileSync(join(dirname(opt.cli), "studio/index.html")))
  .digest("hex")
  .slice(0, 12);
const bench = git("rev-parse --short HEAD");
const load = loadavg()
  .map((v) => v.toFixed(1))
  .join(" ");
const started = Date.now();
const results = [];
const jobs = Math.max(1, Math.min(Number(opt.jobs), cases.length));
console.log(`edit accuracy: ${cases.length} cases, ${jobs} jobs, chrome ${chrome}, out ${out}`);
const browsers = await Promise.all(
  Array.from({ length: jobs }, () =>
    puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    }),
  ),
);
// One producer Chrome for the run; each render still gets its own page and file server.
const producerRoot = mkdtempSync(join(tmpdir(), "hf-edit-accuracy-producer-"));
liveRoots.add(producerRoot);
const releaseProducer = await holdProducerBrowser(producerRoot);
try {
  const decoders = await Promise.all(browsers.map((b) => b.newPage()));
  await runChunks([...cases], browsers, decoders, results);
} finally {
  await Promise.all([releaseProducer(), ...browsers.map((b) => b.close())]);
}
// CI reads slow-runner.json to re-run the shard once on a fresh runner.
if (slow !== null) {
  const first = results.slice(0, SLOW_RUNNER.cases);
  const seconds = Object.fromEntries(first.map((r) => [r.id, [r.seconds, expectedSeconds(r)]]));
  writeFileSync(
    join(out, "slow-runner.json"),
    JSON.stringify({ seconds, median: slow, ...SLOW_RUNNER }),
  );
  console.error(
    `runner too slow: the first ${SLOW_RUNNER.cases} cases took a median ${slow.toFixed(2)}x their usual seconds, over ${SLOW_RUNNER.multiple}x; stopping`,
  );
  process.exit(75);
}
results.sort((a, b) => a.id.localeCompare(b.id));
const meta = {
  studio,
  build,
  bench,
  rerun: opt.rerun,
  grid:
    opt.grid +
    (opt.filter ? ` filter ${opt.filter}` : "") +
    (shards > 1 ? ` shard ${opt.shard}` : ""),
  date: new Date().toISOString(),
  jobs,
  chrome,
  load: `${load} to ${loadavg()
    .map((v) => v.toFixed(1))
    .join(" ")}`,
};
console.log(writeReport(out, meta, results, (Date.now() - started) / 1000));
