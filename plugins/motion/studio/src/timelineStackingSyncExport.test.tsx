// @vitest-environment happy-dom
// Mounts the timeline by package name with no Studio shell, as a host app does.
import { act } from "react";
import { expect, it, vi } from "vitest";
import { Timeline, usePlayerStore, type TimelineZIndexReorderCommit } from "@hyperframes/studio";
import { installReactActEnvironment, mountReactHarness } from "./hooks/domSelectionTestHarness";

installReactActEnvironment();
// happy-dom has no layout; the timeline only renders clips inside a sized viewport.
for (const [prop, px] of [
  ["clientWidth", 1000],
  ["clientHeight", 400],
  ["offsetWidth", 1000],
  ["offsetHeight", 400],
] as const) {
  vi.spyOn(HTMLElement.prototype, prop, "get").mockReturnValue(px);
}

const settle = () => act(async () => new Promise((r) => setTimeout(r, 50)));
const pointer = (type: string, clientY: number) =>
  new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX: 150, clientY });

it("restacks the host's preview when a lane move puts a clip below another", async () => {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  // Tag (top row) paints over title, matching the rows until the move.
  doc.body.innerHTML =
    '<div id="title" style="z-index: 2"></div><div id="tag" style="z-index: 3"></div><div id="note"></div>';
  const clip = (id: string, start: number, duration: number, track: number) =>
    ({ id, key: id, domId: id, tag: "div", start, duration, track }) as const;
  usePlayerStore.setState({
    duration: 10,
    timelineReady: true,
    elements: [clip("title", 0, 4, 1), clip("tag", 0, 4, 0), clip("note", 6, 2, 2)],
  });
  const commit = vi.fn<TimelineZIndexReorderCommit>(async (entries) => {
    for (const e of entries) e.element.style.zIndex = String(e.zIndex);
  });
  const root = mountReactHarness(
    <Timeline
      previewIframeRef={{ current: iframe }}
      onZIndexReorder={commit}
      onMoveElement={async () => {}}
      onMoveElements={async () => {}}
    />,
  );
  await settle();
  const tagClip = document.querySelector<HTMLElement>('.timeline-clip[aria-label^="tag,"]')!;
  vi.spyOn(tagClip, "getBoundingClientRect").mockReturnValue(new DOMRect(80, 77, 360, 42));

  // Drag tag from the top row to the bottom row, clear of note in time.
  act(() => void tagClip.dispatchEvent(pointer("pointerdown", 98)));
  act(() => {
    window.dispatchEvent(pointer("pointermove", 140));
    window.dispatchEvent(pointer("pointermove", 194));
  });
  await act(async () => void window.dispatchEvent(pointer("pointerup", 194)));
  await settle();

  expect(usePlayerStore.getState().elements.find((e) => e.id === "tag")?.track).toBe(2);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0]![0].every((e) => e.element.ownerDocument === doc)).toBe(true);
  const z = (id: string) => Number(doc.getElementById(id)!.style.zIndex || 0);
  expect(z("title")).toBeGreaterThan(z("tag"));
  await act(async () => root.unmount());
  usePlayerStore.setState({ elements: [], timelineReady: false });
});
