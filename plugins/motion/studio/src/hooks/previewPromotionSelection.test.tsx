// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findElementForSelection, type DomEditSelection } from "../components/editor/domEditing";
import { resolveElementForOverlay } from "../components/editor/domEditOverlayGeometry";
import {
  makePreview,
  mountPlayerWithPreview,
  paintShadow,
  resetPlayerStore,
  type TimelinePlayerApi,
} from "../player/hooks/timelinePlayerTestHarness";
import { announcePreviewPromoted } from "../player/sceneSwap";
import { stageElementOffset } from "./elementOffsetStager";
import { savePlainRotation } from "./plainRotation";
import { useDomEditPreviewSync } from "./useDomEditPreviewSync";
import { useLivePreviewIframe } from "./useLivePreviewIframe";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../utils/gsapSoftReload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/gsapSoftReload")>()),
  ensureMotionPathPluginLoaded: vi.fn(),
}));

afterEach(() => {
  document.body.innerHTML = "";
  resetPlayerStore();
});

const previewWithTitle = (query = "") => makePreview('<h1 id="title">Title</h1>', query);

const titleOf = (iframe: HTMLIFrameElement | null) =>
  iframe!.contentDocument!.getElementById("title") as HTMLElement;

const selectionOf = (element: HTMLElement) =>
  ({ element, id: "title", selector: "#title", label: "title" }) as unknown as DomEditSelection;

/** A host shaped like Desktop's: it reads its iframe once and never re-renders for a reload. */
function mountHost(followPromotions: boolean) {
  const selectionRef = { current: null as DomEditSelection | null };
  function Session({ host }: { host: HTMLIFrameElement }) {
    const live = useLivePreviewIframe(host);
    useDomEditPreviewSync({
      previewIframe: followPromotions ? live : host,
      captionEditMode: false,
      domEditSelectionRef: selectionRef,
      domEditSelection: selectionRef.current,
      refreshDomEditSelectionFromPreview: async (selection, iframe) => {
        const element = findElementForSelection(iframe.contentDocument!, selection, null);
        selectionRef.current = element ? selectionOf(element) : null;
      },
      refreshPreviewDocumentVersion: () => {},
      syncPreviewHotkeys: () => {},
      applyStudioManualEditsToPreviewRef: { current: async () => {} },
    });
    return null;
  }
  const live = previewWithTitle();
  const player = mountPlayerWithPreview(live);
  selectionRef.current = selectionOf(titleOf(live));
  const sessionRoot = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => sessionRoot.render(React.createElement(Session, { host: live })));
  const unmount = () => {
    act(() => sessionRoot.unmount());
    act(() => player.root.unmount());
  };
  return { player: player.getApi, selectionRef, live, unmount };
}

/** The real shadow reload: load a shadow, report it painted, and let the player promote it. */
async function promoteShadow(player: () => TimelinePlayerApi): Promise<HTMLIFrameElement> {
  act(() => player().refreshPlayer());
  const shadow = previewWithTitle("?_t=1");
  await paintShadow(player, shadow);
  expect(player().iframeRef.current).toBe(shadow);
  return shadow;
}

describe("a shadow reload promoted without a host re-render", () => {
  // A host stage holds both players, each with the same #title, in either order.
  it.each([
    ["second", true],
    ["first", false],
  ])(
    "with the live preview %s on the stage, the selection, overlay, rotate and move land on it",
    async (_, liveSecond) => {
      const host = mountHost(true);
      const shadow = await promoteShadow(host.player);
      // The stage only orders the two players; nothing here needs their pages to load.
      for (const frame of [host.live, shadow]) frame.removeAttribute("src");
      const stage = document.body.appendChild(document.createElement("div"));
      stage.append(...(liveSecond ? [host.live, shadow] : [shadow, host.live]));

      const selection = host.selectionRef.current!;
      expect(selection.element).toBe(titleOf(shadow));
      const overlayNode = resolveElementForOverlay(shadow.contentDocument!, selection, null, {
        current: null,
      });
      expect(overlayNode).toBe(selection.element);

      const commitPositionPatchToHtml = vi.fn(async () => undefined);
      await savePlainRotation({ commitPositionPatchToHtml }, selection, { angle: 30 });
      await stageElementOffset(
        { commitPositionPatchToHtml, showToast: vi.fn() },
        selection,
        { x: 10, y: 5 },
        true,
      ).save();
      expect(titleOf(shadow).style.getPropertyValue("rotate")).toBe("30deg");
      expect(titleOf(shadow).style.getPropertyValue("translate")).toBe("10px 5px");
      expect(titleOf(host.live).getAttribute("style")).toBeNull();
      host.unmount();
    },
  );

  it("left the selection on the retired node when the session kept the host's first iframe", async () => {
    const host = mountHost(false);
    await promoteShadow(host.player);
    expect(host.selectionRef.current!.element).toBe(titleOf(host.live));
    host.unmount();
  });
});

describe("useLivePreviewIframe", () => {
  function track(host: HTMLIFrameElement) {
    const seen: Array<HTMLIFrameElement | null> = [];
    function Probe({ iframe }: { iframe: HTMLIFrameElement }) {
      seen.push(useLivePreviewIframe(iframe));
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe, { iframe: host })));
    const rerender = (iframe: HTMLIFrameElement) =>
      act(() => root.render(React.createElement(Probe, { iframe })));
    return { live: () => seen.at(-1), rerender, root };
  }

  it("follows each promotion of its own preview and ignores another preview's", () => {
    const [a, b, c, other] = [0, 1, 2, 3].map(() => document.createElement("iframe"));
    const probe = track(a!);
    act(() => announcePreviewPromoted({ retired: other!, live: c! }));
    expect(probe.live()).toBe(a);
    act(() => announcePreviewPromoted({ retired: a!, live: b! }));
    expect(probe.live()).toBe(b);
    act(() => announcePreviewPromoted({ retired: b!, live: c! }));
    expect(probe.live()).toBe(c);
    act(() => probe.root.unmount());
  });

  it("lands on the same iframe wrapped twice, as when a host wraps what it hands the session", () => {
    const [a, b, c] = [0, 1, 2].map(() => document.createElement("iframe"));
    let seen: { outer: HTMLIFrameElement | null; inner: HTMLIFrameElement | null } | null = null;
    function Probe({ host }: { host: HTMLIFrameElement }) {
      const outer = useLivePreviewIframe(host);
      seen = { outer, inner: useLivePreviewIframe(outer) };
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe, { host: a! })));
    act(() => announcePreviewPromoted({ retired: a!, live: b! }));
    expect(seen).toEqual({ outer: b, inner: b });
    act(() => announcePreviewPromoted({ retired: b!, live: c! }));
    expect(seen).toEqual({ outer: c, inner: c });
    act(() => root.unmount());
  });

  it("takes a new host iframe as given, and stops listening on unmount", () => {
    const [a, b, d] = [0, 1, 2].map(() => document.createElement("iframe"));
    const probe = track(a!);
    act(() => announcePreviewPromoted({ retired: a!, live: b! }));
    probe.rerender(d!);
    expect(probe.live()).toBe(d);
    const remove = vi.spyOn(document, "removeEventListener");
    act(() => probe.root.unmount());
    expect(remove).toHaveBeenCalledWith("hf-preview-promoted", expect.any(Function));
  });
});
