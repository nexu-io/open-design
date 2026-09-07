import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as standalone from "@open-design/standalone";

// Execute the adapter's actual declarations without its process-level exchange
// entrypoint. This observes the emitted wire request and budget together, without
// starting a carrier or spending wall time waiting for a deliberately slow host.
const source = ts.createSourceFile("fossil.mjs", readFileSync(new URL("../runtime/fossil.mjs", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = ["sidecarControlRequest"];
const declarations = names.map((name) => {
  const declaration = source.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!declaration) throw new Error(`Missing fossil declaration: ${name}`);
  return declaration.getText(source);
}).join("\n");

function adapter() {
  const invokeSidecar = vi.fn(async () => ({ accepted: true }));
  const request = new Script(`${declarations}\nmessage => sidecarControlRequest(standalone, message);`).runInNewContext({
    standalone,
    invokeSidecar,
    activeSidecarStamp: { channel: "betahyx", namespace: "timeout-proof" },
  });
  return { request, invokeSidecar };
}

describe("Terminal fossil lifecycle request budgets", () => {
  it.each([
    ["transition.force-stop", 60_000],
    ["transition.complete-start", 120_000],
    ["transition.renew", 5_000],
    ["transition.release", 5_000],
    ["lifecycle.start", 120_000],
    ["lifecycle.stop", 60_000],
  ])("routes %s through the public request budget", async (operation, timeoutMs) => {
    const { request, invokeSidecar } = adapter();
    const scope = { channel: "betahyx", namespace: "timeout-proof" };
    const message = { schemaVersion: 1, operation, token: "test-transition", fence: 7, scope };
    await request(message);
    expect(invokeSidecar).toHaveBeenCalledExactlyOnceWith(
      expect.anything(), standalone.STANDALONE_HOST_CONTROL_ACTION, message,
      { timeoutMs },
    );
  });
});
