import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
function select(predicate: (node: ts.Node) => boolean): ts.Node {
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (predicate(node)) found = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!found) throw new Error("startup wiring not found");
  return found;
}
function evaluate(code: string, globals: Record<string, unknown>) {
  return runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, globals);
}

describe("packaged launch timing wiring", () => {
  it("retains daemon/web phase edges on the same tracker and arms reporting only after daemon identity exists", () => {
    const method = select(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === "onPhase");
    const mark = vi.fn();
    const setReporter = vi.fn();
    const reportPackagedLaunch = vi.fn();
    const onPhase = evaluate(`const options = { ${method.getText(ast)} }; options.onPhase;`, {
      packagedStartupTiming: { mark, setReporter }, reportPackagedLaunch, setSplashStage: vi.fn(), splash: null,
    }) as (phase: string) => void;
    for (const phase of ["daemon-spawning", "daemon-ready", "web-spawning", "web-ready"]) onPhase(phase);
    expect(mark.mock.calls.flat()).toEqual(["daemon_spawning", "daemon_ready", "web_spawning", "web_ready"]);
    expect(setReporter).toHaveBeenCalledExactlyOnceWith(reportPackagedLaunch);
    expect(setReporter.mock.invocationCallOrder[0]).toBeLessThan(mark.mock.invocationCallOrder[1]!);
  });

  it("correlates an early failure and waits for bounded telemetry before the existing fatal exit", async () => {
    const call = select(node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "catch" && node.expression.expression.getText(ast) === "main()") as ts.CallExpression;
    const handler = call.arguments[0]!;
    const flush = Promise.withResolvers<void>();
    const timing = { setReporter: vi.fn(), finish: vi.fn(), flush: vi.fn(() => flush.promise) };
    const exit = vi.fn();
    const reportFailure = vi.fn(async () => undefined);
    const run = evaluate(`const handler = ${handler.getText(ast)}; handler;`, {
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
