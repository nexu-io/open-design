// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { installReactActEnvironment } from "../../hooks/domSelectionTestHarness";
import { liveTime, usePlayerStore } from "../../player/store/playerStore";
import { useCompositionStack } from "./useCompositionStack";

installReactActEnvironment();

describe("useCompositionStack — drilling into a composition file", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  for (const compositionSrc of [
    "sections/compositions/x.html",
    "http://localhost:5190/api/projects/p/preview/sections/compositions/x.html",
    "/api/projects/p/preview/comp/sections/compositions/x.html",
  ]) {
    it(`opens the full project path for ${compositionSrc}`, async () => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      let stack!: ReturnType<typeof useCompositionStack>;
      function Harness() {
        stack = useCompositionStack({ projectId: "p" });
        return null;
      }
      await act(async () => {
        root.render(<Harness />);
      });
      await act(async () => {
        stack.handleDrillDown({ id: "x", compositionSrc });
      });
      expect(stack.compositionStack[1]).toMatchObject({
        id: "sections/compositions/x.html",
        previewUrl: "/api/projects/p/preview/comp/sections/compositions/x.html",
      });
      act(() => root.unmount());
    });
  }

  it("keeps a top-level compositions/ path and drops a leading ./", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let stack!: ReturnType<typeof useCompositionStack>;
    function Harness() {
      stack = useCompositionStack({ projectId: "p" });
      return null;
    }
    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      stack.handleDrillDown({ id: "x", compositionSrc: "./compositions/x.html" });
    });
    expect(stack.compositionStack[1]?.id).toBe("compositions/x.html");
    act(() => root.unmount());
  });
});

describe("useCompositionStack — project scoping", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  for (const activeCompositionPath of [null, "index.html"] as const) {
    it(`rebuilds the master preview URL on a project switch with ${String(activeCompositionPath)}`, async () => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      let previewUrl = "";

      function Harness(props: { projectId: string; activeCompositionPath: string | null }) {
        previewUrl = useCompositionStack(props).compositionStack[0]?.previewUrl ?? "";
        return null;
      }

      await act(async () => {
        root.render(
          <Harness projectId="project-a" activeCompositionPath={activeCompositionPath} />,
        );
      });
      expect(previewUrl).toBe("/api/projects/project-a/preview");

      await act(async () => {
        root.render(
          <Harness projectId="project-b" activeCompositionPath={activeCompositionPath} />,
        );
      });
      expect(previewUrl).toBe("/api/projects/project-b/preview");

      act(() => root.unmount());
    });
  }
});

describe("useCompositionStack — activating a composition by path", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function mountStack(activeCompositionPath: string | null) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const seen: { stack: ReturnType<typeof useCompositionStack>["compositionStack"] } = {
      stack: [],
    };

    function Harness(props: { activeCompositionPath: string | null }) {
      seen.stack = useCompositionStack({ projectId: "p", ...props }).compositionStack;
      return null;
    }

    return { root, seen, Harness, activeCompositionPath };
  }

  // The root stays on the master level; everything else pushes a second level.
  for (const path of [
    "compositions/scene-a.html",
    "parts/part-1.html",
    "chapter-2.html",
    "a/b/c/deep.html",
  ]) {
    it(`pushes a level for ${path}`, async () => {
      const { root, seen, Harness } = mountStack(path);

      await act(async () => {
        root.render(<Harness activeCompositionPath={path} />);
      });

      expect(seen.stack).toHaveLength(2);
      expect(seen.stack[1]?.id).toBe(path);
      expect(seen.stack[1]?.previewUrl).toBe(`/api/projects/p/preview/comp/${path}`);

      act(() => root.unmount());
    });
  }

  it("labels a non-compositions/ path without mangling it", async () => {
    const { root, seen, Harness } = mountStack("parts/part-1.html");

    await act(async () => {
      root.render(<Harness activeCompositionPath="parts/part-1.html" />);
    });

    expect(seen.stack[1]?.label).toBe("parts/part-1");

    act(() => root.unmount());
  });

  it("keeps the master alone for the root composition", async () => {
    const { root, seen, Harness } = mountStack("index.html");

    await act(async () => {
      root.render(<Harness activeCompositionPath="index.html" />);
    });

    expect(seen.stack).toHaveLength(1);
    expect(seen.stack[0]?.id).toBe("master");

    act(() => root.unmount());
  });
});

describe("useCompositionStack — back to the master", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    usePlayerStore.getState().setCurrentTime(0);
    usePlayerStore.getState().setIsPlaying(false);
  });

  const INTRO = { id: "intro", compositionSrc: "compositions/intro.html" };
  const LOGO = { id: "logo", compositionSrc: "compositions/logo.html" };
  const seek = (time: number) => act(() => usePlayerStore.getState().setCurrentTime(time));
  const time = () => usePlayerStore.getState().currentTime;

  async function mount(props: { projectId?: string; activeCompositionPath?: string | null } = {}) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const seen = {} as { stack: ReturnType<typeof useCompositionStack> };
    function Harness(p: { projectId: string; activeCompositionPath: string | null }) {
      seen.stack = useCompositionStack(p);
      return null;
    }
    const render = async (next: typeof props) => {
      props = { ...props, ...next };
      await act(async () => {
        root.render(
          <Harness
            projectId={props.projectId ?? "p"}
            activeCompositionPath={props.activeCompositionPath ?? null}
          />,
        );
      });
    };
    await render({});
    const run = async (step: (stack: ReturnType<typeof useCompositionStack>) => void) => {
      await act(async () => step(seen.stack));
    };
    return { seen, render, run, unmount: () => act(() => root.unmount()) };
  }

  it("restores the master playhead from the breadcrumb after a two-level drill", async () => {
    const { seen, run, unmount } = await mount();
    seek(12);
    await run((s) => s.handleDrillDown(INTRO));
    seek(3);
    await run((s) => s.handleDrillDown(LOGO));
    expect(seen.stack.compositionStack.map((level) => level.label)).toEqual([
      "Master",
      "intro",
      "logo",
    ]);
    await run((s) => s.handleNavigateComposition(0));
    expect(time()).toBe(12);
    unmount();
  });

  it("restores the master playhead when Escape or a timeline double-click goes back", async () => {
    const { run, unmount } = await mount();
    seek(12);
    await run((s) => s.handleDrillDown(INTRO));
    seek(3);
    await run((s) => s.handleDrillDown(LOGO));
    seek(1);
    await run((s) => s.updateCompositionStack((prev) => prev.slice(0, -1)));
    expect(time()).toBe(1);
    await run((s) => s.updateCompositionStack((prev) => prev.slice(0, -1)));
    expect(time()).toBe(12);
    unmount();
  });

  it("restores the live master playhead when the drill happens during playback", async () => {
    const { run, unmount } = await mount();
    seek(4);
    act(() => usePlayerStore.getState().setIsPlaying(true));
    liveTime.notify(9);
    await run((s) => s.handleDrillDown(INTRO));
    act(() => usePlayerStore.getState().setIsPlaying(false));
    seek(2);
    await run((s) => s.handleNavigateComposition(0));
    expect(time()).toBe(9);
    unmount();
  });

  it("saves the master playhead at the first of two drills in one batch", async () => {
    const { run, unmount } = await mount();
    seek(12);
    await run((s) => {
      s.handleDrillDown(INTRO);
      usePlayerStore.getState().setCurrentTime(7);
      s.handleDrillDown(LOGO);
    });
    await run((s) => s.handleNavigateComposition(0));
    expect(time()).toBe(12);
    unmount();
  });

  it("restores a master playhead of exactly 0", async () => {
    const { run, unmount } = await mount();
    await run((s) => s.handleDrillDown(INTRO));
    seek(3);
    await run((s) => s.handleNavigateComposition(0));
    expect(time()).toBe(0);
    unmount();
  });

  it("restores the master playhead when the Comps panel goes there and back", async () => {
    const { render, unmount } = await mount();
    seek(30);
    await render({ activeCompositionPath: "compositions/intro.html" });
    seek(4);
    await render({ activeCompositionPath: "index.html" });
    expect(time()).toBe(30);
    unmount();
  });

  it("does not carry one project's master playhead into another", async () => {
    const { run, render, unmount } = await mount({ projectId: "a" });
    seek(12);
    await run((s) => s.handleDrillDown(INTRO));
    seek(3);
    await render({ projectId: "b" });
    expect(time()).toBe(3);
    unmount();
  });
});
