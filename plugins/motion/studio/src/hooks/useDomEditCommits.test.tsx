// fallow-ignore-file code-duplication
// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import type { DomEditSelection, DomEditTextField } from "../components/editor/domEditing";
import type { ImportedFontAsset } from "../components/editor/fontAssets";
import { usePlayerStore } from "../player";
import { createDomEditSaveQueue } from "../utils/domEditSaveQueue";
import { trackStudioEvent } from "../utils/studioTelemetry";
import type { CutoverResult } from "../utils/sdkCutover";
import { useDomEditCommits } from "./useDomEditCommits";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

vi.mock("../utils/studioTelemetry", () => ({
  trackStudioEvent: vi.fn(),
}));

interface PatchResponseBody {
  ok?: boolean;
  changed?: boolean;
  matched?: boolean;
  content?: string;
  path?: string;
  version?: string;
}

interface RenderedDomEditCommits {
  hook: ReturnType<typeof useDomEditCommits>;
  showToast: ReturnType<typeof makeShowToast>;
  recordEdit: ReturnType<typeof vi.fn<() => Promise<void>>>;
  reloadPreview: ReturnType<typeof vi.fn>;
  cleanup: () => void;
}

interface RenderDomEditCommitsOptions {
  importedFontAssets?: ImportedFontAsset[];
  writeProjectFile?: (path: string, content: string, expectedContent?: string) => Promise<void>;
  onTrySdkPersist?: () => Promise<CutoverResult>;
  queueDomEditSave?: <T>(save: () => Promise<T>) => Promise<T>;
  projectIdRef?: MutableRefObject<string | null>;
  readOnlyPreview?: boolean;
}

type FetchHandler = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response>;

function makeShowToast() {
  return vi.fn<(message: string, tone?: "error" | "info") => void>();
}

function ensureCssEscape(): void {
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  if (typeof globalThis.CSS === "undefined") {
    Object.defineProperty(globalThis, "CSS", {
      value: { escape },
      configurable: true,
    });
    return;
  }
  if (typeof globalThis.CSS.escape !== "function") {
    Object.defineProperty(globalThis.CSS, "escape", {
      value: escape,
      configurable: true,
    });
  }
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolveFn: Deferred<T>["resolve"] | null = null;
  let rejectFn: Deferred<T>["reject"] | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  if (!resolveFn || !rejectFn) throw new Error("Expected promise callbacks");
  return { promise, resolve: resolveFn, reject: rejectFn };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function stubPatchFetch(
  patchResponse: PatchResponseBody | Error,
  sourceContent = '<div data-hf-id="hf-card" style="color: red">Card</div>',
) {
  const fetchMock = vi.fn(
    async (
      input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ): Promise<Response> => {
      const url = requestUrl(input);
      if (url.includes("/api/projects/p1/files/")) {
        return jsonResponse({ content: sourceContent });
      }
      if (url.includes("/api/projects/p1/file-mutations/patch-element/")) {
        if (patchResponse instanceof Error) throw patchResponse;
        return jsonResponse(patchResponse);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function flushAsyncWork(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

function createPreviewElement(
  bodyHtml = '<div data-hf-id="hf-card" style="color: red">Card</div>',
): {
  iframe: HTMLIFrameElement;
  element: HTMLElement;
} {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("Expected iframe contentDocument");
  doc.body.innerHTML = bodyHtml;
  const element = doc.querySelector('[data-hf-id="hf-card"]');
  if (!(element instanceof HTMLElement)) throw new Error("Expected HTML target element");
  return { iframe, element };
}

function textField(input: {
  key: string;
  value: string;
  source: DomEditTextField["source"];
  tagName?: string;
}): DomEditTextField {
  return {
    key: input.key,
    label: input.key,
    value: input.value,
    tagName: input.tagName ?? "span",
    attributes: [],
    inlineStyles: {},
    computedStyles: {},
    source: input.source,
  };
}

function createSelection(
  element: HTMLElement,
  overrides: Partial<DomEditSelection> = {},
): DomEditSelection {
  const base: DomEditSelection = {
    element,
    label: "Hero title",
    tagName: "div",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 120, height: 40 },
    textContent: element.textContent,
    dataAttributes: {},
    inlineStyles: { color: "red" },
    computedStyles: {},
    textFields: [],
    capabilities: {
      canSelect: true,
      canEditStyles: true,
      canCrop: true,
      canMove: true,
      canResize: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    },
    hfId: "hf-card",
    selector: '[data-hf-id="hf-card"]',
    selectorIndex: 0,
  };
  return { ...base, ...overrides };
}

function renderDomEditCommits(
  selection: DomEditSelection,
  iframe: HTMLIFrameElement,
  options: RenderDomEditCommitsOptions = {},
) {
  const captured: { current: ReturnType<typeof useDomEditCommits> | null } = { current: null };
  const showToast = makeShowToast();
  const recordEdit = vi.fn(async () => {});
  const previewIframeRef: MutableRefObject<HTMLIFrameElement | null> = { current: iframe };
  const projectIdRef: MutableRefObject<string | null> = options.projectIdRef ?? { current: "p1" };
  const reloadPreview = vi.fn();

  function Probe() {
    captured.current = useDomEditCommits({
      activeCompPath: "index.html",
      previewIframeRef,
      showToast,
      queueDomEditSave: options.queueDomEditSave ?? (async (save) => save()),
      writeProjectFile: options.writeProjectFile ?? (async () => {}),
      editHistory: { recordEdit },
      fileTree: [],
      importedFontAssetsRef: { current: options.importedFontAssets ?? [] },
      projectId: "p1",
      projectIdRef,
      reloadPreview,
      domEditSelection: selection,
      applyDomSelection: vi.fn(),
      clearDomSelection: vi.fn(),
      refreshDomEditSelectionFromPreview: vi.fn(),
      buildDomSelectionFromTarget: vi.fn(async (target: HTMLElement) =>
        target === selection.element ? selection : null,
      ),
      onTrySdkPersist: options.onTrySdkPersist,
      readOnlyPreview: options.readOnlyPreview ?? false,
    });
    return null;
  }

  const container = document.createElement("div");
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(Probe));
  });

  if (!captured.current) throw new Error("Expected hook result");
  return {
    hook: captured.current,
    showToast,
    recordEdit,
    reloadPreview,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  } satisfies RenderedDomEditCommits;
}

describe("useDomEditCommits z-index reorder persistence", () => {
  beforeEach(() => {
    ensureCssEscape();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it.each([false, true])(
    "persists an N-element reorder with one batch POST, one undo entry, and NO iframe reload (read-only preview %s: the timeline's z sync stays editable)",
    async (readOnlyPreview) => {
      const original =
        '<div id="a" style="z-index: 1"></div><div id="b" style="z-index: 2"></div><div id="c" style="z-index: 3"></div>';
      const after =
        '<div id="a" style="z-index: 3"></div><div id="b" style="z-index: 2"></div><div id="c" style="z-index: 1"></div>';
      const fetchMock = vi.fn(
        async (
          input: Parameters<typeof fetch>[0],
          _init?: Parameters<typeof fetch>[1],
        ): Promise<Response> => {
          const url = requestUrl(input);
          if (url.endsWith("/file-mutations/patch-element-batches")) {
            return jsonResponse({
              durable: true,
              files: [
                {
                  sourceFile: "index.html",
                  changed: true,
                  matched: [true, true, true],
                  before: original,
                  after,
                },
              ],
            });
          }
          throw new Error(`Unexpected fetch: ${url}`);
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      const { iframe, element } = createPreviewElement(
        '<div data-hf-id="hf-card"></div><div id="b"></div><div id="c"></div>',
      );
      element.id = "a";
      const elements = [
        element,
        iframe.contentDocument!.getElementById("b")!,
        iframe.contentDocument!.getElementById("c")!,
      ];
      const rendered = renderDomEditCommits(createSelection(element), iframe, { readOnlyPreview });

      try {
        await act(async () => {
          await rendered.hook.handleDomZIndexReorderCommit(
            elements.map((item, index) => ({
              element: item,
              zIndex: 3 - index,
              id: item.id,
              sourceFile: "index.html",
            })),
            "z-reorder:test",
          );
        });

        const batchPosts = fetchMock.mock.calls.filter(([input]) =>
          requestUrl(input).endsWith("/file-mutations/patch-element-batches"),
        );
        const singlePosts = fetchMock.mock.calls.filter(([input]) =>
          requestUrl(input).includes("/file-mutations/patch-elements-batch/"),
        );
        expect(batchPosts).toHaveLength(1);
        expect(singlePosts).toHaveLength(0);
        expect(JSON.parse(String(batchPosts[0]?.[1]?.body))).toEqual({
          batches: [
            {
              sourceFile: "index.html",
              patches: expect.arrayContaining([
                expect.objectContaining({ target: expect.objectContaining({ id: "a" }) }),
                expect.objectContaining({ target: expect.objectContaining({ id: "b" }) }),
                expect.objectContaining({ target: expect.objectContaining({ id: "c" }) }),
              ]),
            },
          ],
        });
        expect(rendered.recordEdit).toHaveBeenCalledTimes(1);
        expect(rendered.recordEdit).toHaveBeenCalledWith({
          label: "Reorder layers",
          coalesceKey: "z-reorder:test",
          // Unbounded per-gesture fold window (keys are unique per gesture):
          // the z entry and its mirror/lane counterpart fold across the server
          // round-trip that separates them.
          coalesceMs: Number.POSITIVE_INFINITY,
          files: { "index.html": { before: original, after } },
          targets: [
            { file: "index.html", id: "a", hfId: "hf-card" },
            { file: "index.html", id: "b" },
            { file: "index.html", id: "c" },
          ],
        });
        // FIX: a z-only reorder must NOT remount the preview iframe ("the blink").
        // The live DOM + store already hold the final state and the server matched
        // every style-only patch, so the reload is provably redundant.
        expect(rendered.reloadPreview).not.toHaveBeenCalled();
      } finally {
        rendered.cleanup();
      }
    },
  );

  it("falls back to reloading when the server response omits matched[]", async () => {
    // Without a matched[] confirmation the persist can't be proven in sync with
    // the live DOM — the skip-reload path must not engage.
    const original = '<div id="a" style="z-index: 1"></div>';
    const after = '<div id="a" style="z-index: 2"></div>';
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = requestUrl(input);
      if (url.endsWith("/file-mutations/patch-element-batches")) {
        return jsonResponse({
          durable: true,
          files: [{ sourceFile: "index.html", changed: true, before: original, after }],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { iframe, element } = createPreviewElement();
    element.id = "a";
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      await act(async () => {
        await rendered.hook.handleDomZIndexReorderCommit([
          { element, zIndex: 2, id: "a", sourceFile: "index.html" },
        ]);
      });

      expect(rendered.recordEdit).toHaveBeenCalledTimes(1);
      expect(rendered.reloadPreview).toHaveBeenCalledTimes(1);
    } finally {
      rendered.cleanup();
    }
  });

  it("warns and reports telemetry for unmatched batch patches without throwing", async () => {
    // The server reports per-patch matched[]: #b was not found in the source,
    // so it atomically refuses the whole multi-file gesture. The reload
    // reconverges the preview with disk while the lifecycle owner rolls back
    // both optimistic writes.
    const original = '<div id="a" style="z-index: 1"></div>';
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = requestUrl(input);
      if (url.endsWith("/file-mutations/patch-element-batches")) {
        return jsonResponse({
          durable: false,
          files: [
            {
              sourceFile: "index.html",
              changed: false,
              matched: [true, false],
              before: original,
              after: original,
            },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { iframe, element } = createPreviewElement(
      '<div data-hf-id="hf-card"></div><div id="b"></div>',
    );
    element.id = "a";
    const second = iframe.contentDocument!.getElementById("b")!;
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      await act(async () => {
        await rendered.hook.handleDomZIndexReorderCommit([
          { element, zIndex: 2, id: "a", sourceFile: "index.html" },
          { element: second, zIndex: 1, id: "b", sourceFile: "index.html" },
        ]);
      });

      // No throw: incomplete durability rolls back both optimistic writes.
      expect(element.style.zIndex).toBe("");
      expect(second.style.zIndex).toBe("");
      expect(rendered.recordEdit).not.toHaveBeenCalled();
      expect(rendered.reloadPreview).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("could not match 1 patch target(s) in index.html"),
        "b",
      );
      expect(trackStudioEvent).toHaveBeenCalledWith(
        "save_failure",
        expect.objectContaining({
          mutation_type: "z-reorder-unmatched",
          file_path: "index.html",
          error_message: expect.stringContaining("b"),
        }),
      );
    } finally {
      warnSpy.mockRestore();
      rendered.cleanup();
    }
  });

  it("uses one atomic request and rolls back every file when one target is unmatched", async () => {
    const indexOriginal = '<div id="a" style="z-index: 4"></div>';
    const sceneOriginal = '<div id="b" style="z-index: 5"></div>';
    const fetchMock = vi.fn(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ): Promise<Response> => {
        const url = requestUrl(input);
        if (url.endsWith("/file-mutations/patch-element-batches")) {
          expect(JSON.parse(String(init?.body))).toEqual({
            batches: [
              expect.objectContaining({ sourceFile: "index.html" }),
              expect.objectContaining({ sourceFile: "scene.html" }),
            ],
          });
          return jsonResponse({
            durable: false,
            files: [
              {
                sourceFile: "index.html",
                changed: false,
                matched: [true],
                before: indexOriginal,
                after: indexOriginal,
              },
              {
                sourceFile: "scene.html",
                changed: false,
                matched: [false],
                before: sceneOriginal,
                after: sceneOriginal,
              },
            ],
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { iframe, element } = createPreviewElement(
      '<div data-hf-id="hf-card" style="z-index: 4"></div><div id="b" style="z-index: 5"></div>',
    );
    element.id = "a";
    const second = iframe.contentDocument!.getElementById("b")!;
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      let result:
        | Awaited<ReturnType<typeof rendered.hook.handleDomZIndexReorderCommit>>
        | undefined;
      await act(async () => {
        result = await rendered.hook.handleDomZIndexReorderCommit([
          { element, zIndex: 8, id: "a", sourceFile: "index.html" },
          { element: second, zIndex: 9, id: "b", sourceFile: "scene.html" },
        ]);
      });

      expect(result).toEqual({ durable: false, allMatched: false, changed: false });
      expect(element.style.zIndex).toBe("4");
      expect(second.style.zIndex).toBe("5");
      expect(rendered.recordEdit).not.toHaveBeenCalled();
      expect(rendered.reloadPreview).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
      rendered.cleanup();
    }
  });

  it("reloads and reports non-durable when an unmatched batch changes no bytes", async () => {
    const original = '<div id="a" style="z-index: 1"></div>';
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = requestUrl(input);
      if (url.endsWith("/file-mutations/patch-element-batches")) {
        return jsonResponse({
          durable: false,
          files: [
            {
              sourceFile: "index.html",
              changed: false,
              matched: [false],
              before: original,
              after: original,
            },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { iframe, element } = createPreviewElement();
    element.id = "a";
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      let result:
        | Awaited<ReturnType<typeof rendered.hook.handleDomZIndexReorderCommit>>
        | undefined;
      await act(async () => {
        result = await rendered.hook.handleDomZIndexReorderCommit([
          { element, zIndex: 2, id: "missing", sourceFile: "index.html" },
        ]);
      });

      expect(result).toEqual({ durable: false, allMatched: false, changed: false });
      expect(element.style.zIndex).toBe("");
      expect(rendered.recordEdit).not.toHaveBeenCalled();
      expect(rendered.reloadPreview).toHaveBeenCalledTimes(1);
    } finally {
      rendered.cleanup();
    }
  });

  it("rolls back and reloads after a rejected batch POST", async () => {
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = requestUrl(input);
      if (url.endsWith("/file-mutations/patch-element-batches")) {
        return jsonResponse({ error: "batch rejected" }, 500);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const writeProjectFile = vi.fn(async () => {});
    const { iframe, element } = createPreviewElement(
      '<div data-hf-id="hf-card" style="z-index: 7"></div><div id="b"></div>',
    );
    element.id = "a";
    const second = iframe.contentDocument!.getElementById("b")!;
    usePlayerStore.getState().setElements([
      { id: "a", tag: "div", start: 0, duration: 1, track: 0, zIndex: 7, hasExplicitZIndex: true },
      { id: "b", tag: "div", start: 0, duration: 1, track: 1, zIndex: 0, hasExplicitZIndex: false },
    ]);
    const rendered = renderDomEditCommits(createSelection(element), iframe, { writeProjectFile });

    try {
      let rejection: unknown;
      await act(async () => {
        try {
          await rendered.hook.handleDomZIndexReorderCommit([
            { element, zIndex: 2, id: "a", sourceFile: "index.html", key: "a" },
            { element: second, zIndex: 1, id: "b", sourceFile: "index.html", key: "b" },
          ]);
        } catch (error) {
          rejection = error;
        }
      });

      expect(rejection).toBeInstanceOf(Error);
      expect((rejection as Error).message).toContain("batch rejected");
      expect(element.style.zIndex).toBe("7");
      expect(second.style.zIndex).toBe("");
      expect(
        usePlayerStore
          .getState()
          .elements.map(({ zIndex, hasExplicitZIndex }) => ({ zIndex, hasExplicitZIndex })),
      ).toEqual([
        { zIndex: 7, hasExplicitZIndex: true },
        { zIndex: 0, hasExplicitZIndex: false },
      ]);
      expect(writeProjectFile).not.toHaveBeenCalled();
      expect(rendered.recordEdit).not.toHaveBeenCalled();
      expect(rendered.reloadPreview).toHaveBeenCalledTimes(1);
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          requestUrl(input).endsWith("/file-mutations/patch-element-batches"),
        ),
      ).toHaveLength(1);
    } finally {
      rendered.cleanup();
    }
  });

  it("reloads after the server commits but the aggregate response is lost", async () => {
    const original = '<div data-hf-id="hf-card" id="a" style="z-index: 7"></div>';
    const after = '<div data-hf-id="hf-card" id="a" style="z-index: 2"></div>';
    let diskContent = original;
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = requestUrl(input);
      if (url.endsWith("/file-mutations/patch-element-batches")) {
        diskContent = after;
        throw new TypeError("connection reset after commit");
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { iframe, element } = createPreviewElement(original);
    usePlayerStore.getState().setElements([
      {
        id: "a",
        tag: "div",
        start: 0,
        duration: 1,
        track: 0,
        zIndex: 7,
        hasExplicitZIndex: true,
      },
    ]);
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      let rejection: unknown;
      await act(async () => {
        try {
          await rendered.hook.handleDomZIndexReorderCommit([
            { element, zIndex: 2, id: "a", sourceFile: "index.html", key: "a" },
          ]);
        } catch (error) {
          rejection = error;
        }
      });

      expect(rejection).toBeInstanceOf(Error);
      expect((rejection as Error).message).toContain("connection reset after commit");
      expect(diskContent).toBe(after);
      expect(element.style.zIndex).toBe("7");
      expect(usePlayerStore.getState().elements[0]).toMatchObject({
        zIndex: 7,
        hasExplicitZIndex: true,
      });
      expect(rendered.recordEdit).not.toHaveBeenCalled();
      expect(rendered.reloadPreview).toHaveBeenCalledTimes(1);
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          requestUrl(input).endsWith("/file-mutations/patch-element-batches"),
        ),
      ).toHaveLength(1);
    } finally {
      rendered.cleanup();
    }
  });

  it.each([
    [
      "changed=false with different snapshots",
      {
        durable: true,
        files: [
          {
            sourceFile: "index.html",
            changed: false,
            matched: [true],
            before: '<div id="a" style="z-index: 1"></div>',
            after: '<div id="a" style="z-index: 2"></div>',
          },
        ],
      },
    ],
    [
      "changed=true with identical snapshots",
      {
        durable: true,
        files: [
          {
            sourceFile: "index.html",
            changed: true,
            matched: [true],
            before: '<div id="a" style="z-index: 1"></div>',
            after: '<div id="a" style="z-index: 1"></div>',
          },
        ],
      },
    ],
    [
      "durable=false with a changed file",
      {
        durable: false,
        files: [
          {
            sourceFile: "index.html",
            changed: true,
            matched: [true],
            before: '<div id="a" style="z-index: 1"></div>',
            after: '<div id="a" style="z-index: 2"></div>',
          },
        ],
      },
    ],
  ])("rejects and reloads for malformed 200 response: %s", async (_label, responseBody) => {
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = requestUrl(input);
      if (url.endsWith("/file-mutations/patch-element-batches")) {
        return jsonResponse(responseBody);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { iframe, element } = createPreviewElement();
    element.id = "a";
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      let rejection: unknown;
      await act(async () => {
        try {
          await rendered.hook.handleDomZIndexReorderCommit([
            { element, zIndex: 2, id: "a", sourceFile: "index.html", key: "a" },
          ]);
        } catch (error) {
          rejection = error;
        }
      });

      expect(rejection).toBeInstanceOf(Error);
      expect((rejection as Error).message).toBe("Invalid atomic element patch response");
      expect(rendered.recordEdit).not.toHaveBeenCalled();
      expect(rendered.reloadPreview).toHaveBeenCalledTimes(1);
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          requestUrl(input).endsWith("/file-mutations/patch-element-batches"),
        ),
      ).toHaveLength(1);
    } finally {
      rendered.cleanup();
    }
  });
});

async function commitStyleAgainst(response: Parameters<typeof stubPatchFetch>[0]) {
  stubPatchFetch(response);
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { iframe, element } = createPreviewElement();
  const rendered = renderDomEditCommits(createSelection(element), iframe);
  let outcome: Awaited<ReturnType<typeof rendered.hook.handleDomStyleCommit>> | undefined;
  await act(async () => {
    outcome = await rendered.hook.handleDomStyleCommit("color", "blue");
  });
  return {
    element,
    outcome,
    rendered,
    warnSpy,
    cleanup: () => {
      warnSpy.mockRestore();
      rendered.cleanup();
    },
  };
}

function renderStyleCommitWithFetch(fetchHandler: FetchHandler) {
  const fetchMock = vi.fn(fetchHandler);
  vi.stubGlobal("fetch", fetchMock);
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { iframe, element } = createPreviewElement();
  const rendered = renderDomEditCommits(createSelection(element), iframe);
  return {
    element,
    fetchMock,
    rendered,
    warnSpy,
    cleanup: () => {
      warnSpy.mockRestore();
      rendered.cleanup();
    },
  };
}

/**
 * Adding or removing a text layer, which no per-child operation can express.
 *
 * Both used to be refused outright — the panel offered the buttons and neither
 * could ever save — so this asserts the opposite of what it used to: one
 * `rich-text` operation carrying the element's new markup, and no complaint.
 */
async function expectPersistedTextStructureEdit(
  commit: (hook: ReturnType<typeof useDomEditCommits>) => Promise<unknown>,
  expectedMarkup: (markup: string) => void,
): Promise<void> {
  const fetchMock = stubPatchFetch({
    ok: true,
    changed: true,
    matched: true,
    content: '<div data-hf-id="hf-card"><span>First</span></div>',
  });
  const { iframe, element } = createPreviewElement(
    '<div data-hf-id="hf-card"><span>First</span><span>Second</span></div>',
  );
  const selection = createSelection(element, {
    textFields: [
      textField({ key: "first", value: "First", source: "child" }),
      textField({ key: "second", value: "Second", source: "child" }),
    ],
  });
  const rendered = renderDomEditCommits(selection, iframe);

  try {
    await act(async () => {
      await commit(rendered.hook);
    });

    const patchPost = fetchMock.mock.calls.find((call) =>
      requestUrl(call[0]).includes("/file-mutations/patch-element/"),
    );
    expect(patchPost).toBeDefined();
    const body = JSON.parse(String(patchPost?.[1]?.body)) as {
      operations: Array<{ type: string; value?: string }>;
    };
    expect(body.operations).toHaveLength(1);
    expect(body.operations[0]?.type).toBe("rich-text");
    expectedMarkup(body.operations[0]?.value ?? "");
    expect(rendered.showToast).not.toHaveBeenCalled();
  } finally {
    rendered.cleanup();
  }
}

describe("useDomEditCommits rich-text persist handling", () => {
  beforeEach(() => {
    ensureCssEscape();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("restores the session snapshot when rich-text persistence fails", async () => {
    stubPatchFetch({ ok: true, changed: false, matched: false });
    const previousHtml = '<span style="color: red">Before</span>';
    const html = '<span style="color: blue">After</span>';
    const { iframe, element } = createPreviewElement(`<div data-hf-id="hf-card">${html}</div>`);
    const rendered = renderDomEditCommits(createSelection(element), iframe);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await act(async () => {
        await rendered.hook.handleDomRichTextCommit({ element, html, previousHtml });
      });

      expect(element.innerHTML).toBe(previousHtml);
      expect(rendered.showToast).toHaveBeenCalledWith(
        expect.stringMatching(/Couldn't save "Hero title"/),
        "error",
      );
    } finally {
      warnSpy.mockRestore();
      rendered.cleanup();
    }
  });

  it("does not retarget a commit onto a replacement preview node, and says the text was not saved", async () => {
    const fetchMock = stubPatchFetch({ ok: true, changed: true, matched: true });
    const html = '<span style="color: blue">After</span>';
    const { iframe, element } = createPreviewElement(`<div data-hf-id="hf-card">${html}</div>`);
    const rendered = renderDomEditCommits(createSelection(element), iframe);
    const replacement = document.createElement("div");
    replacement.dataset.hfId = "hf-card";
    replacement.innerHTML = "Reloaded elsewhere";
    element.replaceWith(replacement);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await act(async () => {
        await rendered.hook.handleDomRichTextCommit({
          element,
          html,
          previousHtml: "Before",
        });
      });

      expect(replacement.innerHTML).toBe("Reloaded elsewhere");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(rendered.showToast).toHaveBeenCalledWith(
        expect.stringMatching(
          /Couldn't save the text edit: the text's element is gone from the preview/,
        ),
        "error",
      );
    } finally {
      errorSpy.mockRestore();
      rendered.cleanup();
    }
  });
});

describe("useDomEditCommits style persist handling", () => {
  beforeEach(() => {
    ensureCssEscape();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("toasts and reverts a style commit when the server cannot resolve the source element", async () => {
    const { element, rendered, cleanup } = await commitStyleAgainst({
      ok: true,
      changed: false,
      matched: false,
    });

    try {
      expect(rendered.showToast).toHaveBeenCalledWith(
        expect.stringMatching(/Couldn't save "Hero title": Couldn't find this element/),
        "error",
      );
      expect(element.style.getPropertyValue("color")).toBe("red");
      expect(trackStudioEvent).toHaveBeenCalledWith(
        "save_skipped_unresolvable",
        expect.objectContaining({ target_source_file: "index.html" }),
      );
    } finally {
      cleanup();
    }
  });

  it("warns without a toast when the server matched the element but reported no change", async () => {
    const { rendered, outcome, warnSpy, cleanup } = await commitStyleAgainst({
      ok: true,
      changed: false,
      matched: true,
      path: "index.html",
      version: '"sha256:current"',
    });

    try {
      expect(rendered.showToast).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        "[Studio] DOM edit persist no-op",
        expect.objectContaining({ operations: "inline-style:color" }),
      );
      expect(outcome).toEqual({
        ok: true,
        persistence: {
          sourceFile: "index.html",
          version: '"sha256:current"',
          changed: false,
        },
      });
    } finally {
      cleanup();
    }
  });

  it("rebinds the paused preview after a saved optimistic style commit", async () => {
    stubPatchFetch({
      ok: true,
      changed: true,
      matched: true,
      path: "index.html",
      version: '"sha256:changed"',
    });
    const { iframe, element } = createPreviewElement();
    const seek = vi.fn();
    const forceTimelineRebind = vi.fn();
    Object.defineProperty(iframe.contentWindow, "__player", {
      configurable: true,
      value: { seek },
    });
    Object.defineProperty(iframe.contentWindow, "__hfForceTimelineRebind", {
      configurable: true,
      value: forceTimelineRebind,
    });
    usePlayerStore.setState({ currentTime: 2.4 });
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      await act(async () => {
        await rendered.hook.handleDomStyleCommit("color", "blue");
      });

      expect(seek).toHaveBeenCalledWith(2.4);
      expect(forceTimelineRebind).toHaveBeenCalledTimes(1);
      expect(rendered.reloadPreview).not.toHaveBeenCalled();
    } finally {
      rendered.cleanup();
      usePlayerStore.getState().reset();
    }
  });

  it("toasts and reverts a style commit when the patch request rejects", async () => {
    const { element, rendered, cleanup } = await commitStyleAgainst(new Error("network down"));

    try {
      expect(rendered.showToast).toHaveBeenCalledWith(
        'Couldn\'t save "Hero title": network down',
        "error",
      );
      expect(element.style.getPropertyValue("color")).toBe("red");
    } finally {
      cleanup();
    }
  });

  it("keeps the optimistic style and records history when the patch succeeds", async () => {
    const { element, rendered, outcome, cleanup } = await commitStyleAgainst({
      ok: true,
      changed: true,
      matched: true,
      content: '<div data-hf-id="hf-card" style="color: blue">Card</div>',
      path: "index.html",
      version: '"sha256:after"',
    });

    try {
      expect(rendered.showToast).not.toHaveBeenCalled();
      expect(element.style.getPropertyValue("color")).toBe("blue");
      expect(rendered.recordEdit).toHaveBeenCalledTimes(1);
      expect(outcome).toEqual({
        ok: true,
        persistence: {
          sourceFile: "index.html",
          version: '"sha256:after"',
          changed: true,
        },
      });
    } finally {
      cleanup();
    }
  });

  it("serializes the full read, write, and history transaction across overlapping commits", async () => {
    const firstPatch = createDeferred<Response>();
    let readCount = 0;
    let patchCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const url = requestUrl(input);
        if (url.includes("/api/projects/p1/files/")) {
          readCount += 1;
          return jsonResponse({
            content:
              readCount === 1
                ? '<div data-hf-id="hf-card" style="color: red">Card</div>'
                : '<div data-hf-id="hf-card" style="color: blue">Card</div>',
          });
        }
        if (url.includes("/api/projects/p1/file-mutations/patch-element/")) {
          patchCount += 1;
          if (patchCount === 1) return firstPatch.promise;
          return jsonResponse({
            ok: true,
            changed: true,
            matched: true,
            content: '<div data-hf-id="hf-card" style="color: green">Card</div>',
            path: "index.html",
            version: '"sha256:green"',
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    const queue = createDomEditSaveQueue();
    const { iframe, element } = createPreviewElement();
    const rendered = renderDomEditCommits(createSelection(element), iframe, {
      queueDomEditSave: queue.enqueue,
    });

    try {
      const first = rendered.hook.handleDomStyleCommit("color", "blue");
      await flushAsyncWork();
      const second = rendered.hook.handleDomStyleCommit("color", "green");
      await flushAsyncWork();

      expect(readCount).toBe(1);
      expect(patchCount).toBe(1);

      firstPatch.resolve(
        jsonResponse({
          ok: true,
          changed: true,
          matched: true,
          content: '<div data-hf-id="hf-card" style="color: blue">Card</div>',
          path: "index.html",
          version: '"sha256:blue"',
        }),
      );
      await first;
      await second;

      expect(readCount).toBe(2);
      expect(patchCount).toBe(2);
      expect(rendered.recordEdit).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          files: {
            "index.html": expect.objectContaining({
              before: expect.stringContaining("color: red"),
              after: expect.stringContaining("color: blue"),
            }),
          },
        }),
      );
      expect(rendered.recordEdit).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          files: {
            "index.html": expect.objectContaining({
              before: expect.stringContaining("color: blue"),
              after: expect.stringContaining("color: green"),
            }),
          },
        }),
      );
    } finally {
      queue.destroy();
      rendered.cleanup();
    }
  });

  it("refuses queued persistence after the active project changes", async () => {
    const firstPatch = createDeferred<Response>();
    const projectIdRef: MutableRefObject<string | null> = { current: "p1" };
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = requestUrl(input);
      if (url.includes("/api/projects/p1/files/")) {
        return jsonResponse({
          content: '<div data-hf-id="hf-card" style="color: red">Card</div>',
        });
      }
      if (url.includes("/api/projects/p1/file-mutations/patch-element/")) {
        return firstPatch.promise;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const queue = createDomEditSaveQueue();
    const { iframe, element } = createPreviewElement();
    const rendered = renderDomEditCommits(createSelection(element), iframe, {
      queueDomEditSave: queue.enqueue,
      projectIdRef,
    });

    try {
      const first = rendered.hook.handleDomStyleCommit("color", "blue");
      await flushAsyncWork();
      const second = rendered.hook.handleDomStyleCommit("color", "green");
      projectIdRef.current = "p2";
      firstPatch.resolve(
        jsonResponse({
          ok: true,
          changed: true,
          matched: true,
          content: '<div data-hf-id="hf-card" style="color: blue">Card</div>',
          path: "index.html",
          version: '"sha256:blue"',
        }),
      );

      await first;
      await expect(second).resolves.toMatchObject({
        ok: false,
        reason: "persist-failed",
      });
      expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("/p2/"))).toBe(
        false,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      queue.destroy();
      rendered.cleanup();
    }
  });

  it("preserves the SDK cutover version as the style commit's durable evidence", async () => {
    const fetchMock = stubPatchFetch({ ok: true, changed: true, matched: true });
    const { iframe, element } = createPreviewElement();
    const rendered = renderDomEditCommits(createSelection(element), iframe, {
      onTrySdkPersist: async () => ({
        status: "committed",
        version: "sdk-version-2",
        before: "",
        after: "",
      }),
    });

    try {
      let outcome: Awaited<ReturnType<typeof rendered.hook.handleDomStyleCommit>> | undefined;
      await act(async () => {
        outcome = await rendered.hook.handleDomStyleCommit("color", "blue");
      });

      expect(outcome).toEqual({
        ok: true,
        persistence: { sourceFile: "index.html", version: "sdk-version-2", changed: true },
      });
      expect(
        fetchMock.mock.calls.some(([input]) =>
          requestUrl(input).includes("/file-mutations/patch-element/"),
        ),
      ).toBe(false);
    } finally {
      rendered.cleanup();
    }
  });

  it("keeps a newer style value when an older overlapping commit later fails", async () => {
    const firstPatch = createDeferred<Response>();
    const secondPatch = createDeferred<Response>();
    let patchCount = 0;
    const { element, rendered, cleanup } = renderStyleCommitWithFetch(async (input) => {
      const url = requestUrl(input);
      if (url.includes("/api/projects/p1/files/")) {
        return jsonResponse({
          content: '<div data-hf-id="hf-card" style="color: red">Card</div>',
        });
      }
      if (url.includes("/api/projects/p1/file-mutations/patch-element/")) {
        patchCount += 1;
        return patchCount === 1 ? firstPatch.promise : secondPatch.promise;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    try {
      const firstCommit = rendered.hook.handleDomStyleCommit("color", "blue");
      await flushAsyncWork();
      expect(patchCount).toBe(1);

      const secondCommit = rendered.hook.handleDomStyleCommit("color", "green");
      await flushAsyncWork();
      // The newer commit waits for the older one in the file's queue.
      expect(patchCount).toBe(1);

      firstPatch.reject(new Error("server rejected blue"));
      await firstCommit;
      expect(element.style.getPropertyValue("color")).toBe("green");

      await flushAsyncWork();
      expect(patchCount).toBe(2);
      secondPatch.resolve(
        jsonResponse({
          ok: true,
          changed: true,
          matched: true,
          content: '<div data-hf-id="hf-card" style="color: green">Card</div>',
        }),
      );
      await secondCommit;

      expect(element.style.getPropertyValue("color")).toBe("green");
    } finally {
      cleanup();
    }
  });

  it("toasts read failures from the source file fetch", async () => {
    const { rendered, cleanup } = renderStyleCommitWithFetch(async (input) => {
      const url = requestUrl(input);
      if (url.includes("/api/projects/p1/files/")) {
        return new Response("read failed", { status: 503 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    try {
      await act(async () => {
        await rendered.hook.handleDomStyleCommit("color", "blue");
      });

      expect(rendered.showToast).toHaveBeenCalledWith(
        expect.stringContaining("Failed to read index.html (503)"),
        "error",
      );
    } finally {
      cleanup();
    }
  });

  it.each(["style", "text"])(
    "a %s edit with an imported font is one patch request that carries its @font-face",
    async (kind) => {
      const patchedContent =
        '<!doctype html><html><head></head><body><div data-hf-id="hf-card">Card</div></body></html>';
      const fetchMock = stubPatchFetch(
        { ok: true, changed: true, matched: true, content: patchedContent },
        patchedContent,
      );
      const { iframe, element } = createPreviewElement();
      const selection = createSelection(element, {
        textFields: [textField({ key: "self", value: "Card", source: "self", tagName: "div" })],
      });
      const importedFont = {
        family: "Imported",
        path: "fonts/Imported.woff2",
        url: "/api/projects/p1/preview/fonts/Imported.woff2",
      };
      const writeProjectFile = vi.fn(async () => {});
      const rendered = renderDomEditCommits(selection, iframe, {
        writeProjectFile,
        importedFontAssets: [importedFont],
      });

      try {
        await act(async () => {
          if (kind === "style") await rendered.hook.handleDomStyleCommit("font-family", "Imported");
          else
            await rendered.hook.commitDomTextFields(
              selection,
              [textField({ key: "self", value: "Card", source: "self", tagName: "div" })],
              { importedFont },
            );
        });

        const writes = fetchMock.mock.calls.filter(
          ([, init]) => init?.method === "POST" || init?.method === "PUT",
        );
        expect(writes).toHaveLength(1);
        expect(requestUrl(writes[0]![0])).toContain("/file-mutations/patch-element/index.html");
        const body = JSON.parse(String(writes[0]![1]?.body)) as { fontFaceCss?: string };
        expect(body.fontFaceCss).toMatch(
          /^@font-face \{ font-family: "Imported"; src: url\("fonts\/Imported.woff2"\)/,
        );
        expect(writeProjectFile).not.toHaveBeenCalled();
        expect(rendered.showToast).not.toHaveBeenCalled();
      } finally {
        rendered.cleanup();
      }
    },
  );

  it("keeps a rejected patch request (HTTP error) to one toast", async () => {
    const { rendered, cleanup } = renderStyleCommitWithFetch(async (input) => {
      const url = requestUrl(input);
      if (url.includes("/api/projects/p1/files/")) {
        return jsonResponse({
          content: '<div data-hf-id="hf-card" style="color: red">Card</div>',
        });
      }
      if (url.includes("/api/projects/p1/file-mutations/patch-element/")) {
        return jsonResponse({ error: "invalid value", fields: ["style.color"] }, 400);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    try {
      await act(async () => {
        await rendered.hook.handleDomStyleCommit("color", "blue");
      });

      expect(rendered.showToast).toHaveBeenCalledTimes(1);
      expect(rendered.showToast).toHaveBeenCalledWith(
        "Couldn't save edit: invalid value (style.color)",
        "error",
      );
    } finally {
      cleanup();
    }
  });

  it("keeps the unsafe-value path to one toast", async () => {
    stubPatchFetch({
      ok: true,
      changed: true,
      matched: true,
      content: '<div data-hf-id="hf-card" style="color: blue">Card</div>',
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { iframe, element } = createPreviewElement();
    const rendered = renderDomEditCommits(createSelection(element, { id: null }), iframe);

    try {
      await act(async () => {
        await rendered.hook.handleDomStyleCommit("color", "blue");
      });

      expect(rendered.showToast).toHaveBeenCalledTimes(1);
      expect(rendered.showToast).toHaveBeenCalledWith(
        "Couldn't save edit because it contains invalid layout values",
        "error",
      );
    } finally {
      warnSpy.mockRestore();
      rendered.cleanup();
    }
  });

  it("persists an added child text field as the element's new markup", async () => {
    await expectPersistedTextStructureEdit(
      (hook) => hook.handleDomAddTextField("first"),
      (markup) => {
        expect(markup).toContain("First");
        expect(markup).toContain("Second");
        // The layer that was added, between the two that were there.
        expect(markup.match(/<span/g) ?? []).toHaveLength(3);
      },
    );
  });

  it("persists a removed child text field as the element's new markup", async () => {
    await expectPersistedTextStructureEdit(
      (hook) => hook.handleDomRemoveTextField("first"),
      (markup) => {
        expect(markup).not.toContain("First");
        expect(markup).toContain("Second");
      },
    );
  });

  it("keeps single self text commits on the text-content path", async () => {
    stubPatchFetch({
      ok: true,
      changed: true,
      matched: true,
      content: '<div data-hf-id="hf-card">A &lt; B</div>',
    });
    const { iframe, element } = createPreviewElement('<div data-hf-id="hf-card">Card</div>');
    const selection = createSelection(element, {
      textFields: [textField({ key: "self", value: "Card", source: "self", tagName: "div" })],
    });
    const rendered = renderDomEditCommits(selection, iframe);

    try {
      await act(async () => {
        await rendered.hook.handleDomTextCommit("A < B", "self");
      });

      expect(rendered.showToast).not.toHaveBeenCalled();
      expect(rendered.recordEdit).toHaveBeenCalledTimes(1);
      expect(element.textContent).toBe("A < B");
    } finally {
      rendered.cleanup();
    }
  });

  it("reverts and toasts a text commit when the server rejects the patch", async () => {
    stubPatchFetch(new Error("network down"));
    const { iframe, element } = createPreviewElement('<div data-hf-id="hf-card">Card</div>');
    const selection = createSelection(element, {
      textFields: [textField({ key: "self", value: "Card", source: "self", tagName: "div" })],
    });
    const rendered = renderDomEditCommits(selection, iframe);

    try {
      await act(async () => {
        await rendered.hook.handleDomTextCommit("Updated", "self");
      });

      expect(rendered.showToast).toHaveBeenCalledWith(
        'Couldn\'t save "Hero title": network down',
        "error",
      );
      expect(element.textContent).toBe("Card");
      expect(rendered.recordEdit).not.toHaveBeenCalled();
    } finally {
      rendered.cleanup();
    }
  });
});

describe("useDomEditCommits attribute persist handling", () => {
  beforeEach(() => {
    ensureCssEscape();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("toasts and reverts a data-attribute commit when the server cannot resolve the source element", async () => {
    stubPatchFetch({ ok: true, changed: false, matched: false });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { iframe, element } = createPreviewElement();
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      await act(async () => {
        await rendered.hook.handleDomAttributeCommit("volume", "0.8");
      });

      expect(rendered.showToast).toHaveBeenCalledWith(
        expect.stringMatching(/Couldn't save "Hero title": Couldn't find this element/),
        "error",
      );
      expect(element.getAttribute("data-volume")).toBeNull();
    } finally {
      warnSpy.mockRestore();
      rendered.cleanup();
    }
  });

  it("toasts and reverts a data-attribute commit when the patch request rejects", async () => {
    stubPatchFetch(new Error("network down"));
    const { iframe, element } = createPreviewElement();
    element.setAttribute("data-volume", "0.5");
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      await act(async () => {
        await rendered.hook.handleDomAttributeCommit("volume", "0.8");
      });

      expect(rendered.showToast).toHaveBeenCalledWith(
        'Couldn\'t save "Hero title": network down',
        "error",
      );
      expect(element.getAttribute("data-volume")).toBe("0.5");
    } finally {
      rendered.cleanup();
    }
  });

  it("applies a preview-only write without persisting it", async () => {
    // What a drag needs from every pointermove: the preview and the audio graph
    // follow, the file does not. Persisting each move filled the undo stack with
    // fragments of one gesture — and because those writes race, a follow-up's
    // "before" often was not the previous entry's "after", so history refused to
    // coalesce them and undo took back a few milliseconds of the drag.
    const fetchSpy = stubPatchFetch({ ok: true, changed: true, matched: true });
    const { iframe, element } = createPreviewElement();
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      await act(async () => {
        await rendered.hook.handleDomAttributeLiveCommit("volume", "0.7", undefined, {
          previewOnly: true,
        });
      });
      expect(element.getAttribute("data-volume")).toBe("0.7");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      rendered.cleanup();
    }
  });

  it("still persists a live write that does not ask to be preview-only", async () => {
    const fetchSpy = stubPatchFetch({ ok: true, changed: true, matched: true });
    const { iframe, element } = createPreviewElement();
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      await act(async () => {
        await rendered.hook.handleDomAttributeLiveCommit("volume", "0.7");
      });
      expect(fetchSpy).toHaveBeenCalled();
    } finally {
      rendered.cleanup();
    }
  });

  it("sets and removes data-audio-group like any other data attribute", async () => {
    stubPatchFetch({ ok: true, changed: true, matched: true });
    const { iframe, element } = createPreviewElement();
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      await act(async () => {
        await rendered.hook.handleDomAttributeLiveCommit("audio-group", "voiceover", undefined, {
          previewOnly: true,
        });
      });
      expect(element.getAttribute("data-audio-group")).toBe("voiceover");

      await act(async () => {
        await rendered.hook.handleDomAttributeLiveCommit("audio-group", "", undefined, {
          previewOnly: true,
        });
      });
      expect(element.getAttribute("data-audio-group")).toBeNull();
    } finally {
      rendered.cleanup();
    }
  });

  it("keeps a data-attribute commit on success", async () => {
    stubPatchFetch({
      ok: true,
      changed: true,
      matched: true,
      content: '<div data-hf-id="hf-card" data-volume="0.8">Card</div>',
    });
    const { iframe, element } = createPreviewElement();
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      await act(async () => {
        await rendered.hook.handleDomAttributeCommit("volume", "0.8");
      });

      expect(rendered.showToast).not.toHaveBeenCalled();
      expect(element.getAttribute("data-volume")).toBe("0.8");
    } finally {
      rendered.cleanup();
    }
  });

  it("toasts and reverts an html-attribute commit when the patch request rejects", async () => {
    stubPatchFetch(new Error("network down"));
    const { iframe, element } = createPreviewElement();
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      await act(async () => {
        await rendered.hook.handleDomHtmlAttributeCommit("muted", "true");
      });

      expect(rendered.showToast).toHaveBeenCalledWith(
        'Couldn\'t save "Hero title": network down',
        "error",
      );
      expect(element.getAttribute("muted")).toBeNull();
    } finally {
      rendered.cleanup();
    }
  });

  it("keeps a newer html-attribute value when an older overlapping commit later fails", async () => {
    const first = createDeferred<Response>();
    let call = 0;
    const { iframe, element } = createPreviewElement();
    const rendered = renderDomEditCommits(createSelection(element), iframe);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const url = requestUrl(input);
        if (url.includes("/api/projects/p1/files/")) {
          return jsonResponse({ content: '<div data-hf-id="hf-card"></div>' });
        }
        call += 1;
        if (call === 1) return first.promise;
        return jsonResponse({ ok: true, changed: true, matched: true, content: "" });
      }),
    );

    try {
      // Older commit's persist stays pending (captures previousValue=null); the
      // newer commit captures previousValue="first-value" (the older commit's
      // optimistic apply) and is still queued when the older one rejects. Without the
      // per-key version guard, the stale rejection would revert to the older
      // commit's own previousValue (null) and stomp the newer commit's value.
      const firstCommit = rendered.hook.handleDomHtmlAttributeCommit("muted", "first-value");
      await act(async () => {
        const secondCommit = rendered.hook.handleDomHtmlAttributeCommit("muted", "second-value");
        first.reject(new Error("stale request failed"));
        await firstCommit;
        await secondCommit;
      });

      expect(element.getAttribute("muted")).toBe("second-value");
    } finally {
      rendered.cleanup();
    }
  });
});

describe("useDomEditCommits attribute batch commit", () => {
  beforeEach(() => {
    ensureCssEscape();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  const original = '<video data-hf-id="hf-card" data-has-audio="true"></video>';
  const patched = '<video data-hf-id="hf-card" muted></video>';
  const mute = [
    { type: "html-attribute" as const, property: "muted", value: "true" },
    { type: "attribute" as const, property: "has-audio", value: null },
  ];

  it("sends mixed html and data attribute ops in ONE patch and ONE undo entry", async () => {
    const fetchMock = stubPatchFetch(
      {
        ok: true,
        changed: true,
        matched: true,
        content: patched,
        path: "index.html",
        version: "v2",
      },
      original,
    );
    const { iframe, element } = createPreviewElement(original);
    const rendered = renderDomEditCommits(createSelection(element, { tagName: "video" }), iframe);

    try {
      let ok = false;
      await act(async () => {
        ok = await rendered.hook.handleDomAttributeBatchCommit(
          createSelection(element, { tagName: "video" }),
          mute,
          { label: "Edit muted" },
        );
      });

      const patches = fetchMock.mock.calls.filter(([input]) =>
        requestUrl(input).includes("/file-mutations/patch-element/"),
      );
      expect(ok).toBe(true);
      expect(patches).toHaveLength(1);
      const body = JSON.parse(String(patches[0]?.[1]?.body));
      expect(body.operations).toEqual(mute);
      expect(rendered.recordEdit).toHaveBeenCalledTimes(1);
      expect(rendered.recordEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          files: { "index.html": { before: original, after: patched } },
        }),
      );
      expect(rendered.reloadPreview).toHaveBeenCalledTimes(1);
      expect(element.hasAttribute("muted")).toBe(true);
      expect(element.hasAttribute("data-has-audio")).toBe(false);
    } finally {
      rendered.cleanup();
    }
  });

  it("folds a document-level prepareContent into the same single undo entry", async () => {
    stubPatchFetch(
      {
        ok: true,
        changed: true,
        matched: true,
        content: patched,
        path: "index.html",
        version: "v2",
      },
      original,
    );
    const writes: string[] = [];
    const { iframe, element } = createPreviewElement(original);
    const rendered = renderDomEditCommits(createSelection(element), iframe, {
      writeProjectFile: async (_path, content) => {
        writes.push(content);
      },
    });
    const withSibling = `<audio id="a"></audio>${patched}`;

    try {
      await act(async () => {
        await rendered.hook.handleDomAttributeBatchCommit(createSelection(element), mute, {
          label: "Remove background",
          prepareContent: () => withSibling,
        });
      });

      expect(writes).toEqual([withSibling]);
      expect(rendered.recordEdit).toHaveBeenCalledTimes(1);
      expect(rendered.recordEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          label: "Remove background",
          files: { "index.html": { before: original, after: withSibling } },
        }),
      );
    } finally {
      rendered.cleanup();
    }
  });

  it("reverts every op in the batch and reports failure when the patch rejects", async () => {
    stubPatchFetch(new Error("network down"), original);
    const { iframe, element } = createPreviewElement(original);
    const rendered = renderDomEditCommits(createSelection(element), iframe);

    try {
      let ok = true;
      await act(async () => {
        ok = await rendered.hook.handleDomAttributeBatchCommit(createSelection(element), mute, {
          label: "Edit muted",
        });
      });

      expect(ok).toBe(false);
      expect(element.hasAttribute("muted")).toBe(false);
      expect(element.getAttribute("data-has-audio")).toBe("true");
    } finally {
      rendered.cleanup();
    }
  });
});
