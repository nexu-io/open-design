import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute the entry's actual shutdown declarations, substituting only Electron
// and the sidecar cleanup boundary. This catches premature process.exit calls.
function shutdownHarness(options: {
  onRendererClosed?: () => void;
  onRendererTransportQuiesced?: () => void;
  onSidecarRetirementStarted?: () => void;
} = {}) {
  const source = readFileSync(new URL("../../src/main/index.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const declarations: string[] = [];
  const names = new Set(["shuttingDown", "shutdownPromise", "shutdownComplete", "shutdownRequestCount", "shutdown", "shutdownAndExit"]);
  function visit(node: ts.Node): void {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
        node.expression.expression.getText(ast) === "app.on" &&
        node.expression.arguments[0]?.getText(ast) === '"before-quit"') {
      declarations.push(node.getText(ast));
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name != null && names.has(node.name.text)) {
      declarations.push(node.getText(ast));
      return;
    }
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && names.has(d.name.text))) {
      declarations.push(node.getText(ast));
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let finishCleanup!: () => void;
  const cleanup = new Promise<void>((resolve) => { finishCleanup = resolve; });
  const beforeShutdown = vi.fn(() => {
    options.onSidecarRetirementStarted?.();
    return cleanup;
  });
  const close = vi.fn(async () => {
    options.onRendererClosed?.();
  });
  const quiesceRendererTransport = vi.fn(async () => {
    options.onRendererTransportQuiesced?.();
  });
  let beforeQuit!: (event: { preventDefault(): void }) => void;
  const quit = vi.fn();
  const on = (_event: string, listener: typeof beforeQuit) => { beforeQuit = listener; };
  const exit = vi.fn();
  const endSession = vi.fn();
  const recordLifecycle = vi.fn(async (_event: unknown) => undefined);
  const sandbox = {
    updater: { recordLifecycle },
    options: { beforeShutdown, quiesceRendererTransport }, desktop: { close }, app: { quit, on }, process: { exit },
    updateScheduler: { stop: vi.fn() }, disposeMenu: vi.fn(), removeDiagnosticsIpc: vi.fn(),
    endDesktopSessionCleanly: endSession, sessionStatePath: "test-session", console: { info: vi.fn(), error: vi.fn() },
  };
  const code = ts.transpileModule(declarations.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const api = runInNewContext(`${code}\n({ shutdown, shutdownAndExit })`, sandbox) as {
    shutdown(): Promise<void>; shutdownAndExit(): void;
  };
  return { ...api, beforeShutdown, close, quiesceRendererTransport, quit, exit, endSession, finishCleanup, beforeQuit, recordLifecycle };
}

async function flushPromises() {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}

describe("desktop shutdown", () => {
  it("[P0] quiesces the renderer before retiring runtime sidecars", async () => {
    const h = shutdownHarness();
    const pending = h.shutdown();

    await flushPromises();

    expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.beforeShutdown).toHaveBeenCalledTimes(1);
    expect(h.close.mock.invocationCallOrder[0]).toBeLessThan(
      h.quiesceRendererTransport.mock.invocationCallOrder[0]!,
    );
    expect(h.quiesceRendererTransport.mock.invocationCallOrder[0]).toBeLessThan(
      h.beforeShutdown.mock.invocationCallOrder[0]!,
    );
    expect(h.recordLifecycle).toHaveBeenNthCalledWith(2, {
      stage: "renderer_quiesced",
      outcome: "completed",
    });
    // Electron main remains alive to finish sidecar cleanup and the deferred
    // payload handoff after the request-producing renderer has gone away.
    expect(h.quit).not.toHaveBeenCalled();
    expect(h.exit).not.toHaveBeenCalled();

    h.finishCleanup();
    await pending;
  });

  it("[P0] emits no renderer request after runtime retirement begins", async () => {
    let rendererCanRequest = true;
    let staleOriginRequestCount = 0;
    const h = shutdownHarness({
      // Model a BrowserWindow.close() held by beforeunload: the transport
      // barrier, not a cooperative page close, must stop stale-origin dials.
      onRendererTransportQuiesced: () => {
        rendererCanRequest = false;
      },
      onSidecarRetirementStarted: () => {
        // Deterministic stand-in for the poll/SSE/resource request that used to
        // hit the retired localhost origin during the sidecar grace window.
        if (rendererCanRequest) staleOriginRequestCount += 1;
      },
    });

    const pending = h.shutdown();
    await flushPromises();

    expect(staleOriginRequestCount).toBe(0);
    expect(h.exit).not.toHaveBeenCalled();

    h.finishCleanup();
    await pending;
  });

  it("does not exit early when quit is requested again during sidecar cleanup", async () => {
    const h = shutdownHarness();
    h.shutdownAndExit();
    h.shutdownAndExit();
    await flushPromises();
    expect(h.beforeShutdown).toHaveBeenCalledTimes(1);
    expect(h.exit).not.toHaveBeenCalled();
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.endSession).not.toHaveBeenCalled();
    h.finishCleanup();
    await flushPromises();
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.quit).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(0);
  });

  it("prevents native quit from bypassing pending cleanup, then allows the final quit", async () => {
    const h = shutdownHarness();
    const pending = h.shutdown();
    await flushPromises();
    const preventDefault = vi.fn();
    h.beforeQuit({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await flushPromises();
    expect(h.exit).not.toHaveBeenCalled();
    h.finishCleanup();
    await pending;
    preventDefault.mockClear();
    h.beforeQuit({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("keeps every shutdown caller pending until the same cleanup finishes", async () => {
    const h = shutdownHarness();
    const first = h.shutdown();
    const finished = vi.fn();
    const second = h.shutdown().then(finished);
    await flushPromises();
    expect(finished).not.toHaveBeenCalled();
    h.finishCleanup();
    await Promise.all([first, second]);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(h.beforeShutdown).toHaveBeenCalledTimes(1);
    expect(h.endSession).toHaveBeenCalledTimes(1);
    expect(h.recordLifecycle.mock.calls.map(([event]) => event)).toEqual([
      { stage: "shutdown_started", outcome: "started" },
      { stage: "renderer_quiesced", outcome: "completed" },
      { stage: "shutdown_completed", outcome: "completed", repeated_quit_count: 1, duration_ms: expect.any(Number) },
    ]);
  });

  it("records caught cleanup failures without preventing the existing exit behavior", async () => {
    const h = shutdownHarness();
    h.beforeShutdown.mockRejectedValueOnce(new Error("cleanup failed"));
    await h.shutdown();
    expect(h.recordLifecycle).toHaveBeenLastCalledWith(expect.objectContaining({ stage: "shutdown_completed", outcome: "failed" }));
    expect(h.quit).toHaveBeenCalledTimes(1);
  });
});
