// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { studioFrame, type FrameToolDeps, type StudioFrameResult } from "./frameTools";
import { expectFailure, expectOk } from "../webmcpTestUtils";

function frameDeps(overrides: Partial<FrameToolDeps> = {}): FrameToolDeps {
  return {
    getProjectId: () => "demo",
    getCompositionPath: () => "index.html",
    readPlayhead: () => ({ currentTime: 2.4, duration: 10, isPlaying: false }),
    requestSeek: () => undefined,
    probeFrame: async () => ({ ok: true, status: 200 }),
    wait: async () => undefined,
    ...overrides,
  };
}

describe("studioFrame", () => {
  it("returns a URL for the composition at the playhead", async () => {
    const result = await studioFrame(frameDeps());

    const ok = expectOk<StudioFrameResult>(result);
    expect(ok.time).toBe(2.4);
    expect(ok.compositionPath).toBe("index.html");
    expect(ok.url).toContain("/thumbnail/");
    expect(ok.url).toContain("t=2.400");
    expect(ok.url).toContain("format=png");
  });

  it("seeks first when given a time", async () => {
    const requestSeek = vi.fn();

    await studioFrame(frameDeps({ requestSeek }), { time: 5 });

    expect(requestSeek).toHaveBeenCalledWith(5);
  });

  it("captures where the playhead LANDED, not what was asked for", async () => {
    // The player clamps. Reporting the request would attach the wrong time to
    // the frame, and an agent judging motion would draw the wrong conclusion.
    const result = await studioFrame(
      frameDeps({ readPlayhead: () => ({ currentTime: 10, duration: 10, isPlaying: false }) }),
      { time: 999 },
    );

    const ok = expectOk<StudioFrameResult>(result);
    expect(ok.time).toBe(10);
    expect(ok.url).toContain("t=10.000");
  });

  it("waits before capturing, so a just-made edit is in the frame", async () => {
    // The render cache is cleared by a file watcher with a write-stability
    // threshold. Capturing faster than that renders the PRE-edit composition.
    const wait = vi.fn(async () => undefined);
    const order: string[] = [];

    await studioFrame(
      frameDeps({
        wait: async (ms) => {
          order.push(`wait:${ms}`);
          await wait();
        },
        probeFrame: async () => {
          order.push("probe");
          return { ok: true, status: 200 };
        },
      }),
    );

    expect(order).toEqual(["wait:150", "probe"]);
  });

  it("honours a caller-supplied settle time and reports it", async () => {
    const result = await studioFrame(frameDeps(), { settleMs: 800 });

    expect(expectOk<StudioFrameResult>(result).settledMs).toBe(800);
  });

  it("clamps an absurd settle time rather than hanging", async () => {
    const result = await studioFrame(frameDeps(), { settleMs: 10 * 60 * 1000 });

    expect(expectOk<StudioFrameResult>(result).settledMs).toBe(5000);
  });

  it("falls back to the default for a nonsense settle time", async () => {
    for (const settleMs of [-1, Number.NaN]) {
      const result = await studioFrame(frameDeps(), { settleMs });
      expect(expectOk<StudioFrameResult>(result).settledMs).toBe(150);
    }
  });

  it("skips the wait entirely when asked for zero", async () => {
    const wait = vi.fn(async () => undefined);

    await studioFrame(frameDeps({ wait }), { settleMs: 0 });

    expect(wait).not.toHaveBeenCalled();
  });

  it("reports a renderer failure instead of handing back a dead URL", async () => {
    const result = expectFailure(
      await studioFrame(frameDeps({ probeFrame: async () => ({ ok: false, status: 500 }) })),
    );

    expect(result.kind).toBe("failed");
    expect(result.reason).toContain("500");
    expect(result.hint).toBeDefined();
  });

  it("fails when no project is open, before touching the renderer", async () => {
    const probeFrame = vi.fn();

    const result = expectFailure(
      await studioFrame(frameDeps({ getProjectId: () => null, probeFrame })),
    );

    expect(result.kind).toBe("blocked");
    expect(probeFrame).not.toHaveBeenCalled();
  });

  it("rejects a negative or non-finite time without seeking", async () => {
    const requestSeek = vi.fn();

    for (const time of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = expectFailure(await studioFrame(frameDeps({ requestSeek }), { time }));
      expect(result.kind).toBe("invalid");
    }
    expect(requestSeek).not.toHaveBeenCalled();
  });

  it("captures the master composition when no path is active", async () => {
    const result = await studioFrame(frameDeps({ getCompositionPath: () => null }));

    expect(expectOk<StudioFrameResult>(result).compositionPath).toBe("index.html");
  });
});
