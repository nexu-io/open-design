// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore, type TimelineElement } from "../player";
import { dispatchLinkShortcut } from "./linkShortcuts";
import { setStudioKeys } from "../player/components/studioShortcuts";

const clip = (id: string, tag: string, extra: Partial<TimelineElement> = {}): TimelineElement => ({
  id,
  tag,
  src: "talk.mp4",
  start: 0,
  duration: 4,
  track: 0,
  ...extra,
});

function key(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
  vi.spyOn(event, "preventDefault");
  return event;
}

function select(elements: TimelineElement[], id: string) {
  usePlayerStore.getState().setElements(elements);
  usePlayerStore.getState().setSelection([id], id);
}

describe("dispatchLinkShortcut", () => {
  afterEach(() => vi.restoreAllMocks());

  it("⌘L unlinks the selected linked clip", () => {
    const video = clip("talk", "video", { muted: true, link: "lk-1" });
    const audio = clip("talk-audio", "audio", { link: "lk-1" });
    select([video, audio], "talk");
    const handleLinkEdit = vi.fn();
    const event = key({ metaKey: true, key: "l" });
    expect(dispatchLinkShortcut(event, { handleLinkEdit })).toBe(true);
    expect(handleLinkEdit).toHaveBeenCalledWith({ kind: "unlink", elements: [video, audio] });
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("⌥⇧D detaches audio, read by key code since Option changes the character", () => {
    const talk = clip("talk", "video", { hasAudio: true });
    select([talk], "talk");
    const handleLinkEdit = vi.fn();
    expect(
      dispatchLinkShortcut(key({ altKey: true, shiftKey: true, key: "Î", code: "KeyD" }), {
        handleLinkEdit,
      }),
    ).toBe(true);
    expect(handleLinkEdit).toHaveBeenCalledWith({ kind: "detach", element: talk });
  });

  it("⌥⌫ deletes one linked member", () => {
    const video = clip("talk", "video", { muted: true, link: "lk-1" });
    select([video, clip("talk-audio", "audio", { link: "lk-1" })], "talk");
    const handleTimelineElementDeleteOnly = vi.fn();
    dispatchLinkShortcut(key({ altKey: true, key: "Backspace" }), {
      handleLinkEdit: vi.fn(),
      handleTimelineElementDeleteOnly,
    });
    expect(handleTimelineElementDeleteOnly).toHaveBeenCalledWith(video);
  });

  it("leaves ⌥⌫ to a text field the user is typing in", () => {
    const video = clip("talk", "video", { muted: true, link: "lk-1" });
    select([video, clip("talk-audio", "audio", { link: "lk-1" })], "talk");
    const input = document.createElement("input");
    document.body.append(input);
    const event = key({ altKey: true, key: "Backspace", bubbles: true });
    const handleTimelineElementDeleteOnly = vi.fn();
    input.addEventListener("keydown", (e) =>
      dispatchLinkShortcut(e, { handleLinkEdit: vi.fn(), handleTimelineElementDeleteOnly }),
    );
    input.dispatchEvent(event);
    input.remove();
    expect(handleTimelineElementDeleteOnly).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("leaves the key alone when no link item applies", () => {
    select([clip("title", "div")], "title");
    const event = key({ metaKey: true, key: "l" });
    expect(dispatchLinkShortcut(event, { handleLinkEdit: vi.fn() })).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe("dispatchLinkShortcut: remapped combos", () => {
  afterEach(() => setStudioKeys(null));

  it("link, detach and delete-one follow the map and the old combos go dead", () => {
    setStudioKeys({ linkToggle: "mod+u", detachAudio: "alt+shift+u", deleteLinked: "alt+x" });
    const video = clip("talk", "video", { muted: true, link: "lk-1", hasAudio: true });
    select([video, clip("talk-audio", "audio", { link: "lk-1" })], "talk");
    const handleLinkEdit = vi.fn();
    const handleTimelineElementDeleteOnly = vi.fn();
    const cb = { handleLinkEdit, handleTimelineElementDeleteOnly };
    expect(dispatchLinkShortcut(key({ metaKey: true, key: "l" }), cb)).toBe(false);
    expect(dispatchLinkShortcut(key({ metaKey: true, key: "u" }), cb)).toBe(true);
    expect(handleLinkEdit).toHaveBeenCalledTimes(1);
    expect(dispatchLinkShortcut(key({ altKey: true, key: "Backspace" }), cb)).toBe(false);
    expect(dispatchLinkShortcut(key({ altKey: true, key: "≈", code: "KeyX" }), cb)).toBe(true);
    expect(handleTimelineElementDeleteOnly).toHaveBeenCalledWith(video);
  });
});
