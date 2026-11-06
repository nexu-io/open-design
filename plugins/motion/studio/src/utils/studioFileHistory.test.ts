import { describe, expect, it, vi } from "vitest";
import { saveProjectFilesWithHistory } from "./studioFileHistory";
import { serializeStudioFileMutation } from "./studioFileMutationCoordinator";

describe("saveProjectFilesWithHistory", () => {
  it("reads before content, writes after content, and records a history entry", async () => {
    const reads: Record<string, string> = { "index.html": "before" };
    const writes: Record<string, string> = {};
    const recordEdit = vi.fn();

    await saveProjectFilesWithHistory({
      projectId: "project-1",
      label: "Move layer",
      files: { "index.html": () => "after" },
      readFile: async (path) => reads[path],
      writeFile: async (path, content) => {
        writes[path] = content;
      },
      recordEdit,
    });

    expect(writes).toEqual({ "index.html": "after" });
    expect(recordEdit).toHaveBeenCalledWith({
      label: "Move layer",
      coalesceKey: undefined,
      files: { "index.html": { before: "before", after: "after" } },
    });
  });

  /**
   * Deleting a clip POSTs `remove-element`, which rewrites the file server-side,
   * and only then saves the duration shrink. Expecting the content read before
   * the mutation made the server refuse that write as a conflict: the save queue
   * paused on the 409 and the clip stayed on the timeline until a reload.
   */
  it("expects what is on disk, not the undo baseline, when they differ", async () => {
    const expectations: Record<string, string | undefined> = {};
    const recordEdit = vi.fn();

    await saveProjectFilesWithHistory({
      projectId: "project-1",
      label: "Delete timeline clip",
      files: { "index.html": () => "removed+shrunk" },
      readFile: async () => "original",
      diskContent: { "index.html": "removed" },
      writeFile: async (path, _content, expectedContent) => {
        expectations[path] = expectedContent;
      },
      recordEdit,
    });

    expect(expectations["index.html"]).toBe("removed");
    // Undo still goes all the way back, which is the whole reason the two are
    // allowed to differ.
    expect(recordEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        files: { "index.html": { before: "original", after: "removed+shrunk" } },
      }),
    );
  });

  it("still expects the undo baseline when nothing says otherwise", async () => {
    const expectations: Record<string, string | undefined> = {};
    await saveProjectFilesWithHistory({
      projectId: "project-1",
      label: "Move layer",
      files: { "index.html": () => "after" },
      readFile: async () => "before",
      writeFile: async (path, _content, expectedContent) => {
        expectations[path] = expectedContent;
      },
      recordEdit: vi.fn(),
    });
    expect(expectations["index.html"]).toBe("before");
  });

  it("skips writes and history for unchanged content", async () => {
    const writeFile = vi.fn();
    const recordEdit = vi.fn();

    const changedPaths = await saveProjectFilesWithHistory({
      projectId: "project-1",
      label: "Edit layer",
      files: { "index.html": () => "same" },
      readFile: async () => "same",
      writeFile,
      recordEdit,
    });

    expect(changedPaths).toEqual([]);
    expect(writeFile).not.toHaveBeenCalled();
    expect(recordEdit).not.toHaveBeenCalled();
  });

  it("rolls back files already written when a later file write fails", async () => {
    const reads: Record<string, string> = {
      "index.html": "index-before",
      "scene.html": "scene-before",
    };
    const writes: Array<[string, string]> = [];
    const recordEdit = vi.fn();

    await expect(
      saveProjectFilesWithHistory({
        projectId: "project-1",
        label: "Move layer",
        files: {
          "index.html": () => "index-after",
          "scene.html": () => "scene-after",
        },
        readFile: async (path) => reads[path],
        writeFile: async (path, content) => {
          writes.push([path, content]);
          if (path === "scene.html") {
            throw new Error("disk full");
          }
        },
        recordEdit,
      }),
    ).rejects.toThrow("disk full");

    expect(writes).toEqual([
      ["index.html", "index-after"],
      ["scene.html", "scene-after"],
      ["index.html", "index-before"],
    ]);
    expect(recordEdit).not.toHaveBeenCalled();
  });

  it("rolls back written files when the injected history recorder throws", async () => {
    const reads: Record<string, string> = {
      "index.html": "index-before",
      "scene.html": "scene-before",
    };
    const writes: Array<[string, string]> = [];

    await expect(
      saveProjectFilesWithHistory({
        projectId: "project-1",
        label: "Move layer",
        files: {
          "index.html": () => "index-after",
          "scene.html": () => "scene-after",
        },
        readFile: async (path) => reads[path],
        writeFile: async (path, content) => {
          writes.push([path, content]);
        },
        recordEdit: async () => {
          throw new Error("history unavailable");
        },
      }),
    ).rejects.toThrow("history unavailable");

    expect(writes).toEqual([
      ["index.html", "index-after"],
      ["scene.html", "scene-after"],
      ["scene.html", "scene-before"],
      ["index.html", "index-before"],
    ]);
  });

  it("reports rollback failure with the original write failure", async () => {
    const reads: Record<string, string> = {
      "index.html": "index-before",
      "scene.html": "scene-before",
    };
    const writes: Array<[string, string]> = [];

    await expect(
      saveProjectFilesWithHistory({
        projectId: "project-1",
        label: "Move layer",
        files: {
          "index.html": () => "index-after",
          "scene.html": () => "scene-after",
        },
        readFile: async (path) => reads[path],
        writeFile: async (path, content) => {
          writes.push([path, content]);
          if (path === "scene.html" && content === "scene-after") {
            throw new Error("write denied");
          }
          if (path === "index.html" && content === "index-before") {
            throw new Error("rollback denied");
          }
        },
        recordEdit: vi.fn(),
      }),
    ).rejects.toThrow("rollback did not complete");

    expect(writes).toEqual([
      ["index.html", "index-after"],
      ["scene.html", "scene-after"],
      ["index.html", "index-before"],
    ]);
  });

  it("builds from what the file holds after an earlier same-file mutation completes", async () => {
    let disk = "before";
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writeFile = vi.fn(async (_path: string, content: string) => {
      disk = content;
    });
    const priorMutation = serializeStudioFileMutation(writeFile, "index.html", async () => {
      await blocked;
      disk = "sdk-after";
    });
    const readFile = vi.fn(async () => disk);
    const recordEdit = vi.fn();

    const save = saveProjectFilesWithHistory({
      projectId: "project-1",
      label: "Edit source",
      files: { "index.html": (current) => `${current}+editor` },
      readFile,
      writeFile,
      recordEdit,
    });

    await Promise.resolve();
    expect(readFile).not.toHaveBeenCalled();
    release();
    await priorMutation;
    await save;

    expect(disk).toBe("sdk-after+editor");
    expect(recordEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        files: { "index.html": { before: "sdk-after", after: "sdk-after+editor" } },
      }),
    );
  });
});
