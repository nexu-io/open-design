import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { API } from "@typescript/native/unstable/sync";
import * as ts from "@typescript/native/unstable/ast";
import type { Node, SourceFile } from "@typescript/native/unstable/ast";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const file = fileURLToPath(new URL("../src/index.ts", import.meta.url));

function withSourceAst<T>(run: (ast: SourceFile) => T): T {
  const compiler = new API();
  try {
    using snapshot = compiler.updateSnapshot({ openFiles: [file] });
    const ast = snapshot.getDefaultProjectForFile(file)?.program.getSourceFile(file);
    if (!ast) throw new Error(`Native TypeScript could not parse ${file}`);
    return run(ast);
  } finally {
    compiler.close();
  }
}

function select(ast: SourceFile, predicate: (node: Node) => boolean): Node {
  let found: Node | undefined;
  function visit(node: Node) {
    if (predicate(node)) found = node;
    node.forEachChild(visit);
  }
  visit(ast);
  if (!found) throw new Error("startup wiring not found");
  return found;
}

function evaluate(code: string, globals: Record<string, unknown>) {
  return runInNewContext(stripTypeScriptTypes(code), globals);
}

describe("packaged launch timing wiring", () => {
  it("retains daemon/web phase edges and leaves launch delivery to the daemon-backed desktop reporter (OPEND-4220)", () => {
    const method = withSourceAst((ast) => {
      const node = select(ast, (candidate) => ts.isMethodDeclaration(candidate) && candidate.name.getText(ast) === "onPhase");
      if (!ts.isMethodDeclaration(node)) throw new Error("startup wiring not found");
      return node.getText(ast);
    });
    const mark = vi.fn();
    const setReporter = vi.fn();
    const reportPackagedLaunch = vi.fn();
    const onPhase = evaluate(`const options = { ${method} }; options.onPhase;`, {
      packagedStartupTiming: { mark, setReporter }, reportPackagedLaunch, setSplashStage: vi.fn(), splash: null,
    }) as (phase: string) => void;
    for (const phase of ["daemon-spawning", "daemon-ready", "web-spawning", "web-ready"]) onPhase(phase);
    expect(mark.mock.calls.flat()).toEqual(["daemon_spawning", "daemon_ready", "web_spawning", "web_ready"]);
    // The direct packaged reporter would send client_launch_attempt before a
    // fresh install has an installation identity, silently dropping it.
    expect(setReporter).not.toHaveBeenCalled();
  });

  it("correlates an early failure and waits for bounded telemetry before the existing fatal exit", async () => {
    const handler = withSourceAst((ast) => {
      const node = select(ast, (candidate) => ts.isCallExpression(candidate) && ts.isPropertyAccessExpression(candidate.expression)
        && candidate.expression.name.text === "catch" && candidate.expression.expression.getText(ast) === "main()");
      if (!ts.isCallExpression(node)) throw new Error("startup wiring not found");
      return node.arguments[0]!.getText(ast);
    });
    const flush = Promise.withResolvers<void>();
    const timing = { context: () => ({ app_session_id: "session-1", launch_attempt_id: "launch-1" }), setReporter: vi.fn(), finish: vi.fn(), flush: vi.fn(() => flush.promise) };
    const exit = vi.fn();
    const reportFailure = vi.fn(async () => undefined);
    const run = evaluate(`const handler = ${handler}; handler;`, {
      packagedStartupTiming: timing, reportPackagedLaunch: vi.fn(),
      PackagedPathAccessError: class extends Error {},
      classifyStartupFailure: () => ({ failureKind: "daemon-start" }),
      packagedLogger: null, console: { error: vi.fn() },
      startupTelemetryContext: { namespace: "test", installationRoot: "test" },
      reportStartupFailure: reportFailure, resolveStartupDistinctId: () => "installation-1",
      process: { exit }, resolveSidecarLauncherExitCode: () => 1,
    }) as (error: Error) => Promise<void>;
    const pending = run(new Error("daemon failed"));
    expect(timing.finish).toHaveBeenCalledExactlyOnceWith("failed", "daemon-start");
    expect(reportFailure).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
    flush.resolve();
    await pending;
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});


it("does not create a process launch for deferred restores, including a failed restore retry", async () => {
  const { launch, timing } = withSourceAst((ast) => {
    const launchNode = select(ast, (node) => ts.isPropertyAssignment(node) && node.name.getText(ast) === "launch");
    const timingNode = select(ast, (node) => ts.isPropertyAssignment(node) && node.name.getText(ast) === "startupTiming");
    if (!ts.isPropertyAssignment(launchNode) || !ts.isPropertyAssignment(timingNode)) throw new Error("startup wiring not found");
    return { launch: launchNode.initializer.getText(ast), timing: timingNode.initializer.getText(ast) };
  });
  const create = vi.fn();
  const launchDesktop = vi.fn().mockRejectedValueOnce(new Error("restore failed")).mockResolvedValueOnce("restored");
  const globals = {
    deferredHeadless: true, packagedStartupTiming: null, activeConfig: { appVersion: "1.0.0" },
    createDesktopStartupTiming: create, reportPackagedLaunch: vi.fn(),
    createSplashWindow: vi.fn(), splash: null, launchDesktop,
  };
  expect(evaluate(timing, globals)).toBeNull();
  const restore = evaluate(`(${launch})`, globals) as () => Promise<unknown>;
  await expect(restore()).rejects.toThrow("restore failed");
  await expect(restore()).resolves.toBe("restored");
  expect(create).not.toHaveBeenCalled();
});

it('passes the original Electron ready timestamp through the packaged desktop boundary', () => {
  const { ready, option } = withSourceAst((ast) => {
    const readyNode = select(ast, (node) => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'electronReadyAtMs');
    const optionNode = select(ast, (node) => ts.isShorthandPropertyAssignment(node) && node.name.getText(ast) === 'electronReadyAtMs');
    if (!ts.isVariableDeclaration(readyNode) || !ts.isShorthandPropertyAssignment(optionNode)) throw new Error("startup wiring not found");
    return { ready: readyNode.initializer!.getText(ast), option: optionNode.getText(ast) };
  });
  const readyAt = evaluate(ready, { performance: { now: () => 10_000 } });
  const passed = evaluate(`({ ${option} })`, { electronReadyAtMs: readyAt });
  expect(passed).toEqual({ electronReadyAtMs: 10_000 });
  const readyIndex = source.indexOf('await app.whenReady()');
  const clockIndex = source.indexOf('const electronReadyAtMs');
  const sidecarsIndex = source.indexOf('await startPackagedSidecars');
  expect(readyIndex).toBeLessThan(clockIndex);
  expect(clockIndex).toBeLessThan(sidecarsIndex);
});
