import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveToolPackConfig } from "@/config/index.js";
import { renderMacPackagedConfig } from "@/mac/app.js";
import { assertExistingMacMaterialization } from "@/mac/existing-app.js";
import { resolveMacPaths } from "@/mac/paths.js";
import { resolveMacInstallIdentity } from "@/mac/identity.js";
import { electronBuilderVersionForAppVersion } from "@/versioning/index.js";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "existing-mac-materialization-")); roots.push(root);
  const config = resolveToolPackConfig("mac", { dir: root, namespace: "pr3a-mat", portable: true, appVersion: "0.23.1-beta.3184" });
  const paths = resolveMacPaths(config);
  await mkdir(paths.assembledAppRoot, { recursive: true });
  await mkdir(join(paths.packagedConfigPath, ".."), { recursive: true });
  const appVersion = "0.23.1-beta.3184";
  const body = JSON.parse(renderMacPackagedConfig({ appVersion, config, usePrebundledStandaloneWeb: config.webOutputMode === "standalone" }));
  await writeFile(paths.packagedConfigPath, JSON.stringify(body));
  await writeFile(paths.assembledPackageJsonPath, JSON.stringify({ productName: resolveMacInstallIdentity(config).productName, version: electronBuilderVersionForAppVersion(appVersion) }));
  return { config, paths, body, appVersion };
}
describe("existing Mac release materialization", () => {
  it("accepts a freshly materialized release identity", async () => {
    const f = await fixture(); await expect(assertExistingMacMaterialization(f.config, f.paths, f.appVersion)).resolves.toBeUndefined();
  });
  it.each(["appVersion", "namespace", "amrProfile", "updateMetadataUrl", "namespaceBaseRoot"])("rejects a stale or injected %s from a reused runtime", async (field) => {
    const f = await fixture();
    await writeFile(f.paths.packagedConfigPath, JSON.stringify({ ...f.body, [field]: "stale" }));
    await expect(assertExistingMacMaterialization(f.config, f.paths, f.appVersion)).rejects.toThrow("not materialized");
  });
  it.each(["version", "productName"])("rejects an assembled %s from a different target release", async (field) => {
    const f = await fixture();
    await writeFile(f.paths.assembledPackageJsonPath, JSON.stringify({ productName: resolveMacInstallIdentity(f.config).productName, version: electronBuilderVersionForAppVersion(f.appVersion), [field]: "stale" }));
    await expect(assertExistingMacMaterialization(f.config, f.paths, f.appVersion)).rejects.toThrow("version or channel identity");
  });
});
