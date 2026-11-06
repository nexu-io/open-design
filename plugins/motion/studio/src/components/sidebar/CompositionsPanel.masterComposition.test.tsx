// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../../player/store/playerStore";
import { CompositionsPanel } from "./CompositionsPanel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(
  window as unknown as { happyDOM: { settings: { disableIframePageLoading: boolean } } }
).happyDOM.settings.disableIframePageLoading = true;

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  usePlayerStore.setState({ thumbnailRevisions: {} });
});

describe("CompositionsPanel root badge source", () => {
  it("derives the root badge from the filtered compositions list, not the raw file tree", () => {
    // The project's raw file tree can hold a non-composition index.html (a vendored
    // preset); the badge must source from the server's filtered `compositions` list.
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        <CompositionsPanel
          projectId="demo"
          compositions={["hero.html"]}
          activeComposition={null}
          onSelect={vi.fn()}
        />,
      );
    });
    const cards = host.querySelectorAll<HTMLElement>('[draggable="true"]');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toContain("Root");
  });
});
