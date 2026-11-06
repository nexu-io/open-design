// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectUnreachableBanner } from "./ProjectUnreachableBanner";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubProjects(projects: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ projects }), { status: 200 })),
  );
}

async function renderBanner(projectId: string): Promise<string> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<ProjectUnreachableBanner projectId={projectId} />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return host.textContent ?? "";
}

describe("ProjectUnreachableBanner", () => {
  // The production case: the CLI host serves exactly one project, and it is not
  // this tab's. Naming both sides is the whole point — the user needs to know
  // their project still exists and which one this Studio actually opened.
  it("names both projects when this Studio serves a different one", async () => {
    stubProjects([{ id: "out-video1", title: "out-video1" }]);
    const text = await renderBanner("out-fb1");

    expect(text).toContain("out-video1");
    expect(text).toContain("out-fb1");
    expect(text).toContain("This Studio is serving");
    expect(text).not.toContain("renamed");
  });

  // With several projects a 404 cannot be told apart from a rename or a
  // deletion, so the banner must not claim a cause. "Could be gone" is the
  // honest ceiling, and it is a weaker claim than "is gone".
  it("does not claim a cause when several projects are served", async () => {
    stubProjects([
      { id: "a", title: "a" },
      { id: "b", title: "b" },
    ]);
    const text = await renderBanner("out-fb1");

    expect(text).toContain("renamed, moved, or deleted");
    expect(text).not.toContain("This Studio is serving");
  });

  // A server that answers with this tab's own project while the read 404s is
  // not the stale-tab case, so the single-project wording would be false.
  it("falls back to the general wording when the served project is this one", async () => {
    stubProjects([{ id: "out-fb1", title: "out-fb1" }]);
    const text = await renderBanner("out-fb1");

    expect(text).toContain("renamed, moved, or deleted");
    expect(text).not.toContain("This Studio is serving");
  });

  it("says nothing it cannot back up when the project list cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const text = await renderBanner("out-fb1");

    expect(text).toContain("renamed, moved, or deleted");
    expect(text).not.toContain("This Studio is serving");
  });

  it("renders nothing until the project list resolves", async () => {
    let resolveList: ((value: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveList = resolve;
          }),
      ),
    );
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<ProjectUnreachableBanner projectId="out-fb1" />);
    });
    expect(host.textContent).toBe("");

    await act(async () => {
      resolveList?.(new Response(JSON.stringify({ projects: [{ id: "other" }] }), { status: 200 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.textContent).toContain("This Studio is serving");
  });
});
