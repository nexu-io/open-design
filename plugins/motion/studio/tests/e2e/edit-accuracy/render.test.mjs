import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FIXTURE_CDN } from "./grid.mjs";
import { heldBrowser, holdProducerBrowser, renderBox } from "./render.mjs";

const require = createRequire(import.meta.url);
const gsapUrl = `${FIXTURE_CDN}npm/gsap@${require("gsap/package.json").version}/dist/gsap.min.js`;
// Chrome's Fetch urlPattern: the whole URL, `*` any run of characters, `?` one character.
const chromeUrlPattern = (pattern) =>
  new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")}$`,
  );
const sent = [];
const handlers = {};
const sessionArgs = [];
const onNewDocument = [];
const page = {
  evaluateOnNewDocument: async (fn) => void onNewDocument.push(fn),
  createCDPSession: async () => ({
    on: (event, handler) => (handlers[event] = handler),
    send: async (method, params) => void sent.push({ method, params }),
    detach: async () => undefined,
  }),
  evaluate: async () => null,
  close: async () => void (page.closed = true),
};
const closed = [];
const producer = { browser: { connected: true }, fail: false };

vi.mock("../../../../producer/src/index.js", () => ({
  createFileServer: async () => ({ url: "http://127.0.0.1:1", close() {} }),
  createCaptureSession: async (...args) => {
    sessionArgs.push(args);
    if (producer.fail) throw new Error("chrome did not launch");
    return { page, browser: producer.browser };
  },
  // Navigation: Chrome pauses the fixture's GSAP request here when it is intercepted.
  initializeSession: async () =>
    handlers["Fetch.requestPaused"]?.({ requestId: "1", request: { url: gsapUrl } }),
  captureFrameToBuffer: async () => ({ buffer: Buffer.alloc(0) }),
  closeCaptureSession: async (session) => void closed.push({ ...session }),
}));

const decoder = { evaluate: async () => ({ left: 0, right: 1, top: 0, bottom: 1, area: 1 }) };

async function render(html) {
  const dir = mkdtempSync(join(tmpdir(), "edit-bench-render-"));
  if (html) writeFileSync(join(dir, "index.html"), html);
  onNewDocument.length = 0;
  try {
    await renderBox(dir, decoder);
  } finally {
    rmSync(dir, { recursive: true });
  }
  return onNewDocument.map((fn) => fn.name);
}

describe("renderBox", () => {
  it("serves the fixture's GSAP from the repo and opens no second page that would fetch it", async () => {
    sent.length = 0;
    await render();
    expect(sent.map((s) => s.method)).toEqual([
      "Network.clearBrowserCache",
      "Fetch.enable",
      "Fetch.fulfillRequest",
    ]);
    const { patterns } = sent[1].params;
    expect(patterns).toEqual([{ urlPattern: patterns[0].urlPattern }]);
    expect(gsapUrl).toMatch(chromeUrlPattern(patterns[0].urlPattern));
    const gsap = readFileSync(require.resolve("gsap/dist/gsap.min.js")).toString("base64");
    expect(sent[2].params.body).toBe(gsap);
    expect(sessionArgs[0][4]).toMatchObject({ staticFrameDedup: false });
  });

  it("opts a project with no timeline out of the engine's timeline wait, and only such a project", async () => {
    expect(await render("<div data-composition-id='main'></div>")).toEqual(["markNoTimeline"]);
    expect(await render("<script>window.__timelines = {};</script>")).toEqual([]);
  });

  it("holds the producer browser with the renders' launch settings and no page of its own", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-bench-hold-"));
    sessionArgs.length = 0;
    closed.length = 0;
    page.closed = false;
    try {
      const release = await holdProducerBrowser(dir);
      expect(page.closed).toBe(true);
      await render();
      const [held, rendered] = sessionArgs;
      expect(held[2]).toEqual({ ...rendered[2], requiresWebGpu: false });
      expect(held[4]).toEqual(rendered[4]);
      await release();
      expect(closed.at(-1)).toMatchObject({ pageReleased: true });
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("drops a held browser that died or never launched and holds a new one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-bench-hold-"));
    const first = { connected: true };
    producer.browser = first;
    try {
      const release = await holdProducerBrowser(dir);
      expect(await heldBrowser()).toBe(first);
      // Its Chrome crashed: the dead hold is released and a new one taken.
      first.connected = false;
      const second = { connected: true };
      producer.browser = second;
      closed.length = 0;
      expect(await heldBrowser()).toBe(second);
      expect(closed).toHaveLength(1);
      // A launch that fails is not kept either: the next call tries again.
      second.connected = false;
      producer.fail = true;
      expect(await heldBrowser()).toBeNull();
      producer.fail = false;
      const third = { connected: true };
      producer.browser = third;
      expect(await heldBrowser()).toBe(third);
      await release();
    } finally {
      producer.fail = false;
      producer.browser = { connected: true };
      rmSync(dir, { recursive: true });
    }
  });
});
