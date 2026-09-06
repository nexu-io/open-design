import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute the adapter's actual declarations without its process-level exchange
// entrypoint. This observes the emitted wire request and budget together, without
// starting a carrier or spending wall time waiting for a deliberately slow host.
const source = ts.createSourceFile("fossil.mjs", readFileSync(new URL("../runtime/fossil.mjs", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = ["sidecarRequestTimeoutMs", "sidecarRequest", "sidecarLifecycle"];
const declarations = names.map((name) => {
  const declaration = source.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!declaration) throw new Error(`Missing fossil declaration: ${name}`);
  return declaration.getText(source);
}).join("\n");

function adapter() {
  const invokeSidecar = vi.fn(async () => ({ state: "acquired", transition: { token: "test-transition" } }));
  const lifecycle = new Script(`${declarations}\nsidecarLifecycle();`).runInNewContext({
    invokeSidecar,
    activeSidecarStamp: { channel: "betahyx", namespace: "timeout-proof" },
    sidecarAction: "standalone.request.v1",
  });
  return { lifecycle, invokeSidecar };
}

describe("Terminal fossil lifecycle request budgets", () => {
  it.each([
    ["forceStop", "force-stop", 60_000],
    ["completeBoundStart", "complete-start", 120_000],
    ["renew", "renew", 5_000],
    ["release", "release", 5_000],
  ])("routes %s through the lifecycle transition budget", async (method, action, timeoutMs) => {
    const { lifecycle, invokeSidecar } = adapter();
    const scope = { channel: "betahyx", namespace: "timeout-proof" };
    const { transition } = await lifecycle.beginTransition(scope, "restart", {});
    invokeSidecar.mockClear();
    await transition[method]();
    expect(invokeSidecar).toHaveBeenCalledExactlyOnceWith(
      expect.anything(), "standalone.request.v1",
      expect.objectContaining({ schemaVersion: 1, domain: "lifecycle", operation: "transition", action, token: "test-transition", scope }),
      { timeoutMs },
    );
  });
});
