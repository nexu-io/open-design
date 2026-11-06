import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { vi } from "vitest";

export interface SplitBody {
  splitTime: number;
  elementStart: number;
  elementDuration: number;
}

interface BatchFileBody {
  path: string;
  targets: SplitBody[];
}

function decodePathFromUrl(url: string, marker: string): string {
  const encoded = url.slice(url.indexOf(marker) + marker.length);
  return decodeURIComponent(encoded);
}

/**
 * Fetch mock shared by both harnesses: the atomic split batch writes each file
 * once and returns its canonical snapshots; file reads echo the in-memory disk.
 */
export function createSplitFetchMock(
  disk: Record<string, string>,
  onSplit?: (path: string, body: SplitBody) => void,
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/file-mutations/split-batch")) {
      const body = JSON.parse(String(init?.body)) as { files: BatchFileBody[] };
      const files = body.files.map((file) => {
        const before = disk[file.path];
        for (const target of file.targets) onSplit?.(file.path, target);
        const after = `${before}${"<!--split-->".repeat(file.targets.length)}`;
        const version = `"test-${file.path}-${after.length}"`;
        return {
          path: file.path,
          before,
          after,
          version,
          writeToken: "test-cut",
          splitCount: file.targets.length,
          skippedSelectors: [],
        };
      });
      for (const file of files) disk[file.path] = file.after;
      return new Response(JSON.stringify({ ok: true, outcome: "committed", files }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes("/files/")) {
      const path = decodePathFromUrl(u, "/files/").replace(/\?.*$/, "");
      const content = disk[path] ?? "";
      return new Response(
        JSON.stringify({ content, version: `"test-${path}-${content.length}"` }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    void init;
    throw new Error(`unexpected fetch: ${u}`);
  });
}

/** Mount a render-only probe component into a fresh host and return its root. */
export function mountProbe(Component: React.ComponentType): ReturnType<typeof createRoot> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(React.createElement(Component)));
  return root;
}
