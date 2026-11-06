#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchStudioChrome } from "./chrome-executable.mjs";

const backend = new URL(process.env.STUDIO_URL ?? "http://127.0.0.1:5190");
assert.equal(backend.protocol, "http:", "The local regression proxy requires HTTP");
const studio = fileURLToPath(new URL("../../", import.meta.url));
const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures/ghost-lane");
const projects = [];
const held = new Map();
const proxy = createServer((incoming, response) => {
  const url = new URL(incoming.url ?? "/", backend);
  // Cache-only poster reads never enter the server's render queue.
  if (
    /\/api\/projects\/[^/]+\/thumbnail\//.test(url.pathname) &&
    url.searchParams.get("cached") !== "1"
  ) {
    held.set(response, incoming.url);
    response.once("close", () => held.delete(response));
    return;
  }
  forward(incoming, response, url.pathname + url.search);
});
function forward(incoming, response, path) {
  const outgoing = request(
    backend,
    {
      path,
      method: incoming.method,
      headers: incoming.headers,
    },
    (upstream) => {
      response.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(response);
    },
  );
  outgoing.on("error", () => {
    if (!response.destroyed) {
      response.writeHead(502);
      response.end("Upstream unavailable");
    }
  });
  response.once("close", () => {
    if (!response.writableEnded) outgoing.destroy();
  });
  incoming.pipe(outgoing);
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, message, bound = 15_000) {
  const deadline = Date.now() + bound;
  while (!predicate()) {
    assert(Date.now() < deadline, message);
    await pause(25);
  }
}
const heldFor = (project) =>
  [...held.values()].filter((path) => path.includes(`/projects/${project}/`)).length;
const clip =
  '[data-clip][data-el-id$="Product-walkthrough-final-approved-cut-with-alternate-opening-and-captions"]';
let browser;
try {
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const address = proxy.address();
  assert(address && typeof address !== "string");
  const proxyStatus = await new Promise((resolve, reject) => {
    const probe = request(
      {
        hostname: "127.0.0.1",
        port: address.port,
        path: "http://127.0.0.1:1/",
        signal: AbortSignal.timeout(5000),
      },
      (response) => {
        response.resume();
        response.once("error", reject);
        response.once("end", () => resolve(response.statusCode));
      },
    );
    probe.once("error", reject);
    probe.end();
  });
  assert.equal(proxyStatus, 200, "An absolute request target cannot replace the Studio backend");
  ({ browser } = await launchStudioChrome());
  let previous;
  let page;
  for (let index = 0; index < 3; index++) {
    const id = `thumbnail-lifetime-${process.pid}-${index}`;
    const dir = join(studio, "data/projects", id);
    mkdirSync(dir, { recursive: true });
    projects.push({ id, dir });
    for (const name of ["index.html", "hyperframes.json"])
      copyFileSync(join(fixture, name), join(dir, name));
    page = await browser.newPage();
    await page.bringToFront();
    if (previous) {
      await previous.waitForFunction(() => document.hidden, { timeout: 5000 });
      await previous.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
      const client = await previous.createCDPSession();
      // Background documents can freeze their timers while requests still hold sockets.
      await client.send("Page.setWebLifecycleState", { state: "frozen" });
    }
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:${address.port}/#project/${id}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForFunction(
      (selector) =>
        document.querySelector(selector)?.closest("[data-timeline-row]")?.dataset.timelineRow ===
        "1",
      { timeout: 30_000 },
      clip,
    );
    await waitFor(() => heldFor(id) >= 2, "Each project starts real held thumbnail requests");
    previous = page;
  }
  const box = await (await page.$(clip)).boundingBox();
  const view = await (await page.$("[data-timeline-scroll-viewport]")).boundingBox();
  const row = await (await page.$('[data-timeline-row="2"]')).boundingBox();
  assert(box && view && row);
  await page.mouse.move(box.x + Math.min(40, box.width / 2), box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(Math.min(view.x + view.width - 120, box.x + 60), row.y, { steps: 8 });
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-timeline-new-track-lane]")
        ?.getAttribute("data-timeline-new-track-lane") === "2",
    { timeout: 5000 },
  );
  const dropped = Date.now();
  await page.mouse.up();
  const saved = join(projects[2].dir, "index.html");
  await waitFor(() => {
    const tag = readFileSync(saved, "utf8").match(
      /<[^>]*\bid="Product-walkthrough-final-approved-cut-with-alternate-opening-and-captions"[^>]*>/,
    )?.[0];
    return /\bdata-track-index="2"/.test(tag ?? "");
  }, "Dropped clip persists within 15 seconds with old-project thumbnails in flight");
  assert.equal(heldFor(projects[0].id), 0, "First hidden document releases its thumbnail sockets");
  assert.equal(heldFor(projects[1].id), 0, "Second hidden document releases its thumbnail sockets");
  assert(
    heldFor(projects[2].id) >= 2,
    "Current document still has unfinished thumbnails at the save",
  );
  console.log(
    JSON.stringify({
      persistedMs: Date.now() - dropped,
      oldThumbnailRequests: 0,
      currentThumbnailRequests: heldFor(projects[2].id),
      saveBoundMs: 15_000,
    }),
  );
} finally {
  await browser?.close();
  proxy.closeAllConnections();
  await new Promise((resolve) => proxy.close(resolve));
  for (const { dir } of projects) rmSync(dir, { recursive: true, force: true });
}
