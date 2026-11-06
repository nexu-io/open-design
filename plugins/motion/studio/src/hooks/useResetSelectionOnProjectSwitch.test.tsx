// @vitest-environment happy-dom

import { act, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResetSelectionOnProjectSwitch } from "./useResetSelectionOnProjectSwitch";
import { useAutoOpenRootComposition } from "./useAutoOpenRootComposition";
import { useActiveComposition } from "./useActiveComposition";
import { useFileTree } from "./useFileTree";
import {
  isHydratedFromUrlState,
  readStudioUrlStateFromWindow,
  resolveMasterCompositionPath,
} from "../utils/studioUrlState";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  window.location.hash = "";
});

describe("useResetSelectionOnProjectSwitch", () => {
  function ResetHarness({ projectId }: { projectId: string | null }) {
    const initialUrlStateRef = useRef(readStudioUrlStateFromWindow());
    const [activeCompPath, setActiveCompPath] = useState<string | null>("stale-comp.html");
    const [activeCompPathHydrated, setActiveCompPathHydrated] = useState(true);
    useResetSelectionOnProjectSwitch({
      projectId,
      initialUrlStateRef,
      setActiveCompPath,
      setActiveCompPathHydrated,
    });
    return (
      <div
        data-active-comp-path={activeCompPath ?? ""}
        data-hydrated={String(activeCompPathHydrated)}
      />
    );
  }

  it("does not reset on the initial resolution from null", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(<ResetHarness projectId={null} />);
    });
    act(() => {
      root?.render(<ResetHarness projectId="project-a" />);
    });
    const el = host.firstElementChild as HTMLElement;
    expect(el.dataset.activeCompPath).toBe("stale-comp.html");
  });

  it("resets activeCompPath and re-derives hydrated on an actual project switch", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(<ResetHarness projectId="project-a" />);
    });
    act(() => {
      root?.render(<ResetHarness projectId="project-b" />);
    });
    const el = host.firstElementChild as HTMLElement;
    expect(el.dataset.activeCompPath).toBe("");
    expect(el.dataset.hydrated).toBe("true");
  });
});

describe("project switch integration (mirrors App.tsx's wiring)", () => {
  function AppLikeHarness({
    projectId,
    masterCompPath,
    onSelectComposition,
  }: {
    projectId: string | null;
    masterCompPath: string | null;
    onSelectComposition: (comp: string) => void;
  }) {
    const initialUrlStateRef = useRef(readStudioUrlStateFromWindow());
    const [activeCompPath, setActiveCompPath] = useState<string | null>(null);
    const [activeCompPathHydrated, setActiveCompPathHydrated] = useState(() =>
      isHydratedFromUrlState(initialUrlStateRef.current),
    );
    // Mirrors handleSelectComposition (useCompositionContentLoader): selecting a composition
    // also updates activeCompPath, which is exactly the state that must be reset on switch.
    const handleSelect = (comp: string) => {
      setActiveCompPath(comp);
      onSelectComposition(comp);
    };
    // Mirrors useActiveComposition's wiring: reset as a sibling call, before auto-open.
    useResetSelectionOnProjectSwitch({
      projectId,
      initialUrlStateRef,
      setActiveCompPath,
      setActiveCompPathHydrated,
    });
    useAutoOpenRootComposition({
      projectId,
      activeCompPath,
      activeCompPathHydrated,
      masterCompPath,
      onSelectComposition: handleSelect,
    });
    return null;
  }

  it("opens the new project's root after switching projects with a composition already open", () => {
    const onSelectComposition = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    // Project A resolves and auto-opens its root, which also sets activeCompPath — the
    // "something already open" state a real user would be in before switching projects.
    act(() => {
      root?.render(
        <AppLikeHarness
          projectId="project-a"
          masterCompPath="index.html"
          onSelectComposition={onSelectComposition}
        />,
      );
    });
    expect(onSelectComposition).toHaveBeenCalledExactlyOnceWith("index.html");
    onSelectComposition.mockClear();

    // Switch to project B in-session (hash change, no remount) — this is the exact scenario
    // the adversarial review found broken: activeCompPath was never reset, so project B's
    // auto-open silently no-op'd because activeCompPath still read as "already set".
    act(() => {
      root?.render(
        <AppLikeHarness
          projectId="project-b"
          masterCompPath="hero.html"
          onSelectComposition={onSelectComposition}
        />,
      );
    });

    expect(onSelectComposition).toHaveBeenCalledExactlyOnceWith("hero.html");
  });
});

describe("full stack: useFileTree -> useActiveComposition (masterCompPath staleness)", () => {
  const PROJECT_DATA: Record<string, { files: string[]; compositions: string[] }> = {
    "project-a": { files: ["index.html"], compositions: ["index.html"] },
    "project-b": { files: ["hero.html"], compositions: ["hero.html"] },
    // A preset/vendor .html can be in `files` without being a real composition —
    // this is the exact shape a review found auto-open mis-targeting.
    "project-c": { files: ["preset.html", "hero.html"], compositions: ["hero.html"] },
  };

  function mockFetch(url: string): Promise<Response> {
    const match = /^\/api\/projects\/([^/]+)$/.exec(url);
    if (match) {
      const data = PROJECT_DATA[decodeURIComponent(match[1])] ?? { files: [], compositions: [] };
      return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  }

  function FullStackHarness({ projectId }: { projectId: string | null }) {
    const initialUrlStateRef = useRef(readStudioUrlStateFromWindow());
    const projectIdRef = useRef(projectId);
    projectIdRef.current = projectId;
    const { fileTree, fileTreeLoaded, compositions } = useFileTree({ projectId, projectIdRef });
    const masterCompPath = useMemo(
      () => resolveMasterCompositionPath(compositions),
      [compositions],
    );
    const { activeCompPath } = useActiveComposition({
      projectId,
      initialUrlStateRef,
      fileTree,
      fileTreeLoaded,
      masterCompPath,
      setEditingFile: vi.fn(),
      showToast: vi.fn(),
    });
    return <div data-active-comp-path={activeCompPath ?? ""} />;
  }

  it("opens project B's real root, not project A's stale master path, on an in-session switch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as typeof fetch);
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(<FullStackHarness projectId="project-a" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    let el = host.firstElementChild as HTMLElement;
    expect(el.dataset.activeCompPath).toBe("index.html");

    // Switch in-session (no remount) before asserting — this is the exact race the
    // adversarial review found: project A's fileTree/masterCompPath are still in state
    // for at least one render after projectId flips, until B's own fetch resolves.
    await act(async () => {
      root?.render(<FullStackHarness projectId="project-b" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    el = host.firstElementChild as HTMLElement;
    expect(el.dataset.activeCompPath).toBe("hero.html");

    fetchSpy.mockRestore();
  });

  it("auto-opens the real composition, not a non-composition .html earlier in the file list", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as typeof fetch);
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(<FullStackHarness projectId="project-c" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const el = host.firstElementChild as HTMLElement;
    expect(el.dataset.activeCompPath).toBe("hero.html");

    fetchSpy.mockRestore();
  });
});
