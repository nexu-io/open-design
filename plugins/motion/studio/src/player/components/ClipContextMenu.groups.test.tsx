// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createHappyDomRootHarness } from "./testRootHarness";
import { ClipContextMenu } from "./ClipContextMenu";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { TimelineEditProvider } from "../../contexts/TimelineEditContext";

const iframe = document.createElement("iframe");
vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContextOptional: () => ({
    projectId: "p1",
    showToast: vi.fn(),
    previewIframeRef: { current: iframe },
  }),
}));

const harness = createHappyDomRootHarness();

const talk: TimelineElement = {
  id: "talk",
  domId: "talk",
  tag: "video",
  src: "talk.mp4",
  start: 0,
  duration: 6,
  track: 0,
  hasAudio: true,
  link: "lk-1",
};
const talkAudio: TimelineElement = {
  ...talk,
  id: "talk-a",
  domId: "talk-a",
  tag: "audio",
  track: 1,
};

function renderMenu(element: TimelineElement) {
  usePlayerStore.getState().setElements([talk, talkAudio]);
  document.body.appendChild(iframe);
  const node = iframe.contentDocument?.createElement("video");
  if (node) {
    node.id = "talk";
    node.setAttribute("data-has-audio", "true");
    iframe.contentDocument?.body.appendChild(node);
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const noop = vi.fn();
  act(() =>
    harness.mount(host).render(
      <TimelineEditProvider
        value={{
          onSetElementAttributeQuiet: vi.fn(async () => undefined),
          onFreezeFrame: noop,
          onLinkEdit: noop,
          onDeleteElementOnly: noop,
        }}
      >
        <ClipContextMenu
          x={10}
          y={10}
          element={element}
          currentTime={2}
          onClose={noop}
          onSplit={noop}
          onDelete={noop}
        />
      </TimelineEditProvider>,
    ),
  );
}

function menuLabels(): string[] {
  return Array.from(document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')).map(
    (item) => item.querySelector("span")?.textContent ?? "",
  );
}

describe("ClipContextMenu order", () => {
  it("groups time, sound, picture, then delete for a linked video with sound", () => {
    renderMenu(talk);
    const expected = [
      "Split at 2.00s",
      "Freeze frame",
      "Audio Gain…",
      "Voice",
      "Detach audio",
      "Unlink from audio",
      "Look",
      "Crop",
      "Delete",
      "Delete this clip only",
    ];
    expect(menuLabels().filter((label) => expected.includes(label))).toEqual(expected);
    const groups = Array.from(document.querySelectorAll('[role="group"]')).map((group) =>
      group.getAttribute("aria-label"),
    );
    expect(groups).toEqual(["Time", "Sound", "Picture", "Clipboard", "Delete"]);
  });
});
