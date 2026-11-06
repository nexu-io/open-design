// @vitest-environment happy-dom

// The render POST is the only place Studio says WHICH file to render. When it
// says nothing the server falls back to index.html, so a caller that forgets
// the field does not fail — it silently exports the wrong video (#3549). The
// default therefore lives in startRender, which every control routes through.

import { afterEach, describe, expect, it, vi } from "vitest";
import { startRenderAndReadBody, type MountedQueue } from "./renderQueueTestHarness";

vi.mock("../../telemetry/policy", () => ({ browserTelemetryAllowed: () => false }));
vi.mock("../../telemetry/config", () => ({ getAnonymousId: () => "unused" }));
vi.mock("../../telemetry/events", () => ({ trackStudioRenderStart: vi.fn() }));

const { useRenderQueue } = await import("./useRenderQueue");

let queue: MountedQueue | null = null;

/** Body of the render POST, started with `opts` while `activeCompPath` is open. */
async function renderBody(
  activeCompPath: string | null,
  opts?: Parameters<ReturnType<typeof useRenderQueue>["startRender"]>[0],
): Promise<Record<string, unknown>> {
  const started = await startRenderAndReadBody(useRenderQueue, { activeCompPath, opts });
  queue = started.queue;
  return started.body;
}

afterEach(() => {
  queue?.unmount();
  queue = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("render target composition", () => {
  it("renders the composition the user has selected when the caller names none", async () => {
    // The header's Export button: no options at all.
    const body = await renderBody("parts/part-1.html", undefined);
    expect(body["composition"]).toBe("parts/part-1.html");
  });

  it("keeps the caller's composition when one is named", async () => {
    // The sidebar's per-composition Render button renders a card the user is
    // not looking at, so its argument must win over the active composition.
    const body = await renderBody("parts/part-1.html", { composition: "parts/part-4.html" });
    expect(body["composition"]).toBe("parts/part-4.html");
  });

  it("omits the composition when nothing is selected", async () => {
    // Master view. The server's index.html fallback is the right answer here.
    const body = await renderBody(null, { format: "mp4" });
    expect(body["composition"]).toBeUndefined();
  });
});

describe("GPU encoding", () => {
  it("asks the server for GPU encoding when the export asks for it", async () => {
    const body = await renderBody(null, { format: "mp4", gpu: true });
    expect(body["gpu"]).toBe(true);
  });

  it("leaves GPU encoding off by default", async () => {
    const body = await renderBody(null, { format: "mp4" });
    expect(body["gpu"]).toBeUndefined();
  });
});

describe("GIF export transport", () => {
  it.each([0, 3, 65535])("forwards loop count %i and creates a GIF queue item", async (gifLoop) => {
    const body = await renderBody(null, { format: "gif", gifLoop });
    expect(body).toMatchObject({ format: "gif", gifLoop });
    expect(queue?.api().jobs).toEqual([expect.objectContaining({ filename: "j1.gif" })]);
  });

  it("omits GIF options for video exports", async () => {
    const body = await renderBody(null, { format: "mp4", gifLoop: 3 });
    expect(body).not.toHaveProperty("gifLoop");
  });
});
