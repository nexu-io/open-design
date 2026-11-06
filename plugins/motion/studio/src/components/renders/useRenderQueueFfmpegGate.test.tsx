// @vitest-environment happy-dom

// Studio has three render entry points: the Renders panel's Export button, the
// header's, and the Render control on every composition card in the left
// sidebar. The last two call startRender directly. A check that lives in one
// button leaves every other caller free to queue a render this machine cannot
// finish, so the refusal lives in startRender, which all of them route through
// — including any fourth caller nobody has written yet.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FfmpegStatus } from "./useFfmpegStatus";
import { mountRenderQueue, renderPosts, stubRenderFetch } from "./renderQueueTestHarness";

let ffmpegStatus: FfmpegStatus | null = { ok: true };

vi.mock("./useFfmpegStatus", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useFfmpegStatus")>()),
  useFfmpegStatus: () => ({ status: ffmpegStatus, checking: false, recheck: vi.fn() }),
}));
// Only the analytics call is stubbed. The identity and policy modules read
// localStorage, which happy-dom provides, so faking them would only be faking.
vi.mock("../../telemetry/events", () => ({ trackStudioRenderStart: vi.fn() }));

const { useRenderQueue } = await import("./useRenderQueue");

let queue: ReturnType<typeof mountRenderQueue> | null = null;
let fetchMock: ReturnType<typeof stubRenderFetch>;

beforeEach(() => {
  ffmpegStatus = { ok: true };
  fetchMock = stubRenderFetch();
});

afterEach(() => {
  queue?.unmount();
  queue = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function start(): Promise<ReturnType<typeof mountRenderQueue>> {
  queue = mountRenderQueue(useRenderQueue);
  const { act } = await import("react");
  await act(async () => {
    await queue?.api().startRender({});
  });
  return queue;
}

describe("useRenderQueue FFmpeg gate", () => {
  it("refuses to start a render, from any caller, when FFmpeg is missing", async () => {
    ffmpegStatus = { ok: false, title: "FFmpeg not found", command: "brew install ffmpeg" };

    const mounted = await start();

    expect(renderPosts(fetchMock)).toHaveLength(0);
    const job = mounted.api().jobs.at(-1);
    expect(job?.status).toBe("failed");
    // The point of refusing here rather than letting the server 503: the row
    // carries the fix, not a status code.
    expect(job?.error).toBe("FFmpeg not found. Install it with: brew install ffmpeg");
  });

  it("starts the render when FFmpeg is present", async () => {
    await start();

    expect(renderPosts(fetchMock)).toHaveLength(1);
  });

  it("starts the render when the probe gave no answer", async () => {
    // An unreachable or older dev server must not block a working setup.
    ffmpegStatus = null;

    const mounted = await start();

    expect(renderPosts(fetchMock)).toHaveLength(1);
    expect(mounted.api().ffmpegMissing).toBe(false);
  });
});
