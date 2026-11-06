// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createGsapLivePreview } from "./gsapLivePreview";
import type { DomEditSelection } from "./domEditingTypes";
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import { readGsapRuntimeValuesForPanel } from "./propertyPanelHelpers";

afterEach(() => {
  delete (window as { gsap?: unknown }).gsap;
  delete (window as { __timelines?: unknown }).__timelines;
});

it("previews on the selected element, not an earlier same-id copy in a sub-composition", () => {
  document.body.innerHTML =
    '<div data-composition-id="strip"><div id="card" data-hf-id="hf-inner"></div></div>' +
    '<div id="card" data-hf-id="hf-root"></div>';
  const set = vi.fn();
  const iframe = { contentWindow: { gsap: { set } }, contentDocument: document };
  const preview = createGsapLivePreview({ current: iframe as unknown as HTMLIFrameElement });
  preview({ id: "card", hfId: "hf-root" } as DomEditSelection, { x: 10 });
  expect(set.mock.calls[0]?.[0]).toBe(document.querySelector('[data-hf-id="hf-root"]'));
});

it("previews on the copy in the selection's own file when a sub-composition repeats its hf-id", () => {
  document.body.innerHTML =
    '<div data-composition-id="strip" data-composition-src="compositions/strip.html">' +
    '<div id="card" data-hf-id="hf-card"></div></div><div id="card" data-hf-id="hf-card" class="root"></div>';
  const set = vi.fn();
  const iframe = { contentWindow: { gsap: { set } }, contentDocument: document };
  const preview = createGsapLivePreview({ current: iframe as unknown as HTMLIFrameElement });
  preview({ id: "card", hfId: "hf-card", sourceFile: "index.html" } as DomEditSelection, { x: 10 });
  expect(set.mock.calls[0]?.[0]).toBe(document.querySelector(".root"));
});

it("previews on the selected node while it is mounted, even in a second mount of the same sub-composition", () => {
  document.body.innerHTML =
    '<div data-composition-id="strip" data-composition-src="compositions/strip.html"><div id="card" data-hf-id="hf-card"></div></div>' +
    '<div data-composition-id="strip" data-composition-src="compositions/strip.html"><div id="card" data-hf-id="hf-card"></div></div>';
  const second = document.querySelectorAll<HTMLElement>("#card")[1];
  const selection = {
    id: "card",
    hfId: "hf-card",
    sourceFile: "compositions/strip.html",
    element: second,
  };
  const set = vi.fn();
  const iframe = { contentWindow: { gsap: { set } }, contentDocument: document };
  createGsapLivePreview({ current: iframe as unknown as HTMLIFrameElement })(
    selection as DomEditSelection,
    { x: 10 },
  );
  expect(set.mock.calls[0]?.[0]).toBe(second);
});

it("the panel reads GSAP values off the node the live preview moves", () => {
  document.body.innerHTML =
    '<div data-composition-id="strip" data-composition-src="compositions/strip.html"><div id="card"></div></div>' +
    '<div id="card" class="root"></div>';
  const root = document.querySelector<HTMLElement>(".root");
  const getProperty = vi.fn(() => 5);
  const iframe = { contentWindow: { gsap: { getProperty } }, contentDocument: document };
  const selection = { id: "card", sourceFile: "index.html", element: root } as DomEditSelection;
  const animations = [{ properties: { x: 5 } }] as unknown as GsapAnimation[];
  readGsapRuntimeValuesForPanel("anim", animations, selection, {
    current: iframe as unknown as HTMLIFrameElement,
  });
  expect(getProperty.mock.calls[0]?.[0]).toBe(root);
});

it.each([
  ["fades it", { opacity: 0 }, ["opacity"]],
  ["fades it about its corner", { opacity: 0, transformOrigin: "0 0" }, ["opacity"]],
  [
    "moves it",
    { x: 100 },
    [
      "x",
      "y",
      "rotation",
      "rotationX",
      "rotationY",
      "rotationZ",
      "z",
      "scale",
      "transformPerspective",
      "opacity",
    ],
  ],
])(
  "the panel reads GSAP's transform only off an element GSAP positions: a tween that %s",
  (_, vars, read) => {
    document.body.innerHTML = '<div id="card"></div>';
    const card = document.querySelector<HTMLElement>("#card");
    const tween = { targets: () => [card], vars, duration: () => 1 };
    const getProperty = vi.fn(() => 1);
    const contentWindow = Object.assign(window, {
      gsap: { getProperty },
      __timelines: { main: { getChildren: () => [tween] } },
    });
    const selection = { id: "card", sourceFile: "index.html", element: card } as DomEditSelection;
    const animations = [{ properties: vars }] as unknown as GsapAnimation[];
    readGsapRuntimeValuesForPanel("anim", animations, selection, {
      current: { contentWindow, contentDocument: document } as unknown as HTMLIFrameElement,
    });
    const props = getProperty.mock.calls.map((call) => (call as unknown[])[1]);
    expect(props).toEqual(read);
  },
);
