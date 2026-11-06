import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryExternalConflictStorage,
  deleteExternalConflictSnapshot,
  loadExternalConflictSnapshot,
  persistExternalConflictSnapshot,
  type ExternalConflictSnapshot,
} from "./externalConflictStorage";
import { StudioFileConflictError } from "./studioSaveDiagnostics";

describe("external conflict snapshots", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("durably records both complete file versions before resolution", async () => {
    const storage = createMemoryExternalConflictStorage();
    const snapshot: ExternalConflictSnapshot = {
      kind: "conflict",
      projectId: "project-a",
      filePath: "index.html",
      externalVersion: "v2",
      externalContent: "external full file",
      studioContent: "studio full file",
      createdAt: 100,
    };

    await storage.set(snapshot);
    expect(await storage.get("project-a", "index.html")).toEqual(snapshot);
    await storage.delete("project-a", "index.html");
    expect(await storage.get("project-a", "index.html")).toBeNull();
  });

  it("records a failed final Studio candidate for remount recovery", async () => {
    const storage = createMemoryExternalConflictStorage();
    const snapshot: ExternalConflictSnapshot = {
      kind: "failed",
      projectId: "project-a",
      filePath: "index.html",
      externalVersion: null,
      externalContent: null,
      studioContent: "recover me",
      failureMessage: "network unavailable",
      createdAt: 101,
    };

    await storage.set(snapshot);
    expect(await storage.get("project-a", "index.html")).toEqual(snapshot);
  });

  it("persists, loads, and deletes a snapshot through the production IndexedDB adapter", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const conflict = new StudioFileConflictError({
      filePath: "index.html",
      currentVersion: "v2",
      currentContent: "external full file",
      attemptedContent: "studio full file",
    });

    await persistExternalConflictSnapshot("indexeddb-project", conflict);
    await expect(loadExternalConflictSnapshot("indexeddb-project", "index.html")).resolves.toEqual({
      kind: "conflict",
      projectId: "indexeddb-project",
      filePath: "index.html",
      externalVersion: "v2",
      externalContent: "external full file",
      studioContent: "studio full file",
      createdAt: 1234,
    });
    await deleteExternalConflictSnapshot("indexeddb-project", "index.html");
    await expect(
      loadExternalConflictSnapshot("indexeddb-project", "index.html"),
    ).resolves.toBeNull();
  });

  it("rejects persistence when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const conflict = new StudioFileConflictError({
      filePath: "index.html",
      currentVersion: "v2",
      currentContent: "external",
      attemptedContent: "studio",
    });

    await expect(persistExternalConflictSnapshot("project-a", conflict)).rejects.toThrow(
      "IndexedDB is unavailable; conflict recovery snapshot was not saved",
    );
  });
});
