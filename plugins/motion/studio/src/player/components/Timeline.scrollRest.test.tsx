// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { mountThreeTrackTimeline } from "./timelineMountFixtures";
import { installTimelineMountEnv } from "./timelineMountTestEnv";
import { isTimelineMoving } from "./timelineMotion";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

installTimelineMountEnv();

afterEach(() => {
  document.body.innerHTML = "";
});

it("keeps the timeline at rest through a scroll, as playback follow makes every frame", async () => {
  const { root, viewport } = await mountThreeTrackTimeline();
  act(() => viewport.dispatchEvent(new Event("scroll")));
  expect(isTimelineMoving()).toBe(false);
  act(() => root.unmount());
});
