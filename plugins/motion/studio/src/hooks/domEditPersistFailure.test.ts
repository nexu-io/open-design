import { describe, expect, it, vi } from "vitest";
import type { PatchOperation } from "../utils/sourcePatcher";
import { StudioSaveHttpError } from "../utils/studioSaveDiagnostics";
import {
  DomEditPersistUnsafeValueError,
  reportDomEditPersistFailure,
  warnDomEditPersistNoOp,
} from "./domEditPersistFailure";

const selection = {
  label: "Hero title",
  hfId: "hf-hero",
  id: "hero",
  selector: ".hero",
  selectorIndex: 0,
  sourceFile: "index.html",
};

const operations: PatchOperation[] = [{ type: "inline-style", property: "color", value: "red" }];

describe("reportDomEditPersistFailure", () => {
  it("toasts with the selected label and underlying error detail", () => {
    const showToast = vi.fn<(message: string, tone?: "error" | "info") => void>();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    reportDomEditPersistFailure(selection, operations, new Error("network down"), showToast);

    expect(showToast).toHaveBeenCalledWith('Couldn\'t save "Hero title": network down', "error");
    expect(warnSpy).toHaveBeenCalledWith(
      "[Studio] DOM edit persist failed",
      expect.objectContaining({
        target: {
          hfId: "hf-hero",
          id: "hero",
          selector: ".hero",
          selectorIndex: 0,
          sourceFile: "index.html",
        },
        operations: "inline-style:color",
        error: "network down",
      }),
    );

    warnSpy.mockRestore();
  });

  it("toasts StudioSaveHttpError and unmarked unsafe errors", () => {
    const showToast = vi.fn<(message: string, tone?: "error" | "info") => void>();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    reportDomEditPersistFailure(
      selection,
      operations,
      new StudioSaveHttpError("Failed to patch index.html (500)", 500),
      showToast,
    );
    reportDomEditPersistFailure(
      selection,
      operations,
      new DomEditPersistUnsafeValueError("DOM patch contains unsafe values: style.width"),
      showToast,
    );

    expect(showToast).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("Failed to patch index.html"),
      "error",
    );
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("DOM patch contains unsafe values: style.width"),
      "error",
    );
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it("does not toast errors explicitly marked as already toasted", () => {
    const showToast = vi.fn<(message: string, tone?: "error" | "info") => void>();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = new DomEditPersistUnsafeValueError(
      "DOM patch contains unsafe values: style.width",
    );
    Object.defineProperty(error, "alreadyToasted", { value: true });

    reportDomEditPersistFailure(selection, operations, error, showToast);

    expect(showToast).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[Studio] DOM edit persist failed",
      expect.objectContaining({
        target: expect.objectContaining({ hfId: "hf-hero", sourceFile: "index.html" }),
      }),
    );

    warnSpy.mockRestore();
  });
});

describe("warnDomEditPersistNoOp", () => {
  it("logs a structured breadcrumb without requiring a toast callback", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    warnDomEditPersistNoOp(selection, operations);

    expect(warnSpy).toHaveBeenCalledWith(
      "[Studio] DOM edit persist no-op",
      expect.objectContaining({
        target: {
          hfId: "hf-hero",
          id: "hero",
          selector: ".hero",
          selectorIndex: 0,
          sourceFile: "index.html",
        },
        operations: "inline-style:color",
      }),
    );

    warnSpy.mockRestore();
  });
});
