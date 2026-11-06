// @vitest-environment jsdom

/**
 * The carve's auto-group write path, end to end from the ids its picker hands
 * over. Both callers — the carve picker (`withAutoGroupedSources`) and the
 * timeline's group-pointer button — name clips by DOM id, because that is the
 * space `collectCarveCandidates` reads them out of and the space
 * `resolveAudioGroups` reads them back in. Resolving against store keys here
 * matched nothing, wrote nothing, threw nothing, and let the carve persist
 * `sources: [<group>]` for a group that was never created — a carve silently
 * not ducking.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore, type TimelineElement } from "../player";
import { useAudioGroupCarveAssignment } from "./timelineAudioGroupCreate";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  usePlayerStore.getState().reset();
});

const FILE = `<html><body>
<audio id="voice-1" data-start="0" data-duration="5"></audio>
<audio id="voice-2" data-start="5" data-duration="5"></audio>
</body></html>`;

function stubProjectFiles(files: Map<string, string>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const path = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
      const content = files.get(path);
      return new Response(JSON.stringify({ content }), {
        status: content === undefined ? 404 : 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

function audio(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: overrides.domId ?? "clip",
    // A store key that is NOT the DOM id — the shape every real row has.
    key: `index.html#${overrides.domId ?? "clip"}`,
    tag: "audio",
    start: 0,
    duration: 5,
    track: 0,
    ...overrides,
  };
}

type Assign = (clipIds: readonly string[], groupId: string) => Promise<void>;

function renderAssign(writeProjectFile: (path: string, content: string) => Promise<void>) {
  const showToast = vi.fn();
  // A holder, not a bare `let`: TS narrows a variable only assigned inside a
  // component body to `never` at the call site.
  const held: { assign: Assign | null } = { assign: null };
  function Probe() {
    held.assign = useAudioGroupCarveAssignment({
      projectIdRef: { current: "project-1" },
      activeCompPath: "index.html",
      showToast,
      writeProjectFile,
      recordEdit: async () => {},
      pendingTimelineEditPathRef: { current: new Set() },
      previewIframeRef: { current: null },
    });
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  const assign = held.assign;
  expect(assign).not.toBeNull();
  return { assign: assign as Assign, showToast, root };
}

describe("useAudioGroupCarveAssignment", () => {
  it("resolves the picker's DOM ids and writes the group", async () => {
    stubProjectFiles(new Map([["index.html", FILE]]));
    usePlayerStore
      .getState()
      .setElements([audio({ domId: "voice-1" }), audio({ domId: "voice-2", track: 1 })]);

    const writes = new Map<string, string>();
    const { assign, showToast, root } = renderAssign(async (path, content) => {
      writes.set(path, content);
    });

    await act(async () => {
      await assign(["voice-1", "voice-2"], "voiceover");
    });

    const written = writes.get("index.html") ?? "";
    expect(written).toContain(
      'id="voice-1" data-start="0" data-duration="5" data-audio-group="voiceover"',
    );
    expect(written).toContain(
      'id="voice-2" data-start="5" data-duration="5" data-audio-group="voiceover"',
    );
    expect(written).toContain('<hf-audio-group id="voiceover"></hf-audio-group>');
    expect(showToast).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  // Loud AND rejecting: the carve chains `.then(() => ({...next, sources:
  // [groupId]}))` off this promise, so a resolved-but-failed call let it
  // persist a carve aimed at a group that was never written. Toasting alone
  // was not enough — the promise has to carry the failure too.
  it("rejects, and toasts, when an id resolves to no clip", async () => {
    stubProjectFiles(new Map([["index.html", FILE]]));
    usePlayerStore.getState().setElements([audio({ domId: "voice-1" })]);

    const writes = new Map<string, string>();
    const { assign, showToast, root } = renderAssign(async (path, content) => {
      writes.set(path, content);
    });

    await act(async () => {
      await expect(assign(["voice-1", "voice-gone"], "voiceover")).rejects.toThrow("voice-gone");
    });

    expect(writes.size).toBe(0);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("voice-gone"));
    act(() => root.unmount());
  });
});
