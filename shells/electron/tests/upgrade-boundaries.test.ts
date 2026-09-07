import { readFile, readdir } from "node:fs/promises";

import ts from "typescript";
import { describe, expect, it } from "vitest";

type Source = Readonly<{ name: string; source: string }>;

const standaloneRoot = new URL("../src/adapters/standalone/", import.meta.url);

async function standaloneSources(): Promise<readonly Source[]> {
  const names = (await readdir(standaloneRoot)).filter((name) => name.endsWith(".ts")).sort();
  return await Promise.all(names.map(async (name) => Object.freeze({
    name,
    source: await readFile(new URL(name, standaloneRoot), "utf8"),
  })));
}

function parsed(name: string, source: string): ts.SourceFile {
  return ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function callsWithin(node: ts.Node): readonly string[] {
  const calls: string[] = [];
  const visit = (candidate: ts.Node): void => {
    if (ts.isCallExpression(candidate)) calls.push(candidate.expression.getText());
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return calls;
}

describe("Electron upgrade negative boundaries", () => {
  it("has exactly one cross-process upgrade lock and no updater-owned lock", async () => {
    const sources = await standaloneSources();
    expect(sources.filter(({ source }) => /\bwithSidecarLifecycleLock\b/u.test(source)).map(({ name }) => name))
      .toEqual(["guarded-lifecycle.ts"]);

    const guard = sources.find(({ name }) => name === "guarded-lifecycle.ts")!.source;
    expect(guard).toContain("return await withSidecarLifecycleLock(stamps, async () => {");
    expect(guard).toContain("const stopped = await stopSidecars(");
    expect(guard.indexOf("withSidecarLifecycleLock(stamps")).toBeLessThan(guard.indexOf("stopSidecars(resourceSet.resources"));

    for (const name of ["host-updater.ts", "shell-updater-ledger.ts"]) {
      const source = sources.find((candidate) => candidate.name === name)!.source;
      expect(source, name).not.toMatch(/withSidecarLifecycleLock|SidecarLifecycleLock|proper-lockfile|flock/u);
    }
    for (const name of ["host-lifecycle.ts", "host-lifecycle-ledger.ts", "host-runtime.ts"]) {
      const shared = await readFile(new URL(`../../../packages/standalone/src/${name}`, import.meta.url), "utf8");
      expect(shared, name).not.toMatch(/withSidecarLifecycleLock|SidecarLifecycleLock|proper-lockfile|flock|@open-design\/sidecar/u);
    }
  });

  it("does not recursively schedule updater handlers", async () => {
    const source = await readFile(new URL("../src/adapters/renderer/product-handlers.ts", import.meta.url), "utf8");
    const file = parsed("product-handlers.ts", source);
    const updaterHandlers: ts.CallExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)
        && node.expression.getText(file) === "ipcMain.handle"
        && node.arguments[0]?.getText(file).startsWith("ELECTRON_RENDERER_IPC.updater")) {
        updaterHandlers.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);

    expect(updaterHandlers.map((handler) => handler.arguments[0]!.getText(file)).sort()).toEqual([
      "ELECTRON_RENDERER_IPC.updaterApply",
      "ELECTRON_RENDERER_IPC.updaterCheck",
      "ELECTRON_RENDERER_IPC.updaterDownload",
      "ELECTRON_RENDERER_IPC.updaterLater",
      "ELECTRON_RENDERER_IPC.updaterSetMenuLabels",
      "ELECTRON_RENDERER_IPC.updaterStatus",
    ]);
    for (const handler of updaterHandlers) {
      const callback = handler.arguments[1];
      expect(callback, handler.arguments[0]!.getText(file)).toBeDefined();
      expect(callsWithin(callback!).filter((call) => [
        "ipcMain.handle",
        "installElectronProductHandlers",
        "process.nextTick",
        "queueMicrotask",
        "setImmediate",
        "setInterval",
        "setTimeout",
      ].includes(call))).toEqual([]);
    }

    const updaterSource = await readFile(new URL("../src/adapters/standalone/host-updater.ts", import.meta.url), "utf8");
    const updaterFile = parsed("host-updater.ts", updaterSource);
    const invoke = updaterFile.statements
      .filter(ts.isClassDeclaration)
      .flatMap((declaration) => declaration.members)
      .find((member): member is ts.MethodDeclaration => ts.isMethodDeclaration(member) && member.name.getText(updaterFile) === "invoke");
    expect(invoke).toBeDefined();
    expect(callsWithin(invoke!).filter((call) => call === "this.invoke" || [
      "process.nextTick",
      "queueMicrotask",
      "setImmediate",
      "setInterval",
      "setTimeout",
    ].includes(call))).toEqual([]);
  });

  it("keeps physical retirement atomic instead of exposing a status-release-stop path", async () => {
    const sources = await standaloneSources();
    const physicalStopOwners = sources
      .filter(({ source }) => /\bstopSidecars?\s*\(/u.test(source))
      .map(({ name }) => name);
    expect(physicalStopOwners).toEqual(["guarded-lifecycle.ts"]);

    const authority = sources.find(({ name }) => name === "authority.ts")!.source;
    expect(authority).toContain("withElectronPhysicalResourceSetGuard");
    expect(authority).toContain("await guard.retire()");
    expect(authority).not.toMatch(/\bstopSidecars?\s*\(|\bwithSidecarLifecycleLock\b/u);

    const guard = sources.find(({ name }) => name === "guarded-lifecycle.ts")!.source;
    expect(guard).not.toMatch(/\bgetSidecarStatus\s*\(|\.lifecycle\.(?:status|release|stop)\s*\(/u);
  });
});
