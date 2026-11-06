// @vitest-environment happy-dom
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHappyDomRootHarness } from "./testRootHarness";
import { ClipMenuAudioItems } from "./clipMenuAudioItems";
import type { TimelineElement } from "../store/timelineElement";
import { useAudioGainDialogStore } from "./audioGainDialogStore";

const showToast = vi.fn();
const setQuiet = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => {});
let previewDoc: Document | null = null;
const iframe = {
  get contentDocument() {
    return previewDoc;
  },
};

vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContextOptional: () => ({
    projectId: "p1",
    showToast,
    previewIframeRef: { current: iframe },
  }),
}));
vi.mock("../../contexts/TimelineEditContext", () => ({
  useTimelineEditContextOptional: () => ({ onSetElementAttributeQuiet: setQuiet }),
}));

const harness = createHappyDomRootHarness();

function render(element: TimelineElement, part: "gain" | "duck" = "gain") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() =>
    harness
      .mount(host)
      .render(<ClipMenuAudioItems part={part} element={element} onClose={() => {}} />),
  );
  return host;
}

const base = { start: 0, duration: 4, track: 0 };
const clickItem = async (host: HTMLElement, label: string) => {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
  await act(async () => button?.click());
};

beforeEach(() => {
  showToast.mockClear();
  setQuiet.mockReset();
  setQuiet.mockResolvedValue(undefined);
});

describe("ClipMenuAudioItems", () => {
  it("offers nothing on a muted video", () => {
    const host = render({ ...base, id: "b", tag: "video", hasAudio: true, muted: true });
    expect(host.textContent).toBe("");
  });

  describe("Duck under voice", () => {
    const duckLabel = (host: HTMLElement) =>
      [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Duck under voice"));
    const compose = (body: string) => {
      previewDoc = document.implementation.createHTMLDocument("c");
      previewDoc.body.innerHTML = body;
    };
    const music: TimelineElement = { ...base, id: "music", tag: "audio", src: "music.mp3" };

    it("is hidden on a lone video with sound", () => {
      compose(
        `<video id="a-roll" src="a.mp4" data-start="0" data-duration="4" data-has-audio="true"></video>`,
      );
      const host = render(
        { ...base, id: "a-roll", tag: "video", hasAudio: true, src: "a.mp4" },
        "duck",
      );
      expect(duckLabel(host)).toBeUndefined();
    });

    it("shows for a music bed with an overlapping voice", () => {
      compose(`<audio id="music" src="music.mp3" data-start="0" data-duration="4"></audio>
        <audio id="voiceover" src="vo.wav" data-start="1" data-duration="2"></audio>`);
      const host = render(music, "duck");
      expect(duckLabel(host)?.getAttribute("aria-checked")).toBe("false");
    });

    it("stays available, checked, once ducked even with the voice gone", () => {
      compose(
        `<audio id="music" src="music.mp3" data-start="0" data-duration="4" data-fx-carve='{"enabled":true,"sources":["voiceover"],"strength":0.25}'></audio>`,
      );
      const host = render(music, "duck");
      const item = duckLabel(host);
      expect(item?.getAttribute("aria-checked")).toBe("true");
      expect(item?.textContent).toBe("Duck under voice✓");
    });
  });

  it("Audio Gain… opens the G dialog for the clicked clip", async () => {
    useAudioGainDialogStore.getState().close();
    const element: TimelineElement = {
      ...base,
      id: "a-roll",
      tag: "video",
      hasAudio: true,
      src: "talk.mp4",
    };
    const host = render(element);
    const button = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Audio Gain…"),
    );
    expect(button?.textContent).toBe("Audio Gain…G");
    await act(async () => button?.click());
    expect(useAudioGainDialogStore.getState().targetKeys).toEqual(["a-roll"]);
    expect(host.textContent).not.toContain("Normalize loudness");
  });

  it("stops ducking at the first refused save and says why", async () => {
    previewDoc = document.implementation.createHTMLDocument("c");
    previewDoc.body.innerHTML = `<audio id="music" src="music.mp3" data-start="0" data-duration="10"></audio>
      <audio id="voiceover" src="vo.wav" data-start="1" data-duration="3"></audio>`;
    setQuiet.mockResolvedValue({
      status: "refused",
      reason: "Cannot edit timeline while recording",
    });
    const host = render({ ...base, id: "music", tag: "audio", src: "music.mp3" }, "duck");
    await clickItem(host, "Duck under voice");
    await vi.waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("Cannot edit timeline while recording", "error"),
    );
    expect(setQuiet).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining("Ducks under"), "info");
    previewDoc = null;
  });
});
