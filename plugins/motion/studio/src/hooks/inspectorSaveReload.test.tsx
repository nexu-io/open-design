// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditing";
import {
  makePreview,
  mountPlayerWithPreview,
  paintShadow,
  resetPlayerStore,
} from "../player/hooks/timelinePlayerTestHarness";
import { useDomEditCommits } from "./useDomEditCommits";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
vi.mock("../utils/gsapSoftReload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/gsapSoftReload")>()),
  ensureMotionPathPluginLoaded: vi.fn(),
}));

/** The project file; the patch route applies a colour to it, and each preview load serves it. */
let color = "red";
const card = () => `<div data-hf-id="hf-card" style="color: ${color}">Card</div>`;

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  resetPlayerStore();
});

it("an inspector save made while a reload loads is not undone when that reload goes on screen", async () => {
  color = "red";
  let land = () => {};
  const landed = new Promise<void>((resolve) => (land = resolve));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (!input.includes("/file-mutations/patch-element/"))
        return Response.json({ content: card() });
      await landed;
      const { operations } = JSON.parse(String(init?.body)) as { operations: { value: string }[] };
      color = operations[0]!.value;
      return Response.json({ ok: true, changed: true, matched: true, content: card() });
    }),
  );
  const live = makePreview(card());
  const player = mountPlayerWithPreview(live);
  const element = live.contentDocument!.querySelector<HTMLElement>("[data-hf-id]")!;
  const selection = {
    element,
    label: "Card",
    tagName: "div",
    sourceFile: "index.html",
    compositionPath: "index.html",
    textFields: [],
    inlineStyles: { color: "red" },
    computedStyles: {},
    dataAttributes: {},
    capabilities: { canSelect: true, canEditStyles: true },
    hfId: "hf-card",
    selector: '[data-hf-id="hf-card"]',
    selectorIndex: 0,
  } as unknown as DomEditSelection;
  let commits: ReturnType<typeof useDomEditCommits> | null = null;
  function Inspector() {
    commits = useDomEditCommits({
      activeCompPath: "index.html",
      previewIframeRef: player.getApi().iframeRef,
      showToast: () => {},
      queueDomEditSave: (save) => save(),
      writeProjectFile: async () => {},
      editHistory: { recordEdit: async () => {} },
      fileTree: [],
      importedFontAssetsRef: { current: [] },
      projectId: "p1",
      projectIdRef: { current: "p1" },
      reloadPreview: () => {},
      domEditSelection: selection,
      applyDomSelection: () => {},
      clearDomSelection: () => {},
      refreshDomEditSelectionFromPreview: () => {},
      buildDomSelectionFromTarget: async () => null,
      readOnlyPreview: false,
    });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Inspector)));

  act(() => player.getApi().refreshPlayer());
  const beforeSave = makePreview(card(), "?_t=1");
  let saved: Promise<unknown> = Promise.resolve();
  act(() => void (saved = commits!.handleDomStyleCommit("color", "green")));
  await act(async () => {
    land();
    await saved;
  });
  expect(color).toBe("green");

  const requested = await paintShadow(player.getApi, beforeSave);
  expect(player.getApi().iframeRef.current, "the file before the save").toBe(live);
  const fresh = makePreview(card(), "?_t=2");
  expect(await paintShadow(player.getApi, fresh)).toBeGreaterThan(requested);
  expect(player.getApi().iframeRef.current).toBe(fresh);
  act(() => root.unmount());
  act(() => player.root.unmount());
});
