/** Drives one edit accuracy case in the built Studio and measures it. All distances are composition px. */
import { execFileSync, spawn } from "node:child_process";
import { classifyTweenPropertyGroup } from "../../../../parsers/src/gsapConstants.ts";
import { parseGsapScript } from "../../../../parsers/src/gsapParser.ts";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { COMPOSITION, FIXTURE_CDN, PLAYHEAD, localAsset } from "./grid.mjs";
import { traceBench } from "./trace.mjs";
import {
  angleOf,
  centre,
  compositionMapper,
  dist,
  localToQuad,
  mid,
  normalizeAngle,
  parseInset,
  percentile,
  quadDistance,
  quadToLocal,
  toPoints,
  visibleQuad,
} from "./geometry.mjs";
import { frameSamplerScript, scoreTeleport, startFrames, stopFrames } from "./teleport.mjs";
import { terminateWindowsProcessTree } from "../../../../cli/src/utils/processTree.ts";
import { installWebMcpHost } from "../webmcp-host.mjs";

export const VIEWPORT = { width: 1600, height: 900 };
const STEPS = 20;
const MOVE_BY = [90, 60];
const RESIZE_BY = 60;
const ROTATE_BY = (25 * Math.PI) / 180;
const CROP_BY = 40;
const NUDGES = 5;
const ZOOM_SENSITIVITY = 0.007; // previewZoom.ts: one wheel unit scales zoom by exp(0.007)

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const up = (port) =>
  fetch(`http://127.0.0.1:${port}/api/projects`).then(
    (r) => r.ok,
    () => false,
  );
const liveServers = new Set();
/** Signals the server's process group; a group that already exited is not an error. */
function signalGroup(child, signal) {
  // Windows has no process groups, so taskkill /T ends the server and its children.
  if (process.platform === "win32")
    return void terminateWindowsProcessTree(child.pid).catch((error) => {
      // taskkill exits 128 when the process is already gone.
      if (!/status 128$/.test(error.message)) throw error;
    });
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
/** Signal-safe cleanup: servers run in their own process group so the CLI's children go with them. */
export function killServers() {
  for (const child of liveServers) signalGroup(child, "SIGKILL");
}

const announcedPort = (log) => /http:\/\/localhost:(\d+)/.exec(log.join(""))?.[1];

/** The real node binary: a version manager's shim (Volta) finds node through HOME, which the server's env replaces. */
const nodeBinary = () =>
  execFileSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).trim();

/** Starts Studio at `port` or, when that is busy, the next free one the CLI binds; returns the port it serves. */
// fallow-ignore-next-line complexity
export async function startServer(cli, dir, port, log, home) {
  const child = spawn(
    nodeBinary(),
    [cli, "preview", dir, "--port", String(port), "--no-open", "--foreground", "--force-new"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      windowsHide: true,
      // A per-case HOME keeps Studio's undo history inside the case's tmp dir.
      env: {
        ...process.env,
        HOME: home,
        HYPERFRAMES_NO_TELEMETRY: "1",
        HYPERFRAMES_NO_UPDATE_CHECK: "1",
      },
    },
  );
  liveServers.add(child);
  child.once("exit", () => liveServers.delete(child));
  child.stdout.on("data", (d) => log.push(String(d)));
  child.stderr.on("data", (d) => log.push(String(d)));
  for (const deadline = Date.now() + 60_000; Date.now() < deadline; await sleep(50)) {
    if (child.exitCode !== null)
      throw new Error(`studio exited ${child.exitCode}: ${log.join("").slice(-500)}`);
    const announced = Number(announcedPort(log));
    if (announced && (await up(announced))) return { child, port: announced };
  }
  await stopServer(child);
  throw new Error("studio did not start in 60s");
}

export async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((r) => child.once("exit", r));
  signalGroup(child, "SIGTERM");
  if (await Promise.race([exited.then(() => true), sleep(5000)])) return;
  signalGroup(child, "SIGKILL");
  await exited;
}

/** Runs in the top frame after installWebMcpHost("__editBench"): a frame-interval and long-task recorder. */
function instrumentPage() {
  if (window.top !== window) return;
  const rec = { on: false, frames: [], long: [] };
  window.__editBench.rec = rec;
  // The callback's own clock: Chrome stamps a late frame with the vsync it missed, which hides a stall.
  const loop = () => {
    if (rec.on) rec.frames.push(performance.now());
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  new PerformanceObserver((list) => {
    if (rec.on) for (const e of list.getEntries()) rec.long.push(e.duration);
  }).observe({ type: "longtask" });
}

export const nextFrame = (page, n = 1) =>
  page.evaluate(
    (count) =>
      new Promise((r) => {
        const tick = (left) => (left ? requestAnimationFrame(() => tick(left - 1)) : r());
        tick(count);
      }),
    n,
  );

export function readFiles(dir, files) {
  return Object.fromEntries(files.map((f) => [f, readFileSync(join(dir, f), "utf8")]));
}
export const sameFiles = (a, b) => Object.keys(a).every((f) => a[f] === b[f]);

/** Waits until the files differ from `from` (or equal `want`, or just exist) and then hold still for 300 ms. */
// fallow-ignore-next-line complexity
export async function waitForFiles(ctx, { from, want, timeout = 5000 }) {
  const deadline = Date.now() + timeout;
  let last = readFiles(ctx.dir, ctx.files);
  let stableSince = Date.now();
  for (; Date.now() < deadline; await sleep(50)) {
    const now = readFiles(ctx.dir, ctx.files);
    if (!sameFiles(now, last)) [last, stableSince] = [now, Date.now()];
    const reached = want ? sameFiles(now, want) : !from || !sameFiles(now, from);
    if (reached && Date.now() - stableSince >= 300)
      return { reached: true, files: now, at: stableSince };
  }
  return { reached: false, files: last };
}

const LOST_MS = 60_000;

/** The write an undo or redo key pressed at `since` causes, with its ms from the key; none after LOST_MS is lost. */
export async function timedWrite(ctx, from, since) {
  const w = await waitForFiles(ctx, { from, timeout: LOST_MS });
  return { ...w, ms: w.reached ? w.at - since : null };
}

/** "undo lost", "redo lost", or null when every write landed; a late one fails undo through its ms. */
export const saveFault = (writes) =>
  writes.map(([name, w]) => (w.reached ? null : `${name} lost`)).find(Boolean) ?? null;

// fallow-ignore-next-line complexity
async function previewCandidate(frame, selector) {
  const target = await frame.$(selector);
  const host = target && (await frame.frameElement());
  // Studio loads an edit in a same-size shadow iframe hidden with visibility; it is not what is on screen.
  const shown =
    host && (await host.evaluate((e) => e.checkVisibility({ visibilityProperty: true })));
  const box = shown && (await host.boundingBox());
  return box && { area: box.width * box.height, frame, target };
}

/** The largest visible preview iframe holding the target; a frame Studio detaches mid-scan is skipped. */
async function findTarget(page, selector = "#target") {
  const previews = page.frames().filter((f) => f.url().includes("/preview"));
  const found = await Promise.all(
    previews.map((f) => previewCandidate(f, selector).catch(() => null)),
  );
  return found.filter(Boolean).reduce((a, b) => (!a || b.area > a.area ? b : a), null);
}

// The handle's own session: remote object ids do not resolve in any other CDP session.
async function contentQuad(handle) {
  const { quads } = await handle.client.send("DOM.getContentQuads", {
    objectId: handle.remoteObject().objectId,
  });
  if (!quads.length) throw new Error("element has no rendered box");
  return toPoints(quads[0]);
}

async function findHandles(ctx) {
  const found = await findTarget(ctx.page, ctx.selector);
  if (!found) throw new Error(`${ctx.selector ?? "#target"} not found in preview`);
  ctx.handles = { target: found.target, root: await found.frame.$('[data-composition-id="main"]') };
}

async function readQuads({ handles }) {
  const read = await Promise.all([
    contentQuad(handles.root),
    contentQuad(handles.target),
    handles.target.evaluate((e) => ({
      width: e.offsetWidth,
      height: e.offsetHeight,
      clip: getComputedStyle(e).clipPath,
    })),
  ]);
  const shown = await handles.target.evaluate((e) => {
    const host = e.ownerDocument.defaultView?.frameElement;
    return !host || host.checkVisibility({ visibilityProperty: true });
  });
  if (!shown) throw new Error("the measured preview was retired");
  return read;
}

/** The target's rendered quad, visible (cropped) quad and the screen/composition mapping, from CDP quads. */
export async function measure(ctx) {
  // Studio can swap the preview into a fresh iframe; a cached handle then reads a hidden copy, so find it again.
  let read = null;
  for (let attempt = 0; !read; attempt++) {
    read = await (ctx.handles ? readQuads(ctx) : Promise.reject(new Error("no handles"))).catch(
      async (error) => {
        if (attempt === 5) throw error;
        await sleep(100);
        await findHandles(ctx).catch(() => undefined);
        return null;
      },
    );
  }
  const [rootQuad, targetQuad, box] = read;
  const map = compositionMapper(rootQuad, COMPOSITION);
  const quad = targetQuad.map(map.toComp);
  const size = { width: box.width, height: box.height };
  return { map, quad, size, visible: visibleQuad(quad, size, parseInset(box.clip)) };
}

// Still means the same reads on STILL_FRAMES animation frames in a row with the page's network quiet.
// EDIT_ACCURACY_STILL_MS restores the old check: a fixed window, in ms, of unchanged reads with no network signal.
const STILL_MS = process.env.EDIT_ACCURACY_STILL_MS
  ? Number(process.env.EDIT_ACCURACY_STILL_MS)
  : null;
export const STILL_FRAMES = 3;

// The server's event stream stays open for the page's life; timeline thumbnails and the background lint
// behind the lint badge run on the server, can take seconds (lint over 15 s on a busy runner), and never
// change the preview. A blob: load is page memory (a thumbnail's image) and can end with no event at all.
export const backgroundRequest = (request) =>
  request.resourceType() === "eventsource" ||
  request.url().startsWith("blob:") ||
  /\/api\/projects\/[^/]+\/(thumbnail\/|lint(\?|$))/.test(request.url());

/**
 * The Studio page's network, for the stillness check: requests in flight, a counter bumped by any request or
 * server event, and when the server last announced each project file. Studio's save requests, its reads of
 * the files and the preview's loads all show here; a server `file-change` event can start another reload.
 */
async function watchNetwork(page) {
  const net = { inflight: new Set(), activity: 0, announced: new Map(), since: Date.now() };
  const done = (request) => {
    net.inflight.delete(request);
    net.activity++;
  };
  page.on("request", (request) => {
    if (!backgroundRequest(request)) net.inflight.add(request);
    net.activity++;
  });
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  const cdp = await page.createCDPSession();
  cdp.on("Network.eventSourceMessageReceived", ({ eventName, data }) => {
    net.activity++;
    if (eventName === "file-change") net.announced.set(JSON.parse(data).path, Date.now());
  });
  await cdp.send("Network.enable");
  return net;
}

/** A file written after the server last announced it: its `file-change` event, and what Studio does on it, is still to come. */
const unannounced = ({ dir, files, net }) =>
  files.some(
    (f) => statSync(join(dir, f)).mtimeMs > Math.max(net.since, net.announced.get(f) ?? 0),
  );

/**
 * Whether the page is waiting on the network. A request whose frame is gone never finishes, so it is dropped,
 * and counted as activity like a finished one: a window that began while it was in flight then restarts.
 */
// fallow-ignore-next-line complexity
export function networkBusy(ctx) {
  for (const request of ctx.net.inflight)
    if (request.frame()?.detached !== false) {
      ctx.net.inflight.delete(request);
      ctx.net.activity++;
    }
  return { busy: ctx.net.inflight.size > 0 || unannounced(ctx), activity: ctx.net.activity };
}

// Studio reloads an edited preview in a shadow iframe (`_t` in its URL) and swaps it in when painted.
const previewFrames = (page) =>
  page
    .frames()
    .map((f) => f.url())
    .filter((u) => u.includes("/preview"))
    .join(" ");

/** A hidden preview holding the target is a shadow reload not yet promoted: the visible frame is about to go stale. */
async function hiddenTarget(page, selector = "#target") {
  for (const f of page.frames().filter((f) => f.url().includes("/preview"))) {
    const host = await f.frameElement().catch(() => null);
    const shown = await host?.evaluate((e) => e.checkVisibility({ visibilityProperty: true }));
    if (shown === false && (await f.$(selector).catch(() => null))) return true;
  }
  return false;
}

// Studio's own word that the preview is about to change: a reload asked for, loading, or an undo or redo in flight.
const previewChanging = (page) =>
  Promise.resolve()
    .then(() => page.evaluate(() => document.documentElement.hasAttribute("data-preview-changing")))
    .catch(() => false);

// Keyframed cases only: waiting out the swap lands a later undo in the preview's burst of requests.
export const swapPending = async (ctx) =>
  Boolean(ctx.keys) &&
  ((await previewChanging(ctx.page)) || (await hiddenTarget(ctx.page, ctx.selector)));

// fallow-ignore-next-line complexity
const netMoved = (start, now) =>
  Boolean(now.net?.busy) || now.net?.activity !== start.net?.activity;

/** Restart the stillness window: a pending swap, a changed set of preview frames, the box moved, or network. */
// fallow-ignore-next-line complexity
export const unsettledBy = (start, now) =>
  start.pending ||
  now.pending ||
  netMoved(start, now) ||
  now.frames !== start.frames ||
  quadDistance(now.m.visible, start.m.visible) >= 0.01;

/** Whether a window that began at `start`, with `still` unchanged reads since, has held long enough. */
// fallow-ignore-next-line complexity
export const heldStill = (start, still, since, stillMs = STILL_MS) =>
  !start.pending &&
  !start.net?.busy &&
  (stillMs === null ? still >= STILL_FRAMES : Date.now() - since >= stillMs);

/** Measures once the shown preview and the box have held still; Studio updates both after a save. */
// fallow-ignore-next-line complexity
export async function settled(ctx, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  const watchNet = STILL_MS === null && ctx.net;
  const read = async () => ({
    m: await measure(ctx),
    frames: previewFrames(ctx.page),
    pending: await swapPending(ctx),
    ...(watchNet && { net: networkBusy(ctx) }),
  });
  let start = await read();
  let now = start;
  // Compared with the window's first read, so a drift too slow to show read to read still restarts it.
  for (let [since, still] = [Date.now(), 0]; !heldStill(start, still, since); ) {
    // A preview that never holds still is a Studio defect: the metrics it feeds fail, the rest still count.
    if (Date.now() > deadline) return { ...now.m, unsettled: true };
    await nextFrame(ctx.page);
    now = await read();
    if (unsettledBy(start, now)) [start, since, still] = [now, Date.now(), 0];
    else still++;
  }
  return now.m;
}

const callTool = (page, name, args) =>
  page.evaluate((n, a) => window.__editBench.call(n, a), name, args).catch(String);

/**
 * Seeks to the playhead once Studio reports the composition's duration, and returns the landed seek. A seek
 * before that is replayed by the runtime's timeline bind from near 0, which skips the first keyframe of a
 * tween starting at the playhead: the preview then holds a box no fresh seek or render shows.
 */
// fallow-ignore-next-line complexity
export async function seekBound(ctx) {
  for (const deadline = Date.now() + 30_000; Date.now() < deadline; await sleep(50)) {
    const look = await callTool(ctx.page, "studio_look", {});
    if (!(look?.ok && look.duration > 0)) continue;
    const seek = await callTool(ctx.page, "studio_seek", { time: ctx.playhead });
    if (
      seek?.ok &&
      seek.duration > 0 &&
      seek.playhead === ctx.playhead &&
      (await findTarget(ctx.page))
    )
      return seek;
  }
  return null;
}

/** Ready once Studio's own seek tool reports the composition and the playhead landed. */
export async function openStudio(ctx) {
  ctx.handles = null;
  await ctx.page.waitForFunction(() => window.__editBench?.has("studio_seek"), { timeout: 90_000 });
  if (!(await seekBound(ctx))) throw new Error("studio never reported a seekable composition");
  return settled(ctx);
}

export async function seekTo(ctx, time) {
  const seek = await ctx.page.evaluate(
    (t) => window.__editBench.call("studio_seek", { time: t }),
    time,
  );
  if (!seek?.ok || seek.playhead !== time)
    throw new Error(`studio_seek ${time}: ${JSON.stringify(seek)}`);
  return settled(ctx);
}

/** Each GSAP-animated property's value at every other keyframe time (and the box there), then back to the playhead. */
async function readKeyframes(ctx, keys, withBox = false) {
  const at = {};
  for (const time of keys.times) {
    const m = await seekTo(ctx, time);
    const values = await ctx.handles.target.evaluate((el, props) => {
      const gsap = el.ownerDocument.defaultView.gsap;
      return Object.fromEntries(props.map((p) => [p, Number.parseFloat(gsap.getProperty(el, p))]));
    }, keys.props);
    at[time] = { values, ...(withBox && { visible: m.visible }) };
  }
  await seekTo(ctx, ctx.playhead);
  return at;
}

// GSAP's own numbers (px, deg, scale): an untouched keyframe reads back exactly.
const KEY_TOLERANCE = 0.01;

/** The largest change of an animated value at a keyframe the edit was not on; NaN (unreadable) fails. */
export function keyframeDrift(before, after) {
  let worst = { diff: 0, time: null, prop: null };
  for (const [time, b] of Object.entries(before))
    for (const [prop, v] of Object.entries(b.values)) {
      const diff = Math.abs(after[time].values[prop] - v);
      if (!(diff <= worst.diff)) worst = { diff, time: Number(time), prop };
    }
  return { ...worst, pass: worst.diff <= KEY_TOLERANCE };
}

const scriptsIn = (html) =>
  [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script[^>]*>/gi)].map((m) => m[1]);
const animatesTarget = (anim) => anim.targetSelector === "#target" && !anim.global;
const keyframeProps = (anim) => (anim.keyframes?.keyframes ?? []).map((k) => k.properties);
const animatedProps = (anim) =>
  [anim.properties, anim.fromProperties, ...keyframeProps(anim)].flatMap((props) =>
    Object.keys(props ?? {}),
  );

function targetGroups(files) {
  const props = Object.values(files)
    .flatMap(scriptsIn)
    .flatMap((script) => parseGsapScript(script).animations.filter(animatesTarget))
    .flatMap(animatedProps);
  return new Set(props.map((prop) => classifyTweenPropertyGroup({ [prop]: 0 })).filter(Boolean));
}

/** Property groups the edit made the timeline animate on #target that it did not animate before. */
export function openedGroups(original, saved) {
  const before = targetGroups(original);
  return [...targetGroups(saved)].filter((group) => !before.has(group));
}

const declarations = (text = "") =>
  Object.fromEntries(
    text
      .split(";")
      .map((d) => d.split(":"))
      .filter((d) => d.length > 1)
      .map(([k, ...v]) => [k.trim(), v.join(":").trim()]),
  );
const capture = (re, text = "") => re.exec(text)?.[1];
const targetCss = (html) => ({
  rule: declarations(capture(/#target\s*\{([^}]*)\}/, html)),
  inline: declarations(capture(/\bstyle="([^"]*)"/, capture(/(<[^>]*\bid="target"[^>]*>)/, html))),
});

const keyRule = (drift, opened) => ({ ...drift, opened, pass: drift.pass && opened.length === 0 });

/** Plain CSS the edit wrote for a property GSAP animates: it would override or fight the timeline. */
export function strayCss(original, saved, props) {
  const changed = (a, b, file, where) =>
    props
      .filter((p) => a[p] !== b[p])
      .map((p) => `${file} ${where} ${p}: ${a[p] ?? "-"} -> ${b[p] ?? "-"}`);
  const stray = Object.keys(original).flatMap((file) => {
    const [a, b] = [targetCss(original[file]), targetCss(saved[file])];
    return [
      ...changed(a.rule, b.rule, file, "rule"),
      ...changed(a.inline, b.inline, file, "inline"),
    ];
  });
  return { pass: stray.length === 0, stray };
}

/** Puppeteer presses one key at a time: hold the modifiers around the last key. */
export async function chord(page, keys) {
  const [key, ...mods] = keys.split("+").reverse();
  for (const m of mods) await page.keyboard.down(m);
  await page.keyboard.press(key);
  for (const m of mods) await page.keyboard.up(m);
}

export async function blurPreview(page) {
  await page.evaluate(() => {
    if (document.activeElement?.tagName === "IFRAME") document.activeElement.blur();
  });
}

/** Snapping deliberately pulls the box off the pointer, so the bench turns it off with Studio's own toggle. */
async function disableSnap(page) {
  const title = await page.$eval('[aria-label="Toggle snap"]', (b) => b.title);
  if (/enabled/i.test(title)) await page.click('[aria-label="Toggle snap"]');
  const after = await page.$eval('[aria-label="Toggle snap"]', (b) => b.title);
  if (!/disabled/i.test(after)) throw new Error(`snap toggle did not turn off: ${after}`);
}

const zoomOf = (page) =>
  page.$eval('[data-testid="preview-zoom-stage"]', (e) => {
    const m = /scale\(([\d.]+)\)/.exec(e.style.transform);
    return m ? Number(m[1]) * 100 : 100;
  });

/** Ctrl+wheel over the target, as a person zooms; wheel units are solved exactly from the zoom law. */
async function setZoom(ctx, percent, anchor) {
  if (percent === 100) return 100;
  await ctx.page.mouse.move(anchor[0], anchor[1]);
  await ctx.page.keyboard.down("Control");
  let units = Math.log(percent / (await zoomOf(ctx.page))) / ZOOM_SENSITIVITY;
  while (Math.abs(units) > 1e-9) {
    const step = Math.max(-10, Math.min(10, units));
    await ctx.page.mouse.wheel({ deltaY: -step });
    units -= step;
  }
  await ctx.page.keyboard.up("Control");
  await sleep(400);
  const achieved = await zoomOf(ctx.page);
  if (Math.abs(achieved - percent) > 0.5)
    throw new Error(`zoom ${percent}% landed at ${achieved}%`);
  return achieved;
}

const overlayRect = (page, selector) =>
  page.$$eval(selector, (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        w: r.width,
        h: r.height,
        label: e.getAttribute("aria-label"),
      };
    }),
  );

export async function selectTarget(ctx, m) {
  const c = m.map.toScreen(centre(m.visible));
  const want = m.visible.map(m.map.toScreen);
  const isSelected = async () => {
    const [box] = await overlayRect(ctx.page, "[data-dom-edit-selection-box]");
    if (!box) return false;
    const xs = want.map((p) => p[0]);
    const ys = want.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    return Math.abs(box.w - w) < 4 && Math.abs(box.h - h) < 4 && dist([box.x, box.y], c) < 4;
  };
  const waitSelected = async () => {
    for (const deadline = Date.now() + 2000; Date.now() < deadline; await sleep(100))
      if (await isSelected()) return true;
    return false;
  };
  await ctx.page.mouse.click(c[0], c[1]);
  if (await waitSelected()) return;
  // A nested composition's child takes a second click to enter the composition.
  await ctx.page.mouse.click(c[0], c[1], { count: 2 });
  if (!(await waitSelected())) {
    const boxes = await overlayRect(ctx.page, "[data-dom-edit-selection-box]");
    throw new Error(
      `could not select #target at ${c.map(Math.round)}; selection ${JSON.stringify(boxes)}`,
    );
  }
}

// fallow-ignore-next-line complexity
async function handlePoint(ctx, m, gesture) {
  if (gesture === "move" || gesture === "nudge") return m.map.toScreen(centre(m.visible));
  if (gesture === "rotate") {
    const [h] = await overlayRect(ctx.page, '[aria-label="Rotate selection"]');
    if (!h) throw new Error("no rotate handle");
    return [h.x, h.y];
  }
  if (gesture === "crop") {
    const [h] = await overlayRect(ctx.page, '[aria-label="Crop right"]');
    if (!h) throw new Error("no crop right handle");
    return [h.x, h.y];
  }
  const corner = m.map.toScreen(m.visible[2]);
  const dots = await overlayRect(ctx.page, "div.pointer-events-auto.absolute.h-4.w-4");
  if (!dots.length) throw new Error("no resize handles");
  const dot = dots.reduce((a, b) => (dist([a.x, a.y], corner) <= dist([b.x, b.y], corner) ? a : b));
  return [dot.x, dot.y];
}

async function cropOutline(ctx, map) {
  const h = await ctx.page.$("[data-dom-edit-crop-frame] > div.border-dashed");
  if (!h) throw new Error("no crop outline");
  return (await contentQuad(h)).map(map.toComp);
}

/** Holds each history reply back, so the next undo is pressed while this one's preview update runs. */
function slowHistory(ms) {
  const send = window.fetch;
  window.fetch = (url, init) =>
    /\/history\/step$/.test(String(url).split("?")[0])
      ? send(url, init).then((r) => new Promise((ok) => setTimeout(() => ok(r), ms)))
      : send(url, init);
}

/** Holds every save request `ms` before it is sent, so a later press lands while it is still in flight. */
function slowSaves(ms) {
  const send = window.fetch;
  window.fetch = (url, init) =>
    /\/file-mutations\/patch-|gsap-mutations/.test(String(url))
      ? new Promise((resolve) => setTimeout(resolve, ms)).then(() => send(url, init))
      : send(url, init);
}

/** Screen path (one point per frame) and the per-frame tracking error for each pointer gesture. */
function plan(gesture, pre, pressComp) {
  const at = (p) => pre.map.toScreen(p);
  const steps = Array.from({ length: STEPS }, (_, i) => (i + 1) / STEPS);
  const follow = (point) => ({
    point,
    error: (s, s0) =>
      dist([s.p[0] - s0.p[0], s.p[1] - s0.p[1]], [s.c[0] - s0.c[0], s.c[1] - s0.c[1]]),
  });
  if (gesture === "move") {
    const local = quadToLocal(pre.quad, { width: 1, height: 1 }, pressComp);
    return {
      path: steps.map((k) => at([pressComp[0] + MOVE_BY[0] * k, pressComp[1] + MOVE_BY[1] * k])),
      ...follow((m) => localToQuad(m.quad, { width: 1, height: 1 }, local)),
    };
  }
  if (gesture === "resize") {
    const c = centre(pre.visible);
    const d = dist(pre.visible[2], c);
    const u = [(pre.visible[2][0] - c[0]) / d, (pre.visible[2][1] - c[1]) / d];
    return {
      path: steps.map((k) =>
        at([pressComp[0] + u[0] * RESIZE_BY * k, pressComp[1] + u[1] * RESIZE_BY * k]),
      ),
      ...follow((m) => m.visible[2]),
    };
  }
  if (gesture === "crop") {
    const n = [pre.quad[0][0] - pre.quad[1][0], pre.quad[0][1] - pre.quad[1][1]];
    const len = Math.hypot(...n);
    return {
      path: steps.map((k) =>
        at([pressComp[0] + (n[0] / len) * CROP_BY * k, pressComp[1] + (n[1] / len) * CROP_BY * k]),
      ),
      ...follow((m) => mid(m.outline[1], m.outline[2])),
    };
  }
  const c = centre(pre.visible);
  const r = dist(pressComp, c);
  const a0 = Math.atan2(pressComp[1] - c[1], pressComp[0] - c[0]);
  const angle = (p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  return {
    path: steps.map((k) =>
      at([c[0] + r * Math.cos(a0 + ROTATE_BY * k), c[1] + r * Math.sin(a0 + ROTATE_BY * k)]),
    ),
    point: (m) => [angleOf(m.quad), 0],
    error: (s, s0) => Math.abs(normalizeAngle(s.p[0] - s0.p[0] - (angle(s.c) - angle(s0.c)))) * r,
  };
}

// A press made while the preview reloads waits for it: Studio draws its box at the pointer meanwhile.
async function waitingQuad(page, map) {
  const waiting = await page.$("[data-dom-edit-press-waiting]");
  const quad = waiting && (await contentQuad(waiting)).map(map.toComp);
  await waiting?.dispose();
  return quad;
}

/** The box as the preview shows it: the waiting marker's quad while a press waits for its replay, else the element. */
export async function measureShown(ctx, gesture, read = measure, quadOf = contentQuad) {
  for (;;) {
    const waiting = await ctx.page.$("[data-dom-edit-press-waiting]");
    try {
      const m = await read(ctx);
      if (gesture === "crop") m.outline = await cropOutline(ctx, m.map);
      const quad = waiting && (await quadOf(waiting)).map(m.map.toComp);
      // Replay removes the marker before moving the element. Do not combine a pre-replay
      // element read with a post-replay marker read into a position nobody displayed.
      if (
        waiting &&
        !(await waiting.evaluate((e) => e.hasAttribute("data-dom-edit-press-waiting")))
      )
        continue;
      return { m: quad ? { ...m, quad, visible: quad } : m, actual: m.visible };
    } finally {
      await waiting?.dispose();
    }
  }
}

export async function sample(ctx, gesture, point, pointerScreen) {
  const { m, actual } = await measureShown(ctx, gesture);
  return { m, actual, p: point(m), c: m.map.toComp(pointerScreen) };
}

const TRACE_CATEGORIES = ["toplevel", "devtools.timeline", "blink.user_timing"];
const TRACE_MARK = "edit-bench-end";

/** Frame stamps plus a main-thread trace of the drag; the end mark ties performance.now() to trace time. */
export async function recording(page, on) {
  if (on) await page.tracing.start({ categories: TRACE_CATEGORIES });
  const rec = await page.evaluate(
    (flag, mark) => {
      const rec = window.__editBench.rec;
      if (flag) [rec.frames, rec.long, rec.on] = [[], [], true];
      else rec.on = false;
      return {
        frames: rec.frames,
        long: rec.long,
        mark: flag ? null : performance.mark(mark).startTime,
      };
    },
    on,
    TRACE_MARK,
  );
  if (on) return rec;
  const trace = new TextDecoder().decode(await page.tracing.stop());
  return { ...rec, trace: JSON.parse(trace).traceEvents };
}

const isRunTask = (e) =>
  e.ph === "X" && (e.name === "RunTask" || e.name === "ThreadControllerImpl::RunTask");

/** Outermost tasks on one thread; nested RunTask events sit inside them. */
function topLevelTasks(trace, { pid, tid }) {
  const runs = trace
    .filter((e) => e.pid === pid && e.tid === tid && isRunTask(e))
    .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const tops = [];
  let end = -Infinity;
  for (const e of runs) {
    if (e.ts < end) continue;
    tops.push(e);
    end = e.ts + e.dur;
  }
  return tops;
}

// Thread CPU time, spread evenly over the task, so a descheduled thread does not count; untimed tasks count wall time.
const cpuUs = (e, a, b) =>
  (Math.max(0, Math.min(b, e.ts + e.dur) - Math.max(a, e.ts)) * (e.tdur ?? e.dur)) / (e.dur || 1);

/** Main-thread CPU ms inside each frame interval, on the thread that ran the end mark; null when unknown. */
function mainThreadPerFrame({ frames, mark, trace }) {
  const anchor = trace.find((e) => e.name === TRACE_MARK && e.cat.includes("user_timing"));
  // Without the mark the work is unknown, which fails smoothness alone.
  if (!anchor) return { work: null, wallTimed: 0, unknown: "no end mark in the trace" };
  const toTrace = (ms) => anchor.ts + (ms - mark) * 1000;
  const [from, to] = [toTrace(frames[0]), toTrace(frames.at(-1))];
  const tasks = topLevelTasks(trace, anchor);
  const inFrames = (e) => e.ts < to && e.ts + e.dur > from;
  const wallTimed = tasks.filter((e) => e.tdur === undefined && inFrames(e)).length;
  const work = frames.slice(1).map((t, i) => {
    const [a, b] = [toTrace(frames[i]), toTrace(t)];
    return tasks.reduce((sum, e) => sum + cpuUs(e, a, b), 0) / 1000;
  });
  return { work, wallTimed };
}

const hundredth = (v) => Math.round(v * 100) / 100;

export function smoothness(rec) {
  const intervals = rec.frames.slice(1).map((t, i) => t - rec.frames[i]);
  const { work, wallTimed, unknown } = mainThreadPerFrame(rec);
  return {
    p95: percentile(intervals, 95),
    frames: intervals.length,
    longTasks: rec.long.length,
    intervals: intervals.map(hundredth),
    work: work && work.map(hundredth),
    wallTimed,
    ...(unknown && { unknown }),
  };
}

const CONTROL_PAGE = `data:text/html,<body style="margin:0;background:%23202020"><div id="box"
  style="position:absolute;left:600px;top:300px;width:240px;height:160px;background:%23f0c020"></div>`;

// Reported, never gated, so it runs once per gesture per browser rather than once per case.
const controls = new WeakMap();

/** The case's drag schedule and per-frame reads on a blank page in the same Chrome: the machine's own frame drops. */
export function controlDrag(browser, gesture) {
  const byGesture = controls.get(browser) ?? new Map();
  controls.set(browser, byGesture);
  if (!byGesture.has(gesture)) {
    const measured = measureControl(browser, gesture);
    // A failed control is not cached, so one transient failure does not fail every later case.
    measured.catch(() => byGesture.get(gesture) === measured && byGesture.delete(gesture));
    byGesture.set(gesture, measured);
  }
  return byGesture.get(gesture);
}

async function measureControl(browser, gesture) {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport(VIEWPORT);
    await page.evaluateOnNewDocument(installWebMcpHost, "__editBench");
    await page.evaluateOnNewDocument(instrumentPage);
    // The real drags run the frame sampler, so the control pays its cost too.
    await page.evaluateOnNewDocument(frameSamplerScript);
    await page.goto(CONTROL_PAGE);
    const box = await page.$("#box");
    const ctx = { page, handles: { target: box, root: box } };
    const read = () => readQuads(ctx);
    if (gesture === "nudge") {
      await recording(page, true);
      for (let i = 0; i < NUDGES; i++) {
        await page.keyboard.press("ArrowRight");
        await nextFrame(page);
      }
      await nextFrame(page, 2);
      return smoothness(await recording(page, false));
    }
    await page.mouse.move(700, 380);
    await startFrames(page, "#box");
    await page.mouse.down();
    await nextFrame(page);
    await read();
    await recording(page, true);
    for (let i = 1; i <= STEPS; i++) {
      await page.mouse.move(700 + (MOVE_BY[0] * i) / STEPS, 380 + (MOVE_BY[1] * i) / STEPS);
      await nextFrame(page);
      await read();
    }
    const smooth = smoothness(await recording(page, false));
    await page.mouse.up();
    await stopFrames(page);
    return smooth;
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** The move Chromium resends at the last known point after a layout change: no button, capture kept. A CDP move
 * with no button ends the capture instead, so it goes to the captured box (the mouse is pointer 1). */
async function strayMove(page, [x, y]) {
  const sent = await page.evaluate(
    ([clientX, clientY]) =>
      document.querySelector("[data-dom-edit-selection-box]")?.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          buttons: 0,
          clientX,
          clientY,
        }),
      ),
    [x, y],
  );
  if (sent === undefined) throw new Error("no selection box to send the stray move to");
  await nextFrame(page);
}

/** `route`, given the press point, replaces the gesture's straight path.
 * `{ pause }` holds still; `{ stray }`: see strayMove. */
// fallow-ignore-next-line complexity
export async function pointerGesture(ctx, gesture, pre, route) {
  const quad = await waitingQuad(ctx.page, pre.map);
  if (quad) pre = { ...pre, quad, visible: quad };
  const press = await handlePoint(ctx, pre, gesture);
  const pressComp = pre.map.toComp(press);
  const g = { ...plan(gesture, pre, pressComp), ...(route && { path: route(press) }) };
  const hit = await ctx.page.evaluate(([x, y]) => {
    const e = document.elementFromPoint(x, y);
    return e
      ? `${e.tagName.toLowerCase()}${e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label")}]` : ""}`
      : null;
  }, press);
  await ctx.page.mouse.move(press[0], press[1]);
  await startFrames(ctx.page, ctx.selector ?? "#target");
  await nextFrame(ctx.page, 2);
  traceBench("press", { gesture });
  await ctx.page.mouse.down();
  await nextFrame(ctx.page);
  const s0 = await sample(ctx, gesture, g.point, press);
  traceBench("pressed", { gesture, jump: pre && quadDistance(s0.m.visible, pre.visible) });
  await recording(ctx.page, true);
  const errors = [];
  let last = s0;
  for (const p of g.path) {
    if (p.pause) {
      await sleep(p.pause);
      continue;
    }
    if (p.stray) {
      await strayMove(ctx.page, p.stray);
      continue;
    }
    await ctx.page.mouse.move(p[0], p[1]);
    await nextFrame(ctx.page);
    last = await sample(ctx, gesture, g.point, p);
    errors.push(g.error(last, s0));
  }
  const rec = await recording(ctx.page, false);
  const smooth = smoothness(rec);
  traceBench("release", { gesture, worst: Math.max(...errors) });
  await ctx.page.mouse.up();
  const lastQuad = gesture === "crop" ? last.m.outline : last.m.visible;
  return {
    errors,
    lastQuad,
    lastMeasure: last.m,
    pressJump: quadDistance(s0.m.visible, pre.visible),
    smooth,
    diag: {
      hit,
      actualAtRelease: last.actual,
      shownAtRelease: lastQuad,
      grabOffset: gesture === "rotate" ? 0 : dist(s0.p, s0.c),
      errors: errors.map((e) => Math.round(e * 1000) / 1000),
    },
  };
}

async function nudgeGesture(ctx, pre) {
  await recording(ctx.page, true);
  for (let i = 0; i < NUDGES; i++) {
    await ctx.page.keyboard.press("ArrowRight");
    await nextFrame(ctx.page);
  }
  await nextFrame(ctx.page, 2);
  const smooth = smoothness(await recording(ctx.page, false));
  const m = await measure(ctx);
  const [a, b] = [centre(pre.visible), centre(m.visible)];
  return {
    errors: [dist([b[0] - a[0], b[1] - a[1]], [NUDGES, 0])],
    lastQuad: m.visible,
    pressJump: null,
    smooth,
    diag: {},
  };
}

const blockedCdnUrls = new Set();

/** Serves the fixtures' CDN requests from the repo; any other CDN URL is blocked and named once. */
export async function serveFixtureAssetsLocally(page) {
  const cdp = await page.createCDPSession();
  cdp.on("Fetch.requestPaused", ({ requestId, request }) => {
    const file = localAsset(request.url);
    if (!file) {
      if (!blockedCdnUrls.has(request.url)) console.warn(`edit bench: blocked ${request.url}`);
      blockedCdnUrls.add(request.url);
      cdp
        .send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" })
        .catch(() => undefined);
      return;
    }
    // A request whose frame went away rejects; that must not end the run.
    cdp
      .send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "text/javascript" }],
        body: readFileSync(file).toString("base64"),
      })
      .catch(() => undefined);
  });
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: `${FIXTURE_CDN}*` }] });
}

/**
 * Takes evidence screenshots into `evidence.shots` only when `shots` is on (the gate's confirmation re-runs); an
 * error screen is always kept. Studio fills the viewport; capturing beyond it makes Chrome resize the page.
 */
export function shooter(page, evidence, shots) {
  evidence.shots = {};
  return async (name) => {
    if (!shots && name !== "error") return;
    evidence.shots[name] = await page.screenshot({
      type: "jpeg",
      quality: 70,
      captureBeyondViewport: false,
      optimizeForSpeed: true,
    });
  };
}

/**
 * Studio open on the case in a fresh browser context, snapping off, at the case's zoom, target selected;
 * `drive` measures the rest. A failure keeps a screenshot, and the context always closes.
 */
// fallow-ignore-next-line complexity
export async function inStudio({ browser, spec, dir, files, url, evidence, shots = true }, drive) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await serveFixtureAssetsLocally(page);
  const ctx = {
    page,
    dir,
    files,
    handles: null,
    playhead: spec.playhead ?? PLAYHEAD,
    keys: spec.keys,
    net: await watchNetwork(page),
  };
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on(
    "console",
    (m) =>
      m.text().startsWith("[hf-reload]") && traceBench("reload", { line: m.text().slice(0, 400) }),
  );
  const shoot = shooter(page, evidence, shots);
  try {
    await page.setViewport(VIEWPORT);
    if (process.env.HF_WRITE_TRACE)
      await page.evaluateOnNewDocument(() => localStorage.setItem("hf-reload-debug", "1"));
    await page.evaluateOnNewDocument(installWebMcpHost, "__editBench");
    await page.evaluateOnNewDocument(instrumentPage);
    if (spec.slowSaves) await page.evaluateOnNewDocument(slowSaves, spec.slowSaves);
    if (process.env.HF_SLOW_HISTORY)
      await page.evaluateOnNewDocument(slowHistory, Number(process.env.HF_SLOW_HISTORY));
    await page.evaluateOnNewDocument(frameSamplerScript);
    await page.goto(url);
    let pre = await openStudio(ctx);
    await disableSnap(page);
    const zoom = await setZoom(ctx, spec.zoom, pre.map.toScreen(centre(pre.visible)));
    // The animated values at the other keyframes, read before anything is selected or edited.
    const keysBefore = spec.keys && (await readKeyframes(ctx, spec.keys));
    pre = await settled(ctx);
    await selectTarget(ctx, pre);
    pre = await settled(ctx);
    return await drive({ ctx, page, pre, zoom, shoot, consoleErrors, keysBefore });
  } catch (error) {
    await shoot("error").catch(() => undefined);
    throw error;
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** One case, end to end, against a Studio already serving `dir`. */
export async function runCase(args) {
  const control = await controlDrag(args.browser, args.spec.gesture);
  return inStudio(args, (session) => measureCase(args, session, control));
}

// fallow-ignore-next-line complexity
async function measureCase(
  { spec, dir, files, evidence },
  { ctx, page, pre, zoom, shoot, consoleErrors, keysBefore },
  control,
) {
  const original = readFiles(dir, files);

  const drive =
    spec.gesture === "nudge"
      ? await nudgeGesture(ctx, pre)
      : await pointerGesture(ctx, spec.gesture, pre);
  const releasedAt = Date.now();
  const save = await waitForFiles(ctx, {
    from: original,
    timeout: spec.gesture === "nudge" ? 6000 : 5000,
  });
  await nextFrame(page, 2);
  await blurPreview(page);
  await page.keyboard.press("Escape");
  const committed = await settled(ctx);
  const frames = await stopFrames(page);
  await shoot("committed");
  const committedFiles = readFiles(dir, files);
  evidence.files = committedFiles;
  const saved = !sameFiles(committedFiles, original);

  // Undo and redo run before any reload, each timed from its key to its own write; redo waits for undo.
  const landed = (from, since) =>
    saved ? timedWrite(ctx, from, since) : { reached: true, files: from, ms: null };
  let since = Date.now();
  await chord(page, "Control+z");
  const undo = await landed(committedFiles, since);
  const undone = await settled(ctx);
  await shoot("undone");
  let [redo, redone] = [{ reached: false }, null];
  if (undo.reached) {
    await blurPreview(page);
    since = Date.now();
    await chord(page, "Control+Shift+z");
    redo = await landed(undo.files, since);
    redone = await settled(ctx);
  }
  // A late write must not land under the reload.
  await waitForFiles(ctx, { timeout: 15_000 });

  await page.reload();
  const reloaded = await openStudio(ctx);
  await shoot("reloaded");
  // From the saved file: the other keyframes keep their values, and no animated property gets plain CSS.
  const keysAfter = spec.keys && (await readKeyframes(ctx, spec.keys, true));
  const quads = Object.fromEntries(
    Object.entries({ pre, committed, undone, redone, reloaded }).filter(([, m]) => m),
  );
  const round = (m) => m.visible.map((p) => p.map((v) => Math.round(v * 100) / 100));
  return {
    zoom,
    saved,
    tracking: {
      max: Math.max(...drive.errors),
      p95: percentile(drive.errors, 95),
      frames: drive.errors.length,
    },
    pressJump: drive.pressJump,
    teleport: spec.gesture === "nudge" ? null : scoreTeleport(spec.gesture, frames[0] ?? []),
    drop: quadDistance(drive.lastQuad, committed.visible),
    // Also against the box the gesture left, so a write the file drops shows here and not only as drop.
    reload: Math.max(
      quadDistance(committed.visible, reloaded.visible),
      quadDistance(drive.lastQuad, reloaded.visible),
    ),
    undo: {
      bytes: saved && undo.reached && sameFiles(undo.files, original),
      box: quadDistance(undone.visible, pre.visible),
      redoBytes: saved && redo.reached && sameFiles(redo.files, committedFiles),
      redoBox: redone && quadDistance(redone.visible, committed.visible),
      ms: undo.ms ?? null,
      redoMs: redo.ms ?? null,
    },
    // From release (or the last nudge key) to the edit's file write.
    saveMs: save.at ? save.at - releasedAt : null,
    // A lost undo or redo write fails undo; a redo that was never sent is untested.
    undoTimeout: saved
      ? saveFault([
          ["undo", undo],
          ["redo", redo],
        ])
      : null,
    smooth: { ...drive.smooth, control },
    unsettled: Object.keys(quads).filter((k) => quads[k].unsettled),
    reloaded,
    ...(spec.keys && {
      keys: keyRule(
        keyframeDrift(keysBefore, keysAfter),
        openedGroups(original, readFiles(dir, files)),
      ),
      css: strayCss(original, readFiles(dir, files), spec.keys.css),
      keyRender: { time: spec.keys.render, visible: keysAfter[spec.keys.render].visible },
    }),
    diag: {
      ...drive.diag,
      consoleErrors: consoleErrors.slice(0, 5),
      quads: Object.fromEntries(Object.entries(quads).map(([k, m]) => [k, round(m)])),
    },
  };
}
