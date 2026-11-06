#!/usr/bin/env node
// fallow-ignore-file complexity
/** Times bulk timeline actions (select, move, resize, delete) in a real browser on a real project; see USAGE. */
const USAGE = `
BULK_PROJECT_DIR=<project> node packages/studio/tests/e2e/timeline-bulk-actions.mjs

Runs the built CLI's preview server, so build first:
  bun run --filter @hyperframes/studio build && bun run --filter @hyperframes/cli build
BULK_PROJECT_DIR is copied, never modified. Optional: BULK_RUNS (default 5), BULK_PORT,
BULK_ONLY (action name substring), BULK_THROTTLE (CPU slowdown rate for drag actions), BULK_PROFILE=1 (CPU profile and request summary; "drag" profiles the pointer moves of the drag actions).
An action is done when no foreground request is in flight and no long task ran for 500 ms.
Thumbnail and lint requests are background and not awaited. Each run starts a fresh server.
`;
import { cpSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { resolveChromeExecutable } from "./chrome-executable.mjs";

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "../../../cli/dist/cli.js");
const SOURCE = process.env.BULK_PROJECT_DIR;
const RUNS = Number(process.env.BULK_RUNS || 5);
const PORT = Number(process.env.BULK_PORT || 5291);
const QUIET_MS = 500;
const TIMEOUT_MS = 120_000;
const ORIGIN = `http://127.0.0.1:${PORT}`;

if (!SOURCE || !existsSync(join(SOURCE, "index.html"))) {
  console.error(`BULK_PROJECT_DIR must point at a project directory with an index.html.\n${USAGE}`);
  process.exit(2);
}
const chrome = resolveChromeExecutable();
if (!chrome) {
  console.error("No Chrome executable found; set PUPPETEER_EXECUTABLE_PATH");
  process.exit(2);
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
/** `median<Key>` for each numeric key that every run reported. */
const medians = (results, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => results.every((r) => typeof r[key] === "number"))
      .map((key) => [`median_${key}`, Math.round(median(results.map((r) => r[key])) * 10) / 10]),
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const projectId = `bulk-${basename(SOURCE)}`;
const tempRoot = mkdtempSync(join(tmpdir(), "hf-bulk-"));
let server = null;
let browser = null;

function cleanup() {
  server?.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}

async function waitForServer() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${ORIGIN}/api/projects`)).ok) return;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error("Studio server did not start");
}

/** Thumbnails and lint are background work the user never waits on; they are counted, not awaited. */
const BACKGROUND = /\/(thumbnail|lint)(\/|\?|$)/;

/** Installed before any page script: tracks long tasks and the in-flight foreground fetches. */
function installProbe(backgroundSource) {
  const background = new RegExp(backgroundSource);
  const probe = (window.__bulk = { lastBusy: performance.now(), inflight: 0 });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries())
      probe.lastBusy = Math.max(probe.lastBusy, e.startTime + e.duration);
  }).observe({ type: "longtask", buffered: true });
  const realFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input.url ?? String(input));
    if (background.test(url)) return realFetch(input, init);
    probe.inflight++;
    try {
      return await realFetch(input, init);
    } finally {
      probe.inflight--;
      probe.lastBusy = performance.now();
      if (/\/(files|gsap-mutations[^/]*|file-mutations\/(?!probe))/.test(url) && init?.method)
        probe.lastWriteDone = probe.lastBusy;
    }
  };
}

async function openStudio() {
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  await page.setViewport({ width: 1600, height: 1000 });
  page.pageErrors = [];
  page.on("pageerror", (e) => page.pageErrors.push(String(e).slice(0, 300)));
  page.on("console", (m) => m.type() === "error" && page.pageErrors.push(m.text().slice(0, 300)));
  await page.evaluateOnNewDocument(installProbe, BACKGROUND.source);
  await page.goto(`${ORIGIN}/#project/${projectId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("button[data-clip]");
  await settle(page);
  return page;
}

/** Resolves with the page time at which foreground work was last busy, after QUIET_MS of quiet. */
const settle = (page) =>
  page.evaluate(
    (quiet) =>
      new Promise((resolveQuiet) => {
        const tick = () => {
          const p = window.__bulk;
          if (p.inflight === 0 && performance.now() - p.lastBusy > quiet) resolveQuiet(p.lastBusy);
          else setTimeout(tick, 25);
        };
        tick();
      }),
    QUIET_MS,
  );

const now = (page) => page.evaluate(() => performance.now());
const nextPaint = (page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Selected-count readout, from the multi-select prompt box. */
const selectedCount = (page) =>
  page.evaluate(() => Number(document.body.innerText.match(/(\d+) elements selected/)?.[1] ?? 0));

/** Ctrl-clicks the first `count` mounted clips, dispatched so layout cannot misplace a click. */
async function clickClips(page, count) {
  await page.evaluate((n) => {
    for (const clip of [...document.querySelectorAll("button[data-clip]")].slice(0, n))
      clip.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
  }, count);
  await settle(page);
}

/** `/api/projects/<id>/thumbnail/x.html?..` -> `thumbnail`; anything else keeps its first two segments. */
const requestKind = (url) =>
  new URL(url).pathname
    .replace(/^\/api\/projects\/[^/]+\//, "")
    .split("/")
    .slice(0, 2)
    .join("/");

// Runs `action` (returns the page time it considers done); returns ms since its start.
// BULK_PROFILE=1 also prints the CPU profile and a request summary of that action to stderr.
async function measure(page, name, action) {
  const profile = Boolean(process.env.BULK_PROFILE);
  const cdp = profile ? await page.createCDPSession() : null;
  const requests = [];
  const started = new Map();
  const onRequest = (r) => started.set(r, Date.now());
  const onFinished = (r) =>
    requests.push({
      at: started.get(r) - startedAt,
      ms: Date.now() - started.get(r),
      kind: `${r.method()} ${requestKind(r.url())}`,
    });
  if (profile) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    page.on("request", onRequest);
    page.on("requestfinished", onFinished);
  }
  const startedAt = Date.now();
  await page.evaluate(() => (window.__bulk.lastWriteDone = 0));
  const t0 = await now(page);
  const doneAt = await action();
  const ms = doneAt - t0;
  const lastWrite = await page.evaluate(() => window.__bulk.lastWriteDone);
  if (profile) {
    page.off("request", onRequest);
    page.off("requestfinished", onFinished);
    const { profile: cpu } = await cdp.send("Profiler.stop");
    printProfile(name, cpu, requests);
  }
  return {
    ms,
    saveMs: lastWrite > 0 ? lastWrite - t0 : undefined,
    thumbnailRequests: profile
      ? requests.filter((r) => r.kind.includes("thumbnail")).length
      : undefined,
  };
}

// Inclusive time per function (self plus callees), the costliest first (BULK_STACKS=1).
function printInclusive(cpu, byId) {
  const parent = new Map();
  for (const n of cpu.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const total = new Map();
  cpu.samples.forEach((id, i) => {
    const seen = new Set();
    for (let n = id; n !== undefined; n = parent.get(n)) {
      const f = byId.get(n).callFrame;
      const key = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber}`;
      if (f.url && !seen.has(key)) {
        seen.add(key);
        total.set(key, (total.get(key) ?? 0) + cpu.timeDeltas[i] / 1000);
      }
    }
  });
  for (const [k, v] of [...total].sort((a, b) => b[1] - a[1]).slice(0, 14))
    console.error(`incl ${Math.round(v)}ms ${k}`);
}

// Call chain of the node with the most self time among real functions (BULK_STACKS=1).
function printHeaviestStack(cpu, byId) {
  const parent = new Map();
  for (const n of cpu.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const selfById = new Map();
  cpu.samples.forEach((id, i) =>
    selfById.set(id, (selfById.get(id) ?? 0) + cpu.timeDeltas[i] / 1000),
  );
  const real = [...selfById].filter(([id]) => byId.get(id).callFrame.url);
  const [top] = real.sort((a, b) => b[1] - a[1]);
  if (!top) return;
  const chain = [];
  for (let id = top[0]; id !== undefined && chain.length < 14; id = parent.get(id)) {
    const f = byId.get(id).callFrame;
    chain.push(`${f.functionName || "(anon)"}:${f.lineNumber}`);
  }
  console.error(`heaviest ${Math.round(top[1])}ms: ${chain.join(" <- ")}`);
}

function printProfile(name, cpu, requests) {
  const self = new Map();
  const byId = new Map(cpu.nodes.map((n) => [n.id, n]));
  cpu.samples.forEach((id, i) => {
    const f = byId.get(id).callFrame;
    const key = `${f.functionName || "(anon)"} ${f.url.split("/").slice(-2).join("/")}:${f.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + cpu.timeDeltas[i] / 1000);
  });
  console.error(`--- ${name}`);
  for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 15))
    console.error(`${Math.round(v)}ms ${k}`);
  if (process.env.BULK_STACKS) {
    printHeaviestStack(cpu, byId);
    printInclusive(cpu, byId);
  }
  const kinds = new Map();
  for (const { ms, kind } of requests) {
    const k = kinds.get(kind) ?? { n: 0, totalMs: 0, maxMs: 0 };
    kinds.set(kind, { n: k.n + 1, totalMs: k.totalMs + ms, maxMs: Math.max(k.maxMs, ms) });
  }
  console.error(`requests: ${requests.length}`);
  if (process.env.BULK_PROFILE === "timeline")
    for (const r of [...requests].sort((a, b) => a.at - b.at))
      console.error(`  +${r.at}ms ${r.ms}ms ${r.kind}`);
  for (const [k, v] of [...kinds].sort((a, b) => b[1].totalMs - a[1].totalMs).slice(0, 12))
    console.error(`  ${v.n}x total ${v.totalMs}ms max ${v.maxMs}ms  ${k}`);
}

async function selectAll(page, name) {
  await page.click("[data-studio-timeline]", { offset: { x: 5, y: 5 } }).catch(() => {});
  await settle(page);
  const result = await measure(page, name, async () => {
    await page.keyboard.press("]");
    await page.waitForFunction(
      () => Number(document.body.innerText.match(/(\d+) elements selected/)?.[1] ?? 0) > 3,
    );
    await nextPaint(page);
    return settle(page);
  });
  return { ...result, selected: await selectedCount(page) };
}

async function move3(page, name) {
  await clickClips(page, 3);
  const box = await (await page.$("button[data-clip]")).boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(cx + i * 12, cy);
  return measure(page, name, async () => {
    await page.mouse.up();
    return settle(page);
  });
}

async function deleteAll(page, name) {
  await page.keyboard.press("]");
  await settle(page);
  const selected = await selectedCount(page);
  await page.focus("button[data-clip]");
  const result = await measure(page, name, async () => {
    await page.keyboard.press("Delete");
    await page.waitForFunction(() => !/(\d+) elements selected/.test(document.body.innerText));
    return settle(page);
  });
  return { ...result, selected };
}

async function selectN(page, name, n) {
  const result = await measure(page, name, async () => {
    for (let i = 0; i < n; i++) {
      await page.evaluate((index) => {
        const clip = document.querySelectorAll("button[data-clip]")[index];
        clip?.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
      }, i);
      await settle(page);
    }
    await nextPaint(page);
    return settle(page);
  });
  return { ...result, selected: await selectedCount(page) };
}

const clipTimes = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("button[data-clip]")].map((c) => [
        c.dataset.elId,
        `${c.dataset.clipStart}-${c.dataset.clipEnd}`,
      ]),
    ),
  );

const taskMs = async (cdp) =>
  (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "TaskDuration").value *
  1000;

const percentile = (xs, q) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))];

// Drags with every clip selected: main-thread task time per pointermove, then the drop settle time.
async function dragAll(page, name, { edge, dx, steps }) {
  const cdp = await page.createCDPSession();
  await cdp.send("Performance.enable");
  const throttle = Number(process.env.BULK_THROTTLE || 1);
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await page.click("[data-studio-timeline]", { offset: { x: 5, y: 5 } }).catch(() => {});
  await settle(page);
  await page.keyboard.press("]");
  await page.waitForFunction(
    () => Number(document.body.innerText.match(/(\d+) elements selected/)?.[1] ?? 0) > 3,
  );
  await settle(page);
  const selected = await selectedCount(page);
  const before = await clipTimes(page);
  const box = await (await page.$("button[data-clip]")).boundingBox();
  const cy = box.y + box.height / 2;
  const cx = edge ? box.x + box.width - 2 : box.x + box.width / 2;
  await page.mouse.move(cx - 20, cy);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const profileDrag = process.env.BULK_PROFILE === "drag";
  if (profileDrag) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
  }
  const frames = [];
  for (let i = 1; i <= steps; i++) {
    const t0 = await taskMs(cdp);
    await page.mouse.move(cx + i * dx, cy);
    await nextPaint(page);
    frames.push((await taskMs(cdp)) - t0);
  }
  if (profileDrag) printProfile(`${name} (drag)`, (await cdp.send("Profiler.stop")).profile, []);
  const dropTask0 = await taskMs(cdp);
  const result = await measure(page, name, async () => {
    await page.mouse.up();
    return settle(page);
  });
  const dropTaskMs = (await taskMs(cdp)) - dropTask0;
  const after = await clipTimes(page);
  const changed = Object.keys(before).filter((id) => before[id] !== after[id]).length;
  const round = (n) => Math.round(n * 10) / 10;
  return {
    ...result,
    selected,
    changed,
    dropTaskMs: round(dropTaskMs),
    firstFrameMs: round(frames[0]),
    steadyP95Ms: round(percentile(frames.slice(1), 0.95)),
    frameP95Ms: round(percentile(frames, 0.95)),
    frameMaxMs: round(Math.max(...frames)),
    throttle,
  };
}

const actions = {
  "select-all": selectAll,
  "move-3": move3,
  "delete-all": deleteAll,
  "move-all-small": (p, name) => dragAll(p, name, { edge: null, dx: 4, steps: 20 }),
  "move-all-past-end": (p, name) => dragAll(p, name, { edge: null, dx: 40, steps: 20 }),
  "resize-all-end": (p, name) => dragAll(p, name, { edge: "end", dx: -6, steps: 20 }),
  "ctrl-click-5": (p, name) => selectN(p, name, 5),
};

/** A fresh copy of the project under a fresh preview server: every run starts from the same disk state. */
async function startFreshServer() {
  const projectDir = join(tempRoot, projectId);
  rmSync(projectDir, { recursive: true, force: true });
  cpSync(SOURCE, projectDir, { recursive: true });
  server = spawn(
    "node",
    [
      CLI,
      "preview",
      projectDir,
      "--port",
      String(PORT),
      "--no-open",
      "--foreground",
      "--force-new",
    ],
    { env: { ...process.env, HYPERFRAMES_AUTO_PROXY: "false" }, stdio: "ignore" },
  );
  await waitForServer();
}

async function stopServer() {
  const exited = new Promise((resolveExit) => server.once("exit", resolveExit));
  server.kill();
  await exited;
}

try {
  browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    timeout: TIMEOUT_MS,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const rows = [];
  for (const [name, run] of Object.entries(actions)) {
    if (process.env.BULK_ONLY && !name.includes(process.env.BULK_ONLY)) continue;
    const samples = [];
    const results = [];
    let detail = {};
    for (let i = 0; i < RUNS; i++) {
      await startFreshServer();
      const page = await openStudio();
      const clips = (await page.$$("button[data-clip]")).length;
      const result = await run(page, name).catch(async (error) => {
        await page.screenshot({ path: join(tmpdir(), `bulk-failed-${name}.png`) });
        console.error(`${name} failed, screenshot in ${tmpdir()}: ${error.message}`);
        console.error(
          page.pageErrors
            .filter((e) => !e.startsWith("Failed to load resource"))
            .slice(0, 8)
            .join("\n"),
        );
        console.error(
          await page.evaluate(
            () =>
              `pressed clips: ${document.querySelectorAll("button[data-clip][aria-pressed=true]").length}`,
          ),
        );
        throw error;
      });
      samples.push(result.ms);
      results.push(result);
      detail = { visibleClips: clips, ...result };
      await page.close();
      await stopServer();
    }
    rows.push({
      action: name,
      medianMs: Math.round(median(samples)),
      samplesMs: samples.map(Math.round),
      ...detail,
      ...medians(results, [
        "saveMs",
        "dropTaskMs",
        "firstFrameMs",
        "steadyP95Ms",
        "frameP95Ms",
        "frameMaxMs",
      ]),
    });
  }
  console.log(JSON.stringify({ project: basename(SOURCE), runs: RUNS, rows }, null, 2));
  console.table(rows.map(({ action, medianMs }) => ({ action, medianMs })));
} finally {
  await browser?.close();
  cleanup();
}
