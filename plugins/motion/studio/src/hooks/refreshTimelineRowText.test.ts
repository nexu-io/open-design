// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { usePlayerStore, type TimelineElement } from "../player/store/playerStore";
import { refreshTimelineRowText } from "./refreshTimelineRowText";

afterEach(() => {
  usePlayerStore.getState().reset();
  document.body.innerHTML = "";
});

const row = (key: string, selector: string, sourceFile?: string): TimelineElement => ({
  id: key.split("#").pop()!,
  key,
  tag: "p",
  start: 0,
  duration: 2,
  track: 0,
  selector,
  selectorIndex: 0,
  sourceFile,
  text: { value: "Old" },
});

describe("refreshTimelineRowText", () => {
  it("gives the edited layer's row, addressed by its store key, its new words", () => {
    document.body.innerHTML = `<h1 id="title">New words</h1>`;
    usePlayerStore.getState().setElements([row("index.html#title", "#title")]);

    refreshTimelineRowText(document.getElementById("title")!);

    expect(usePlayerStore.getState().elements[0]?.text?.value).toBe("New words");
  });

  it("finds a row known only by its data-hf-id", () => {
    document.body.innerHTML = `<p data-hf-id="caption-a">New</p>`;
    usePlayerStore
      .getState()
      .setElements([
        { ...row("index.html#caption-a", ""), selector: undefined, hfId: "caption-a" },
      ]);

    refreshTimelineRowText(document.querySelector("p")!);

    expect(usePlayerStore.getState().elements[0]?.text?.value).toBe("New");
  });

  it("finds the row in the edited layer's own composition when two share a selector", () => {
    document.body.innerHTML = `
      <div data-composition-id="a" data-composition-file="a.html"><p class="caption">A</p></div>
      <div data-composition-id="b" data-composition-file="b.html"><p class="caption">B new</p></div>`;
    usePlayerStore
      .getState()
      .setElements([
        row("a.html#a-caption", ".caption", "a.html"),
        row("b.html#b-caption", ".caption", "b.html"),
      ]);

    refreshTimelineRowText(document.querySelectorAll<HTMLElement>(".caption")[1]!);

    expect(usePlayerStore.getState().elements.map((element) => element.text?.value)).toEqual([
      "Old",
      "B new",
    ]);
  });
});
