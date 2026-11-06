// Shared mounting/stubbing for the useRenderQueue test files. Both of them
// need the same three things — a fetch that answers the render POST, an inert
// EventSource, and a component that exposes the hook's value — and keeping two
// copies in step is not worth the lines.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import type { useRenderQueue } from "./useRenderQueue";

export type RenderQueueApi = ReturnType<typeof useRenderQueue>;
type UseRenderQueue = typeof useRenderQueue;

// Part of the harness contract: importing it puts React in act() mode, so no
// test file has to remember to.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** Answers the render POST with a job id, and the history GET with nothing. */
export function stubRenderFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () =>
    Promise.resolve(
      new Response(JSON.stringify({ jobId: "j1", status: "rendering" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "EventSource",
    class {
      close(): void {}
      addEventListener(): void {}
    },
  );
  return fetchMock;
}

/** Render POSTs only, so assertions ignore the history GET the hook makes. */
export function renderPosts(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "POST",
  );
}

export interface MountedQueue {
  /** The hook's current value. Throws if the harness never mounted. */
  api: () => RenderQueueApi;
  unmount: () => void;
}

/**
 * Mounts the hook, starts one render, and returns the body of the POST it
 * made — the only place Studio states what to render and who to attribute it
 * to, so it is what the tests around it assert on. The caller keeps the
 * returned queue to unmount it.
 */
export async function startRenderAndReadBody(
  useRenderQueueHook: UseRenderQueue,
  {
    activeCompPath = null,
    opts,
  }: { activeCompPath?: string | null; opts?: Parameters<RenderQueueApi["startRender"]>[0] } = {},
): Promise<{ body: Record<string, unknown>; queue: MountedQueue }> {
  const fetchMock = stubRenderFetch();
  const queue = mountRenderQueue(useRenderQueueHook, "demo", activeCompPath);
  await act(async () => {
    await queue.api().startRender(opts);
  });
  const [post] = renderPosts(fetchMock) as [undefined | [string, RequestInit]];
  const body = post?.[1]?.body;
  if (body === undefined || body === null) throw new Error("hook made no POST with a body");
  return { body: JSON.parse(String(body)) as Record<string, unknown>, queue };
}

export function mountRenderQueue(
  useRenderQueueHook: UseRenderQueue,
  projectId = "demo",
  activeCompPath: string | null = null,
): MountedQueue {
  let current: RenderQueueApi | null = null;
  const activeCompPathRef = { current: activeCompPath };
  function Harness(): null {
    current = useRenderQueueHook(projectId, activeCompPathRef);
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);
  act(() => {
    root.render(<Harness />);
  });
  return {
    api: () => {
      if (!current) throw new Error("useRenderQueue harness did not mount");
      return current;
    },
    unmount: () => act(() => root.unmount()),
  };
}
