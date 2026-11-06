/**
 * Shared fixtures for the WebMCP tool tests.
 *
 * Not a `.test` file so vitest does not collect it as a suite. Mirrors the
 * existing `hooks/domSelectionTestHarness.ts` convention.
 */

import { isHtmlElement } from "@hyperframes/core/runtime/dom-realm";
import { expect } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { ToolFailure, ToolResult } from "./toolResult";
import type { StudioLookSnapshot } from "./tools/lookTools";
import type { SelectionToolDeps } from "./tools/selectionTools";
import type { StudioAgentToolsDeps } from "./useStudioAgentTools";
import { mintElementHandle } from "./handles";
import type { TargetedWriteDeps } from "./writeCoordinator";

/**
 * An element inside a real iframe, which is where Studio's chrome expects to
 * find preview elements. The separate realm matters: a preview element is not
 * an instance of Studio's own `HTMLElement`.
 */
export function previewDoc(html: string): Document {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("expected iframe document");
  doc.body.innerHTML = html;
  return doc;
}

export function previewElement(html: string, id: string): HTMLElement {
  const doc = previewDoc(html);
  const element = doc.getElementById(id);
  if (!isHtmlElement(element)) {
    throw new Error(`expected preview element #${id}`);
  }
  return element;
}

export function selectionFor(
  element: HTMLElement,
  overrides: Partial<DomEditSelection> = {},
): DomEditSelection {
  return {
    id: element.id || undefined,
    hfId: element.getAttribute("data-hf-id") ?? undefined,
    element,
    label: "Headline",
    tagName: element.tagName.toLowerCase(),
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 40, y: 12, width: 880, height: 96 },
    textContent: element.textContent,
    dataAttributes: { "data-role": "title" },
    inlineStyles: { color: "red" },
    computedStyles: { "font-size": "42.7px", color: "rgb(255, 0, 0)" },
    textFields: [
      {
        key: "self",
        label: "Text",
        value: element.textContent ?? "",
        tagName: element.tagName.toLowerCase(),
        attributes: [],
        inlineStyles: {},
        computedStyles: {},
        source: "self",
      },
    ],
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
    ...overrides,
  };
}

export function selectionToolDeps(overrides: Partial<SelectionToolDeps> = {}): SelectionToolDeps {
  return {
    getPreviewDocument: () => null,
    getCompositionPath: () => "index.html",
    getProjectId: () => "project-a",
    buildSelection: async (element) => selectionFor(element),
    applySelection: () => undefined,
    requestSeek: () => undefined,
    readPlayhead: () => ({ currentTime: 0, duration: 10, isPlaying: false }),
    ...overrides,
  };
}

export function sourceHandle(domId: string, projectId = "project-a"): string {
  const handle = mintElementHandle({
    projectId,
    domId,
    sourceFile: "index.html",
    activeCompositionPath: "index.html",
  });
  if (!handle) throw new Error(`expected source handle for #${domId}`);
  return handle;
}

export function targetedWriteDeps(selection: DomEditSelection): TargetedWriteDeps {
  return {
    getPreviewDocument: () => selection.element.ownerDocument,
    getProjectId: () => "project-a",
    getWriteBlockedReason: () => null,
    buildSelection: async () => selection,
    applySelection: () => undefined,
  };
}

export function expectOk<T>(result: ToolResult<T>): { ok: true } & T {
  expect(result.ok, `expected ok, got ${JSON.stringify(result)}`).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  return result;
}

export function expectFailure(result: ToolResult<unknown>): ToolFailure {
  expect(result.ok, `expected failure, got ${JSON.stringify(result)}`).toBe(false);
  if (result.ok) throw new Error("unreachable");
  return result;
}

/** A Studio snapshot with nothing in it; override only what the test is about. */
export function lookSnapshot(overrides: Partial<StudioLookSnapshot> = {}): StudioLookSnapshot {
  return {
    projectId: "demo",
    compositionPath: "index.html",
    currentTime: 0,
    duration: 10,
    isPlaying: false,
    elements: [],
    scene: { status: "ready", items: [], drillInItem: null },
    selection: null,
    selectionAnimationCount: 0,
    history: { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null },
    ...overrides,
  };
}

/** Full `useStudioAgentTools` deps with inert defaults; override only what the test is about. */
export function studioAgentToolsDeps(
  overrides: Partial<StudioAgentToolsDeps> = {},
): StudioAgentToolsDeps {
  return {
    getSnapshot: () => lookSnapshot(),
    getPreviewDocument: () => null,
    buildSelection: async () => null,
    applySelection: () => undefined,
    requestSeek: () => undefined,
    readPlayhead: () => ({ currentTime: 0, duration: 10, isPlaying: false }),
    getProjectId: () => "demo",
    getCompositionPath: () => "index.html",
    probeFrame: async () => ({ ok: true, status: 200 }),
    wait: async () => undefined,
    getCurrentSelection: () => null,
    getWriteBlockedReason: () => null,
    setText: async () => ({ ok: true }),
    setStyle: async () => ({ ok: true }),
    readBox: () => ({ x: 0, y: 0, width: 100, height: 50 }),
    moveTo: async () => undefined,
    resizeTo: async () => undefined,
    rotateTo: async () => undefined,
    addAnimation: async () => true,
    updateAnimation: async () => true,
    addKeyframe: async () => undefined,
    deleteAnimation: async () => true,
    getAnimationsForSelection: async () => [],
    getGsapDiagnostics: () => ({
      animations: [],
      multipleTimelines: false,
      unsupportedTimelinePattern: false,
    }),
    ...overrides,
  };
}
