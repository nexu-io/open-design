import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STILL_FRAMES,
  backgroundRequest,
  heldStill,
  measureShown,
  networkBusy,
  seekBound,
  swapPending,
  unsettledBy,
} from "./case.mjs";
import { heldSize } from "./sequences.mjs";

describe("settling on the shown preview", () => {
  const read = (pending, x = 0, frames = "a") => ({
    pending,
    frames,
    m: {
      visible: [
        [x, 0],
        [x + 1, 0],
        [x + 1, 1],
        [x, 1],
      ],
    },
  });

  it("keeps waiting while a shadow preview is loading, and restarts once it is promoted", () => {
    expect(unsettledBy(read(false), read(false))).toBe(false);
    expect(unsettledBy(read(false), read(true))).toBe(true);
    expect(unsettledBy(read(true), read(false))).toBe(true);
    expect(unsettledBy(read(false), read(false, 0.02))).toBe(true);
  });

  const frame = (url, shown, holds) => ({
    url: () => url,
    frameElement: async () => ({ evaluate: async () => shown }),
    $: async () => (holds ? {} : null),
  });
  const keys = { times: [0, 3] };
  const page = (...frames) => ({ frames: () => frames });
  const swapping = page(frame("/preview/a", true, true), frame("/preview/a?_t=1", false, true));

  it("calls a swap pending only for a hidden preview that holds the target", async () => {
    expect(await swapPending({ page: page(frame("/preview/a", true, true)), keys })).toBe(false);
    expect(await swapPending({ page: swapping, keys })).toBe(true);
    expect(await swapPending({ page: page(frame("/preview/a?_t=1", false, false)), keys })).toBe(
      false,
    );
    expect(await swapPending({ page: page(frame("/studio", false, true)), keys })).toBe(false);
  });

  it("calls a swap pending while Studio says the preview is changing, with no hidden preview yet", async () => {
    const changing = (on) => ({ frames: () => [], evaluate: async () => on });
    expect(await swapPending({ page: changing(true), keys })).toBe(true);
    expect(await swapPending({ page: changing(false), keys })).toBe(false);
    expect(await swapPending({ page: changing(true) }), "a case without keyframes").toBe(false);
  });

  it("never waits on a swap in a case without keyframes, so its undo keeps main's timing", async () => {
    expect(await swapPending({ page: swapping })).toBe(false);
    expect(await swapPending({ page: swapping, keys: undefined, selector: "#other" })).toBe(false);
  });
});

describe("settling on the page's network", () => {
  const read = (busy, activity) => ({
    pending: false,
    frames: "a",
    m: { visible: [[0, 0]] },
    net: { busy, activity },
  });

  it("restarts on a request in flight or any network activity since the window began", () => {
    expect(unsettledBy(read(false, 3), read(false, 3))).toBe(false);
    expect(unsettledBy(read(false, 3), read(true, 3))).toBe(true);
    expect(unsettledBy(read(false, 3), read(false, 4))).toBe(true);
  });

  it("holds after STILL_FRAMES quiet reads, or after the fixed window when one is set", () => {
    const since = Date.now();
    expect(heldStill(read(false, 0), STILL_FRAMES - 1, since, null)).toBe(false);
    expect(heldStill(read(false, 0), STILL_FRAMES, since, null)).toBe(true);
    expect(heldStill(read(true, 0), STILL_FRAMES, since, null)).toBe(false);
    expect(heldStill({ ...read(false, 0), pending: true }, STILL_FRAMES, since, null)).toBe(false);
    expect(heldStill(read(false, 0), 100, since, 500)).toBe(false);
    expect(heldStill(read(false, 0), 0, since - 500, 500)).toBe(true);
  });

  it("restarts a window that began busy once its request's frame is gone", () => {
    const request = { frame: () => ({ detached: false }) };
    const net = {
      inflight: new Set([request]),
      activity: 0,
      announced: new Map(),
      since: Date.now(),
    };
    const ctx = { dir: tmpdir(), files: [], net };
    const start = { ...read(false, 0), net: networkBusy(ctx) };
    expect(start.net.busy).toBe(true);
    request.frame = () => null;
    const now = { ...read(false, 0), net: networkBusy(ctx) };
    expect(now.net.busy).toBe(false);
    expect(unsettledBy(start, now)).toBe(true);
  });

  it("never waits on thumbnails, their blob images or background lint, which do not change the preview", () => {
    const request = (url, type = "fetch") => ({ url: () => url, resourceType: () => type });
    const api = "http://127.0.0.1:5910/api/projects/case";
    expect(backgroundRequest(request(`${api}/lint`))).toBe(true);
    expect(backgroundRequest(request(`${api}/thumbnail/index.html?t=3.00`))).toBe(true);
    expect(backgroundRequest(request(`${api}/events`, "eventsource"))).toBe(true);
    expect(backgroundRequest(request("blob:http://127.0.0.1:5910/7baf001f", "image"))).toBe(true);
    expect(backgroundRequest(request(`${api}/preview`, "document"))).toBe(false);
    expect(backgroundRequest(request(`${api}/files/index.html`))).toBe(false);
    expect(backgroundRequest(request(`${api}/lint-rules`))).toBe(false);
  });

  it("waits for requests in live frames and for the server to announce each written file", () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-bench-net-"));
    try {
      writeFileSync(join(dir, "index.html"), "");
      const since = Date.now() / 1000;
      utimesSync(join(dir, "index.html"), since - 10, since - 10);
      const request = (detached) => ({ frame: () => (detached === null ? null : { detached }) });
      const live = request(false);
      const net = {
        inflight: new Set([live, request(true), request(null)]),
        activity: 7,
        announced: new Map(),
        since: since * 1000,
      };
      const ctx = { dir, files: ["index.html"], net };
      expect(networkBusy(ctx)).toEqual({ busy: true, activity: 9 });
      expect([...net.inflight]).toEqual([live]);
      net.inflight.clear();
      expect(networkBusy(ctx).busy).toBe(false);
      utimesSync(join(dir, "index.html"), since + 5, since + 5);
      expect(networkBusy(ctx).busy).toBe(true);
      net.announced.set("index.html", since * 1000 + 6000);
      expect(networkBusy(ctx).busy).toBe(false);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe("seeking to the playhead after a reload", () => {
  it("seeks only once Studio reports the composition's duration, so the timeline bind cannot replay it", async () => {
    // Studio before its timeline bind: a seek still moves the playhead, but the duration reads 0.
    const calls = [];
    let looks = 0;
    const studio = {
      studio_look: () => ({ ok: true, duration: ++looks > 2 ? 4 : 0 }),
      studio_seek: ({ time }) => ({ ok: true, playhead: time, duration: looks > 2 ? 4 : 0 }),
    };
    globalThis.window = {
      __editBench: { call: (name, args) => (calls.push(name), studio[name](args)) },
    };
    const host = { evaluate: async () => true, boundingBox: async () => ({ width: 1, height: 1 }) };
    const preview = { url: () => "/preview", $: async () => ({}), frameElement: async () => host };
    const page = { evaluate: async (fn, ...args) => fn(...args), frames: () => [preview] };
    try {
      expect(await seekBound({ page, playhead: 2 })).toMatchObject({ playhead: 2, duration: 4 });
      expect(calls).toEqual(["studio_look", "studio_look", "studio_look", "studio_seek"]);
    } finally {
      delete globalThis.window;
    }
  });
});

describe("the size auto-record keys hold", () => {
  const keys = new Map([
    [3, { width: 440, height: 294 }],
    [2, { width: 380, height: 250 }],
  ]);

  it("holds the first key before it and the last after it, and leaves eased spans unscored", () => {
    expect(heldSize(keys, 1)).toEqual({ width: 380, height: 250 });
    expect(heldSize(keys, 3)).toEqual({ width: 440, height: 294 });
    expect(heldSize(keys, 5)).toEqual({ width: 440, height: 294 });
    expect(heldSize(keys, 2.5)).toBeUndefined();
    expect(heldSize(new Map(), 1)).toBeUndefined();
  });
});

describe("the box a press is measured against", () => {
  const quad = (x) => [
    [x, 0],
    [x + 1, 0],
    [x + 1, 1],
    [x, 1],
  ];
  const marker = (answers) => ({
    evaluate: async () => answers.shift() ?? false,
    dispose: async () => {},
  });
  const read = async () => ({ map: { toComp: (p) => p }, visible: quad(0) });
  const page = (markers) => ({ $: async () => markers.shift() ?? null });

  it("reads the waiting marker while a press waits for its replay, not the element under it", async () => {
    const shown = await measureShown({ page: page([marker([true])]) }, "move", read, async () =>
      quad(260),
    );
    expect(shown.m.visible[0][0]).toBe(260);
    expect(shown.actual[0][0]).toBe(0);
  });

  it("reads the element when nothing waits", async () => {
    const shown = await measureShown({ page: page([]) }, "move", read, async () => quad(260));
    expect(shown.m.visible[0][0]).toBe(0);
  });

  it("reads again when the replay took the marker away between the two reads", async () => {
    const shown = await measureShown({ page: page([marker([false])]) }, "move", read, async () =>
      quad(260),
    );
    expect(shown.m.visible[0][0]).toBe(0);
  });
});
