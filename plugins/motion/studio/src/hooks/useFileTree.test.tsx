// @vitest-environment happy-dom

import { act, useImperativeHandle, useRef, forwardRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFileTree } from "./useFileTree";

vi.mock("../components/feedback/projectProvenance", () => ({
  captureProjectProvenance: vi.fn(),
}));

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

import { captureProjectProvenance } from "../components/feedback/projectProvenance";
import { trackStudioEvent } from "../utils/studioTelemetry";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
});

interface Handle {
  compositions: string[];
  refresh: () => Promise<void>;
}

const Harness = forwardRef<Handle, { projectId: string }>(function Harness({ projectId }, ref) {
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const { compositions, refreshFileTree } = useFileTree({ projectId, projectIdRef });
  useImperativeHandle(ref, () => ({ compositions, refresh: refreshFileTree }), [
    compositions,
    refreshFileTree,
  ]);
  return null;
});

async function renderHarness(projectId: string): Promise<{ current: Handle | null }> {
  const handleRef = { current: null as Handle | null };
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  await act(async () => {
    root?.render(
      <Harness
        ref={(h) => {
          handleRef.current = h;
        }}
        projectId={projectId}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  return handleRef;
}

describe("useFileTree unresolved project", () => {
  const provenance = vi.mocked(captureProjectProvenance);

  afterEach(() => {
    provenance.mockClear();
  });

  /** Render the tree for `projectId` against one canned response. */
  async function renderWithResponse(
    projectId: string,
    build: () => Response,
  ): Promise<{ current: Handle | null }> {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => build());
    const handleRef = await renderHarness(projectId);
    fetchSpy.mockRestore();
    return handleRef;
  }

  const notFound = () =>
    new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  const emptyListing = () =>
    new Response(JSON.stringify({ files: [], compositions: [] }), { status: 200 });

  // An unresolvable project answers 404 with a JSON body. Without an `r.ok`
  // check that parsed cleanly and took the SUCCESS branch, recording an empty
  // tree and an empty provenance snapshot for a project that was never read —
  // so a bug report filed from that tab described a project that does not
  // exist. The tree itself stays empty either way; the provenance lie is the
  // part that leaves the browser.
  it("does not snapshot provenance for a project the server could not resolve", async () => {
    const handleRef = await renderWithResponse("gone-project", notFound);

    expect(handleRef.current?.compositions).toEqual([]);
    expect(provenance).not.toHaveBeenCalled();
  });

  // The counterpart, and the reason the check above cannot be collapsed into
  // "skip provenance whenever the tree is empty": a project with no
  // compositions yet is a real, successful read and must still be snapshotted.
  it("still snapshots provenance when a resolved project has no compositions", async () => {
    const handleRef = await renderWithResponse("empty-project", emptyListing);

    expect(handleRef.current?.compositions).toEqual([]);
    expect(provenance).toHaveBeenCalledWith("empty-project", [], []);
  });
});

describe("useFileTree.refreshFileTree", () => {
  it("updates compositions, not just the raw file list, on refresh", async () => {
    let call = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      call += 1;
      // Initial load: one composition. After a refresh (e.g. a new file created),
      // the server now reports a second one — this is the exact shape a refresh
      // after creating/duplicating a composition produces.
      const body =
        call === 1
          ? { files: ["index.html"], compositions: ["index.html"] }
          : { files: ["index.html", "hero.html"], compositions: ["index.html", "hero.html"] };
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const handleRef = await renderHarness("project-a");
    expect(handleRef.current?.compositions).toEqual(["index.html"]);

    await act(async () => {
      await handleRef.current?.refresh();
    });
    expect(handleRef.current?.compositions).toEqual(["index.html", "hero.html"]);

    fetchSpy.mockRestore();
  });

  it("keeps the most-recently-issued refresh's data when an earlier one resolves later", async () => {
    let call = 0;
    const deferred: Array<(value: Response) => void> = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return new Response(
          JSON.stringify({ files: ["index.html"], compositions: ["index.html"] }),
          {
            status: 200,
          },
        );
      }
      return new Promise<Response>((resolve) => {
        deferred.push(resolve);
      });
    });

    const handleRef = await renderHarness("project-a");

    let firstDone = false;
    let secondDone = false;
    act(() => {
      void handleRef.current?.refresh().then(() => {
        firstDone = true;
      });
      void handleRef.current?.refresh().then(() => {
        secondDone = true;
      });
    });

    // The second (later-issued) request resolves first, with its own data.
    await act(async () => {
      deferred[1](
        new Response(
          JSON.stringify({
            files: ["index.html", "second.html"],
            compositions: ["index.html", "second.html"],
          }),
          {
            status: 200,
          },
        ),
      );
      await vi.waitFor(() => secondDone);
    });
    expect(handleRef.current?.compositions).toEqual(["index.html", "second.html"]);

    // The first (earlier-issued, now stale) request resolves after — it must not win.
    await act(async () => {
      deferred[0](
        new Response(
          JSON.stringify({
            files: ["index.html", "stale.html"],
            compositions: ["index.html", "stale.html"],
          }),
          {
            status: 200,
          },
        ),
      );
      await vi.waitFor(() => firstDone);
    });
    expect(handleRef.current?.compositions).toEqual(["index.html", "second.html"]);

    fetchSpy.mockRestore();
  });

  it("aborts the superseded request's fetch when a newer refresh is issued", async () => {
    let call = 0;
    const signals: AbortSignal[] = [];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init?: RequestInit) => {
        call += 1;
        if (call === 1) {
          return new Response(
            JSON.stringify({ files: ["index.html"], compositions: ["index.html"] }),
            { status: 200 },
          );
        }
        if (init?.signal) signals.push(init.signal);
        return new Promise<Response>(() => {});
      });

    const handleRef = await renderHarness("project-a");

    act(() => {
      void handleRef.current?.refresh();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    act(() => {
      void handleRef.current?.refresh();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    fetchSpy.mockRestore();
  });

  it("resolves when the server is gone, and reports it once per unreachable streak", async () => {
    const track = vi.mocked(trackStudioEvent);
    track.mockClear();
    let serverUp = true;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (!serverUp) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify({ files: ["index.html"], compositions: ["index.html"] }));
    });
    const handleRef = await renderHarness("project-a");

    serverUp = false;
    await act(async () => {
      await handleRef.current?.refresh();
      await handleRef.current?.refresh();
    });
    expect(handleRef.current?.compositions).toEqual(["index.html"]);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("file_tree_refresh_failed", {
      error_name: "TypeError",
      error_message: "Failed to fetch",
    });

    serverUp = true;
    await act(async () => handleRef.current?.refresh());
    serverUp = false;
    await act(async () => handleRef.current?.refresh());
    expect(track).toHaveBeenCalledTimes(2);

    fetchSpy.mockRestore();
  });

  it("keeps the prior compositions list when a refresh response omits the field", async () => {
    let call = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      call += 1;
      const body =
        call === 1
          ? { files: ["index.html"], compositions: ["index.html"] }
          : { files: ["index.html", "hero.html"] };
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const handleRef = await renderHarness("project-a");
    expect(handleRef.current?.compositions).toEqual(["index.html"]);

    await act(async () => {
      await handleRef.current?.refresh();
    });
    // `files` grew but the response carried no `compositions` field — the known-good
    // list must survive, not collapse to empty.
    expect(handleRef.current?.compositions).toEqual(["index.html"]);

    fetchSpy.mockRestore();
  });
});
