import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Timeline } from "./Timeline";
import type { TimelineProps } from "./TimelineTypes";
import { usePlayerStore } from "../store/playerStore";
import { TIMELINE_ASSET_MIME } from "../../utils/timelineAssetDrop";

export async function mountThreeTrackTimeline(props: TimelineProps = {}) {
  usePlayerStore.setState({
    duration: 10,
    currentTime: 0,
    timelineReady: true,
    gsapAnimations: new Map(),
    selectedElementId: null,
    selectedElementIds: new Set(),
    elements: [0, 1, 2].map((track) => ({
      id: `c${track}`,
      key: `c${track}`,
      domId: `c${track}`,
      tag: "div",
      start: 0,
      duration: 2,
      track,
    })),
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Timeline {...props} />));
  const viewport = host.querySelector<HTMLElement>("[data-timeline-scroll-viewport]")!;
  const ghost = () => host.querySelector<HTMLElement>('[data-testid="timeline-ghost-lane"]');
  return { host, root, viewport, ghost };
}

export function dragTimelineFixtureAsset(target: EventTarget, type: string, clientY: number): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: 400 },
    clientY: { value: clientY },
    dataTransfer: {
      value: {
        types: [TIMELINE_ASSET_MIME],
        files: [],
        dropEffect: "none",
        getData: (mime: string) => (mime === TIMELINE_ASSET_MIME ? '{"path":"a.png"}' : ""),
      },
    },
  });
  act(() => void target.dispatchEvent(event));
}

export function pointerTimelineFixture(target: EventTarget, type: string, clientY: number): void {
  act(
    () =>
      void target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 0,
          pointerId: 1,
          clientX: 400,
          clientY,
        }),
      ),
  );
}
