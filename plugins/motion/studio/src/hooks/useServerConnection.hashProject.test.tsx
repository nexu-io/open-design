// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { useServerConnection } from "./useServerConnection";

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const captured: { projectId: string | null } = { projectId: null };

function Probe() {
  captured.projectId = useServerConnection().projectId;
  return null;
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * The hash project id outlives the project it names — a renamed folder, or a
 * bookmark from a project that is gone. It used to be trusted unconditionally,
 * so every later /api/projects/<id>/... request 404'd for the life of the tab,
 * including the composition read that opens the SDK session. Telemetry after
 * the read-reason split: 120 http_error/404 reads across 5 users in 24h.
 */
function stubFetch(projectRoute: { status: number } | "reject") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/projects") {
        return { ok: true, json: async () => ({ projects: [{ id: "real-project" }] }) } as Response;
      }
      if (projectRoute === "reject") throw new TypeError("Failed to fetch");
      return { ok: projectRoute.status === 200, status: projectRoute.status } as Response;
    }),
  );
}

async function renderWithHash(hash: string) {
  window.location.hash = hash;
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
  await flush();
  return root;
}

describe("useServerConnection hash project id", () => {
  beforeEach(() => {
    captured.projectId = null;
    window.location.hash = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(trackStudioEvent).mockClear();
  });

  it("keeps a hash id the server can resolve", async () => {
    stubFetch({ status: 200 });
    const root = await renderWithHash("#project/stale-or-not");

    expect(captured.projectId).toBe("stale-or-not");
    await act(async () => root.unmount());
  });

  it("falls back to the first project when the hash id is gone", async () => {
    stubFetch({ status: 404 });
    const root = await renderWithHash("#project/deleted-project");

    expect(captured.projectId).toBe("real-project");
    expect(window.location.hash).toContain("real-project");
    await act(async () => root.unmount());
  });

  // The important one: a blip must not rewrite the user's hash out from under a
  // project that is actually fine. Only a definite 404 is "missing".
  it("keeps the hash id when the check itself fails", async () => {
    stubFetch("reject");
    const root = await renderWithHash("#project/unreachable-check");

    expect(captured.projectId).toBe("unreachable-check");
    await act(async () => root.unmount());
  });

  it("keeps the hash id on a non-404 error status", async () => {
    stubFetch({ status: 500 });
    const root = await renderWithHash("#project/server-erroring");

    expect(captured.projectId).toBe("server-erroring");
    await act(async () => root.unmount());
  });
});

/** Per-project status, so one test can hold two projects in different states. */
function stubFetchByProject(statuses: Record<string, number | "reject">) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/projects") {
        return {
          ok: true,
          json: async () => ({ projects: [{ id: "real-project" }] }),
        } as Response;
      }
      const id = decodeURIComponent(url.replace("/api/projects/", ""));
      const status = statuses[id];
      if (status === "reject") throw new TypeError("Failed to fetch");
      if (status === undefined) return { ok: false, status: 404 } as Response;
      return { ok: status === 200, status } as Response;
    }),
  );
}

async function changeHash(hash: string) {
  await act(async () => {
    window.location.hash = hash;
  });
  await flush();
}

/**
 * Change the hash WITHOUT the test itself pushing or firing anything.
 *
 * `location.hash =` does both, which makes "did the CODE push?" unanswerable —
 * the test's own navigation moves history.length either way. replaceState does
 * neither, so the dispatch is explicit and any growth after it is the hook's.
 */
async function replaceHashAndDispatch(hash: string) {
  await act(async () => {
    window.history.replaceState(null, "", hash);
    window.dispatchEvent(new Event("hashchange"));
  });
  await flush();
}

/**
 * The hashchange path took any id the URL offered, with no validation — so the
 * mount fix from v0.8.52 could be walked straight around by changing projects.
 * These pin the second door shut.
 */
describe("useServerConnection hashchange validation", () => {
  beforeEach(() => {
    captured.projectId = null;
    window.location.hash = "";
    vi.mocked(trackStudioEvent).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adopts a hash id the server can resolve", async () => {
    stubFetchByProject({ first: 200, second: 200 });
    const root = await renderWithHash("#project/first");
    expect(captured.projectId).toBe("first");

    await changeHash("#project/second");
    expect(captured.projectId).toBe("second");
    await act(async () => root.unmount());
  });

  it("falls back to the first project when the new hash id is gone", async () => {
    stubFetchByProject({ first: 200, deleted: 404 });
    const root = await renderWithHash("#project/first");
    expect(captured.projectId).toBe("first");

    await changeHash("#project/deleted");
    expect(captured.projectId).toBe("real-project");
    expect(window.location.hash).toContain("real-project");
    await act(async () => root.unmount());
  });

  it("keeps the new hash id when the check itself fails", async () => {
    // Same transient-tolerance as the mount path: a blip must not rewrite the
    // user's hash out from under a project that is actually fine.
    stubFetchByProject({ first: 200, flaky: "reject" });
    const root = await renderWithHash("#project/first");

    await changeHash("#project/flaky");
    expect(captured.projectId).toBe("flaky");
    await act(async () => root.unmount());
  });

  it("reports the hashchange verdict with its stage", async () => {
    stubFetchByProject({ first: 200, deleted: 404 });
    const root = await renderWithHash("#project/first");
    vi.mocked(trackStudioEvent).mockClear();

    await changeHash("#project/deleted");
    const verdicts = vi
      .mocked(trackStudioEvent)
      .mock.calls.filter(([name]) => name === "project_hash_validated");
    expect(verdicts).toEqual([
      ["project_hash_validated", { stage: "hashchange", outcome: "missing", status: 404 }],
    ]);
    await act(async () => root.unmount());
  });

  it("ignores a verdict that lands after the user moved on", async () => {
    // Two changes in quick succession. The first check resolves late; if it were
    // trusted, it would adopt a project the user already navigated away from.
    let releaseFirst: (() => void) | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/projects") {
          return {
            ok: true,
            json: async () => ({ projects: [{ id: "real-project" }] }),
          } as Response;
        }
        const id = decodeURIComponent(url.replace("/api/projects/", ""));
        if (id === "slow") {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
          return { ok: true, status: 200 } as Response;
        }
        return { ok: true, status: 200 } as Response;
      }),
    );

    const root = await renderWithHash("#project/slow");
    await flush();
    // Move on before the slow validation answers.
    await act(async () => {
      window.location.hash = "#project/fast";
    });
    await flush();
    expect(captured.projectId).toBe("fast");

    // Now let the stale check resolve. It must not win.
    await act(async () => {
      releaseFirst?.();
    });
    await flush();
    expect(captured.projectId).toBe("fast");
    await act(async () => root.unmount());
  });

  it("falls back to the CURRENT project list, not the one from mount", async () => {
    // The mount fetch is a snapshot. A long-lived tab is exactly the case this
    // path exists for, so re-reading the list is the difference between landing
    // on a project that exists and landing on the one that was first an hour ago.
    let list = [{ id: "old-first" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/projects") {
          return { ok: true, json: async () => ({ projects: list }) } as Response;
        }
        const id = decodeURIComponent(url.replace("/api/projects/", ""));
        return { ok: id !== "deleted", status: id === "deleted" ? 404 : 200 } as Response;
      }),
    );

    const root = await renderWithHash("#project/old-first");
    expect(captured.projectId).toBe("old-first");

    list = [{ id: "new-first" }];
    await changeHash("#project/deleted");
    expect(captured.projectId).toBe("new-first");
    await act(async () => root.unmount());
  });

  it("re-reads the list on a second dead hash rather than reusing the first answer", async () => {
    // The caching version is invisible with one dead hash — firstProjectId runs
    // once, so a memo and a fresh fetch look identical. Two dead hashes with the
    // list changing in between is what separates them.
    let list = [{ id: "first-a" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/projects") {
          return { ok: true, json: async () => ({ projects: list }) } as Response;
        }
        const id = decodeURIComponent(url.replace("/api/projects/", ""));
        return { ok: id === "alive", status: id === "alive" ? 200 : 404 } as Response;
      }),
    );

    const root = await renderWithHash("#project/alive");
    await changeHash("#project/dead-one");
    expect(captured.projectId).toBe("first-a");

    list = [{ id: "first-b" }];
    await changeHash("#project/dead-two");
    expect(captured.projectId).toBe("first-b");
    await act(async () => root.unmount());
  });

  it("rewrites a dead hash without adding a history entry", async () => {
    // `location.hash =` pushes, which would leave the dead id one Back away —
    // and Back would then re-validate, fall back and push again, forever.
    stubFetchByProject({ first: 200, deleted: 404 });
    const root = await renderWithHash("#project/first");

    const before = window.history.length;
    await replaceHashAndDispatch("#project/deleted");
    expect(captured.projectId).toBe("real-project");
    expect(window.history.length).toBe(before);
    await act(async () => root.unmount());
  });

  it("rewrites the mount fallback without adding a history entry", async () => {
    // The mount path pushed until now — the same bug from the other end: Back
    // returned to the dead id, which re-validates and pushes again.
    stubFetchByProject({ deleted: 404 });
    window.history.replaceState(null, "", "#project/deleted");
    const before = window.history.length;

    const root = await renderWithHash("#project/deleted");
    expect(captured.projectId).toBe("real-project");
    expect(window.history.length).toBe(before);
    await act(async () => root.unmount());
  });
});

/**
 * The verdict event. Until it existed, a tab that kept its hash because the
 * check itself failed was indistinguishable in production from one that never
 * ran the check — different causes, different fixes, one silent bucket.
 */
describe("project_hash_validated", () => {
  // Mount only: assigning window.location.hash is what happy-dom turns into a
  // hashchange, so the listener reports too. This describe is about the mount
  // path; the hashchange verdicts have their own.
  const verdictCalls = () =>
    vi
      .mocked(trackStudioEvent)
      .mock.calls.filter(
        ([name, props]) =>
          name === "project_hash_validated" &&
          (props as { stage?: string } | undefined)?.stage === "mount",
      );

  beforeEach(() => {
    captured.projectId = null;
    window.location.hash = "";
    vi.mocked(trackStudioEvent).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports an ok verdict with its status", async () => {
    stubFetch({ status: 200 });
    const root = await renderWithHash("#project/stale-or-not");
    expect(verdictCalls()).toEqual([
      ["project_hash_validated", { stage: "mount", outcome: "ok", status: 200 }],
    ]);
    await act(async () => root.unmount());
  });

  it("reports a missing verdict with the 404", async () => {
    stubFetch({ status: 404 });
    const root = await renderWithHash("#project/deleted-project");
    expect(verdictCalls()).toEqual([
      ["project_hash_validated", { stage: "mount", outcome: "missing", status: 404 }],
    ]);
    await act(async () => root.unmount());
  });

  it("reports unknown with no status when the check is rejected", async () => {
    // The point of the event: this case LOOKS like success from outside (the
    // hash is kept) but is a failed check. Only the verdict says so.
    stubFetch("reject");
    const root = await renderWithHash("#project/unreachable-check");
    expect(verdictCalls()).toEqual([
      ["project_hash_validated", { stage: "mount", outcome: "unknown" }],
    ]);
    await act(async () => root.unmount());
  });

  it("reports unknown — not missing — for a 5xx", async () => {
    stubFetch({ status: 500 });
    const root = await renderWithHash("#project/server-erroring");
    expect(verdictCalls()).toEqual([
      ["project_hash_validated", { stage: "mount", outcome: "unknown", status: 500 }],
    ]);
    await act(async () => root.unmount());
  });

  it("emits nothing when there is no hash id to validate", async () => {
    stubFetch({ status: 200 });
    const root = await renderWithHash("");
    expect(verdictCalls()).toEqual([]);
    await act(async () => root.unmount());
  });
});
