// @vitest-environment jsdom
/**
 * Drives the write tools through the REAL `@mcp-b/global` package rather than
 * a fake `document.modelContext`.
 *
 * The package invokes a registered `execute` with the input alone, on both of
 * its paths: the in-page `BrowserMcpServer` wrapper that agents reach through
 * the registry and `executeTool`, and the descriptor it mirrors into a native
 * `document.modelContext` when the browser ships one. A Studio handler that
 * destructured `{ signal }` from the missing second argument threw before it
 * ran, so every write tool failed with "Cannot destructure property 'signal'
 * of 'undefined'" while the read tools kept working. This file proves the fix
 * against the code that ships in the polyfill chunk. The spec-shaped call and
 * the abort path live in `useStudioAgentTools.test.tsx`; the polyfill cannot
 * exercise them because it drops the caller's signal before the handler.
 *
 * A native-looking `modelContext` is installed BEFORE the import so the bridge
 * wraps it and mirrors every registration into it, which is how both paths get
 * covered from one setup. Its own file because the import is a one-shot side
 * effect that the sibling suite's fake would otherwise have to fight.
 */
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mountReactHarness } from "../hooks/domSelectionTestHarness";
import { mintElementHandle } from "./handles";
import { useStudioAgentTools, type StudioAgentToolsDeps } from "./useStudioAgentTools";
import { previewDoc, selectionFor, studioAgentToolsDeps } from "./webmcpTestUtils";

vi.mock("../telemetry/client", () => ({ trackEvent: vi.fn() }));

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

/** What a browser's own `registerTool` receives from the bridge. */
interface MirroredTool {
  name: string;
  description: string;
  execute: (input: object, options?: { signal?: AbortSignal }) => Promise<unknown>;
}

/** What `getTools()` returns and `executeTool()` accepts. */
interface RegisteredTool {
  name: string;
  description: string;
  window: Window;
  origin: string;
}

/** The bridge's registry entry, as the reporter of the bug drove it. */
interface BridgeToolEntry {
  item: { name: string };
  execute: (input: object, signal?: AbortSignal) => Promise<unknown>;
}

interface BridgeModelContext {
  tools: Map<string, BridgeToolEntry>;
  getTools(): Promise<RegisteredTool[]>;
  executeTool(
    tool: RegisteredTool,
    inputArguments: string,
    options?: { signal?: AbortSignal },
  ): Promise<string | null>;
}

const mirrored: MirroredTool[] = [];
/** Enough of a browser's `modelContext` for the bridge to wrap and mirror into. */
const fakeNative = {
  registerTool: async (tool: MirroredTool): Promise<void> => {
    mirrored.push(tool);
  },
  // The bridge delegates `getTools()` to the native context when there is one,
  // and its own `executeTool` then insists on a full `RegisteredTool`.
  getTools: async (): Promise<RegisteredTool[]> =>
    mirrored.map((tool) => ({
      name: tool.name,
      description: tool.description,
      window,
      origin: window.location.origin,
    })),
};

let cleanup: (() => void) | null = null;

beforeAll(async () => {
  // Configurable, so the bridge is allowed to replace it with itself.
  Object.defineProperty(document, "modelContext", {
    value: fakeNative,
    configurable: true,
    writable: true,
  });
  await import("@mcp-b/global");
  expect(Reflect.get(document, "modelContext")).not.toBe(fakeNative);
});

afterEach(async () => {
  cleanup?.();
  cleanup = null;
  mirrored.length = 0;
  // The polyfill watches the document with a MutationObserver that reads jsdom
  // globals. Empty the document and let the observer settle now, while those
  // globals still exist, instead of when vitest closes the window.
  document.body.replaceChildren();
  await new Promise((resolve) => setTimeout(resolve, 0));
  window.localStorage.clear();
});

function bridge(): BridgeModelContext {
  // Through `unknown`: importing the package brings its own `Document.modelContext`
  // typing into scope, and this file reads the bridge's non-standard surface.
  return Reflect.get(document, "modelContext") as unknown as BridgeModelContext;
}

/** Registration is async, so wait for the whole tool set to land. */
async function waitForTools(count: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (bridge().tools.size !== count || mirrored.length !== count) {
    if (Date.now() > deadline) {
      throw new Error(
        `expected ${count} tools, saw ${bridge().tools.size} in the bridge and ${mirrored.length} mirrored`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function bridgeEntry(name: string): BridgeToolEntry {
  const entry = [...bridge().tools.values()].find((candidate) => candidate.item.name === name);
  if (!entry) throw new Error(`expected ${name} in the bridge registry`);
  return entry;
}

function mirroredTool(name: string): MirroredTool {
  const tool = mirrored.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`expected ${name} to be mirrored into the native context`);
  return tool;
}

/** Mount Studio's tools against a preview whose `#agent` element can be edited. */
async function mountEditableAgent() {
  const doc = previewDoc('<h1 id="agent">Agent</h1>');
  const agent = doc.getElementById("agent") as HTMLElement;
  const handle = mintElementHandle({
    projectId: "demo",
    domId: "agent",
    sourceFile: "index.html",
    activeCompositionPath: "index.html",
  });
  if (!handle) throw new Error("expected agent handle");
  const setText = vi.fn(
    async () =>
      ({
        ok: true,
        persistence: { sourceFile: "index.html", version: '"sha256:after"', changed: true },
      }) as const,
  );
  const deps: StudioAgentToolsDeps = studioAgentToolsDeps({
    getPreviewDocument: () => doc,
    buildSelection: async (element) => selectionFor(element),
    setText,
  });

  function Probe() {
    useStudioAgentTools(deps);
    return null;
  }
  await act(async () => {
    const root = mountReactHarness(<Probe />);
    cleanup = () => act(() => root.unmount());
  });
  await waitForTools(12);
  return { agent, handle, setText };
}

describe("useStudioAgentTools through @mcp-b/global", () => {
  it("saves through studio_set_text when the in-page server calls execute with the input alone", async () => {
    const { agent, handle, setText } = await mountEditableAgent();

    // Registry entry, as `[...document.modelContext.tools.values()]` exposes it.
    const viaEntry = await bridgeEntry("studio_set_text").execute(
      { handle, text: "Through the registry" },
      new AbortController().signal,
    );
    expect(viaEntry).toMatchObject({ ok: true, stage: "saved", changed: true });

    // Chromium's `executeTool` extension, which the bridge also implements.
    const descriptor = (await bridge().getTools()).find((tool) => tool.name === "studio_set_text");
    if (!descriptor) throw new Error("expected studio_set_text in getTools()");
    const viaExecuteTool = await bridge().executeTool(
      descriptor,
      JSON.stringify({ handle, text: "Through executeTool" }),
      { signal: new AbortController().signal },
    );
    expect(JSON.parse(viaExecuteTool ?? "null")).toMatchObject({ ok: true, stage: "saved" });

    expect(setText).toHaveBeenCalledTimes(2);
    expect(setText).toHaveBeenCalledWith(
      expect.objectContaining({ element: agent }),
      "Through the registry",
      "self",
    );
  });

  it("saves through the descriptor the bridge mirrors into a native modelContext", async () => {
    const { agent, handle, setText } = await mountEditableAgent();

    // The browser would call this with `(input, { signal })`; the mirror drops
    // the options before Studio's handler sees them.
    const result = await mirroredTool("studio_set_text").execute(
      { handle, text: "Through the native mirror" },
      { signal: new AbortController().signal },
    );

    expect(result).toMatchObject({ ok: true, stage: "saved", changed: true });
    expect(setText).toHaveBeenCalledWith(
      expect.objectContaining({ element: agent }),
      "Through the native mirror",
      "self",
    );
  });
});
