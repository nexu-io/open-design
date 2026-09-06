import { describe, expect, it } from "vitest";

import { createElectronContractInvocationExpression } from "../src/automation.js";
import { installMockOpenDesignElectron } from "../src/testing.js";

describe("Electron contract automation", () => {
  it("invokes a declared method without exposing the physical contract slot", async () => {
    const scope: Record<string, unknown> = {};
    const remove = installMockOpenDesignElectron({ scope, host: { updater: { check: async (target) => ({ target } as never) } } });
    const expression = createElectronContractInvocationExpression(["updater", "check"], ["closure"]);
    expect(expression).not.toContain("window.__od__");
    const invoke = Function("globalThis", `return ${expression}`) as (scope: Record<string, unknown>) => Promise<unknown>;
    await expect(invoke(scope)).resolves.toEqual({ target: "closure" });
    remove();
  });

  it("rejects paths that could escape the declared property traversal", () => {
    expect(() => createElectronContractInvocationExpression(["updater", "__proto__"], [])).toThrow("path is invalid");
  });
});
