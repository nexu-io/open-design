// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openComposition } from "@hyperframes/sdk";
import type { CompositionVariable } from "@hyperframes/sdk";
import type { DomEditSelection } from "../editor/domEditingTypes";
import { VariablesBindElement } from "./VariablesBindElement";

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => vi.unstubAllGlobals());

const cases = [
  {
    declaration: {
      id: "selected-font",
      label: "Brand font",
      type: "font",
      default: { name: "Brand Sans", source: "assets/brand.css" },
    },
    expected: "Brand Sans",
  },
  {
    declaration: {
      id: "selected",
      label: "Brand logo",
      type: "image",
      default: { url: "assets/logo.svg", alt: "Brand logo", fit: "contain" },
    },
    expected: "assets/logo.svg",
  },
  {
    declaration: { id: "selected-font", label: "Font", type: "font", default: "serif" },
    expected: "serif",
  },
  {
    declaration: { id: "selected", label: "Logo", type: "image", default: "fallback.svg" },
    expected: "fallback.svg",
  },
] satisfies { declaration: CompositionVariable; expected: string }[];

describe("VariablesBindElement existing defaults", () => {
  it.each(cases)(
    "shows $expected when binding to a $declaration.type",
    async ({ declaration, expected }) => {
      const session = await openComposition(
        '<html><body><img id="selected" data-hf-id="hf-selected" src="own.svg"></body></html>',
      );
      session.declareVariable(declaration);
      const selection: DomEditSelection = {
        hfId: "hf-selected",
        element: document.createElement("img"),
        label: "Selected image",
        tagName: "IMG",
        sourceFile: "index.html",
        compositionPath: "index.html",
        isCompositionHost: false,
        isInsideLockedComposition: false,
        boundingBox: { x: 0, y: 0, width: 100, height: 100 },
        textContent: null,
        dataAttributes: {},
        inlineStyles: {},
        computedStyles: {},
        textFields: [],
        capabilities: {
          canSelect: true,
          canEditStyles: true,
          canCrop: false,
          canMove: false,
          canResize: false,
          canApplyManualOffset: false,
          canApplyManualSize: false,
          canApplyManualRotation: false,
        },
      };
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const onBind = vi.fn();
      try {
        await act(async () => {
          root.render(
            <VariablesBindElement selection={selection} sdkSession={session} onBind={onBind} />,
          );
        });
        const label = declaration.type === "font" ? "Font" : "Image source";
        const action = [...host.querySelectorAll("button")].find((button) =>
          button.textContent?.startsWith(label),
        );
        if (!action) throw new Error(`Missing ${label} bind action`);
        await act(async () => action.click());
        const warning = host.querySelector("p.text-warning-ink");
        expect(warning?.textContent).toContain(`"${declaration.id}" already exists.`);
        expect(warning?.querySelector("span")?.textContent).toBe(` (${expected})`);
        expect(onBind).not.toHaveBeenCalled();
        expect(session.getVariableDeclarations()).toEqual([declaration]);
      } finally {
        await act(async () => root.unmount());
        host.remove();
        session.dispose();
      }
    },
  );
});
