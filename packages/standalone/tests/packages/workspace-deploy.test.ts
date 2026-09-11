import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import { deployWorkspacePackage } from "@/packages/workspace-build.js";

it("deploys from the shared lock with an empty registry cache, without resolving unrelated workspace ranges", async () => {
  const root = await mkdtemp(join(tmpdir(), "locked-workspace-deploy-"));
  vi.stubEnv("npm_config_cache_dir", join(root, "metadata"));
  vi.stubEnv("npm_config_store_dir", join(root, "store"));
  try {
    const { packageManager } = JSON.parse(await readFile(new URL("../../../../package.json", import.meta.url), "utf8"));
    await writeFile(join(root, "package.json"), JSON.stringify({ private: true, packageManager }));
    const workspace = "packages:\n  - packages/*\nautoInstallPeers: false\ninjectWorkspacePackages: false\nforceLegacyDeploy: true\n";
    await writeFile(join(root, "pnpm-workspace.yaml"), workspace);
    for (const name of ["target", "leaf", "unrelated"]) await mkdir(join(root, "packages", name), { recursive: true });
    await writeFile(join(root, "packages/target/package.json"), JSON.stringify({ name: "@fixture/target", version: "1.0.0",
      type: "module", dependencies: { "@fixture/leaf": "workspace:*" } }));
    await writeFile(join(root, "packages/target/index.js"), 'export { marker } from "@fixture/leaf";');
    await writeFile(join(root, "packages/leaf/package.json"), JSON.stringify({ name: "@fixture/leaf", version: "1.0.0",
      type: "module", exports: "./index.js", scripts: { postinstall: "exit 91" } }));
    await writeFile(join(root, "packages/leaf/index.js"), 'export const marker = "portable";');
    await writeFile(join(root, "packages/unrelated/package.json"), JSON.stringify({ name: "@fixture/unrelated", version: "1.0.0",
      dependencies: { "missing-meta-fixture": ">=1.0.0" } }));
    const lock = `lockfileVersion: '9.0'
settings:
  autoInstallPeers: false
  excludeLinksFromLockfile: false
importers:
  .: {}
  packages/target:
    dependencies:
      '@fixture/leaf':
        specifier: workspace:*
        version: link:../leaf
  packages/leaf: {}
  packages/unrelated:
    dependencies:
      missing-meta-fixture:
        specifier: '>=1.0.0'
        version: 1.0.0
packages:
  missing-meta-fixture@1.0.0:
    resolution: {integrity: sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==}
snapshots:
  missing-meta-fixture@1.0.0: {}
`;
    await writeFile(join(root, "pnpm-lock.yaml"), lock);
    const result = await deployWorkspacePackage({ workspaceRoot: root, packageDirectory: join(root, "packages/target"), outputRoot: join(root, "export") });
    expect(await readFile(join(root, "pnpm-lock.yaml"), "utf8")).toBe(lock);
    expect(await readFile(join(root, "pnpm-workspace.yaml"), "utf8")).toBe(workspace);
    await rm(join(root, "packages"), { recursive: true, force: true });
    execFileSync(process.execPath, ["--input-type=module", "-e",
      "import {marker} from " + JSON.stringify(pathToFileURL(join(result.packageRoot, "index.js")).href) + "; if(marker !== 'portable') process.exit(1);"]);
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});
