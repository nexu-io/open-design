import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchParsedAnimations } from "./keyframeCacheAstLoad";
import { usePlayerStore } from "../player/store/playerStore";

/**
 * Parsing a composition is a whole-file read + parse on the server, and a
 * multi-element action asks for the same file once per element. Callers that
 * overlap in time share one request; a caller that comes after the last one
 * settled does not, so a parse issued after a write is never served a
 * pre-write answer.
 */
describe("fetchParsedAnimations — in-flight sharing", () => {
  beforeEach(() => {
    usePlayerStore.setState({ timelineProjectId: "p", previewBooted: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not ask the server to parse until the live preview has booted", async () => {
    usePlayerStore.setState({ previewBooted: false });
    const fetchStub = stubFetch();

    const parsed = fetchParsedAnimations("p", "boot.html");
    await Promise.resolve();
    expect(fetchStub.calls()).toBe(0);

    usePlayerStore.getState().markPreviewBooted();
    await vi.waitFor(() => expect(fetchStub.calls()).toBe(1));
    fetchStub.settle();
    expect((await parsed)?.animations).toHaveLength(1);
  });

  it("drops a parse for a project the user left before its preview booted", async () => {
    usePlayerStore.setState({ previewBooted: false });
    const fetchStub = stubFetch();

    const parsed = fetchParsedAnimations("p", "left.html");
    usePlayerStore.getState().beginTimelineSession("q");
    usePlayerStore.getState().markPreviewBooted();

    expect(await parsed).toBeNull();
    expect(fetchStub.calls()).toBe(0);
  });

  function stubFetch(): { calls: () => number; settle: () => void } {
    let calls = 0;
    const pending: Array<() => void> = [];
    vi.stubGlobal("fetch", () => {
      calls++;
      return new Promise((resolve) => {
        pending.push(() =>
          resolve({
            ok: true,
            json: () => Promise.resolve({ animations: [{ id: "a", targetSelector: "#a" }] }),
          } as Response),
        );
      });
    });
    return {
      calls: () => calls,
      settle: () => {
        for (const release of pending.splice(0, pending.length)) release();
      },
    };
  }

  it("serves overlapping reads of one file from a single request", async () => {
    const fetchStub = stubFetch();

    const pending = [
      fetchParsedAnimations("p", "index.html"),
      fetchParsedAnimations("p", "index.html"),
      fetchParsedAnimations("p", "index.html"),
    ];
    fetchStub.settle();
    const results = await Promise.all(pending);

    expect(fetchStub.calls()).toBe(1);
    expect(results.map((parsed) => parsed?.animations.length)).toEqual([1, 1, 1]);
  });

  it("does not share across files", async () => {
    const fetchStub = stubFetch();

    const pending = [
      fetchParsedAnimations("p", "index.html"),
      fetchParsedAnimations("p", "other.html"),
    ];
    fetchStub.settle();
    await Promise.all(pending);

    expect(fetchStub.calls()).toBe(2);
  });

  it("re-requests once the previous read has settled", async () => {
    const fetchStub = stubFetch();

    const first = fetchParsedAnimations("p", "index.html");
    fetchStub.settle();
    await first;
    const second = fetchParsedAnimations("p", "index.html");
    fetchStub.settle();
    await second;

    expect(fetchStub.calls()).toBe(2);
  });

  it("supersedes an in-flight pre-write parse with a fresh post-write read", async () => {
    const releases: Array<(response: Response) => void> = [];
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          releases.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const response = (id: string) =>
      ({
        ok: true,
        json: () => Promise.resolve({ animations: [{ id, targetSelector: `#${id}` }] }),
      }) as Response;

    const stale = fetchParsedAnimations("p", "index.html");
    const fresh = fetchParsedAnimations("p", "index.html", { fresh: true });
    expect(fetch).toHaveBeenCalledTimes(2);

    releases[0]?.(response("stale"));
    await stale;
    const overlappingFreshRead = fetchParsedAnimations("p", "index.html");
    expect(fetch).toHaveBeenCalledTimes(2);

    releases[1]?.(response("fresh"));
    const [freshResult, sharedResult] = await Promise.all([fresh, overlappingFreshRead]);
    expect(freshResult?.animations[0]?.id).toBe("fresh");
    expect(sharedResult?.animations[0]?.id).toBe("fresh");
  });
});
