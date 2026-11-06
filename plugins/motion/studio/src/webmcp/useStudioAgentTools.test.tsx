// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountReactHarness } from "../hooks/domSelectionTestHarness";
import { writeStudioUiPreferences } from "../utils/studioUiPreferences";
import { mintElementHandle } from "./handles";
import { useStudioAgentTools, type StudioAgentToolsDeps } from "./useStudioAgentTools";
import type { ModelContext, ModelContextRegisterToolOptions, ModelContextTool } from "./types";
import { lookSnapshot, previewDoc, selectionFor, studioAgentToolsDeps } from "./webmcpTestUtils";

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock("../telemetry/client", () => ({ trackEvent }));

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let cleanup: (() => void) | null = null;

async function executeRegistered<T>(
  registered: ModelContextTool[],
  name: string,
  input: object,
  signal: AbortSignal = new AbortController().signal,
): Promise<T> {
  const tool = registered.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`expected ${name} to be registered`);
  return (await tool.execute(input, { signal })) as T;
}

/** The call shape `@mcp-b/global` uses: the input and nothing else. */
async function executeRegisteredWithoutOptions<T>(
  registered: ModelContextTool[],
  name: string,
  input: object,
): Promise<T> {
  const tool = registered.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`expected ${name} to be registered`);
  return (await tool.execute(input)) as T;
}

function mountedTargetDeps(overrides: Partial<StudioAgentToolsDeps> = {}) {
  const doc = previewDoc('<h1 id="human">Human</h1><h1 id="agent">Agent</h1>');
  const human = doc.getElementById("human") as HTMLElement;
  const agent = doc.getElementById("agent") as HTMLElement;
  const agentHandle = mintElementHandle({
    projectId: "demo",
    domId: "agent",
    sourceFile: "index.html",
    activeCompositionPath: "index.html",
  });
  if (!agentHandle) throw new Error("expected agent handle");
  return {
    agent,
    agentHandle,
    currentSelection: selectionFor(human),
    deps: studioAgentToolsDeps({
      getPreviewDocument: () => doc,
      buildSelection: async (element) => selectionFor(element),
      ...overrides,
    }),
  };
}

/** Install a fake `document.modelContext` and report what got registered. */
function installModelContext() {
  const registered: ModelContextTool[] = [];
  const registerTool = vi.fn(
    async (tool: ModelContextTool, _options?: ModelContextRegisterToolOptions) => {
      registered.push(tool);
    },
  );
  const modelContext: ModelContext = { registerTool };
  Object.defineProperty(document, "modelContext", {
    value: modelContext,
    configurable: true,
    writable: true,
  });
  return { registered, registerTool };
}

async function executeFirstRegistered<T>(registered: ModelContextTool[]): Promise<T> {
  const look = registered[0];
  if (!look) throw new Error("expected studio_look to be registered");
  return (await look.execute({}, { signal: new AbortController().signal })) as T;
}

function removeModelContext() {
  Reflect.deleteProperty(document, "modelContext");
}

function mountTools(initial: StudioAgentToolsDeps) {
  function Probe({ current }: { current: StudioAgentToolsDeps }) {
    useStudioAgentTools(current);
    return null;
  }
  const root = mountReactHarness(<Probe current={initial} />);
  cleanup = () => act(() => root.unmount());
  return {
    rerenderWith(next: StudioAgentToolsDeps) {
      act(() => root.render(<Probe current={next} />));
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  trackEvent.mockReset();
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  removeModelContext();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("useStudioAgentTools", () => {
  it("registers the tool set once on mount", async () => {
    const { registered } = installModelContext();

    await act(async () => {
      mountTools(studioAgentToolsDeps({ getSnapshot: () => lookSnapshot() }));
    });

    expect(registered.map((tool) => tool.name)).toEqual([
      "studio_look",
      "studio_select",
      "studio_seek",
      "studio_frame",
      "studio_inspect",
      "studio_set_text",
      "studio_set_style",
      "studio_transform",
      "studio_add_animation",
      "studio_update_animation",
      "studio_add_keyframe",
      "studio_delete_animation",
    ]);
    expect(trackEvent).toHaveBeenCalledWith("webmcp.native_present");
  });

  it("does not re-register when the deps object changes identity", async () => {
    // The regression test for the whole design. The DomEdit actions object
    // changes identity on nearly every interaction; if registration depended on
    // it, the signal would abort and unregister the tools each time.
    const { registerTool } = installModelContext();

    let harness: ReturnType<typeof mountTools> | null = null;
    await act(async () => {
      harness = mountTools(studioAgentToolsDeps({ getSnapshot: () => lookSnapshot() }));
    });
    expect(registerTool).toHaveBeenCalledTimes(12);

    await act(async () => {
      harness?.rerenderWith(
        studioAgentToolsDeps({ getSnapshot: () => lookSnapshot({ currentTime: 5 }) }),
      );
      harness?.rerenderWith(
        studioAgentToolsDeps({ getSnapshot: () => lookSnapshot({ currentTime: 6 }) }),
      );
    });

    expect(registerTool).toHaveBeenCalledTimes(12);
  });

  it("executes against the LATEST deps, not the ones present at registration", async () => {
    // The other half of the ref: registering once must not freeze the state the
    // tools read, or every answer after the first render would be stale.
    const { registered } = installModelContext();

    let harness: ReturnType<typeof mountTools> | null = null;
    await act(async () => {
      harness = mountTools(
        studioAgentToolsDeps({ getSnapshot: () => lookSnapshot({ currentTime: 1 }) }),
      );
    });

    await act(async () => {
      harness?.rerenderWith(
        studioAgentToolsDeps({ getSnapshot: () => lookSnapshot({ currentTime: 42 }) }),
      );
    });

    const result = await executeFirstRegistered<{
      ok: boolean;
      playhead: number;
    }>(registered);

    expect(result.ok).toBe(true);
    expect(result.playhead).toBe(42);
  });

  it("unregisters on unmount by aborting the registration signal", async () => {
    const { registerTool } = installModelContext();

    await act(async () => {
      mountTools(studioAgentToolsDeps({ getSnapshot: () => lookSnapshot() }));
    });
    const signal = registerTool.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);

    cleanup?.();
    cleanup = null;

    expect(signal?.aborted).toBe(true);
  });

  it("boots cleanly when the browser has no native WebMCP", async () => {
    removeModelContext();

    await act(async () => {
      mountTools(studioAgentToolsDeps({ getSnapshot: () => lookSnapshot() }));
    });

    // The assertion is that mounting did not throw; a browser without the
    // native API must still boot Studio. The polyfill may install
    // document.modelContext as a fallback — that is expected.
  });

  it("registers nothing when the preference is turned off", async () => {
    writeStudioUiPreferences({ agentToolsEnabled: false });
    const { registerTool } = installModelContext();

    await act(async () => {
      mountTools(studioAgentToolsDeps({ getSnapshot: () => lookSnapshot() }));
    });

    expect(registerTool).not.toHaveBeenCalled();
  });

  it("registers when the preference is absent, because on is the default", async () => {
    const { registerTool } = installModelContext();

    await act(async () => {
      mountTools(studioAgentToolsDeps({ getSnapshot: () => lookSnapshot() }));
    });

    expect(registerTool).toHaveBeenCalledTimes(12);
  });

  it("reports a non-abort registration failure through production telemetry", async () => {
    const { registerTool } = installModelContext();
    registerTool.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));

    await act(async () => {
      mountTools(studioAgentToolsDeps({ getSnapshot: () => lookSnapshot() }));
    });

    expect(trackEvent).toHaveBeenCalledWith("webmcp_registration_failed", {
      error_name: "NotAllowedError",
      tool_name: "studio_look",
    });
  });

  it("reports a tool that throws as an internal failure instead of rejecting", async () => {
    const { registered } = installModelContext();

    await act(async () => {
      mountTools(
        studioAgentToolsDeps({
          getSnapshot: () => {
            throw new TypeError("handler signature moved");
          },
        }),
      );
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await executeFirstRegistered<{
      ok: boolean;
      kind: string;
    }>(registered);

    expect(result.ok).toBe(false);
    expect(result.kind).toBe("internal");
  });

  it("requires a source-safe handle on every source-writing tool", async () => {
    const { registered } = installModelContext();
    await act(async () => mountTools(studioAgentToolsDeps()));

    for (const name of [
      "studio_set_text",
      "studio_set_style",
      "studio_transform",
      "studio_add_animation",
      "studio_update_animation",
      "studio_add_keyframe",
      "studio_delete_animation",
    ]) {
      const schema = registered.find((tool) => tool.name === name)?.inputSchema as {
        required?: string[];
      };
      expect(schema.required, name).toContain("handle");
    }
  });

  it("binds a text write to the explicit handle even when human selection points elsewhere", async () => {
    const { registered } = installModelContext();
    const targeted = mountedTargetDeps();
    const setText = vi.fn(
      async () =>
        ({
          ok: true,
          persistence: {
            sourceFile: "index.html",
            version: '"sha256:after"',
            changed: true,
          },
        }) as const,
    );
    await act(async () => mountTools({ ...targeted.deps, setText }));

    const result = await executeRegistered<{
      ok: boolean;
      stage: string;
      changed: boolean;
      target: { handle: string; sourceFile: string };
    }>(registered, "studio_set_text", {
      handle: targeted.agentHandle,
      text: "Edited by agent",
    });

    expect(setText).toHaveBeenCalledWith(
      expect.objectContaining({ element: targeted.agent }),
      "Edited by agent",
      "self",
    );
    expect(result).toMatchObject({
      ok: true,
      stage: "saved",
      changed: true,
      target: { handle: targeted.agentHandle, sourceFile: "index.html" },
    });
  });

  it("refuses a locked target and an early abort before invoking the write actor", async () => {
    const { registered } = installModelContext();
    const setText = vi.fn();
    const targeted = mountedTargetDeps({
      buildSelection: async (element) => selectionFor(element, { isInsideLockedComposition: true }),
    });
    await act(async () => mountTools({ ...targeted.deps, setText }));

    const locked = await executeRegistered<{ ok: boolean; stage: string }>(
      registered,
      "studio_set_text",
      { handle: targeted.agentHandle, text: "No" },
    );
    const controller = new AbortController();
    controller.abort();
    const aborted = await executeRegistered<{ ok: boolean; stage: string; cancelRequested: true }>(
      registered,
      "studio_set_text",
      { handle: targeted.agentHandle, text: "No" },
      controller.signal,
    );

    expect(locked).toMatchObject({ ok: false, stage: "refused" });
    expect(aborted).toMatchObject({ ok: false, stage: "refused", cancelRequested: true });
    expect(setText).not.toHaveBeenCalled();
  });

  it("runs every write tool when execute is called with the input alone", async () => {
    // `@mcp-b/global` invokes `execute(input)` with no options object, both from
    // its in-page server and from the descriptor it mirrors into a native
    // `document.modelContext`. Handlers that destructured `{ signal }` threw a
    // TypeError before running, which `runToolBody` reports as `internal`.
    const { registered } = installModelContext();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const targeted = mountedTargetDeps();
    const setText = vi.fn(
      async () =>
        ({
          ok: true,
          persistence: { sourceFile: "index.html", version: '"sha256:after"', changed: true },
        }) as const,
    );
    await act(async () => mountTools({ ...targeted.deps, setText }));

    const writeTools = registered.filter((tool) => tool.annotations?.readOnlyHint === false);
    expect(writeTools.map((tool) => tool.name)).toEqual([
      "studio_select",
      "studio_seek",
      "studio_set_text",
      "studio_set_style",
      "studio_transform",
      "studio_add_animation",
      "studio_update_animation",
      "studio_add_keyframe",
      "studio_delete_animation",
    ]);
    for (const tool of writeTools) {
      // One argument, exactly as the polyfill calls it. An empty input is a bad
      // request, never a crash: the failure kind must not be `internal`.
      const result = (await tool.execute({})) as { ok: boolean; kind?: string };
      expect(result.ok, tool.name).toBe(false);
      expect(result.kind, tool.name).not.toBe("internal");
    }
    expect(consoleError).not.toHaveBeenCalled();

    const saved = await executeRegisteredWithoutOptions<{ ok: boolean; stage: string }>(
      registered,
      "studio_set_text",
      { handle: targeted.agentHandle, text: "Edited without options" },
    );
    expect(saved).toMatchObject({ ok: true, stage: "saved" });
    expect(setText).toHaveBeenCalledTimes(1);
  });

  it("reports dispatched, saved, and verified only from their corresponding evidence", async () => {
    const { registered } = installModelContext();
    const targeted = mountedTargetDeps();
    const box = { x: 0, y: 0, width: 100, height: 50 };
    await act(async () =>
      mountTools({
        ...targeted.deps,
        setText: async () => ({
          ok: true,
          persistence: {
            sourceFile: "index.html",
            version: '"sha256:after"',
            changed: true,
          },
        }),
        addAnimation: async () => true,
        readBox: () => ({ ...box }),
        resizeTo: async (_selection, next) => {
          Object.assign(box, next);
          return {
            ok: true,
            persistence: {
              sourceFile: "index.html",
              version: '"sha256:transform"',
              changed: true,
            },
          } as const;
        },
      }),
    );

    const dispatched = await executeRegistered<{ stage: string }>(
      registered,
      "studio_add_animation",
      { handle: targeted.agentHandle, method: "to" },
    );
    const saved = await executeRegistered<{ stage: string }>(registered, "studio_set_text", {
      handle: targeted.agentHandle,
      text: "Saved",
    });
    const verified = await executeRegistered<{ stage: string }>(registered, "studio_transform", {
      handle: targeted.agentHandle,
      width: 200,
      height: 80,
    });

    expect(dispatched.stage).toBe("dispatched");
    expect(saved.stage).toBe("saved");
    expect(verified.stage).toBe("verified");
  });

  it("reports a matched no-op with its durable version without fabricating a change", async () => {
    const { registered } = installModelContext();
    const targeted = mountedTargetDeps();
    await act(async () =>
      mountTools({
        ...targeted.deps,
        setText: async () => ({
          ok: true,
          persistence: {
            sourceFile: "index.html",
            version: '"sha256:current"',
            changed: false,
          },
        }),
      }),
    );

    const result = await executeRegistered<{
      ok: boolean;
      stage: string;
      changed: boolean;
      evidence: { version: string };
    }>(registered, "studio_set_text", {
      handle: targeted.agentHandle,
      text: "Agent",
    });

    expect(result).toMatchObject({
      ok: true,
      stage: "saved",
      changed: false,
      evidence: { version: '"sha256:current"' },
    });
  });

  it("reports the actual saved outcome and late cancellation without promising rollback", async () => {
    const { registered } = installModelContext();
    const targeted = mountedTargetDeps();
    let finish: (() => void) | undefined;
    const setText = vi.fn(
      () =>
        new Promise<{
          ok: true;
          persistence: { sourceFile: string; version: string; changed: true };
        }>((resolve) => {
          finish = () =>
            resolve({
              ok: true,
              persistence: {
                sourceFile: "index.html",
                version: '"sha256:late"',
                changed: true,
              },
            });
        }),
    );
    await act(async () => mountTools({ ...targeted.deps, setText }));
    const controller = new AbortController();

    const pending = executeRegistered<{
      ok: boolean;
      stage: string;
      cancelRequested?: boolean;
    }>(
      registered,
      "studio_set_text",
      { handle: targeted.agentHandle, text: "Late" },
      controller.signal,
    );
    await vi.waitFor(() => expect(setText).toHaveBeenCalledTimes(1));
    controller.abort();
    finish?.();

    expect(await pending).toMatchObject({
      ok: true,
      stage: "saved",
      cancelRequested: true,
    });
    expect(setText).toHaveBeenCalledTimes(1);
  });

  it("aggregates partial style evidence and uses the weakest applied assurance", async () => {
    const { registered } = installModelContext();
    const targeted = mountedTargetDeps();
    const setStyle = vi.fn(async (_selection, property: string) => {
      if (property === "left") return { ok: false, reason: "geometry-property" } as const;
      if (property === "opacity") return { ok: true } as const;
      return {
        ok: true,
        persistence: {
          sourceFile: "index.html",
          version: '"sha256:color"',
          changed: true,
        },
      } as const;
    });
    await act(async () => mountTools({ ...targeted.deps, setStyle }));

    const result = await executeRegistered<{
      ok: boolean;
      stage: string;
      partial: boolean;
      applied: Record<string, string>;
      rejected: Record<string, string>;
      propertyReceipts: Record<string, { stage: string }>;
    }>(registered, "studio_set_style", {
      handle: targeted.agentHandle,
      styles: { color: "red", left: "10px", opacity: "0.5" },
    });

    expect(result).toMatchObject({
      ok: true,
      stage: "dispatched",
      partial: true,
      applied: { color: "red", opacity: "0.5" },
      rejected: { left: "geometry-property" },
      propertyReceipts: {
        color: { stage: "saved" },
        opacity: { stage: "dispatched" },
      },
    });
  });
});
