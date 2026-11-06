import { afterEach, describe, expect, it, vi } from "vitest";
import { commitTimelineCompositionInsertion } from "./timelineCompositionInsert";

afterEach(() => vi.unstubAllGlobals());

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("commitTimelineCompositionInsertion", () => {
  it("records one history entry, then selects and refreshes once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ content: "before", version: "v1" }))
      .mockResolvedValueOnce(
        response({
          path: "index.html",
          hostId: "headline",
          before: "before",
          after: "after",
          version: "v2",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const writeFile = vi.fn();
    const recordEdit = vi.fn();
    const observeVersion = vi.fn();
    const selectHost = vi.fn();
    const resync = vi.fn();
    const refresh = vi.fn();

    await commitTimelineCompositionInsertion({
      projectId: "launch#demo",
      targetPath: "index.html",
      sourcePath: "headline.html",
      start: 4,
      track: 2,
      writeFile,
      recordEdit,
      observeVersion,
      selectHost,
      resync,
      refresh,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/projects/launch%23demo/files/index.html",
      "/api/projects/launch%23demo/file-mutations/insert-composition/index.html",
    ]);
    expect(recordEdit).toHaveBeenCalledOnce();
    expect(writeFile).not.toHaveBeenCalled();
    expect(observeVersion).toHaveBeenCalledWith("index.html", "v2");
    expect(selectHost).toHaveBeenCalledWith("index.html#headline");
    expect(resync).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("CAS-restores the server write when history registration fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ content: "before", version: "v1" }))
        .mockResolvedValueOnce(
          response({
            path: "index.html",
            hostId: "headline",
            before: "before",
            after: "after",
            version: "v2",
          }),
        ),
    );
    const writeFile = vi.fn();
    const refresh = vi.fn();

    await expect(
      commitTimelineCompositionInsertion({
        projectId: "demo",
        targetPath: "index.html",
        sourcePath: "headline.html",
        start: 4,
        track: 2,
        writeFile,
        recordEdit: vi.fn().mockRejectedValue(new Error("history failed")),
        selectHost: vi.fn(),
        refresh,
      }),
    ).rejects.toThrow("history failed");

    expect(writeFile).toHaveBeenCalledWith("index.html", "before", "after");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps a durable insertion successful and refreshes when resync fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ content: "before", version: "v1" }))
        .mockResolvedValueOnce(
          response({
            path: "index.html",
            hostId: "headline",
            before: "before",
            after: "after",
            version: "v2",
          }),
        ),
    );
    const refresh = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      commitTimelineCompositionInsertion({
        projectId: "demo",
        targetPath: "index.html",
        sourcePath: "headline.html",
        start: 4,
        track: 2,
        writeFile: vi.fn(),
        recordEdit: vi.fn(),
        selectHost: vi.fn(),
        resync: () => {
          throw new Error("resync failed");
        },
        refresh,
      }),
    ).resolves.toBeUndefined();

    expect(refresh).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "[Studio] Composition insertion committed but preview resync failed",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
