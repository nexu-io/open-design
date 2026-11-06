// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineGroupRow } from "./TimelineGroupRow";
import { TimelineEditProvider } from "../../contexts/TimelineEditContext";
import { defaultTimelineTheme } from "./timelineTheme";
import type { TimelineTrackGroupInfo } from "./useTimelineTrackDerivations";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../telemetry/canary", () => ({ isCanaryEnabled: () => true }));
const domEditMocks = vi.hoisted(() => ({
  handleTimelineElementSelect: vi.fn(async () => undefined),
}));
vi.mock("../../contexts/DomEditContext", () => ({
  useDomEditSelectionContextOptional: () => null,
  useDomEditActionsContextOptional: () => domEditMocks,
}));

afterEach(() => {
  document.body.innerHTML = "";
  domEditMocks.handleTimelineElementSelect.mockClear();
  usePlayerStore.setState({ revealedAudioFxTarget: null });
});

const member = (id: string, track: number): TimelineElement => ({
  id,
  domId: id,
  tag: "audio",
  start: 0,
  duration: 5,
  track,
  audioGroup: "voiceover",
});

const GROUP: TimelineTrackGroupInfo = {
  id: "voiceover",
  label: "Voiceover",
  anchorKey: -0.5,
  memberTracks: [0, 1],
  memberElements: [member("vo-1", 0), member("vo-2", 1)],
  volume: 1,
  hidden: false,
};

const GAIN_AUTOMATED: Partial<TimelineTrackGroupInfo> = {
  fxChain: JSON.stringify({
    version: 1,
    nodes: [{ type: "peaking", id: "p1", params: { frequency: 1000, gain: -3, q: 1 } }],
  }),
  automation: JSON.stringify({
    version: 1,
    lanes: [{ target: "fx.p1.gain", points: [{ t: 0, v: 0 }] }],
  }),
};

function renderRow(
  overrides: Partial<TimelineTrackGroupInfo> = {},
  expandedLaneOwnerIds = new Set<string>(),
  showAudioEffects?: boolean,
) {
  const onSetAudioGroupAttributeQuiet = vi.fn();
  const onSetElementAttributeQuiet = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  act(() =>
    createRoot(host).render(
      <TimelineEditProvider value={{ onSetAudioGroupAttributeQuiet, onSetElementAttributeQuiet }}>
        <TimelineGroupRow
          index={0}
          rowKey={0}
          group={{ ...GROUP, ...overrides }}
          logicalRow={{ id: "g", level: 1, kind: "track" } as never}
          top={0}
          height={48}
          virtualized={false}
          contentOrigin={232}
          theme={defaultTimelineTheme}
          showAudioEffects={showAudioEffects}
          collapsedGroupIds={new Set()}
          expandedLaneOwnerIds={expandedLaneOwnerIds}
          toggleGroupExpanded={vi.fn()}
          toggleLaneOwnerExpanded={vi.fn()}
          lanes={
            {
              bind: (element: TimelineElement) => {
                const automation = element.automation
                  ? JSON.parse(element.automation)
                  : { version: 1, lanes: [] };
                return {
                  automation,
                  lanes: automation.lanes,
                  chain: element.fxChain ? JSON.parse(element.fxChain) : null,
                  onPreview: vi.fn(),
                  onCommit: vi.fn(),
                  onSelect: vi.fn(),
                  readOnly: true,
                  selection: null,
                  onRangeSelect: vi.fn(),
                  onRangeClear: vi.fn(),
                };
              },
            } as never
          }
          pps={10}
          currentTime={0}
          compositionDuration={60}
          contentGutter={0}
          trackContentWidth={800}
        />
      </TimelineEditProvider>,
    ),
  );
  return { host, onSetAudioGroupAttributeQuiet, onSetElementAttributeQuiet };
}

describe("TimelineGroupRow", () => {
  it("routes the group title through the guarded selection path", () => {
    const { host } = renderRow();
    const title = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Open Voiceover effects"]',
    );

    act(() => title?.click());

    expect(domEditMocks.handleTimelineElementSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "voiceover", domId: "voiceover" }),
    );
  });

  it("opens a group automation lane on its exact rack parameter", async () => {
    const { host } = renderRow(GAIN_AUTOMATED, new Set(["voiceover"]));
    const laneTitle = host.querySelector<HTMLButtonElement>('[data-group-lane-label="fx.p1.gain"]');

    await act(async () => {
      laneTitle?.click();
      await Promise.resolve();
    });

    expect(domEditMocks.handleTimelineElementSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "voiceover", domId: "voiceover" }),
    );
    expect(usePlayerStore.getState().revealedAudioFxTarget).toMatchObject({
      elementKey: "voiceover",
      automationTarget: "fx.p1.gain",
    });
  });

  it("keeps a group lane's name off the rack while audio effects are hidden", () => {
    const { host } = renderRow(GAIN_AUTOMATED, new Set(["voiceover"]), false);
    const laneTitle = host.querySelector<HTMLButtonElement>('[data-group-lane-label="fx.p1.gain"]');

    expect(laneTitle?.disabled).toBe(true);
    expect(laneTitle?.getAttribute("aria-label")).toBeNull();
  });

  // C1 names this as the step's own definition of done: "opening the popover on
  // a GROUP and applying a preset results in exactly ONE `data-fx-chain` write,
  // on the group element, and zero writes on members". A group IS a bus — a
  // write that fanned out to the members would be batch-apply wearing a bus's
  // clothes, which is the one thing §1 rules out.
  it("applies a preset to the group element only, never to its members", () => {
    const { host, onSetAudioGroupAttributeQuiet, onSetElementAttributeQuiet } = renderRow();
    const fx = Array.from(host.querySelectorAll("button")).find((b) =>
      b.getAttribute("aria-label")?.startsWith("Effects"),
    );
    act(() => fx?.click());
    const preset = document.querySelector<HTMLButtonElement>(".hf-fx-preset-item");
    act(() => preset?.click());

    expect(onSetAudioGroupAttributeQuiet).toHaveBeenCalledTimes(1);
    const [groupId, attr] = onSetAudioGroupAttributeQuiet.mock.calls[0] ?? [];
    expect(groupId).toBe("voiceover");
    expect(attr).toBe("data-fx-chain");
    // The members are the point: not one write reaches them.
    expect(onSetElementAttributeQuiet).not.toHaveBeenCalled();
  });

  // A disclosure over nothing tells the author their group has no automation
  // only AFTER they open an empty row. Track headers already gate their own
  // toggle on having something to disclose; the group's did not.
  it("hides the lane toggle until the group actually automates something", () => {
    const laneToggle = (host: HTMLElement) =>
      Array.from(host.querySelectorAll("button")).find((b) =>
        /lanes$/.test(b.getAttribute("aria-label") ?? ""),
      );

    expect(laneToggle(renderRow().host)).toBeUndefined();

    const automated = renderRow(GAIN_AUTOMATED);
    expect(laneToggle(automated.host)).toBeDefined();
  });

  // Same shape as a track header: caret and name on the left, every control in
  // one right-anchored group. It was two lines — name, then controls — which is
  // what let a stray child overflow the 48px box on the track side.
  it("keeps the caret, the name and every control on one line", () => {
    const { host } = renderRow(GAIN_AUTOMATED);
    const header = host.querySelector<HTMLElement>('[role="rowheader"]');
    // Caret, name, control group — no second line.
    expect(header?.children).toHaveLength(3);
    const controls = header?.lastElementChild as HTMLElement | null;
    expect(controls?.className).toContain("ml-auto");
    // Both controls live in that group, so they share the right edge.
    expect(controls?.querySelectorAll("button")).toHaveLength(2);
    // The member count rides with the name, not out with the controls.
    expect(controls?.querySelector('[title="2 tracks"]')).toBeNull();
    act(() => undefined);
  });
});
