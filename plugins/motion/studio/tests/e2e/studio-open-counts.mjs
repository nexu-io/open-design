#!/usr/bin/env node
/**
 * Counts the work Studio does to open the studio-open fixture until the film
 * can play, then in the idle window after it. Prints evidence JSON whose
 * `workCounts` perf-ratchet.mjs checks against perf-ceilings.json.
 *
 * STUDIO_URL=http://127.0.0.1:5190/#project/studio-open \
 * STUDIO_PROJECT_DIR=packages/studio/data/projects/studio-open \
 *   node packages/studio/tests/e2e/studio-open-counts.mjs
 *
 * The project's .thumbnails directory is emptied first: every file in it at
 * the end is one thumbnail the server rendered during this journey. Totals are
 * read once thumbnail work has gone quiet; `idle.*` is the fixed window.
 */
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { resolveChromeExecutable } from "./chrome-executable.mjs";
import { diffCounts, startWorkCounters } from "./perf-counters.mjs";

const STUDIO_URL = process.env.STUDIO_URL;
const PROJECT_DIR = process.env.STUDIO_PROJECT_DIR;
const IDLE_MS = Number(process.env.STUDIO_IDLE_MS || 20_000);
const SCENE_COUNT = 12;

if (!STUDIO_URL || !PROJECT_DIR) {
  console.error("STUDIO_URL and STUDIO_PROJECT_DIR are required");
  process.exit(2);
}
const executablePath = resolveChromeExecutable();
if (!executablePath) {
  console.error("No Chrome executable found; set PUPPETEER_EXECUTABLE_PATH");
  process.exit(2);
}

// A scene file that never made it into the fixture still opens and still renders a thumbnail,
// so check the film is whole before measuring it.
const indexHtml = readFileSync(join(PROJECT_DIR, "index.html"), "utf8");
const scenes = [...indexHtml.matchAll(/data-composition-src="([^"]+)"/g)].map((match) => match[1]);
const missingScenes = scenes.filter((scene) => !existsSync(join(PROJECT_DIR, scene)));
if (scenes.length !== SCENE_COUNT || missingScenes.length > 0) {
  console.error(
    `The fixture must mount ${SCENE_COUNT} scenes that exist; index.html mounts ${scenes.length}` +
      (missingScenes.length > 0 ? `, missing: ${missingScenes.join(", ")}` : ""),
  );
  process.exit(2);
}

const thumbnailDir = join(PROJECT_DIR, ".thumbnails");
/** `compositions/scene-3.html t=2.50` from a thumbnail URL, for reading which renders ran. */
const thumbnailLabel = (url) => {
  const { pathname, searchParams } = new URL(url);
  return `${decodeURIComponent(pathname.split("/thumbnail/")[1])} t=${searchParams.get("t")}`;
};
rmSync(thumbnailDir, { recursive: true, force: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const counters = await startWorkCounters(browser, page);
  const thumbnailsInFlight = new Set();
  const thumbnailOutcomes = [];
  let lastThumbnailActivity = 0;
  const isThumbnail = (request) => request.url().includes("/thumbnail/");
  page.on("request", (request) => {
    if (!isThumbnail(request)) return;
    thumbnailsInFlight.add(request);
    lastThumbnailActivity = Date.now();
  });
  for (const done of ["requestfinished", "requestfailed"]) {
    page.on(done, (request) => {
      if (!thumbnailsInFlight.delete(request)) return;
      lastThumbnailActivity = Date.now();
      const outcome = request.response()?.status() ?? request.failure()?.errorText;
      thumbnailOutcomes.push(
        `${thumbnailLabel(request.url())} ${request.resourceType()} ${outcome}`,
      );
    });
  }
  const started = performance.now();
  await page.goto(STUDIO_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // Open is done when the film can play and the timeline shows every scene.
  await page.waitForFunction(
    (sceneCount) => {
      const play = document.querySelector('button[aria-label="Play"]');
      const timeline = document.querySelector("[data-timeline-element-count]");
      return (
        play instanceof HTMLButtonElement &&
        !play.disabled &&
        Number(timeline?.getAttribute("data-timeline-element-count")) >= sceneCount
      );
    },
    { timeout: 60_000, polling: 50 },
    SCENE_COUNT,
  );
  const wallMs = Math.round(performance.now() - started);
  const open = await counters.read();
  await new Promise((resolve) => setTimeout(resolve, IDLE_MS));
  const idle = diffCounts(await counters.read(), open);
  // Studio asks for thumbnails a few at a time and the server finishes aborted ones, so a
  // count at a fixed time follows runner speed. Count the whole set Studio asks for instead.
  // ponytail: quiet = no request and no new file for 10 s; a single render slower than that ends early.
  const renderedFiles = () =>
    existsSync(thumbnailDir)
      ? readdirSync(thumbnailDir).filter((name) => !name.endsWith(".tmp")).length
      : 0;
  const settleDeadline = Date.now() + 240_000;
  let thumbnailRenders = renderedFiles();
  for (;;) {
    const files = renderedFiles();
    if (files !== thumbnailRenders) {
      thumbnailRenders = files;
      lastThumbnailActivity = Date.now();
    }
    if (thumbnailsInFlight.size === 0 && Date.now() - lastThumbnailActivity >= 10_000) break;
    if (Date.now() > settleDeadline) {
      const urls = [...thumbnailsInFlight].map((request) => request.url());
      throw new Error(`thumbnails never settled; in flight: ${urls.join(", ") || "none"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (thumbnailOutcomes.length === 0 || thumbnailRenders === 0) {
    // Twelve clips on the timeline always ask for thumbnails; none means the journey is broken.
    throw new Error("Studio asked for or rendered no thumbnails; the journey measured nothing");
  }
  const total = await counters.read();

  // Whole-journey totals, because what lands just before or after "can play" varies run to run.
  const workCounts = { thumbnailRenders };
  for (const [key, value] of Object.entries(total)) workCounts[`total.${key}`] = value;
  for (const [key, value] of Object.entries(idle)) workCounts[`idle.${key}`] = value;
  console.log(
    JSON.stringify(
      {
        journey: "studio-open",
        browser: await browser.version(),
        idleMs: IDLE_MS,
        wallMs,
        workCounts,
        thumbnailRequests: thumbnailOutcomes.sort(),
        thumbnailFiles: existsSync(thumbnailDir) ? readdirSync(thumbnailDir).sort() : [],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
