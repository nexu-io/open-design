import { describe, expect, it, vi } from "vitest";
import { StudioFileConflictError } from "../utils/studioSaveDiagnostics";
import { drainStudioSaveQueues } from "./usePreviewPersistence";

describe("drainStudioSaveQueues", () => {
  it("does not erase a pending-field conflict with a clean DOM queue", async () => {
    const conflict = new StudioFileConflictError({
      filePath: "index.html",
      currentVersion: "v2",
      currentContent: "external",
      attemptedContent: "studio",
    });
    const waitForDomQueue = vi.fn(async () => ({ status: "clean" as const }));

    await expect(
      drainStudioSaveQueues(
        async () => ({ status: "conflict" as const, error: conflict }),
        waitForDomQueue,
      ),
    ).resolves.toEqual({ status: "conflict", error: conflict });
    expect(waitForDomQueue).not.toHaveBeenCalled();
  });
});
