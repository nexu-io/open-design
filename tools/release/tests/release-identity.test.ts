import { describe, expect, it } from "vitest";

import { readIdentityRegistry, resolveIdentityDeclaration } from "../src/identity/declaration/registry.js";
import { resolveReleaseIdentity } from "../src/identity/resolution/resolve.js";

const workspaceRoot = new URL("../../..", import.meta.url).pathname;

describe("release identity registry", () => {
  it("expands complete platform specs without leaking the opposite platform", async () => {
    const registry = await readIdentityRegistry(workspaceRoot);
    const mac = resolveIdentityDeclaration(registry, "shell.spec.mac_arm64");
    const win = resolveIdentityDeclaration(registry, "shell.spec.win_x64");
    expect(mac.sources.map(({ path }) => path)).toContain("e2e/specs/mac");
    expect(mac.sources.map(({ path }) => path)).not.toContain("e2e/specs/win");
    expect(win.sources.map(({ path }) => path)).toContain("e2e/specs/win");
    expect(win.sources.map(({ path }) => path)).not.toContain("e2e/specs/mac");
  });

  it("covers Closure runtime dependencies while isolating platform packagers", async () => {
    const registry = await readIdentityRegistry(workspaceRoot);
    const shared = resolveIdentityDeclaration(registry, "closure.shared.build");
    const target = resolveIdentityDeclaration(registry, "closure.target.darwin-arm64");
    expect(shared.sources.map(({ path }) => path)).toEqual(expect.arrayContaining([
      "packages/closure",
      "packages/download",
    ]));
    expect(target.sources.map(({ path }) => path)).toEqual(expect.arrayContaining([
      "packages/closure",
    ]));
    expect(target.sources.some(({ excludePaths }) => JSON.stringify(excludePaths) === JSON.stringify(["mac", "win"]))).toBe(true);
  });

  it("binds declared parameters and rejects missing or surplus values", async () => {
    const parameters = { matrix: "mac-shell-v3", standaloneProtocolVersion: 1 };
    const arm = await resolveReleaseIdentity({ id: "shell.spec.mac_arm64", parameters, workspaceRoot });
    const x64 = await resolveReleaseIdentity({ id: "shell.spec.mac_x64", parameters, workspaceRoot });
    expect(arm.digest).not.toBe(x64.digest);
    await expect(resolveReleaseIdentity({
      id: "shell.spec.mac_arm64",
      parameters: { matrix: "mac-shell-v3" },
      workspaceRoot,
    })).rejects.toThrow(/parameters must be exactly/u);
  });
});
