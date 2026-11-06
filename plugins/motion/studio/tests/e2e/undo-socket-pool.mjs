#!/usr/bin/env node
// An undo must not wait for a socket while the preview's paused videos hold Chrome's six per host.
// STUDIO_URL=http://localhost:5317/#project/undo-socket-pool STUDIO_PROJECT_DIR=<that project> node <this file>
// Generates any missing fixture video with ffmpeg and deletes what it generated. Prints evidence JSON.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { launchStudioChrome } from "./chrome-executable.mjs";
import { installWebMcpHost } from "./webmcp-host.mjs";

const STUDIO_URL = process.env.STUDIO_URL;
const PROJECT_DIR = process.env.STUDIO_PROJECT_DIR;
const ROUNDS = Number(process.env.UNDO_ROUNDS || 3);
// Unpinned, the undo is sent in under 20 ms; behind pinned media it waited 780-961 ms.
const STALL_LIMIT_MS = Number(process.env.UNDO_STALL_LIMIT_MS || 250);
const VIDEOS = 8;

if (!STUDIO_URL || !PROJECT_DIR) {
  console.error("STUDIO_URL and STUDIO_PROJECT_DIR are required");
  process.exit(2);
}
mkdirSync(join(PROJECT_DIR, "assets"), { recursive: true });
// 480 MB in all: whatever this run generated, it deletes when it ends. A caller may supply the videos instead.
const generated = [];
process.on("exit", () => generated.forEach((file) => rmSync(file, { force: true })));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => process.exit(1));
for (let i = 1; i <= VIDEOS; i++) {
  const file = join(PROJECT_DIR, `assets/v${i}.mp4`);
  if (existsSync(file)) continue;
  generated.push(file);
  // 60 MB each (constant 8 Mb/s for 60 s): more than Chrome buffers for a paused element, so its request stays open.
  execFileSync("ffmpeg", [
    ...["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=10:duration=60"],
    ...["-vf", `hue=h=${i * 40}`, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast"],
    ...[
      "-b:v",
      "8M",
      "-minrate",
      "8M",
      "-maxrate",
      "8M",
      "-bufsize",
      "2M",
      "-x264-params",
      "nal-hrd=cbr",
    ],
    ...["-g", "10", file],
  ]);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const indexFile = join(PROJECT_DIR, "index.html");
const readIndex = () => readFileSync(indexFile, "utf8");
async function until(check, timeoutMs) {
  for (const deadline = Date.now() + timeoutMs; Date.now() < deadline; await sleep(50)) {
    if (await check()) return true;
  }
  return false;
}

const { browser } = await launchStudioChrome();
const failures = [];
const rounds = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.evaluateOnNewDocument(installWebMcpHost, "__undoPool");
  const call = (name, input) =>
    Promise.race([
      page.evaluate((n, i) => window.__undoPool.call(n, i), name, input),
      sleep(20_000).then(() => {
        const waiting = [...requests.values()].filter(
          (r) => !r.headers && !r.done && r.type !== "Media" && !pinUrls.has(r.url),
        );
        throw new Error(
          `${name} did not answer in 20 s; ${pinnedMedia()} media responses open, Studio requests with no ` +
            `answer: ${waiting.map((r) => `${r.method} ${new URL(r.url).pathname}`).join(", ")}`,
        );
      }),
    ]);

  const origin = new URL(STUDIO_URL).origin;
  const requests = new Map();
  const cdp = await page.createCDPSession();
  await cdp.send("Network.enable");
  await cdp.send("Page.enable");
  cdp.on("Network.requestWillBeSent", ({ requestId, request, type, frameId }) => {
    if (request.url.startsWith(origin))
      requests.set(requestId, { url: request.url, method: request.method, type, frameId });
  });
  // Chrome cancels a replaced preview frame's media without a loadingFailed event; those sockets are free again.
  const dropFrame = (frameId) => {
    for (const r of requests.values())
      if (r.frameId === frameId && r.type === "Media") r.done = true;
  };
  cdp.on("Page.frameDetached", ({ frameId }) => dropFrame(frameId));
  cdp.on("Page.frameNavigated", ({ frame }) => dropFrame(frame.id));
  cdp.on("Network.responseReceived", ({ requestId, response }) => {
    const entry = requests.get(requestId);
    if (entry) Object.assign(entry, { headers: true, timing: response.timing });
  });
  const finish = ({ requestId }) => {
    const entry = requests.get(requestId);
    if (entry) entry.done = true;
  };
  cdp.on("Network.loadingFinished", finish);
  cdp.on("Network.loadingFailed", finish);
  // A socket is held by a response whose body is still being read.
  // Chrome gives a host six sockets. Under the CLI the /api/events stream holds one, so five videos fill the rest;
  // Vite's dev server sends live updates over its HMR WebSocket instead of SSE, so there all six must be media.
  const pinnedNeeded = () =>
    [...requests.values()].some((r) => r.type === "EventSource" && !r.done) ? 5 : 6;
  const pinUrls = new Set();
  const pinnedMedia = () =>
    [...requests.values()].filter(
      (r) => (r.type === "Media" || pinUrls.has(r.url)) && r.headers && !r.done,
    ).length;

  await page.goto(STUDIO_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__undoPool?.has("studio_seek"), { timeout: 90_000 });
  await until(async () => (await call("studio_seek", { time: 1 }).catch(() => null))?.ok, 30_000);
  const look = await call("studio_look", { limit: 50 });
  const target = (look.elements ?? []).find((element) => element.label === "Target");
  if (!target)
    throw new Error(`studio_look found no #target: ${JSON.stringify(look).slice(0, 400)}`);
  // Chrome cancels a paused video's request about 15 s after its last use, so on a slow runner the videos stopped
  // pinning between rounds. An unread fetch per video, sent with cookies as the videos are, never idles out.
  const findVideos = async () => {
    for (const frame of page.frames()) {
      const srcs = await frame
        .$$eval("video", (videos) => videos.map((v) => v.currentSrc))
        .catch(() => []);
      // The marker keeps Studio's own fetches of the same file out of the count.
      srcs
        .filter(Boolean)
        .forEach((src) => pinUrls.add(`${src}${src.includes("?") ? "&" : "?"}pin`));
    }
    return pinUrls.size >= VIDEOS;
  };
  if (!(await until(findVideos, 10_000)))
    throw new Error(`found ${pinUrls.size} of the fixture's ${VIDEOS} videos`);
  await page.evaluate(
    (urls) => {
      window.__pins = urls.map((url) => fetch(url, { cache: "no-store" }));
    },
    [...pinUrls],
  );

  const colors = ["#ff0000", "#00ff00", "#0000ff", "#ff00ff", "#00ffff"];
  // What the preview paints for #target: an undo must show the edit taken back, not only write the file.
  const previewColor = async () => {
    for (const frame of page.frames()) {
      const color = await frame
        .$eval("#target", (el) => getComputedStyle(el).backgroundColor)
        .catch(() => null);
      if (color) return color;
    }
    return null;
  };
  for (let round = 0; round < ROUNDS; round++) {
    const before = readIndex();
    const shownBefore = await previewColor();
    await call("studio_set_style", {
      handle: target.handle,
      styles: { backgroundColor: colors[round % colors.length] },
    });
    if (!(await until(() => readIndex() !== before, 10_000)))
      throw new Error(`round ${round}: the edit never reached disk`);
    // Without pinned media the gate would pass on any build, so it refuses to measure.
    if (!(await until(() => pinnedMedia() >= pinnedNeeded(), 30_000))) {
      failures.push(
        `round ${round}: only ${pinnedMedia()} media responses held open; the fixture must pin ${pinnedNeeded()}`,
      );
      break;
    }
    const pinned = pinnedMedia();
    const seen = requests.size;
    await page.evaluate(() => {
      if (document.activeElement?.tagName === "IFRAME") document.activeElement.blur();
    });
    await page.keyboard.down("Control");
    await page.keyboard.press("z");
    await page.keyboard.up("Control");
    const step = () =>
      [...requests.values()]
        .slice(seen)
        .find((r) => r.method === "POST" && r.url.includes("/history/step"));
    await until(() => step()?.done, 15_000);
    const undo = step();
    const reverted = await until(() => readIndex() === before, 5_000);
    const repainted = await until(async () => (await previewColor()) === shownBefore, 3_000);
    const stallMs = undo?.timing ? Math.round(undo.timing.sendStart) : null;
    rounds.push({ round, pinned, stallMs, reverted, repainted });
    if (!reverted) failures.push(`round ${round}: the undo did not restore the file`);
    if (!repainted)
      failures.push(`round ${round}: the preview still showed the edit 3 s after the undo`);
    if (stallMs == null)
      failures.push(`round ${round}: the undo's POST history/step never answered`);
    else if (stallMs > STALL_LIMIT_MS)
      failures.push(
        `round ${round}: the undo waited ${stallMs} ms for a socket (limit ${STALL_LIMIT_MS} ms) with ${pinned} media responses open`,
      );
    await sleep(500);
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ stallLimitMs: STALL_LIMIT_MS, rounds, failures }, null, 2));
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
