// @vitest-environment happy-dom
// Mounts the Layers panel by package name with no Studio shell, as a host app does.
import { act, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  DomEditProvider,
  LayersPanel,
  TimelineEditProvider,
  usePlayerStore,
  type LayersPanelHost,
} from "@hyperframes/studio";
import { installReactActEnvironment, mountReactHarness } from "./hooks/domSelectionTestHarness";
import { deriveTimelineStoreKeyForDomId } from "./player/lib/timelineElementHelpers";

installReactActEnvironment();

const flush = () => act(async () => {});
const rowLabels = () =>
  [...document.querySelectorAll("[data-layer-index]")].map((row) => row.textContent);
const clip = (id: string, track: number) => {
  const key = deriveTimelineStoreKeyForDomId(id, "index.html");
  return { id: key, key, domId: id, tag: "div", start: 0, duration: 4, track };
};
const bgTrack = () => usePlayerStore.getState().elements.find((e) => e.domId === "bg")?.track;

afterEach(() => {
  usePlayerStore.setState({ elements: [] });
  document.body.innerHTML = "";
});

/** The host's preview (title in front of bg, rows to match) and its edit session, mounted around the panel. */
const TWO_BOXES =
  '<div data-composition-id="main"><div id="bg" style="z-index:1"></div><div id="title" style="z-index:2"></div></div>';

async function mountPanel(
  wrap: (panel: ReactNode) => ReactNode = (panel) => panel,
  picture = TWO_BOXES,
) {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.body.innerHTML = picture;
  usePlayerStore.setState({ elements: [clip("title", 0), clip("bg", 1)] });
  const session = {
    domEditSelection: null,
    activeGroupElement: null,
    applyDomSelection: vi.fn(),
    updateDomEditHoverSelection: vi.fn(),
    handleDomZIndexReorderCommit: vi.fn(async () => ({
      durable: true,
      allMatched: true,
      changed: true,
    })),
    setActiveGroupElement: vi.fn(),
  } as unknown as Parameters<typeof DomEditProvider>[0]["value"];
  const host: LayersPanelHost = {
    previewIframeRef: { current: iframe },
    activeCompPath: null,
    showToast: vi.fn(),
    timelineElements: usePlayerStore.getState().elements,
    isPlaying: false,
  };
  const root = mountReactHarness(
    <DomEditProvider value={session}>{wrap(<LayersPanel host={host} />)}</DomEditProvider>,
  );
  await flush();
  return { doc, session, root };
}

/** Drags the back row (bg) above the front one. */
async function dragBackRowToFront() {
  const rows = document.querySelectorAll<HTMLElement>("[data-layer-index]");
  rows.forEach((row, i) =>
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue(new DOMRect(0, i * 24, 200, 24)),
  );
  const pointer = (type: string, clientY: number) =>
    new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX: 10, clientY });
  const list = rows[0]!.parentElement!;
  list.setPointerCapture = () => {};
  act(() => void rows[1]!.dispatchEvent(pointer("pointerdown", 36)));
  act(() => {
    list.dispatchEvent(pointer("pointermove", 20));
    list.dispatchEvent(pointer("pointermove", 2));
  });
  await act(async () => void list.dispatchEvent(pointer("pointerup", 2)));
  await flush();
}

it("lists, selects and reorders the host's preview layers through the host's session", async () => {
  const { doc, session, root } = await mountPanel();

  expect(rowLabels()).toEqual(["Title", "Bg"]);

  const rows = document.querySelectorAll<HTMLElement>("[data-layer-index]");
  await act(async () => rows[0]!.click());
  expect(session.applyDomSelection).toHaveBeenCalledWith(
    expect.objectContaining({ element: doc.getElementById("title") }),
  );

  await dragBackRowToFront();
  expect(session.handleDomZIndexReorderCommit).toHaveBeenCalledTimes(1);
  const [entries] = vi.mocked(session.handleDomZIndexReorderCommit).mock.calls[0]!;
  const z = Object.fromEntries(entries.map((e) => [e.element.id, e.zIndex]));
  expect(z.bg).toBeGreaterThan(Number(doc.getElementById("title")!.style.zIndex));
  // No TimelineEditProvider, so nothing can save a lane move: the row stays where the file says.
  expect(bgTrack()).toBe(1);
  await act(async () => root.unmount());
});

it("mirrors the reorder into the timeline rows through the host's move handler", async () => {
  const onMoveElements = vi.fn(async () => {});
  const { root } = await mountPanel((panel) => (
    <TimelineEditProvider value={{ onMoveElements }}>{panel}</TimelineEditProvider>
  ));

  await dragBackRowToFront();
  expect(onMoveElements).toHaveBeenCalledTimes(1);
  expect(bgTrack()).not.toBe(1);
  await act(async () => root.unmount());
});

it("puts a caret only on a group's row and starts each child's icon where its parent's label starts", async () => {
  const { root } = await mountPanel(
    undefined,
    '<div data-composition-id="main"><h1 id="title" style="z-index:2">Hi</h1>' +
      '<div id="intro" data-hf-group="Intro" style="z-index:1"><img id="logo">' +
      '<div id="inner" data-hf-group="Inner"><img id="mark"></div></div>' +
      '<div id="wrap" style="z-index:0"><div id="box"></div></div></div>',
  );
  const rows = [...document.querySelectorAll<HTMLElement>("[data-layer-index]")];
  const byLabel = (label: string) => rows.find((row) => row.textContent?.startsWith(label))!;
  const kind = (label: string) =>
    byLabel(label).querySelector("[data-layer-kind]")?.getAttribute("data-layer-kind");
  expect(["Title", "Intro", "Logo", "Inner", "Mark"].map(kind)).toEqual([
    "text",
    "group",
    "image",
    "group",
    "image",
  ]);
  expect([kind("Wrap"), kind("Box")]).toEqual(["group", "shape"]);
  expect(byLabel("Wrap").firstElementChild?.getAttribute("aria-label")).toBe("Collapse children");
  const icons = ["Title", "Intro", "Logo", "Box"].map(
    (l) => byLabel(l).querySelector("[data-layer-kind]")!.innerHTML,
  );
  expect(new Set(icons).size).toBe(4);
  for (const row of rows.filter((r) => r.title)) {
    expect(row.querySelector<HTMLElement>("[data-layer-kind]")!.title).toContain(row.title);
  }
  expect(byLabel("Title").firstElementChild?.hasAttribute("data-layer-kind")).toBe(true);
  expect(byLabel("Intro").firstElementChild?.getAttribute("aria-label")).toBe("Collapse children");
  expect(
    ["Title", "Intro", "Logo", "Inner", "Mark"].map((l) => byLabel(l).style.paddingLeft),
  ).toEqual(["8px", "8px", "56px", "56px", "104px"]);
  await act(async () => root.unmount());
});
