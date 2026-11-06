// @vitest-environment happy-dom

// The render POST's catch used to discard its error, so a dead server, a DNS
// failure and a mid-render crash all produced one sentence. That string is also
// what travels into the feedback report, so three field reports — one of them a
// render that failed EVERY time — arrived with nothing to act on.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountRenderQueue } from "./renderQueueTestHarness";

vi.mock("./useFfmpegStatus", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useFfmpegStatus")>()),
  useFfmpegStatus: () => ({ status: { ok: true }, checking: false, recheck: vi.fn() }),
}));
vi.mock("../../telemetry/events", () => ({ trackStudioRenderStart: vi.fn() }));

const { useRenderQueue } = await import("./useRenderQueue");

let queue: ReturnType<typeof mountRenderQueue> | null = null;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
  );
});

afterEach(() => {
  queue?.unmount();
  queue = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("useRenderQueue transport failure", () => {
  it("names the cause instead of collapsing every failure into one sentence", async () => {
    queue = mountRenderQueue(useRenderQueue);
    const { act } = await import("react");
    await act(async () => {
      await queue?.api().startRender({});
    });

    const job = queue.api().jobs.at(-1);
    expect(job?.status).toBe("failed");
    expect(job?.error).toContain("Failed to fetch");
    // The CLI guidance still earns its place; it just no longer stands alone.
    expect(job?.error).toContain("hyperframes render");
  });
});
