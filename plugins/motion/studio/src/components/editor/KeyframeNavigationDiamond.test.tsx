// @vitest-environment happy-dom

import { act } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { installReactActEnvironment, mountReactHarness } from "../../hooks/domSelectionTestHarness";
import { KeyframeNavigation } from "./KeyframeNavigation";

beforeAll(installReactActEnvironment);

/**
 * Regression: a merged gutter row shows the keyframes of EVERY tween in the
 * property group. The panel guesses "the group's animation" for the write, so a
 * click on a keyframe authored by a sibling tween named the wrong animation and
 * the writer silently found nothing to remove. The diamond now reports the
 * clicked keyframe's own animationId.
 */
const MERGED_ROW = [
  { percentage: 0, tweenPercentage: 0, properties: { x: 0 }, animationId: "delta-to-500-position" },
  {
    percentage: 50,
    tweenPercentage: 25,
    properties: { x: 120 },
    animationId: "delta-to-4000-position",
  },
];

function clickDiamond(currentPercentage: number, onRemoveKeyframe: (...args: never[]) => void) {
  const root = mountReactHarness(
    <KeyframeNavigation
      property="x"
      keyframes={MERGED_ROW}
      currentPercentage={currentPercentage}
      onSeek={vi.fn()}
      onAddKeyframe={vi.fn()}
      onRemoveKeyframe={onRemoveKeyframe as never}
      onConvertToKeyframes={vi.fn()}
    />,
  );
  const diamond = document.querySelector<HTMLElement>('[title="Remove x keyframe"]');
  expect(diamond).not.toBeNull();
  act(() => {
    diamond?.click();
  });
  act(() => root.unmount());
}

describe("KeyframeNavigation diamond", () => {
  it("reports the clicked keyframe's own animation on a merged row", () => {
    const onRemoveKeyframe = vi.fn();
    clickDiamond(50, onRemoveKeyframe);
    expect(onRemoveKeyframe).toHaveBeenCalledWith(25, "delta-to-4000-position");
  });

  it("still reports the first tween's keyframe as its own", () => {
    const onRemoveKeyframe = vi.fn();
    clickDiamond(0, onRemoveKeyframe);
    expect(onRemoveKeyframe).toHaveBeenCalledWith(0, "delta-to-500-position");
  });
});
