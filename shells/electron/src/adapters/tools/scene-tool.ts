import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleElectronScene } from "@open-design/electron-kit/distribution";

import { buildElectronStandaloneAuthority } from "../standalone/build.ts";
import { parseElectronExactSceneRequest } from "./exact-contract.ts";
import { resolveElectronSceneManifest } from "./manifests.ts";
import { electronShellSource } from "./resources.ts";
import { withElectronPhysicalPlatform } from "../../platform/build.ts";

export async function executeElectronExactScene(input: ReturnType<typeof parseElectronExactSceneRequest>) {
const manifest = await resolveElectronSceneManifest(input.buildHash);
const rawResources = JSON.parse(await readFile(input.resourceReceiptFile, "utf8")) as { schemaVersion?: unknown; operation?: unknown; resources?: unknown };
if (rawResources.schemaVersion !== 1 || rawResources.operation !== "closure.resources.build" || !Array.isArray(rawResources.resources)) {
  throw new Error("Electron exact scene requires a Closure resource receipt");
}
const resources = rawResources.resources.map((candidate) => {
  if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Closure resource receipt entry is invalid");
  const value = candidate as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.file !== "string" || typeof value.path !== "string" || typeof value.entrypoint !== "string"
    || typeof value.sha256 !== "string" || typeof value.size !== "number" || typeof value.treeSha256 !== "string") throw new Error("Closure resource receipt entry is incomplete");
  return { id: value.id, file: value.file, path: resolve(value.path), entrypoint: value.entrypoint, sha256: value.sha256, size: value.size, treeSha256: value.treeSha256 };
});
const normalizedReceiptPath = resolve(dirname(input.sceneDirectory), "closure-resources.json");
await mkdir(dirname(normalizedReceiptPath), { recursive: true });
await writeFile(normalizedReceiptPath, `${JSON.stringify({ schemaVersion: 1, operation: "closure.resources.build", resources: resources.map(({ path: _path, ...resource }) => resource) }, null, 2)}\n`, "utf8");
const authority = await buildElectronStandaloneAuthority(resolve(dirname(input.sceneDirectory), "electron-authority-build"));
const receipt = await withElectronPhysicalPlatform({ archivePath: input.platformArchivePath, target: input.target }, async platformRoot => assembleElectronScene({
  authorityResources: [
    { name: "platform", path: platformRoot },
    authority.host,
    authority.updaterProvider,
    authority.supervisor,
    { name: "closure.mjs", path: input.acceptedClosureBaselineFile },
    { name: "standalone-launcher.mjs", path: input.standaloneLauncherFile },
    { name: "closure-resources.json", path: normalizedReceiptPath },
    ...resources.map((resource) => ({ name: resource.file, path: resource.path })),
  ],
  entryPath: electronShellSource("main.ts"),
  manifest,
  nodeCarrierLockPath: fileURLToPath(new URL("../../../config/carriers/node-lock.json", import.meta.url)),
  outputRoot: input.sceneDirectory,
  rendererPreloadEntryPath: electronShellSource("adapters/renderer/preload.ts"),
  runtimeConfigPath: fileURLToPath(new URL("../../../config/runtime.json", import.meta.url)),
  standaloneBinding: {
    target: input.target,
    closureResourceName: "closure.mjs",
    launcherResourceName: "standalone-launcher.mjs",
  },
}));
const sceneBytes = await readFile(receipt.sceneManifestPath);
return Object.freeze({
  schemaVersion: 1,
  operation: "electron.scene.build",
  target: input.target,
  sceneDirectory: receipt.sceneRoot,
  sceneManifestSha256: createHash("sha256").update(sceneBytes).digest("hex"),
});
}
