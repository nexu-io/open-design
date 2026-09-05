import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleElectronScene } from "@open-design/electron-kit/distribution";

import { buildElectronStandaloneAuthority } from "./build-authority.ts";
import { parseElectronExactSceneRequest } from "./exact-adapter-contract.ts";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} is required`);
  return resolve(value);
}

const requestPath = argument("--request");
const receiptPath = argument("--receipt");
const input = parseElectronExactSceneRequest(JSON.parse(await readFile(requestPath, "utf8")));
const authority = await buildElectronStandaloneAuthority(resolve(dirname(input.sceneDirectory), "electron-authority-build"));
const receipt = await assembleElectronScene({
  authorityResources: [
    authority.host,
    authority.supervisor,
    { name: "closure.mjs", path: input.acceptedClosureBaselineFile },
    { name: "standalone-launcher.mjs", path: input.standaloneLauncherFile },
  ],
  entryPath: fileURLToPath(new URL("../src/main.ts", import.meta.url)),
  manifestPath: input.shellManifestFile,
  nodeCarrierLockPath: fileURLToPath(new URL("../config/carriers/node-lock.json", import.meta.url)),
  outputRoot: input.sceneDirectory,
  rendererPreloadEntryPath: fileURLToPath(new URL("../src/adapters/renderer/preload.ts", import.meta.url)),
  runtimeConfigPath: fileURLToPath(new URL("../config/runtime.json", import.meta.url)),
  standaloneBinding: {
    target: input.target,
    closureResourceName: "closure.mjs",
    launcherResourceName: "standalone-launcher.mjs",
  },
});
const sceneBytes = await readFile(receipt.sceneManifestPath);
await mkdir(dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify({
  schemaVersion: 1,
  operation: "electron.scene.build",
  target: input.target,
  sceneDirectory: receipt.sceneRoot,
  sceneManifestSha256: createHash("sha256").update(sceneBytes).digest("hex"),
}, null, 2)}\n`, "utf8");
