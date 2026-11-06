// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { useAutomationLanes, type AutomationLaneBinding } from "./useAutomationLanes";
import type { TimelineElement } from "../store/playerStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Bind one element through the hook and hand back what the lane would get. */
function bindOnce(element: TimelineElement): AutomationLaneBinding {
  let captured: AutomationLaneBinding | null = null;
  function Probe() {
    captured = useAutomationLanes().bind(element, true);
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  act(() => {
    createRoot(host).render(<Probe />);
  });
  if (!captured) throw new Error("bind never ran");
  return captured;
}

const el = (over: Partial<TimelineElement> = {}): TimelineElement => ({
  id: "music",
  key: "music",
  tag: "audio",
  start: 0,
  duration: 12,
  track: 10,
  ...over,
});

const CHAIN = JSON.stringify({
  version: 1,
  nodes: [{ type: "lowpass", id: "n2", params: { frequency: 400, q: 0.9, poles: "2" } }],
});

describe("useAutomationLanes", () => {
  it("drops a lane whose effect is no longer in the chain", () => {
    // n1 was deleted from the chain but its lane survived in the attribute.
    // Drawn as-is it landed on the volume axis, with points off the lane and
    // a selector that had no option for it.
    const automation = JSON.stringify({
      version: 1,
      lanes: [
        {
          target: "fx.n1.speed",
          points: [
            { t: 0, v: 0.4 },
            { t: 12, v: 6 },
          ],
        },
        { target: "volume", points: [{ t: 0, v: 0.55 }] },
      ],
    });
    const bound = bindOnce(el({ automation, fxChain: CHAIN }));
    expect(bound.automation.lanes.map((l) => l.target)).toEqual(["volume"]);
  });

  it("keeps a lane whose effect is still there", () => {
    const automation = JSON.stringify({
      version: 1,
      lanes: [
        {
          target: "fx.n2.frequency",
          points: [
            { t: 0, v: 400 },
            { t: 4, v: 8000 },
          ],
        },
      ],
    });
    const bound = bindOnce(el({ automation, fxChain: CHAIN }));
    expect(bound.lanes.map((l) => l.target)).toEqual(["fx.n2.frequency"]);
  });

  it("gives one lane per automated parameter, in draw order", () => {
    // Draw order is the spectrum: a lane belonging to an effect that sits at a
    // frequency is placed by that frequency, high first, and lanes with none —
    // the track's own volume — follow in written order.
    const automation = JSON.stringify({
      version: 1,
      lanes: [
        { target: "volume", points: [{ t: 0, v: 0.5 }] },
        { target: "fx.n2.frequency", points: [{ t: 0, v: 400 }] },
        { target: "fx.n2.q", points: [{ t: 0, v: 1 }] },
      ],
    });
    const bound = bindOnce(el({ automation, fxChain: CHAIN }));
    expect(bound.lanes.map((l) => l.target)).toEqual(["fx.n2.frequency", "fx.n2.q", "volume"]);
  });

  it("reads an element with neither attribute as an empty volume lane", () => {
    const bound = bindOnce(el());
    expect(bound.lanes).toEqual([]);
    expect(bound.chain).toBeNull();
  });

  it("is read-only without an edit session, whatever the selection", () => {
    // No DomEditProvider in this tree — the bare player case.
    expect(bindOnce(el({ automation: undefined })).readOnly).toBe(true);
  });

  it("survives an unreadable attribute instead of breaking the row", () => {
    const bound = bindOnce(el({ automation: "{not json", fxChain: "{also not}" }));
    expect(bound.automation.lanes).toEqual([]);
    expect(bound.chain).toBeNull();
  });
});
