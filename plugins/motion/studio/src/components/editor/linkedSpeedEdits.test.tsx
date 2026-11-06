// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createHappyDomRootHarness } from "../../player/components/testRootHarness";
import { usePlayerStore, type TimelineElement } from "../../player/store/playerStore";
import type { CommitDomAttributeBatch } from "../../hooks/domEditCommitTypes";
import type { DomEditSelection } from "./domEditingTypes";
import {
  fanOutAttributeInSource,
  linkedPartnerTargets,
  useLinkedSpeedCommit,
  withLinkedPlaybackRate,
  type LinkedSpeedCommit,
} from "./linkedSpeedEdits";
import { useVolumeAutomation } from "./useVolumeAutomation";
import { useLinkedClipPreferences } from "../../utils/linkedClipPreferences";

const clip = (id: string, tag: string, link?: string): TimelineElement => ({
  id,
  domId: id,
  tag,
  start: 0,
  duration: 4,
  track: 0,
  ...(link ? { link } : {}),
});

const elements = [
  clip("talk", "video", "lk-1"),
  clip("talk-audio", "audio", "lk-1"),
  clip("music", "audio"),
];

const source = `<div data-composition-id="main">
<video id="talk" data-start="0" data-duration="4" data-link="lk-1" muted></video>
<audio id="talk-audio" data-start="0" data-duration="4" data-link="lk-1" data-automation="{&quot;version&quot;:1,&quot;lanes&quot;:[]}"></audio>
<audio id="music" data-start="0" data-duration="4"></audio>
</div>`;

function selection(id: string, dataAttributes: Record<string, string> = {}): DomEditSelection {
  const element = document.createElement("video");
  element.id = id;
  return {
    id,
    element,
    label: id,
    tagName: "video",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    textContent: null,
    dataAttributes: { start: "0", duration: "4", ...dataAttributes },
    inlineStyles: {},
    computedStyles: {},
    textFields: [],
    capabilities: {
      canSelect: true,
      canEditStyles: true,
      canCrop: true,
      canMove: true,
      canResize: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    },
  };
}

describe("linkedPartnerTargets", () => {
  it("returns the other data-link members and nothing for an unlinked clip", () => {
    expect(linkedPartnerTargets({ id: "talk" }, elements)).toEqual([{ id: "talk-audio" }]);
    expect(linkedPartnerTargets({ id: "music" }, elements)).toEqual([]);
  });

  it("reaches no partner with Linked Selection off", () => {
    useLinkedClipPreferences.getState().setLinkedSelection(false);
    try {
      expect(linkedPartnerTargets({ id: "talk" }, elements)).toEqual([]);
    } finally {
      useLinkedClipPreferences.getState().setLinkedSelection(true);
    }
  });
});

describe("fanOutAttributeInSource", () => {
  it("writes each partner from its own current value", () => {
    const seen: Array<string | undefined> = [];
    const next = fanOutAttributeInSource(
      source,
      [{ id: "talk-audio" }],
      "data-automation",
      (raw) => {
        seen.push(raw);
        return "rate-lane";
      },
    );
    expect(seen).toEqual(['{"version":1,"lanes":[]}']);
    expect(next).toContain(
      'id="talk-audio" data-start="0" data-duration="4" data-link="lk-1" data-automation="rate-lane"',
    );
    expect(next).not.toContain('id="music" data-start="0" data-duration="4" data-automation');
  });
});

const harness = createHappyDomRootHarness();

function renderLinked(sel: DomEditSelection, commit: CommitDomAttributeBatch) {
  let linked: LinkedSpeedCommit | null = null;
  let rate: ReturnType<typeof useVolumeAutomation>["rate"] | null = null;
  function Probe() {
    linked = useLinkedSpeedCommit(sel, commit);
    rate = useVolumeAutomation(sel, 0, vi.fn(), linked).rate;
    return null;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => harness.mount(host).render(<Probe />));
  return { linked: () => linked, rate: () => rate };
}

describe("linked speed edits", () => {
  it("fans a playback-rate edit out to the partner in one batch commit", async () => {
    usePlayerStore.getState().setElements(elements);
    const commit = vi.fn<CommitDomAttributeBatch>(async () => true);
    const onSetAttribute = vi.fn();
    const probe = renderLinked(selection("talk"), commit);
    await withLinkedPlaybackRate(onSetAttribute, probe.linked())("playback-rate", "2");
    expect(onSetAttribute).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
    const [, ops, options] = commit.mock.calls[0] ?? [];
    expect(ops).toEqual([{ type: "attribute", property: "playback-rate", value: "2" }]);
    expect(options?.prepareContent?.(source)).toContain(
      'id="talk-audio" data-start="0" data-duration="4" data-link="lk-1" data-automation="{&quot;version&quot;:1,&quot;lanes&quot;:[]}" data-playback-rate="2"',
    );
  });

  it("fans a ramp preset out as one commit carrying each member's rate lane", () => {
    usePlayerStore.getState().setElements(elements);
    const commit = vi.fn<CommitDomAttributeBatch>(async () => true);
    const probe = renderLinked(selection("talk"), commit);
    act(() => probe.rate()?.onApplyPreset("ramp-in"));
    expect(commit).toHaveBeenCalledTimes(1);
    const [, ops, options] = commit.mock.calls[0] ?? [];
    expect(ops?.[0]?.property).toBe("automation");
    expect(String(ops?.[0]?.value)).toContain('"target":"rate"');
    const partner = /id="talk-audio"[^>]*data-automation="([^"]*)"/.exec(
      options?.prepareContent?.(source) ?? "",
    )?.[1];
    expect(partner).toContain("rate");
  });

  it("leaves an unlinked clip on its usual write path", async () => {
    usePlayerStore.getState().setElements(elements);
    const commit = vi.fn<CommitDomAttributeBatch>(async () => true);
    const onSetAttribute = vi.fn();
    const probe = renderLinked(selection("music"), commit);
    expect(probe.linked()).toBeNull();
    await withLinkedPlaybackRate(onSetAttribute, probe.linked())("playback-rate", "2");
    expect(onSetAttribute).toHaveBeenCalledWith("playback-rate", "2");
    expect(commit).not.toHaveBeenCalled();
  });
});
