// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./useFileTree", () => ({
  useFileTree: () => ({
    projectDir: "",
    fileTree: [],
    fileTreeLoaded: true,
    refreshFileTree: vi.fn(async () => {}),
    compositions: [],
    assets: [],
    fontAssets: [],
  }),
}));

vi.mock("./useEditorSave", () => ({
  useEditorSave: () => ({
    saveRafRef: { current: null },
    handleContentChange: vi.fn(),
    getPendingCandidate: vi.fn(() => null),
    flushPendingSave: vi.fn(async () => ({ status: "clean" as const })),
    discardPendingSave: vi.fn(),
  }),
}));

import { useFileManager } from "./useFileManager";
import { resetStudioWriteTokens, studioFileContentVersion } from "../utils/studioFileVersion";
import { StudioFileConflictError } from "../utils/studioSaveDiagnostics";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function useTestFileManager(projectId: string, showToast = vi.fn()) {
  return useFileManager({
    projectId,
    showToast,
    recordEdit: vi.fn(async () => {}),
    setRefreshKey: vi.fn(),
  });
}

async function mountTestFileManager(projectId = "project-a", showToast = vi.fn()) {
  const captured: { manager: ReturnType<typeof useFileManager> | null } = { manager: null };
  function Probe() {
    captured.manager = useTestFileManager(projectId, showToast);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
  const manager = captured.manager;
  if (!manager) throw new Error("file manager did not render");
  return { manager, root };
}

async function mountOverwriteRequest(response: Response) {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method !== "PUT") {
      throw new Error("overwrite unexpectedly performed a preflight read");
    }
    return Promise.resolve(response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { ...(await mountTestFileManager()), fetchMock };
}

function createOverwriteConflict(currentVersion: string | null, currentContent: string | null) {
  return new StudioFileConflictError({
    filePath: "index.html",
    currentVersion,
    currentContent,
    attemptedContent: "STUDIO",
  });
}

describe("useFileManager project ownership", () => {
  afterEach(() => {
    resetStudioWriteTokens();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps delayed callbacks bound to the project that created them", async () => {
    let resolveProjectARead: ((value: Response) => void) | undefined;
    const projectARead = new Promise<Response>((resolve) => {
      resolveProjectARead = resolve;
    });
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/files/missing.html") && !init?.method) {
        return Promise.resolve({ ok: false, status: 404 } as Response);
      }
      if (url.includes("project-a") && !init?.method) return projectARead;
      if (!init?.method) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ content: "PROJECT_B", version: "b-v1" }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({ version: "a-v2" }) } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);

    const captured: { manager: ReturnType<typeof useFileManager> | null } = { manager: null };
    function Probe({ projectId }: { projectId: string }) {
      captured.manager = useTestFileManager(projectId);
      return null;
    }

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a/../other?x=1" />));
    const managerA = captured.manager;
    if (!managerA) throw new Error("project A manager did not render");
    const delayedRead = managerA.readProjectFile("index.html");

    await act(async () => root.render(<Probe projectId="project-b#fragment" />));
    const managerB = captured.manager;
    if (!managerB) throw new Error("project B manager did not render");
    expect(managerB.writeProjectFile).not.toBe(managerA.writeProjectFile);

    resolveProjectARead?.({
      ok: true,
      json: async () => ({ content: "PROJECT_A", version: "a-v1" }),
    } as Response);
    await expect(delayedRead).resolves.toBe("PROJECT_A");
    await managerA.writeProjectFile("index.html", "A_AFTER");
    await managerA.writeProjectFile("missing.html", "A_NEW");
    await expect(managerB.readProjectFile("index.html")).resolves.toBe("PROJECT_B");
    await expect(managerB.readOptionalProjectFile("index.html")).resolves.toBe("PROJECT_B");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-a%2F..%2Fother%3Fx%3D1/files/index.html",
      { credentials: "omit" },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-a%2F..%2Fother%3Fx%3D1/files/index.html",
      expect.objectContaining({ method: "PUT", body: "A_AFTER" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-a%2F..%2Fother%3Fx%3D1/files/missing.html",
      { credentials: "omit" },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-a%2F..%2Fother%3Fx%3D1/files/missing.html",
      expect.objectContaining({ method: "PUT", body: "A_NEW" }),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-b%23fragment/files/index.html", {
      credentials: "omit",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-b%23fragment/files/index.html?optional=1",
      { credentials: "omit" },
    );

    await act(async () => root.unmount());
  });

  it("uses a fresh write token when a lost response retries a committed save", async () => {
    vi.useFakeTimers();
    let putAttempt = 0;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (!init?.method) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ content: "BEFORE", version: "v1" }),
        } as Response);
      }
      putAttempt += 1;
      if (putAttempt === 1) return Promise.reject(new TypeError("response lost"));
      return Promise.resolve({ ok: true, json: async () => ({ version: "v2" }) } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { manager, root } = await mountTestFileManager();
    await manager.readProjectFile("index.html");

    const write = manager.writeProjectFile("index.html", "AFTER");
    await vi.runAllTimersAsync();
    await write;

    const writeTokens = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "PUT")
      .map(([, init]) => new Headers(init?.headers).get("X-Hyperframes-Write-Token"));
    expect(writeTokens).toHaveLength(2);
    expect(writeTokens[0]).toBeTruthy();
    expect(writeTokens[1]).not.toBe(writeTokens[0]);

    await act(async () => root.unmount());
  });

  it("overwrites the exact external content version with an If-Match precondition", async () => {
    const { manager, root, fetchMock } = await mountOverwriteRequest({
      ok: true,
      json: async () => ({ version: "v3" }),
    } as Response);
    const conflict = createOverwriteConflict("v2", "EXTERNAL");

    await manager.overwriteExternalConflict(conflict);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(init).toMatchObject({ method: "PUT", body: "STUDIO" });
    expect(headers.get("If-Match")).toBe(await studioFileContentVersion("EXTERNAL"));
    expect(headers.get("If-None-Match")).toBeNull();
    await act(async () => root.unmount());
  });

  it("preserves a newer third-party edit when a content-less conflict version is stale", async () => {
    const { manager, root, fetchMock } = await mountOverwriteRequest({
      ok: false,
      status: 409,
      json: async () => ({ currentVersion: "v3", currentContent: "THIRD PARTY" }),
    } as Response);
    const conflict = createOverwriteConflict("v2", null);

    await expect(manager.overwriteExternalConflict(conflict)).rejects.toMatchObject({
      name: "StudioFileConflictError",
      currentVersion: "v3",
      currentContent: "THIRD PARTY",
      attemptedContent: "STUDIO",
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get("If-Match")).toBe("v2");
    expect(headers.get("If-None-Match")).toBeNull();
    await act(async () => root.unmount());
  });

  it("uses create-only semantics when the conflicted file was deleted", async () => {
    const { manager, root, fetchMock } = await mountOverwriteRequest({
      ok: true,
      json: async () => ({ version: "v1" }),
    } as Response);
    const conflict = createOverwriteConflict(null, null);

    await manager.overwriteExternalConflict(conflict);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get("If-Match")).toBeNull();
    expect(headers.get("If-None-Match")).toBe("*");
    await act(async () => root.unmount());
  });
});

describe("useFileManager uploads", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function uploadClip(response: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { ok: true, files: [], skipped: [], invalid: [], ...response },
          { status: 201 },
        ),
      ),
    );
    const showToast = vi.fn();
    const { manager, root } = await mountTestFileManager("project-a", showToast);
    const added = await act(() => manager.uploadProjectFiles([new File(["x"], "clip.mp4")]));
    await act(async () => root.unmount());
    return { added, showToast };
  }

  it("says which uploads were added without a media check, and why", async () => {
    const reason =
      "not checked: ffprobe was not found. Install FFmpeg or set HYPERFRAMES_FFPROBE_PATH.";
    const { added, showToast } = await uploadClip({
      files: ["clip.mp4"],
      unchecked: [{ name: "clip.mp4", reason }],
    });

    expect(added).toEqual(["clip.mp4"]);
    expect(showToast).toHaveBeenCalledWith(`Added clip.mp4, ${reason}`, "info");
  });

  it("says why each upload was not added", async () => {
    const { added, showToast } = await uploadClip({
      invalid: [
        { name: "clip.mp4", reason: "no supported video stream found" },
        { name: "song.mp3", reason: "no supported audio stream found" },
      ],
    });

    expect(added).toEqual([]);
    expect(showToast).toHaveBeenCalledWith(
      "Not added: clip.mp4 (no supported video stream found), song.mp3 (no supported audio stream found)",
    );
  });
});
