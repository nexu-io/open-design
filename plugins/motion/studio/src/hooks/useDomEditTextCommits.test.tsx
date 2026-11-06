// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomEditSelection, DomEditTextField } from "../components/editor/domEditing";
import { mountReactHarness } from "./domSelectionTestHarness";
import { useDomEditTextCommits, type UseDomEditTextCommitsParams } from "./useDomEditTextCommits";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] | undefined;
  let reject: Deferred<T>["reject"] | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  if (!resolve || !reject) throw new Error("deferred callbacks were not initialized");
  return { promise, resolve, reject };
}

function textField(value: string): DomEditTextField {
  return {
    key: "self",
    label: "Text",
    value,
    tagName: "div",
    attributes: [],
    inlineStyles: {},
    computedStyles: {},
    source: "self",
  };
}

function selectionFor(element: HTMLElement): DomEditSelection {
  return {
    id: element.id,
    element,
    label: "Card",
    tagName: "div",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    textContent: element.textContent,
    dataAttributes: {},
    inlineStyles: {},
    computedStyles: {},
    textFields: [textField(element.textContent ?? "")],
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
  };
}

/** A preview element inside a real iframe, which is where Studio's chrome expects to find it. */
function previewElement(
  html: string,
  id: string,
): { iframe: HTMLIFrameElement; element: HTMLElement } {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("expected iframe document");
  doc.body.innerHTML = html;
  const element = doc.getElementById(id);
  const HTMLElementCtor = doc.defaultView?.HTMLElement;
  if (!HTMLElementCtor || !(element instanceof HTMLElementCtor)) {
    throw new Error("expected preview element");
  }
  return { iframe, element };
}

/** Hook params with nothing selected and a writer that succeeds; override what the test is about. */
function commitParams(
  overrides: Partial<UseDomEditTextCommitsParams> = {},
): UseDomEditTextCommitsParams {
  return {
    activeCompPath: "index.html",
    previewIframeRef: { current: null },
    showToast: vi.fn(),
    domEditSelection: null,
    applyDomSelection: vi.fn(),
    refreshDomEditSelectionFromPreview: vi.fn(),
    buildDomSelectionFromTarget: vi.fn(async () => null),
    persistDomEditOperations: vi.fn().mockResolvedValue(undefined),
    resolveImportedFontAsset: () => null,
    readOnlyPreview: false,
    ...overrides,
  };
}

let cleanup: (() => void) | null = null;

function renderTextCommitHook(params: UseDomEditTextCommitsParams) {
  const captured: { hook: ReturnType<typeof useDomEditTextCommits> | null } = { hook: null };
  function TextCommitProbe() {
    captured.hook = useDomEditTextCommits(params);
    return null;
  }
  const root = mountReactHarness(<TextCommitProbe />);
  cleanup = () => act(() => root.unmount());
  if (!captured.hook) throw new Error("hook did not initialize");
  return captured.hook;
}

afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("useDomEditTextCommits", () => {
  function richTextProbe(
    html = '<h1 id="t">Old</h1>',
    overrides: (doc: Document) => Partial<UseDomEditTextCommitsParams> = () => ({}),
  ) {
    const { iframe, element } = previewElement(html, "t");
    const persist = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    const base = commitParams({
      previewIframeRef: { current: iframe },
      domEditSelection: selectionFor(element),
      buildDomSelectionFromTarget: vi.fn(async (target: HTMLElement) => selectionFor(target)),
      persistDomEditOperations: persist,
      showToast,
      ...overrides(element.ownerDocument),
    });
    const captured: { hook: ReturnType<typeof useDomEditTextCommits> | null } = { hook: null };
    function Probe({ readOnlyPreview }: { readOnlyPreview: boolean }) {
      captured.hook = useDomEditTextCommits({ ...base, readOnlyPreview });
      return null;
    }
    const root = mountReactHarness(<Probe readOnlyPreview={false} />);
    cleanup = () => act(() => root.unmount());
    const save = captured.hook!.handleDomRichTextCommit;
    const commit = { element, html: "New", previousHtml: "Old" };
    element.innerHTML = "New";
    return {
      root,
      Probe,
      persist,
      showToast,
      element,
      save: () => act(async () => save(commit)),
    };
  }

  it.each([true, false])(
    "counts in-place text only after a changed write (%s)",
    async (changed) => {
      vi.mocked(trackStudioEvent).mockClear();
      const { persist, save } = richTextProbe();
      persist.mockResolvedValue({ changed, sourceFile: "private.html", version: "v2" });
      await save();
      expect(vi.mocked(trackStudioEvent).mock.calls).toEqual(
        changed
          ? [["feature_used", { feature: "text_edit", surface: "preview", method: "field" }]]
          : [],
      );
    },
  );

  it("saves in-place text while the preview is editable, and refreshes the selection it edited", async () => {
    const applyDomSelection = vi.fn();
    const { persist, element, save } = richTextProbe(undefined, () => ({ applyDomSelection }));
    await save();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(applyDomSelection).toHaveBeenCalledWith(
      expect.objectContaining({ element }),
      expect.objectContaining({ preserveGroup: true }),
    );
  });

  it("refuses in-place text once the preview turns read-only, through an earlier handler, and puts the old text back", async () => {
    const { root, Probe, persist, element, save } = richTextProbe();
    act(() => root.render(<Probe readOnlyPreview />));
    await save();
    expect(persist).not.toHaveBeenCalled();
    expect(element.innerHTML).toBe("Old");
  });

  it("saves the edited element, and leaves the selection alone, when the selection is another element or none", async () => {
    for (const selected of ["card", null]) {
      const applyDomSelection = vi.fn();
      const { persist, element, save } = richTextProbe(
        '<div id="card"><p id="t">Old</p></div>',
        (doc) => ({
          domEditSelection: selected ? selectionFor(doc.getElementById(selected)!) : null,
          applyDomSelection,
          buildDomSelectionFromTarget: vi.fn(async (target: HTMLElement) => ({
            ...selectionFor(target),
            label: "Resolved from the edited element",
          })),
        }),
      );
      await save();
      expect(persist).toHaveBeenCalledTimes(1);
      expect(persist.mock.calls[0]![0]).toMatchObject({
        element,
        label: "Resolved from the edited element",
      });
      expect(applyDomSelection).not.toHaveBeenCalled();
      cleanup?.();
      cleanup = null;
    }
  });

  it("says so and puts the old text back when the edited text cannot be saved", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { persist, showToast, element, save } = richTextProbe(undefined, () => ({
      buildDomSelectionFromTarget: vi.fn(async () => null),
    }));
    await save();
    expect(persist).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("Couldn't save"), "error");
    expect(error).toHaveBeenCalled();
    expect(element.innerHTML).toBe("Old");
  });

  it("keeps concurrent text commit ownership isolated by target", async () => {
    const { iframe, element: firstElement } = previewElement(
      "<div id='first'>First</div><div id='second'>Second</div>",
      "first",
    );
    const secondElement = iframe.contentDocument?.getElementById("second") as HTMLElement;
    const firstSelection = selectionFor(firstElement);
    const secondSelection = selectionFor(secondElement);
    const firstPersist = createDeferred<void>();
    const persistDomEditOperations = vi
      .fn()
      .mockImplementationOnce(() => firstPersist.promise)
      .mockResolvedValueOnce(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const hook = renderTextCommitHook(
      commitParams({
        previewIframeRef: { current: iframe },
        domEditSelection: firstSelection,
        persistDomEditOperations,
      }),
    );

    let firstCommit: Promise<unknown> | undefined;
    act(() => {
      firstCommit = hook.handleDomTextCommitForSelection(firstSelection, "Pending first", "self");
    });
    await act(async () => {
      await hook.handleDomTextCommitForSelection(secondSelection, "Saved second", "self");
    });
    firstPersist.reject(new Error("first target failed"));
    await act(async () => {
      await firstCommit;
    });

    expect(firstElement.textContent).toBe("First");
    expect(secondElement.textContent).toBe("Saved second");
  });

  it("does not let a stale failed fields commit revert newer text", async () => {
    const { iframe, element } = previewElement("<div id='card'>Original</div>", "card");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const selection = selectionFor(element);
    const stalePersist = createDeferred<void>();
    const persistDomEditOperations = vi
      .fn()
      .mockImplementationOnce(() => stalePersist.promise)
      .mockResolvedValueOnce(undefined);
    const hook = renderTextCommitHook(
      commitParams({
        previewIframeRef: { current: iframe },
        domEditSelection: selection,
        persistDomEditOperations,
      }),
    );

    let staleCommit: Promise<void> | undefined;
    act(() => {
      staleCommit = hook.commitDomTextFields(selection, [textField("Stale")]);
    });
    await act(async () => {
      await hook.commitDomTextFields(selection, [textField("Newest")]);
    });
    stalePersist.reject(new Error("stale request failed"));
    await act(async () => {
      await staleCommit;
    });

    expect(element.innerHTML).toBe("Newest");
  });

  it("reports persist failure from a style commit instead of resolving silently", async () => {
    const { iframe, element } = previewElement("<div id='card'>Original</div>", "card");
    const selection = selectionFor(element);
    const showToast = vi.fn();
    const hook = renderTextCommitHook(
      commitParams({
        previewIframeRef: { current: iframe },
        showToast,
        domEditSelection: selection,
        persistDomEditOperations: vi.fn().mockRejectedValue(new Error("server said no")),
      }),
    );

    let outcome: unknown;
    await act(async () => {
      outcome = await hook.handleDomStyleCommit("color", "red");
    });

    expect(outcome).toEqual({ ok: false, reason: "persist-failed" });
    // The human-facing behaviour must be unchanged: still toasts, still reverts.
    expect(showToast).toHaveBeenCalled();
    expect(element.style.getPropertyValue("color")).toBe("");
  });

  it("reports a successful style commit", async () => {
    const { iframe, element } = previewElement("<div id='card'>Original</div>", "card");
    const selection = selectionFor(element);
    const persistence = {
      sourceFile: "index.html",
      version: '"sha256:after"',
      changed: true,
    } as const;
    const hook = renderTextCommitHook(
      commitParams({
        previewIframeRef: { current: iframe },
        domEditSelection: selection,
        persistDomEditOperations: vi.fn().mockResolvedValue(persistence),
      }),
    );

    let outcome: unknown;
    await act(async () => {
      outcome = await hook.handleDomStyleCommit("color", "red");
    });

    expect(outcome).toEqual({ ok: true, persistence });
  });

  it("saves a style map on a selection as one patch, so it is one undo step", async () => {
    const { iframe, element } = previewElement("<div id='card'>Original</div>", "card");
    const persist = vi.fn().mockResolvedValue({ sourceFile: "index.html", changed: true });
    const hook = renderTextCommitHook(
      commitParams({
        previewIframeRef: { current: iframe },
        domEditSelection: null,
        persistDomEditOperations: persist,
      }),
    );

    await act(async () => {
      await hook.handleDomStyleCommitForSelection(selectionFor(element), {
        "border-width": "4px",
        "border-style": "solid",
      });
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(element.style.borderWidth).toBe("4px");
    expect(element.style.borderStyle).toBe("solid");
  });

  it("declines a style commit with no selection, without reaching the writer", async () => {
    const persistDomEditOperations = vi.fn().mockResolvedValue(undefined);
    const hook = renderTextCommitHook(
      commitParams({
        domEditSelection: null,
        persistDomEditOperations,
      }),
    );

    let outcome: unknown;
    await act(async () => {
      outcome = await hook.handleDomStyleCommit("color", "red");
    });

    expect(outcome).toEqual({ ok: false, reason: "no-selection" });
    expect(persistDomEditOperations).not.toHaveBeenCalled();
  });

  it("declines a style commit for a manual-geometry property", async () => {
    const persistDomEditOperations = vi.fn().mockResolvedValue(undefined);
    const { element } = previewElement("<div id='card'>Original</div>", "card");
    const hook = renderTextCommitHook(
      commitParams({
        domEditSelection: selectionFor(element),
        persistDomEditOperations,
      }),
    );

    let outcome: unknown;
    await act(async () => {
      // `left` is a manual-geometry property the style path deliberately refuses.
      outcome = await hook.handleDomStyleCommit("left", "10px");
    });

    expect(outcome).toEqual({ ok: false, reason: "geometry-property" });
    expect(persistDomEditOperations).not.toHaveBeenCalled();
  });

  it("declines a style commit when the selection cannot edit styles", async () => {
    const persistDomEditOperations = vi.fn().mockResolvedValue(undefined);
    const { element } = previewElement("<div id='card'>Original</div>", "card");
    const locked = selectionFor(element);
    locked.capabilities = { ...locked.capabilities, canEditStyles: false };
    const hook = renderTextCommitHook(
      commitParams({
        domEditSelection: locked,
        persistDomEditOperations,
      }),
    );

    let outcome: unknown;
    await act(async () => {
      outcome = await hook.handleDomStyleCommit("color", "red");
    });

    expect(outcome).toEqual({ ok: false, reason: "styles-not-editable" });
    expect(persistDomEditOperations).not.toHaveBeenCalled();
  });

  it("reports persist failure from a text commit instead of resolving silently", async () => {
    const { iframe, element } = previewElement("<div id='card'>Original</div>", "card");
    const selection = selectionFor(element);
    const hook = renderTextCommitHook(
      commitParams({
        previewIframeRef: { current: iframe },
        domEditSelection: selection,
        persistDomEditOperations: vi.fn().mockRejectedValue(new Error("server said no")),
      }),
    );

    let outcome: unknown;
    await act(async () => {
      outcome = await hook.handleDomTextCommit("Updated");
    });

    expect(outcome).toEqual({ ok: false, reason: "persist-failed" });
    expect(element.innerHTML).toBe("Original");
  });

  it("reports a text commit declined for an unselected target", async () => {
    const persistDomEditOperations = vi.fn().mockResolvedValue(undefined);
    const hook = renderTextCommitHook(commitParams({ persistDomEditOperations }));

    let outcome: unknown;
    await act(async () => {
      outcome = await hook.handleDomTextCommit("Updated");
    });

    expect(outcome).toEqual({ ok: false, reason: "no-selection" });
    expect(persistDomEditOperations).not.toHaveBeenCalled();
  });

  it("preserves text persistence evidence for an explicit selection", async () => {
    const { iframe, element: ambientElement } = previewElement(
      "<div id='ambient'>Ambient</div><div id='agent'>Agent</div>",
      "ambient",
    );
    const agentElement = iframe.contentDocument?.getElementById("agent") as HTMLElement;
    const ambientSelection = selectionFor(ambientElement);
    const agentSelection = selectionFor(agentElement);
    const persistence = {
      sourceFile: "index.html",
      version: '"sha256:text"',
      changed: true,
    } as const;
    const persistDomEditOperations = vi.fn().mockResolvedValue(persistence);
    const hook = renderTextCommitHook(
      commitParams({
        previewIframeRef: { current: iframe },
        domEditSelection: ambientSelection,
        persistDomEditOperations,
      }),
    );

    let outcome: unknown;
    await act(async () => {
      outcome = await hook.handleDomTextCommitForSelection(agentSelection, "Edited", "self");
    });

    expect(outcome).toEqual({ ok: true, persistence });
    expect(persistDomEditOperations).toHaveBeenCalledWith(
      agentSelection,
      expect.any(Array),
      expect.any(Object),
    );
    expect(ambientElement.textContent).toBe("Ambient");
    expect(agentElement.textContent).toBe("Edited");
  });
});

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
import { trackStudioEvent } from "../utils/studioTelemetry";
