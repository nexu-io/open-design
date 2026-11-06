// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioFileConflictError } from "../utils/studioSaveDiagnostics";
import type { ExternalFileChangeCoordinatorHandle } from "../hooks/useExternalFileChangeCoordinator";
import { ExternalFileConflictBanner } from "./ExternalFileConflictBanner";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ExternalFileConflictBanner", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("keeps destructive choices explicit and exposes both full versions for review", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const conflict = new StudioFileConflictError({
      filePath: "index.html",
      currentVersion: "v2",
      currentContent: "<html>external</html>",
      attemptedContent: "<html>studio</html>",
    });
    const coordinator: ExternalFileChangeCoordinatorHandle = {
      blocked: { status: "conflict", generation: 1, error: conflict, payload: {} },
      retry: vi.fn(async () => undefined),
      useExternalFile: vi.fn(async () => undefined),
      keepStudioFile: vi.fn(async () => undefined),
    };

    await act(async () => root.render(<ExternalFileConflictBanner coordinator={coordinator} />));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Preview is paused so neither version is lost",
    );
    expect(document.body.textContent).toContain("Discard Studio edits and reload file");
    expect(document.body.textContent).toContain("Overwrite file with Studio version");

    const review = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Review or export both"),
    );
    await act(async () => review?.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(Array.from(document.querySelectorAll("textarea"), (field) => field.value)).toEqual([
      "<html>external</html>",
      "<html>studio</html>",
    ]);

    await act(async () => root.unmount());
  });

  it("lets authors review and export the local candidate after a drain failure", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const coordinator: ExternalFileChangeCoordinatorHandle = {
      blocked: {
        status: "failed",
        generation: 1,
        path: "index.html",
        error: new Error("offline"),
        payload: {},
        studioContent: "<html>recover me</html>",
        recovered: false,
      },
      retry: vi.fn(async () => undefined),
      useExternalFile: vi.fn(async () => undefined),
      keepStudioFile: vi.fn(async () => undefined),
    };

    await act(async () => root.render(<ExternalFileConflictBanner coordinator={coordinator} />));
    const review = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Review or export Studio draft"),
    );
    await act(async () => review?.click());
    expect(document.querySelector("textarea")?.value).toBe("<html>recover me</html>");
    expect(document.body.textContent).toContain("Copy");
    expect(document.body.textContent).toContain("Download");
    await act(async () => root.unmount());
  });

  it("does not offer a fake retry after remount and instead offers explicit overwrite", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const keepStudioFile = vi.fn(async () => undefined);
    const coordinator: ExternalFileChangeCoordinatorHandle = {
      blocked: {
        status: "failed",
        generation: 1,
        path: "index.html",
        error: new Error("offline"),
        payload: { path: "index.html", version: "v2", content: "external" },
        studioContent: "recovered draft",
        recovered: true,
      },
      retry: vi.fn(async () => undefined),
      useExternalFile: vi.fn(async () => undefined),
      keepStudioFile,
    };

    await act(async () => root.render(<ExternalFileConflictBanner coordinator={coordinator} />));
    expect(document.body.textContent).not.toContain("Retry save");
    const overwrite = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Overwrite file with recovered Studio draft"),
    );
    expect(overwrite).toBeTruthy();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => overwrite?.click());
    expect(keepStudioFile).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("does not offer retry when a failed DOM edit has no recoverable source candidate", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const coordinator: ExternalFileChangeCoordinatorHandle = {
      blocked: {
        status: "failed",
        generation: 1,
        path: "index.html",
        error: new Error("offline"),
        payload: { path: "index.html", version: "v2", content: "external" },
        studioContent: null,
        recovered: false,
      },
      retry: vi.fn(async () => undefined),
      useExternalFile: vi.fn(async () => undefined),
      keepStudioFile: vi.fn(async () => undefined),
    };

    await act(async () => root.render(<ExternalFileConflictBanner coordinator={coordinator} />));
    expect(document.body.textContent).not.toContain("Retry save");
    expect(document.body.textContent).toContain("Discard Studio edits and reload file");

    await act(async () => root.unmount());
  });
});
