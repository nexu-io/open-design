// @vitest-environment happy-dom
// Imports the render queue the way a host app does: by package name, through the declared exports.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  RenderQueue,
  getPersistedRenderSettings,
  persistRenderSettings,
  useRenderQueue,
  type FfmpegStatus,
  type RenderJob,
} from "@hyperframes/studio";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("render queue package exports", () => {
  it("exposes the hook and settings helpers", () => {
    expect(typeof useRenderQueue).toBe("function");
    persistRenderSettings("webm", "high", 30);
    expect(getPersistedRenderSettings()).toMatchObject({
      format: "webm",
      quality: "high",
      fps: 30,
    });
  });

  it("mounts RenderQueue with a host-supplied job", async () => {
    const job: RenderJob = {
      id: "j1",
      status: "complete",
      progress: 100,
      filename: "host-render.mp4",
      createdAt: 0,
    };
    const ffmpeg: FfmpegStatus = { ok: true };
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(
        <RenderQueue
          jobs={[job]}
          projectId="p"
          onDelete={vi.fn()}
          onClearCompleted={vi.fn()}
          onStartRender={vi.fn()}
          isRendering={false}
          ffmpeg={ffmpeg}
          ffmpegChecking={false}
          onRecheckFfmpeg={vi.fn()}
        />,
      );
    });
    expect(el.textContent).toContain("host-render.mp4");
    await act(async () => root.unmount());
  });
});
