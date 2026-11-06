#!/usr/bin/env node
// The A-roll must show in Studio's preview while playing: the untimed #plate backdrop above it is
// one the film's own script keeps hidden outside 6-8 s, and the preview must not force it visible.
import { writeFileSync } from "node:fs";
import { launchStudioChrome } from "./chrome-executable.mjs";

const STUDIO_URL = process.env.STUDIO_URL;
const OUT_DIR = process.env.OUT_DIR;
const PLATE_START_S = 6;
const PLATE_END_S = 8;

if (!STUDIO_URL) {
  console.error("STUDIO_URL is required and must point at the aroll-backdrop fixture");
  process.exit(2);
}
const { browser } = await launchStudioChrome();
const failures = [];
const evidence = {};
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(STUDIO_URL, { waitUntil: "domcontentloaded" });
  // Ready when Play is enabled and the preview's A-roll has a frame to paint.
  await page.waitForSelector('button[aria-label="Play"]:not([disabled])', { timeout: 60_000 });
  const iframe = await page.waitForFunction(
    () => document.querySelector("hyperframes-player")?.shadowRoot?.querySelector("iframe"),
    { timeout: 60_000 },
  );
  await page.waitForFunction(
    (frame) => frame.contentDocument.getElementById("aroll")?.readyState >= 2,
    { timeout: 60_000, polling: 50 },
    iframe,
  );

  // Playhead, the element on top at the frame's centre, and the plate's own state, in the preview.
  const readPreview = () =>
    page.evaluate(() => {
      const frame = document.querySelector("hyperframes-player").shadowRoot.querySelector("iframe");
      const doc = frame.contentDocument;
      const player = frame.contentWindow.__player;
      const film = doc.getElementById("film").getBoundingClientRect();
      const plate = doc.getElementById("plate");
      const video = doc.getElementById("aroll");
      const box = frame.getBoundingClientRect();
      return {
        box: [box.x, box.y, box.width, box.height].map(Math.round).join(","),
        time: player.getTime(),
        playing: player.isPlaying(),
        topId: doc.elementFromPoint(film.x + film.width / 2, film.y + film.height * 0.45)?.id,
        plateVisibility: plate.style.visibility,
        plateStamped: plate.getAttribute("data-hf-autostamped"),
        videoReady: video.readyState >= 2 && !video.seeking,
      };
    });
  // Mean chroma (max-min channel) and luma of the frame's centre: the A-roll is colour bars, the plate
  // near black. Studio can re-fit the preview just after a pause, so a shot across that reflow is retaken.
  const shoot = async (name) => {
    let before;
    let png;
    let after;
    let attempts = 0;
    do {
      attempts++;
      before = await readPreview();
      png = await iframe.screenshot({ encoding: "base64" });
      after = await readPreview();
    } while (before.box !== after.box && attempts < 5);
    if (OUT_DIR) writeFileSync(`${OUT_DIR}/${name}.png`, Buffer.from(png, "base64"));
    const pixels = await page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const x = Math.round(img.width * 0.3);
      const y = Math.round(img.height * 0.35);
      const { data: rgba } = ctx.getImageData(
        x,
        y,
        Math.round(img.width * 0.4),
        Math.round(img.height * 0.25),
      );
      let chroma = 0;
      let luma = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]];
        chroma += Math.max(r, g, b) - Math.min(r, g, b);
        luma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      const n = rgba.length / 4;
      return { chroma: Math.round(chroma / n), luma: Math.round(luma / n) };
    }, png);
    evidence[name] = { attempts, before, after, pixels };
    return { before, after, pixels };
  };
  const expectAroll = (name, shot) => {
    if (shot.pixels.chroma < 100 || shot.after.topId !== "aroll")
      failures.push(
        `${name}: A-roll hidden (chroma ${shot.pixels.chroma}, on top "${shot.after.topId}", plate ${shot.after.plateVisibility})`,
      );
  };
  const outsidePlate = (t) => t < PLATE_START_S || t >= PLATE_END_S;
  const playheadIn = (from, to) =>
    page.waitForFunction(
      (lo, hi) => {
        const frame = document
          .querySelector("hyperframes-player")
          .shadowRoot.querySelector("iframe");
        const player = frame.contentWindow.__player;
        const t = player.getTime();
        return player.isPlaying() && t >= lo && t < hi;
      },
      { timeout: 30_000, polling: "raf" },
      from,
      to,
    );

  evidence.step = "paused at the start";
  const start = await shoot("paused-start");
  // The fixture guards a preview-stamped backdrop; unstamped, it no longer tests that shape.
  if (start.after.plateStamped !== "1")
    failures.push(
      `paused-start: #plate is not stamped (data-hf-autostamped=${start.after.plateStamped})`,
    );
  expectAroll("paused-start", start);

  evidence.step = "playing before the plate";
  await page.click('button[aria-label="Play"]');
  await playheadIn(1, PLATE_START_S - 1);
  const playing = await shoot("playing");
  if (!playing.after.playing || playing.after.time >= PLATE_START_S)
    failures.push(
      `playing: sampled at ${playing.after.time.toFixed(2)} s, not playing outside the plate`,
    );
  expectAroll("playing", playing);

  // Without this the test would pass on a plate that never shows.
  evidence.step = "playing inside the plate's window";
  await playheadIn(PLATE_START_S + 0.1, PLATE_END_S - 0.5);
  const plate = await shoot("playing-plate");
  if (outsidePlate(plate.before.time) || outsidePlate(plate.after.time))
    failures.push(`playing-plate: sample left the plate window (${plate.after.time.toFixed(2)} s)`);
  if (plate.pixels.luma > 30 || plate.after.topId !== "plate")
    failures.push(
      `playing-plate: plate not shown (luma ${plate.pixels.luma}, on top "${plate.after.topId}")`,
    );

  evidence.step = "paused after the plate";
  await playheadIn(PLATE_END_S + 0.2, 10);
  await page.click('button[aria-label="Pause"]');
  await page.waitForFunction(
    () => {
      const frame = document.querySelector("hyperframes-player").shadowRoot.querySelector("iframe");
      const video = frame.contentDocument.getElementById("aroll");
      return !frame.contentWindow.__player.isPlaying() && video.readyState >= 2 && !video.seeking;
    },
    { timeout: 10_000, polling: "raf" },
  );
  expectAroll("paused", await shoot("paused"));
  evidence.step = "done";
} catch (error) {
  failures.push(`walk stopped at "${evidence.step}": ${error.message}`);
  if (OUT_DIR) await (await browser.pages()).at(-1)?.screenshot({ path: `${OUT_DIR}/failed.png` });
} finally {
  await browser.close();
}
console.log(JSON.stringify({ evidence, failures }, null, 2));
if (failures.length > 0) process.exit(1);
