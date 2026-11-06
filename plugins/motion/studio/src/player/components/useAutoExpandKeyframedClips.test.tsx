// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import { useAutoExpandKeyframedClips } from "./useAutoExpandKeyframedClips";

const studioShell = vi.hoisted(() => ({ projectId: "project-a" }));
vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContextOptional: () => studioShell,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  studioShell.projectId = "project-a";
  usePlayerStore.getState().reset();
});

const animations = new Map<string, GsapAnimation[]>([
  [
    "clip-1",
    [
      {
        id: "position-tween",
        targetSelector: "#clip-1",
        method: "to",
        position: 0,
        duration: 1,
        properties: { x: 100 },
        propertyGroup: "position",
      },
    ],
  ],
]);

function AutoExpandHarness({ value }: { value: Map<string, GsapAnimation[]> }) {
  useAutoExpandKeyframedClips(value);
  return null;
}

describe("useAutoExpandKeyframedClips", () => {
  it("preserves manual collapse within a project and expands again in a different project", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = (projectId: string, value = new Map(animations)) => {
      studioShell.projectId = projectId;
      act(() => root.render(<AutoExpandHarness value={value} />));
    };

    const projectAAnimations = new Map(animations);
    render("project-a", projectAAnimations);
    expect(usePlayerStore.getState().expandedClipIds).toEqual(new Set(["clip-1"]));

    act(() => usePlayerStore.getState().toggleClipExpanded("clip-1"));
    expect(usePlayerStore.getState().expandedClipIds).toEqual(new Set());

    const refreshedProjectAAnimations = new Map(animations);
    render("project-a", refreshedProjectAAnimations);
    expect(usePlayerStore.getState().expandedClipIds).toEqual(new Set());

    render("project-b", refreshedProjectAAnimations);
    expect(usePlayerStore.getState().expandedClipIds).toEqual(new Set());

    render("project-b", new Map());
    render("project-b");
    expect(usePlayerStore.getState().expandedClipIds).toEqual(new Set(["clip-1"]));

    act(() => root.unmount());
  });
});
