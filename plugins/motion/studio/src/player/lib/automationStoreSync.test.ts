// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { syncStoredAutomationFromPreview, syncStoredElementAttribute } from "./automationStoreSync";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";

const TWO_POINTS = '{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":1}]}]}';
const RESTORED =
  '{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":1},{"t":4,"v":0}]}]}';

const el = (over: Partial<TimelineElement> = {}): TimelineElement => ({
  id: "bgm",
  key: "bgm",
  tag: "audio",
  start: 0,
  duration: 10,
  track: 1,
  domId: "bgm",
  ...over,
});

/** A stand-in preview document carrying the attributes an undo would have written. */
function previewWith(attrs: Record<string, string>): Document {
  const doc = document.implementation.createHTMLDocument("preview");
  const audio = doc.createElement("audio");
  audio.id = "bgm";
  for (const [name, value] of Object.entries(attrs)) audio.setAttribute(name, value);
  doc.body.append(audio);
  return doc;
}

beforeEach(() => {
  usePlayerStore.getState().reset();
});

describe("syncStoredElementAttribute", () => {
  it("records a saved fade on the stored clip, so the timeline draws what the file holds", () => {
    usePlayerStore.setState({ elements: [el({ fadeIn: 1 })] });
    syncStoredElementAttribute(el(), "data-fade-in", "2.5");
    expect(usePlayerStore.getState().elements[0]?.fadeIn).toBe(2.5);
    syncStoredElementAttribute(el(), "data-fade-in", null);
    expect(usePlayerStore.getState().elements[0]?.fadeIn).toBeUndefined();
  });

  // A quick volume save left the clip at its last load's volume, so a card reopened on it read the old level.
  it("records a saved volume, and drops it when the attribute goes", () => {
    usePlayerStore.setState({ elements: [el({ volume: 0.5 })] });
    syncStoredElementAttribute(el(), "data-volume", "1.5");
    expect(usePlayerStore.getState().elements[0]?.volume).toBe(1.5);
    syncStoredElementAttribute(el(), "data-volume", null);
    expect(usePlayerStore.getState().elements[0]?.volume).toBeUndefined();
  });
});

describe("syncStoredAutomationFromPreview", () => {
  it("reads back a volume an undo restored on the preview", () => {
    usePlayerStore.setState({ elements: [el({ volume: 1.5 })] });
    syncStoredAutomationFromPreview(previewWith({ "data-volume": "0.5" }));
    expect(usePlayerStore.getState().elements[0]?.volume).toBe(0.5);
  });

  it("reads back a fade an undo restored on the preview", () => {
    usePlayerStore.setState({ elements: [el({ fadeOut: 2 })] });
    syncStoredAutomationFromPreview(previewWith({ "data-fade-in": "0.6" }));
    const stored = usePlayerStore.getState().elements[0];
    expect([stored?.fadeIn, stored?.fadeOut]).toEqual([0.6, undefined]);
  });

  it("reads the element the timeline bound, not an earlier same-id copy in a sub-composition", () => {
    usePlayerStore.setState({ elements: [el({ hfId: "hf-root" })] });
    const doc = document.implementation.createHTMLDocument("preview");
    doc.body.innerHTML =
      '<div data-composition-id="strip"><audio id="bgm" data-hf-id="hf-inner"></audio></div>' +
      '<audio id="bgm" data-hf-id="hf-root"></audio>';
    doc.querySelector('[data-hf-id="hf-inner"]')?.setAttribute("data-automation", TWO_POINTS);
    doc.querySelector('[data-hf-id="hf-root"]')?.setAttribute("data-automation", RESTORED);
    syncStoredAutomationFromPreview(doc);
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(RESTORED);
  });

  it("reads the copy in the element's own file when a sub-composition repeats its hf-id", () => {
    usePlayerStore.setState({ elements: [el({ hfId: "hf-bgm" })] });
    const doc = document.implementation.createHTMLDocument("preview");
    doc.body.innerHTML =
      '<div data-composition-id="strip" data-composition-src="compositions/strip.html">' +
      '<audio id="bgm" data-hf-id="hf-bgm"></audio></div><audio id="bgm" data-hf-id="hf-bgm"></audio>';
    doc.querySelectorAll("audio")[0]?.setAttribute("data-automation", TWO_POINTS);
    doc.querySelectorAll("audio")[1]?.setAttribute("data-automation", RESTORED);
    syncStoredAutomationFromPreview(doc);
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(RESTORED);
  });

  it("reads back an envelope an undo restored on the preview", () => {
    // The bug: a soft undo patches the preview document and re-runs the timeline, but
    // the store keeps its own copy of the attributes and that copy is what a lane
    // draws — so an undone delete stayed invisible until the page was reloaded.
    usePlayerStore.setState({ elements: [el({ automation: TWO_POINTS })] });
    syncStoredAutomationFromPreview(previewWith({ "data-automation": RESTORED }));
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(RESTORED);
  });

  it("reads back an undone FX chain too, since a lane's targets come from it", () => {
    const chain = '{"version":1,"nodes":[{"type":"lowpass","id":"n1","params":{}}]}';
    usePlayerStore.setState({ elements: [el()] });
    syncStoredAutomationFromPreview(previewWith({ "data-fx-chain": chain }));
    expect(usePlayerStore.getState().elements[0]?.fxChain).toBe(chain);
  });

  it("clears an attribute the undo removed", () => {
    usePlayerStore.setState({ elements: [el({ automation: TWO_POINTS })] });
    syncStoredAutomationFromPreview(previewWith({}));
    expect(usePlayerStore.getState().elements[0]?.automation).toBeUndefined();
  });

  it("finds the node by data-hf-id when the dom id does not match", () => {
    // Studio stamps hf-ids; an element discovered under a suffixed dom id still has
    // to resolve, or the sync silently skips it.
    const doc = document.implementation.createHTMLDocument("preview");
    const audio = doc.createElement("audio");
    audio.setAttribute("data-hf-id", "hf-snao");
    audio.setAttribute("data-automation", RESTORED);
    doc.body.append(audio);
    usePlayerStore.setState({ elements: [el({ domId: "bgm-2", hfId: "hf-snao" })] });
    syncStoredAutomationFromPreview(doc);
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(RESTORED);
  });

  it("keeps the same array when nothing changed, so nothing re-renders", () => {
    usePlayerStore.setState({ elements: [el({ automation: RESTORED })] });
    const before = usePlayerStore.getState().elements;
    syncStoredAutomationFromPreview(previewWith({ "data-automation": RESTORED }));
    expect(usePlayerStore.getState().elements).toBe(before);
  });

  it("does nothing without a preview document", () => {
    usePlayerStore.setState({ elements: [el({ automation: TWO_POINTS })] });
    syncStoredAutomationFromPreview(null);
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(TWO_POINTS);
  });
  // The reported symptom: automate a parameter on a GROUP from the FX rack and
  // the group's row shows no automation. The rack is not group-aware — it
  // writes the attribute on the group node through the ordinary element path —
  // and the timeline reads a group's lanes from the mirrors its MEMBERS carry,
  // which that path used to leave untouched.
  it("re-reads what the group carries onto every member that belongs to it", () => {
    const chain = '{"version":1,"nodes":[{"type":"gain","id":"n1","params":{"gain":0}}]}';
    const groupAutomation =
      '{"version":1,"lanes":[{"target":"fx.n1.gain","points":[{"t":0,"v":0}]}]}';
    const doc = document.implementation.createHTMLDocument("preview");
    const group = doc.createElement("hf-audio-group");
    group.id = "voiceover";
    group.setAttribute("data-fx-chain", chain);
    group.setAttribute("data-automation", groupAutomation);
    const audio = doc.createElement("audio");
    audio.id = "bgm";
    audio.setAttribute("data-audio-group", "voiceover");
    doc.body.append(group, audio);

    usePlayerStore.setState({ elements: [el({ audioGroup: "voiceover" })] });
    syncStoredAutomationFromPreview(doc);

    const stored = usePlayerStore.getState().elements[0];
    expect(stored?.audioGroupAutomation).toBe(groupAutomation);
    expect(stored?.audioGroupFxChain).toBe(chain);
  });
});
