// @vitest-environment happy-dom
// Imports DOM editing the way a host app does: by package name, mounted outside EditorShell.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  ConnectedDomEditOverlay,
  DomEditProvider,
  PreviewReadOnlyProvider,
  useDomEditSelectionContext,
  useDomEditSession,
  useDomEditZOrder,
  usePreviewPersistence,
  type ConnectedDomEditOverlayProps,
  type DomEditCapabilities,
  type DomEditSelection,
  type DomEditZOrder,
  type UseDomEditSessionParams,
  type UsePreviewPersistenceParams,
  type ZOrderAction,
} from "@hyperframes/studio";
import { makeSelection } from "./hooks/domSelectionTestHarness";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("DOM editing package exports", () => {
  it("exposes the session and persistence hooks with their params types", () => {
    expect(typeof useDomEditSession).toBe("function");
    expect(typeof usePreviewPersistence).toBe("function");
    expectTypeOf<UseDomEditSessionParams>().toHaveProperty("writeProjectFile");
    expectTypeOf<UsePreviewPersistenceParams>().toHaveProperty("recordEdit");
    expectTypeOf<DomEditSelection>().toHaveProperty("capabilities");
    expectTypeOf<DomEditCapabilities>().toHaveProperty("canApplyManualOffset");
    expectTypeOf<ConnectedDomEditOverlayProps>().toHaveProperty("canvasInput");
  });

  it("mounts the connected overlay in host mode inside a host's providers", async () => {
    const seen: Array<DomEditSelection | null> = [];
    function Probe() {
      seen.push(useDomEditSelectionContext().domEditSelection);
      return null;
    }
    const session = {
      domEditSelection: null,
      domEditGroupSelections: [],
      domEditHoverSelection: null,
      previewIframeRef: { current: null },
      handlePreviewCanvasPointerLeave: vi.fn(),
    } as unknown as Parameters<typeof DomEditProvider>[0]["value"];
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    await act(async () =>
      root.render(
        <PreviewReadOnlyProvider readOnly={false}>
          <DomEditProvider value={session}>
            <Probe />
            <ConnectedDomEditOverlay
              activeCompositionPath={null}
              showHoverSelection={false}
              shouldShowSelectedDomBounds={true}
              canvasInput="host"
            />
          </DomEditProvider>
        </PreviewReadOnlyProvider>,
      ),
    );
    expect(seen.at(-1)).toBeNull();
    const canvas = el.querySelector('[aria-label="Composition canvas"]');
    expect(canvas?.className).toContain("pointer-events-none");
    await act(async () => root.unmount());
  });

  it("gives a host the canvas menu's z-order: enabled, then one step through the session's commit", async () => {
    const parent = document.createElement("div");
    const back = document.createElement("div");
    back.id = "back";
    const front = document.createElement("div");
    front.id = "front";
    parent.append(back, front);
    document.body.append(parent);
    const commitZ = vi.fn(async () => ({ durable: true, changed: true }));
    const session = {
      handleDomZIndexReorderCommit: commitZ,
    } as unknown as Parameters<typeof DomEditProvider>[0]["value"];
    let zOrder: DomEditZOrder | undefined;
    function Probe() {
      zOrder = useDomEditZOrder();
      return null;
    }
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    await act(async () =>
      root.render(
        <DomEditProvider value={session}>
          <Probe />
        </DomEditProvider>,
      ),
    );
    const sel = makeSelection("Back", back);
    const toFront: ZOrderAction = "bring-to-front";
    expect(zOrder?.enabled(sel, "send-to-back")).toBe(false);
    expect(zOrder?.enabled(sel, toFront)).toBe(true);
    expect(zOrder?.apply(sel, "send-to-back")).toBe(false);
    expect(commitZ).not.toHaveBeenCalled();
    await act(async () => {
      expect(zOrder?.apply(sel, toFront)).toBe(true);
    });
    expect(trackStudioEvent).toHaveBeenCalledWith("feature_used", {
      feature: "z_order",
      surface: "preview",
      method: "button",
    });
    expect(commitZ).toHaveBeenCalledTimes(1);
    expect(commitZ).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ element: back, id: "back" })]),
      expect.stringContaining(toFront),
      toFront,
    );
    await act(async () => root.unmount());
    parent.remove();
  });

  it("gives a read-only preview or a detached element no z-order, and never asks the session", async () => {
    const parent = document.createElement("div");
    const back = document.createElement("div");
    back.id = "back";
    parent.append(back, document.createElement("div"));
    document.body.append(parent);
    const commitZ = vi.fn(() => Promise.resolve());
    const session = {
      handleDomZIndexReorderCommit: commitZ,
    } as unknown as Parameters<typeof DomEditProvider>[0]["value"];
    let zOrder: DomEditZOrder | undefined;
    function Probe() {
      zOrder = useDomEditZOrder();
      return null;
    }
    const el = document.body.appendChild(document.createElement("div"));
    const root = createRoot(el);
    const mount = (readOnly: boolean) =>
      act(async () =>
        root.render(
          <PreviewReadOnlyProvider readOnly={readOnly}>
            <DomEditProvider value={session}>
              <Probe />
            </DomEditProvider>
          </PreviewReadOnlyProvider>,
        ),
      );
    const sel = makeSelection("Back", back);
    await mount(true);
    expect(zOrder?.enabled(sel, "bring-to-front")).toBe(false);
    expect(zOrder?.apply(sel, "bring-to-front")).toBe(false);
    expect(zOrder?.commit(sel, [{ element: back, zIndex: 1 }], "bring-to-front", null)).toBe(false);
    await mount(false);
    // A reload leaves the old nodes connected to their old document, one no window shows.
    document.implementation.createHTMLDocument().body.append(parent);
    expect(back.isConnected).toBe(true);
    expect(zOrder?.enabled(sel, "bring-to-front"), "a selection from before a reload").toBe(false);
    expect(zOrder?.apply(sel, "bring-to-front")).toBe(false);
    expect(commitZ).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});

vi.mock("./utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
import { trackStudioEvent } from "./utils/studioTelemetry";
