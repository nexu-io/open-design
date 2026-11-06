// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createHappyDomRootHarness } from "./testRootHarness";
import { ClipPeakMarks } from "./ClipPeakMarks";
import { TimelineClip } from "./TimelineClip";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

const harness = createHappyDomRootHarness();

async function render(url: string, bins: number[], gain: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ binSeconds: 1, bins })),
  );
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = harness.mount(host);
  const view = (volume: number) => (
    <TimelineClip
      el={{ id: "audio", tag: "audio", start: 0, duration: 2, track: 0 }}
      pps={16}
      clipY={0}
      isSelected={false}
      isHovered={false}
      hasCustomContent
      capabilities={{ canMove: true, canTrimStart: true, canTrimEnd: true }}
      isComposition={false}
      tabIndex={0}
      onHoverStart={() => {}}
      onHoverEnd={() => {}}
      onClick={() => {}}
      onDoubleClick={() => {}}
    >
      <ClipPeakMarks peaksUrl={url} sourceWindow={{ mediaStart: 0, sourceSpan: 2 }} gain={volume}>
        <span>wave</span>
      </ClipPeakMarks>
    </TimelineClip>
  );
  await act(async () => root.render(view(gain)));
  await act(async () => {});
  vi.unstubAllGlobals();
  return { host, setGain: async (value: number) => act(async () => root.render(view(value))) };
}

describe("ClipPeakMarks", () => {
  it("uses a plain warning and describes the focused clip with the numeric peak", async () => {
    const { host } = await render("/api/projects/p/peaks/loud.mp4", [0.2, 0.98], 1);
    expect(host.textContent).toContain("wave");
    expect(host.querySelector("[data-testid=clip-peak-marks]")?.textContent).toContain(
      "▲ Too loud",
    );
    expect(host.querySelector("[data-peak-text]")?.textContent).not.toContain("dBFS");
    const clip = host.querySelector("button")!;
    await act(async () => clip.focus());
    await vi.waitFor(() =>
      expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
        "Peaks −0.2 dBFS at this volume; export lowers the whole mix",
      ),
    );
    expect(clip.getAttribute("aria-describedby")).toBe(
      document.querySelector('[role="tooltip"]')?.id,
    );
    expect(host.querySelectorAll("button")).toHaveLength(1);
  });

  it("removes the focused warning when volume becomes quiet without replacing the clip", async () => {
    const { host, setGain } = await render("/api/projects/p/peaks/changing.mp4", [1, 1], 1);
    const clip = host.querySelector("button")!;
    await act(async () => clip.focus());
    await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]')).not.toBeNull());
    await setGain(0.25);
    await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]')).toBeNull());
    expect(clip.getAttribute("aria-describedby")).toBeNull();
    expect(document.activeElement).toBe(clip);
    expect(host.querySelector("button")).toBe(clip);
    expect(host.querySelector("[data-peak-badge]")).toBeNull();
  });

  it("paints nothing on a quiet clip", async () => {
    const { host } = await render("/api/projects/p/peaks/quiet.mp4", [0.25, 0.25], 1);
    expect(host.querySelector("[data-testid=clip-peak-marks]")).toBeNull();
  });
});
