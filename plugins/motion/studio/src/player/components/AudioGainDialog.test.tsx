// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { audioGainToDb } from "@hyperframes/core/audio-gain";
import { createHappyDomRootHarness } from "./testRootHarness";
import { AudioGainDialog } from "./AudioGainDialog";
import { usePlayerStore } from "../store/playerStore";
import type { TimelineElement } from "../store/timelineElement";

const onNotice = vi.fn();
const setQuiet = vi.fn(async () => {});
const setMany = vi.fn(
  async (_edits: ReadonlyArray<{ value: string | null }>, _attr: string, _label: string) => {},
);

vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContextOptional: () => null,
}));
vi.mock("../../contexts/TimelineEditContext", () => ({
  useTimelineEditContextOptional: () => ({
    onSetElementAttributeQuiet: setQuiet,
    onSetElementsAttributeQuiet: setMany,
    onNotice,
  }),
}));

const harness = createHappyDomRootHarness();
const clip = (id: string, extra: Partial<TimelineElement> = {}): TimelineElement => ({
  id,
  tag: "audio",
  start: 0,
  duration: 2,
  track: 0,
  src: `${id}.wav`,
  ...extra,
});

function stubPeaks(peaks: Record<string, number[]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const name = Object.keys(peaks).find((key) => String(url).includes(`/peaks/${key}.wav`));
      return name
        ? Response.json({ binSeconds: 1, bins: peaks[name] })
        : new Response("", { status: 404 });
    }),
  );
}

function open(elements: TimelineElement[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => harness.mount(host).render(<AudioGainDialog elements={elements} onClose={() => {}} />));
}

const row = (text: string) =>
  [...document.querySelectorAll("label")].find((label) => label.textContent?.startsWith(text));
const choose = (text: string) =>
  act(() => row(text)?.querySelector<HTMLInputElement>("input[type=radio]")?.click());
function typeDb(text: string, value: string) {
  const input = row(text)?.querySelector<HTMLInputElement>("input[type=number]");
  if (!input) throw new Error(`no field for ${text}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const ok = () => [...document.querySelectorAll("button")].find((b) => b.textContent === "OK");
const peakText = () => document.querySelector("[data-testid='audio-gain-peak']")?.textContent;

beforeEach(() => {
  usePlayerStore.getState().beginTimelineSession("p1");
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("AudioGainDialog", () => {
  it("shows the selection's peak amplitude at the clips' current gain", async () => {
    stubPeaks({ pk1: [0.25, 0.5] });
    open([clip("pk1", { volume: 2 })]);
    await vi.waitFor(() => expect(peakText()).toBe("Peak Amplitude: 0.0 dB"));
  });

  it("Set Gain writes every selected clip in one undo step", async () => {
    stubPeaks({});
    const a = clip("set-a");
    const b = clip("set-b", { volume: 0.5 });
    open([a, b]);
    choose("Set Gain to");
    typeDb("Set Gain to", "-6");
    await act(async () => ok()?.click());
    expect(setMany).toHaveBeenCalledTimes(1);
    const [edits, attr, label] = setMany.mock.calls[0] ?? [];
    expect(attr).toBe("data-volume");
    expect(label).toBe("Audio Gain");
    expect(edits?.map((e) => audioGainToDb(Number(e.value)))).toEqual([
      expect.closeTo(-6, 3),
      expect.closeTo(-6, 3),
    ]);
    expect(setQuiet).not.toHaveBeenCalled();
  });

  it("Normalize All Peaks brings each clip's own peak to the target", async () => {
    stubPeaks({ na1: [0.5], na2: [0.25] });
    open([clip("na1"), clip("na2")]);
    await vi.waitFor(() => expect(peakText()).not.toContain("measuring"));
    choose("Normalize All Peaks to");
    typeDb("Normalize All Peaks to", "-3");
    await act(async () => ok()?.click());
    const [edits] = setMany.mock.calls[0] ?? [];
    const gains = edits?.map((e) => Number(e.value)) ?? [];
    expect(audioGainToDb(0.5 * (gains[0] ?? 0))).toBeCloseTo(-3, 3);
    expect(audioGainToDb(0.25 * (gains[1] ?? 0))).toBeCloseTo(-3, 3);
  });

  it("refuses a peak target above 0 dB", async () => {
    stubPeaks({ over: [0.5] });
    open([clip("over")]);
    await vi.waitFor(() => expect(peakText()).not.toContain("measuring"));
    choose("Normalize Max Peak to");
    typeDb("Normalize Max Peak to", "2");
    expect(ok()?.disabled).toBe(true);
  });

  it("disables the peak options when the clip cannot be measured", async () => {
    stubPeaks({});
    open([clip("unmeasured")]);
    await vi.waitFor(() => expect(peakText()).toBe("Peak Amplitude: Unavailable"));
    expect(row("Normalize Max Peak to")?.querySelector("input")?.disabled).toBe(true);
    expect(row("Adjust Gain by")?.querySelector("input")?.disabled).toBe(false);
  });
});
