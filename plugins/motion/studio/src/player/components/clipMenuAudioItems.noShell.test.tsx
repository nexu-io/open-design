// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHappyDomRootHarness } from "./testRootHarness";
import { ClipMenuAudioItems } from "./clipMenuAudioItems";
import { AudioGainDialog } from "./AudioGainDialog";
import { usePlayerStore } from "../store/playerStore";
import { usePreviewIframeStore } from "../store/previewIframeStore";
import type { TimelineElement } from "../store/timelineElement";

const onNotice = vi.fn();
const setQuiet = vi.fn(async () => {});

vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContextOptional: () => null,
}));
vi.mock("../../contexts/TimelineEditContext", () => ({
  useTimelineEditContextOptional: () => ({ onSetElementAttributeQuiet: setQuiet, onNotice }),
}));

const harness = createHappyDomRootHarness();
const tour: TimelineElement = {
  id: "tour",
  tag: "video",
  start: 0,
  duration: 4,
  track: 0,
  hasAudio: true,
  src: "tour.mp4",
};

function mountPreview(): void {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("iframe has no document");
  doc.body.innerHTML =
    '<video id="tour" src="tour.mp4" data-has-audio="true" data-start="0" data-duration="4"></video><audio id="voiceover" src="vo.wav" data-start="1" data-duration="2"></audio>';
  usePreviewIframeStore.getState().setIframe(iframe);
}

function render(part: "gain" | "duck") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() =>
    harness
      .mount(host)
      .render(<ClipMenuAudioItems part={part} element={tour} onClose={() => {}} />),
  );
  return host;
}

afterEach(() => {
  usePreviewIframeStore.getState().setIframe(null);
  vi.unstubAllGlobals();
});

describe("ClipMenuAudioItems in a host without Studio's shell", () => {
  it("offers Audio Gain and Duck from the timeline session and the live preview", () => {
    usePlayerStore.getState().beginTimelineSession("p1");
    mountPreview();
    expect(render("gain").textContent).toContain("Audio Gain…");
    expect(render("duck").textContent).toContain("Duck under voice");
  });

  it("the dialog's loudness row normalizes through the session's project and onNotice", async () => {
    usePlayerStore.getState().beginTimelineSession("p1");
    const plan = { targetLufs: -16, projectedLufs: -16, volume: 2, changeDb: 6, limitedBy: null };
    const fetchSpy = vi.fn(async (_url: string) => Response.json({ plan }));
    vi.stubGlobal("fetch", fetchSpy);
    const host = document.createElement("div");
    document.body.appendChild(host);
    act(() => harness.mount(host).render(<AudioGainDialog elements={[tour]} onClose={() => {}} />));
    const loudness = [...document.querySelectorAll("label")].find((l) =>
      l.textContent?.includes("−16 LUFS"),
    );
    act(() => loudness?.querySelector("input")?.click());
    const ok = [...document.querySelectorAll("button")].find((b) => b.textContent === "OK");
    await act(async () => ok?.click());
    await vi.waitFor(() => expect(onNotice).toHaveBeenCalled());
    const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain("/api/projects/p1/loudness/normalize");
    expect(setQuiet).toHaveBeenCalledWith(tour, "data-volume", "2", "Normalize loudness");
    expect(onNotice).toHaveBeenCalledWith("Normalized to −16 LUFS (+6.0 dB)", "info");
  });
});
