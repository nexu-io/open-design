import { describe, expect, it } from "vitest";

import { readIdentityRegistry, resolveIdentityDeclaration } from "../src/identity/declaration/registry.js";
import { resolveReleaseIdentity, resolveReleaseWorkspaceRoot } from "../src/identity/resolution/resolve.js";

const workspaceRoot = new URL("../../..", import.meta.url).pathname;

it("anchors runtime release identity to cwd rather than the bundled module location", () => {
  expect(resolveReleaseWorkspaceRoot()).toBe(workspaceRoot.replace(/\/$/u, ""));
  expect(resolveReleaseWorkspaceRoot(".")).toBe(process.cwd());
});
const sourcePath = (...segments: string[]): string => segments.join("/");

describe("release identity registry", () => {
  it("owns Shell artifact identity without consuming tools-pack process-cache mechanics", async () => {
    const registry = await readIdentityRegistry(workspaceRoot);
    const mac = resolveIdentityDeclaration(registry, "shell.build.darwin-arm64");
    const paths = mac.sources.map(({ path }) => path);
    expect(paths).toEqual(expect.arrayContaining([
      sourcePath("packages", "shell", "src"),
      sourcePath("shells", "electron", "src"),
      sourcePath("tools", "pack", "src", "mac"),
    ]));
    expect(paths).not.toEqual(expect.arrayContaining([
      sourcePath("tools", "pack", "src", "build-identity.ts"),
      sourcePath("tools", "pack", "src", "cache.ts"),
      sourcePath("tools", "pack", "src", "shell-build-plan.ts"),
      sourcePath("tools", "pack", "src", "workspace-build.ts"),
    ]));
    expect(mac.sources.every(({ normalizePackageVersion }) => normalizePackageVersion === true)).toBe(true);

    const base = { profile: { namespace: "release-beta", signing: { enabled: false } }, target: "darwin-arm64" };
    const first = await resolveReleaseIdentity({ id: "shell.build.darwin-arm64", parameters: base, workspaceRoot });
    const changed = await resolveReleaseIdentity({
      id: "shell.build.darwin-arm64",
      parameters: { ...base, profile: { ...base.profile, namespace: "release-stable" } },
      workspaceRoot,
    });
    expect(changed.digest).not.toBe(first.digest);
  });

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
    expect(target.sources.some(({ path, excludePaths }) => (
      path === sourcePath("tools", "pack", "src", "closure")
      && JSON.stringify(excludePaths) === JSON.stringify(["cache-key.ts"])
    ))).toBe(true);
    expect(target.sources.map(({ path }) => path)).not.toContain(sourcePath("tools", "pack", "src", "cache.ts"));
    expect(shared.sources.every(({ normalizePackageVersion }) => normalizePackageVersion === true)).toBe(true);
    expect(target.sources.every(({ normalizePackageVersion }) => normalizePackageVersion === true)).toBe(true);
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
