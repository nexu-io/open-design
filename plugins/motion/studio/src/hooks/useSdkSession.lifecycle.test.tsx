// fallow-ignore-file code-duplication
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openComposition = vi.fn();

vi.mock("@hyperframes/sdk", () => ({
  openComposition: (...args: unknown[]) => openComposition(...args),
}));

import type { Composition } from "@hyperframes/sdk";
import { useSdkSession, type SdkSessionHandle } from "./useSdkSession";
import { usePlayerStore } from "../player/store/playerStore";
import { notifyExternalFileReload } from "./externalFileReloadBus";

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

import { trackStudioEvent } from "../utils/studioTelemetry";

const trackMock = vi.mocked(trackStudioEvent);

beforeEach(() => {
  usePlayerStore.setState({ timelineProjectId: "project-a", previewBooted: true });
});

function Probe({ projectId }: { projectId: string }) {
  useSdkSession(projectId, "index.html");
  return null;
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fakeSession(): Composition {
  return { dispose: vi.fn() } as unknown as Composition;
}

function response(content: string): Response {
  return { ok: true, json: async () => ({ content }) } as Response;
}

async function flushAsyncEffects(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("useSdkSession ownership", () => {
  beforeEach(() => {
    openComposition.mockReset();
    class FakeEventSource {
      addEventListener(): void {}
      close(): void {}
    }
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not read or parse the composition until the live preview has booted", async () => {
    usePlayerStore.setState({ previewBooted: false });
    const fetchStub = vi.fn(async () => response("PROJECT_A"));
    vi.stubGlobal("fetch", fetchStub);
    openComposition.mockImplementation(async () => fakeSession());

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();
    expect(fetchStub).not.toHaveBeenCalled();
    expect(openComposition).not.toHaveBeenCalled();

    await act(async () => usePlayerStore.getState().markPreviewBooted());
    await flushAsyncEffects();
    expect(openComposition).toHaveBeenCalledWith("PROJECT_A", { history: false });
    act(() => root.unmount());
  });

  it("hides project A immediately while project B with the same path is still opening", async () => {
    const sessionA = fakeSession();
    const publishedA = fakeSession();
    const sessionB = fakeSession();
    let resolveProjectB: ((value: Response) => void) | undefined;
    const projectBResponse = new Promise<Response>((resolve) => {
      resolveProjectB = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.includes("project-b") ? projectBResponse : Promise.resolve(response("PROJECT_A")),
      ),
    );
    openComposition.mockImplementation(async (content: string) =>
      content === "PROJECT_A" ? sessionA : sessionB,
    );

    const captured: { handle: SdkSessionHandle | null } = { handle: null };
    function Probe({ projectId }: { projectId: string }) {
      captured.handle = useSdkSession(projectId, "index.html");
      return null;
    }

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();
    expect(captured.handle?.session).toBe(sessionA);

    let publication: ReturnType<SdkSessionHandle["publish"]> | undefined;
    await act(async () => {
      publication = captured.handle?.publish({
        candidate: publishedA,
        expectedSession: sessionA,
        targetPath: "index.html",
      });
    });
    expect(publication).toBe("published");
    expect(captured.handle?.session).toBe(publishedA);

    await act(async () => {
      usePlayerStore.getState().beginTimelineSession("project-b");
      usePlayerStore.getState().markPreviewBooted();
      root.render(<Probe projectId="project-b" />);
    });
    expect(captured.handle?.session).toBeNull();
    expect(publishedA.dispose).toHaveBeenCalledOnce();
    expect(
      captured.handle?.publish({
        candidate: fakeSession(),
        expectedSession: publishedA,
        targetPath: "index.html",
      }),
    ).toBe("rejected-inactive-target");

    resolveProjectB?.(response("PROJECT_B"));
    await flushAsyncEffects();
    expect(captured.handle?.session).toBe(sessionB);

    await act(async () => root.unmount());
    expect(sessionB.dispose).toHaveBeenCalledOnce();
  });

  it("disposes the currently published candidate when its owner unmounts", async () => {
    const opened = fakeSession();
    const published = fakeSession();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response("PROJECT_A")),
    );
    openComposition.mockResolvedValue(opened);

    const captured: { handle: SdkSessionHandle | null } = { handle: null };
    function Probe() {
      captured.handle = useSdkSession("project-a", "index.html");
      return null;
    }

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    await flushAsyncEffects();
    expect(captured.handle?.session).toBe(opened);
    let publication: ReturnType<SdkSessionHandle["publish"]> | undefined;
    await act(async () => {
      publication = captured.handle?.publish({
        candidate: published,
        expectedSession: opened,
        targetPath: "index.html",
      });
    });
    expect(publication).toBe("published");
    expect(opened.dispose).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    expect(published.dispose).toHaveBeenCalledOnce();
  });

  it("reopens on a project-wide external change whatever composition it holds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response("INDEX")),
    );
    openComposition.mockImplementation(async () => fakeSession());
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();
    expect(openComposition).toHaveBeenCalledOnce();
    await act(async () => notifyExternalFileReload("film.html"));
    await flushAsyncEffects();
    expect(openComposition).toHaveBeenCalledOnce();
    await act(async () => notifyExternalFileReload("."));
    await flushAsyncEffects();
    expect(openComposition).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });
});

describe("useSdkSession unreachable project", () => {
  beforeEach(() => {
    openComposition.mockReset();
    trackMock.mockClear();
    class FakeEventSource {
      addEventListener(): void {}
      close(): void {}
    }
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function probeHandle(projectId: string) {
    usePlayerStore.setState({ timelineProjectId: projectId });
    const captured: { handle: SdkSessionHandle | null } = { handle: null };
    function HandleProbe() {
      captured.handle = useSdkSession(projectId, "index.html");
      return null;
    }
    return { captured, HandleProbe };
  }

  const failedRead = (status: number) => async () =>
    ({ ok: false, status, json: async () => ({}) }) as Response;

  /** Render the hook for `projectId` against a stubbed read and let it settle. */
  async function readOutcome(
    projectId: string,
    read: () => Promise<Response>,
  ): Promise<{ captured: { handle: SdkSessionHandle | null }; unmount: () => Promise<void> }> {
    vi.stubGlobal("fetch", vi.fn(read));
    const { captured, HandleProbe } = probeHandle(projectId);
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<HandleProbe />));
    await flushAsyncEffects();
    return { captured, unmount: () => act(async () => root.unmount()) };
  }

  // A 404 on the composition read is the one failure that says something about
  // the PROJECT rather than the request: under the CLI host it means this
  // Studio serves a different one. Every edit then fails silently, so the UI
  // needs the id to explain that.
  it("names the project when the read is a 404", async () => {
    const { captured, unmount } = await readOutcome("gone-project", failedRead(404));

    expect(captured.handle?.unreachableProject).toBe("gone-project");
    await unmount();
  });

  // A 500 says the request failed, not that the project is elsewhere. Claiming
  // otherwise would tell a user their tab is pointed at the wrong project when
  // the server is merely unwell.
  it("stays quiet on a failure that says nothing about the project", async () => {
    const { captured, unmount } = await readOutcome("project-a", failedRead(500));

    expect(captured.handle?.unreachableProject).toBeNull();
    await unmount();
  });

  it("clears the state once the project resolves", async () => {
    const { captured, unmount } = await readOutcome("gone-project", failedRead(404));
    expect(captured.handle?.unreachableProject).toBe("gone-project");

    openComposition.mockResolvedValue(fakeSession());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response("PROJECT_A")),
    );
    await act(async () => {
      captured.handle?.forceReload();
    });
    await flushAsyncEffects();

    expect(captured.handle?.unreachableProject).toBeNull();
    await unmount();
  });
});

describe("useSdkSession unavailable telemetry", () => {
  beforeEach(() => {
    openComposition.mockReset();
    trackMock.mockClear();
    class FakeEventSource {
      addEventListener(): void {}
      close(): void {}
    }
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Every cutover chokepoint silently takes the server path when there is no
  // session, and the shadow never runs either — so a missing session is a total,
  // otherwise-invisible SDK bypass. These exits are its only origin.
  //
  // `stage: read` carries a reason because it was the largest remaining class
  // and a single opaque string: 56 users hit it in a 7-day window and never
  // landed one successful SDK edit between them, with no way to tell a genuinely
  // absent file from a request that never reached one.
  it("reports the HTTP status when the read fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response),
    );
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();

    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "read",
      reason: "http_error",
      status: 404,
      why: undefined,
    });
    await act(async () => root.unmount());
  });

  // `why` distinguishes the studio-server route's own 403/404 causes (the
  // project's folder having been renamed or deleted out from under a running
  // server, vs. a NUL byte, vs. a path escaping the project) from a bare
  // status code. Optional and best-effort: an older server or a non-JSON body
  // just omits it, which must not crash the read.
  it("carries the server's why when the error body has one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 404,
            json: async () => ({ error: "not found", why: "project_dir_missing" }),
          }) as Response,
      ),
    );
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();

    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "read",
      reason: "http_error",
      status: 404,
      why: "project_dir_missing",
    });
    await act(async () => root.unmount());
  });

  it("stays quiet about why when the response body cannot be parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 500,
            json: async () => {
              throw new Error("not json");
            },
          }) as unknown as Response,
      ),
    );
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();

    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "read",
      reason: "http_error",
      status: 500,
      why: undefined,
    });
    await act(async () => root.unmount());
  });

  // A fetch that REJECTS produces no response at all. It used to escape this
  // function and be caught by the effect's outer `.catch`, which reported it as
  // `stage: "open"` — a label that means openComposition threw. Every `stage:
  // open` event on 0.8.56/0.8.57 carries a fetch-rejection message, so the
  // largest failure class was a network problem reported as a parser one and
  // was unaddressable in that bucket.
  it("reports a rejected request as a read failure, not an open failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();

    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "read",
      reason: "network",
      elapsed_ms: expect.any(Number),
      hidden: expect.any(Boolean),
    });
    expect(trackMock).not.toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "open",
      error: expect.anything(),
    });
    await act(async () => root.unmount());
  });

  // `elapsed_ms` is the discriminator this event exists for: a policy block
  // (CSP, PNA, an extension rewriting fetch) rejects near-instantly; a dropped
  // connection (the tab or `preview` server going away mid-flight) rejects
  // after a real delay. Both look identical without the timing.
  it("times the network rejection from fetch start to reject", async () => {
    // Fake only the clock `performance.now` reads, not timers: other code in
    // this tree (React's own scheduler included) also calls `performance.now`,
    // so pinning return values by call order (`mockReturnValueOnce`) is
    // unreliable — a real run showed React consuming the queued values first.
    // A fake clock that only advances when we say so sidesteps that entirely.
    vi.useFakeTimers({ toFake: ["performance"] });
    let rejectFetch: ((error: unknown) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            rejectFetch = reject;
          }),
      ),
    );
    const root = createRoot(document.createElement("div"));
    // The effect runs synchronously up to `await fetch(...)`, capturing
    // `fetchStarted` at the current (fake) clock value before this returns.
    await act(async () => root.render(<Probe projectId="project-a" />));
    await vi.advanceTimersByTimeAsync(3_200);
    await act(async () => rejectFetch?.(new TypeError("Failed to fetch")));

    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "read",
      reason: "network",
      elapsed_ms: 3_200,
      hidden: false,
    });
    vi.useRealTimers();
    await act(async () => root.unmount());
  });

  it("records the page as hidden when the rejection lands after the tab is backgrounded", async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();

    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "read",
      reason: "network",
      elapsed_ms: expect.any(Number),
      hidden: true,
    });
    await act(async () => root.unmount());
    if (originalDescriptor) Object.defineProperty(document, "visibilityState", originalDescriptor);
  });

  it("separates an unexpected response shape from a failed request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response),
    );
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();

    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "read",
      reason: "missing_content",
    });
    await act(async () => root.unmount());
  });

  // `optional=1` answers a file that is not on disk with 200 + an empty string,
  // so this is what "the composition genuinely is not there" looks like on the
  // wire — previously indistinguishable from a broken request. The shim and a
  // real 0-byte file are the same response, hence the name.
  // An older server sends no `missing` field, so the combined label stays —
  // rather than guessing one of the two and quietly corrupting the series.
  it("keeps the combined label when the server does not say which empty this is", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ content: "" }) }) as Response),
    );
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();

    // No fileTree passed (this Probe doesn't have one) — path_in_tree stays
    // null, same as before the tree loads. See the tree-aware tests below.
    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "read",
      reason: "absent_or_empty",
      path_in_tree: null,
    });
    await act(async () => root.unmount());
  });

  // `missing: true` is the route's shim — nothing resolved at that path.
  it("reports a file the server could not find as absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => ({ ok: true, json: async () => ({ content: "", missing: true }) }) as Response,
      ),
    );
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();

    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "read",
      reason: "absent",
      path_in_tree: null,
    });
    await act(async () => root.unmount());
  });

  // `missing: false` with empty content is a real 0-byte file on disk — a
  // placeholder somebody created and has not written yet, not a bad path.
  it("reports a real zero-byte file separately from an absent one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => ({ ok: true, json: async () => ({ content: "", missing: false }) }) as Response,
      ),
    );
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();

    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "read",
      reason: "empty_file",
      path_in_tree: null,
    });
    await act(async () => root.unmount());
  });

  // A 200 carrying HTML is an SPA fallback or a proxy answering in the route's
  // place. Before this, `res.json()` rejected outside any catch and the outer
  // catch filed it as `stage: "open"` — blaming the user's composition for a
  // response the composition had nothing to do with.
  it("reports a non-JSON 200 as a read failure, not a composition parse failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            headers: { get: () => "text/html; charset=utf-8" },
            json: async () => {
              throw new SyntaxError(`Unexpected token '<', "<!-- /*!"... is not valid JSON`);
            },
          }) as unknown as Response,
      ),
    );
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();

    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "read",
      reason: "invalid_json",
      content_type: "text/html; charset=utf-8",
    });
    expect(trackMock).not.toHaveBeenCalledWith(
      "sdk_session_unavailable",
      expect.objectContaining({ stage: "open" }),
    );
    await act(async () => root.unmount());
  });

  // The graveyard-refuted fix's proposed next step: instrument, don't act.
  // `path_in_tree` separates "genuinely not in the loaded tree" from
  // "concurrent/duplicate open" without deciding anything on Studio's behalf.
  // Two separate mounts (not a re-render of one): fileTree/fileTreeLoaded are
  // deliberately outside the open effect's deps — re-running the whole
  // open/dispose cycle on every tree refresh would drop a perfectly good
  // session far more often than the tree actually changes — so a prop-only
  // change on an already-mounted probe would never re-fire the read this
  // event comes from.
  it("reports path_in_tree against the caller's loaded file tree", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ content: "" }) }) as Response),
    );
    function TreeProbe({
      fileTree,
      fileTreeLoaded,
    }: {
      fileTree: string[];
      fileTreeLoaded: boolean;
    }) {
      useSdkSession("project-a", "index.html", fileTree, fileTreeLoaded);
      return null;
    }

    const rootA = createRoot(document.createElement("div"));
    await act(async () =>
      rootA.render(<TreeProbe fileTree={["other.html"]} fileTreeLoaded={true} />),
    );
    await flushAsyncEffects();
    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "read",
      reason: "absent_or_empty",
      path_in_tree: false,
    });
    await act(async () => rootA.unmount());

    trackMock.mockClear();
    const rootB = createRoot(document.createElement("div"));
    await act(async () =>
      rootB.render(<TreeProbe fileTree={["index.html"]} fileTreeLoaded={true} />),
    );
    await flushAsyncEffects();
    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "read",
      reason: "absent_or_empty",
      path_in_tree: true,
    });
    await act(async () => rootB.unmount());
  });

  // `compositionMissing` and the once-per-path refresh fallback: proven
  // 2026-09-23 that `absent` means a stale tree (refreshFileTree only runs
  // after Studio's own file ops, never on an external change), so an `absent`
  // read is the one signal that should make the tree self-correct even when
  // the SSE-driven refresh in useExternalFileChangeCoordinator is missed.
  describe("compositionMissing and the absent-read refresh fallback", () => {
    function HandleProbe({
      projectId,
      path,
      onAbsentRead,
    }: {
      projectId: string;
      path: string;
      onAbsentRead?: (path: string) => void;
    }) {
      captured.handle = useSdkSession(projectId, path, [], false, onAbsentRead);
      return null;
    }
    const captured: { handle: SdkSessionHandle | null } = { handle: null };

    it("sets compositionMissing and calls onAbsentRead once for an absent read", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            ({ ok: true, json: async () => ({ content: "", missing: true }) }) as Response,
        ),
      );
      const onAbsentRead = vi.fn();
      const root = createRoot(document.createElement("div"));
      await act(async () =>
        root.render(
          <HandleProbe projectId="project-a" path="index.html" onAbsentRead={onAbsentRead} />,
        ),
      );
      await flushAsyncEffects();

      expect(captured.handle?.compositionMissing).toBe(true);
      expect(onAbsentRead).toHaveBeenCalledOnce();
      expect(onAbsentRead).toHaveBeenCalledWith("index.html");

      // A second absent read for the SAME path must not refresh again — the
      // refresh already ran and didn't fix it (the file really is gone).
      await act(async () => {
        captured.handle?.forceReload();
      });
      await flushAsyncEffects();
      expect(onAbsentRead).toHaveBeenCalledOnce();

      await act(async () => root.unmount());
    });

    it("calls onAbsentRead again for a different path", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            ({ ok: true, json: async () => ({ content: "", missing: true }) }) as Response,
        ),
      );
      const onAbsentRead = vi.fn();
      const root = createRoot(document.createElement("div"));
      await act(async () =>
        root.render(
          <HandleProbe projectId="project-a" path="scenes/a.html" onAbsentRead={onAbsentRead} />,
        ),
      );
      await flushAsyncEffects();
      await act(async () =>
        root.render(
          <HandleProbe projectId="project-a" path="scenes/b.html" onAbsentRead={onAbsentRead} />,
        ),
      );
      await flushAsyncEffects();

      expect(onAbsentRead).toHaveBeenCalledTimes(2);
      expect(onAbsentRead).toHaveBeenNthCalledWith(1, "scenes/a.html");
      expect(onAbsentRead).toHaveBeenNthCalledWith(2, "scenes/b.html");
      await act(async () => root.unmount());
    });

    it("resets the guard on project change, so the same path can refresh again", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            ({ ok: true, json: async () => ({ content: "", missing: true }) }) as Response,
        ),
      );
      const onAbsentRead = vi.fn();
      const root = createRoot(document.createElement("div"));
      await act(async () =>
        root.render(
          <HandleProbe projectId="project-a" path="index.html" onAbsentRead={onAbsentRead} />,
        ),
      );
      await flushAsyncEffects();
      await act(async () => {
        usePlayerStore.getState().beginTimelineSession("project-b");
        usePlayerStore.getState().markPreviewBooted();
        root.render(
          <HandleProbe projectId="project-b" path="index.html" onAbsentRead={onAbsentRead} />,
        );
      });
      await flushAsyncEffects();

      expect(onAbsentRead).toHaveBeenCalledTimes(2);
      await act(async () => root.unmount());
    });

    it("clears compositionMissing once a later read succeeds", async () => {
      const fetchMock = vi.fn(
        async () => ({ ok: true, json: async () => ({ content: "", missing: true }) }) as Response,
      );
      vi.stubGlobal("fetch", fetchMock);
      openComposition.mockResolvedValue(fakeSession());
      const root = createRoot(document.createElement("div"));
      await act(async () => root.render(<HandleProbe projectId="project-a" path="index.html" />));
      await flushAsyncEffects();
      expect(captured.handle?.compositionMissing).toBe(true);

      fetchMock.mockImplementation(async () => response("PROJECT_A"));
      await act(async () => {
        captured.handle?.forceReload();
      });
      await flushAsyncEffects();

      expect(captured.handle?.compositionMissing).toBe(false);
      await act(async () => root.unmount());
    });

    it("does not throw when onAbsentRead is not supplied", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            ({ ok: true, json: async () => ({ content: "", missing: true }) }) as Response,
        ),
      );
      const root = createRoot(document.createElement("div"));
      await act(async () => root.render(<HandleProbe projectId="project-a" path="index.html" />));
      await flushAsyncEffects();

      expect(captured.handle?.compositionMissing).toBe(true);
      await act(async () => root.unmount());
    });
  });

  it("reports a parse failure with its message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response("PROJECT_A")),
    );
    openComposition.mockRejectedValue(new Error("unparseable composition"));

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();

    expect(trackMock).toHaveBeenCalledWith("sdk_session_unavailable", {
      stage: "open",
      error: "unparseable composition",
    });
    await act(async () => root.unmount());
  });

  it("stays silent on the happy path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response("PROJECT_A")),
    );
    openComposition.mockResolvedValue(fakeSession());

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe projectId="project-a" />));
    await flushAsyncEffects();

    expect(trackMock).not.toHaveBeenCalledWith("sdk_session_unavailable", expect.anything());
    await act(async () => root.unmount());
  });
});
