// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Timeline } from "./Timeline";
import { installTimelineMountEnv } from "./timelineMountTestEnv";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

installTimelineMountEnv();

afterEach(() => {
  document.body.innerHTML = "";
});

const voice: TimelineElement = {
  id: "vo",
  domId: "vo",
  tag: "audio",
  start: 0,
  duration: 4,
  track: 0,
};
const grouped: TimelineElement[] = ["vo-1", "vo-2"].map((id, track) => ({
  id,
  domId: id,
  tag: "audio",
  start: 0,
  duration: 4,
  track,
  audioGroup: "voiceover",
  audioGroupLabel: "Voiceover",
}));

async function mount(elements: TimelineElement[], showAudioEffects?: boolean) {
  usePlayerStore.setState({ duration: 10, currentTime: 0, timelineReady: true, elements });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Timeline showAudioEffects={showAudioEffects} />));
  const labels = Array.from(host.querySelectorAll("button")).map(
    (b) => b.getAttribute("aria-label") ?? "",
  );
  act(() => root.unmount());
  return labels;
}

const effects = (labels: string[]) => labels.filter((l) => l.startsWith("Effects"));

describe("Timeline showAudioEffects", () => {
  it("shows the effects button on an audio track by default", async () => {
    expect(effects(await mount([voice]))).toHaveLength(1);
  });

  it("hides the effects button on an audio track when the host turns effects off", async () => {
    expect(effects(await mount([voice], false))).toEqual([]);
  });

  it("hides the group-these-clips effects button on a track of several clips", async () => {
    const clips: TimelineElement[] = [
      { ...voice, id: "sfx-1", domId: "sfx-1" },
      { ...voice, id: "sfx-2", domId: "sfx-2", start: 5 },
    ];
    expect(effects(await mount(clips))).toHaveLength(1);
    expect(effects(await mount(clips, false))).toEqual([]);
  });

  it("hides a group's effects button and its open-effects name when effects are off", async () => {
    const on = await mount(grouped);
    expect(effects(on).length).toBeGreaterThan(0);
    expect(on).toContain("Open Voiceover effects");

    const off = await mount(grouped, false);
    expect(effects(off)).toEqual([]);
    expect(off).not.toContain("Open Voiceover effects");
    expect(off).toContain("Select Voiceover");
  });
});
