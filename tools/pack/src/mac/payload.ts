import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  LAUNCHER_SCHEMA_VERSION,
  resolveLauncherVersionPaths,
} from "@open-design/launcher-proto";

import type { ToolPackConfig } from "../config.js";
import {
  resolveToolPackLauncherChannel,
  resolveToolPackLauncherRoot,
} from "../launcher-layout.js";
import { execFileAsync } from "./commands.js";
import { resolveMacInstallIdentity } from "./identity.js";
import { readPackagedVersion } from "./manifest.js";
import type { MacPaths } from "./types.js";

export type MacLauncherPayloadManifest = {
  appBundleName: string;
  channel: string;
  entry: {
    cwd: string;
    executable: string;
  };
  namespace: string;
  payloadRoot: "payload";
  platform: "darwin";
  schemaVersion: typeof LAUNCHER_SCHEMA_VERSION;
  version: string;
};

export function buildMacLauncherPayloadManifest(input: {
  channel: string;
  executableName: string;
  namespace: string;
  publicAppBundleName: string;
  version: string;
}): MacLauncherPayloadManifest {
  return {
    appBundleName: input.publicAppBundleName,
    channel: input.channel,
    entry: {
      cwd: `payload/${input.publicAppBundleName}`,
      executable: `payload/${input.publicAppBundleName}/Contents/MacOS/${input.executableName}`,
    },
    namespace: input.namespace,
    payloadRoot: "payload",
    platform: "darwin",
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    version: input.version,
  };
}

export async function createMacLauncherPayloadArchive(
  config: ToolPackConfig,
  paths: MacPaths,
): Promise<string> {
  const packagedVersion = await readPackagedVersion(config);
  const channel = resolveToolPackLauncherChannel(config);
  const launcherRoot = resolveToolPackLauncherRoot(config);
  resolveLauncherVersionPaths({
    channel,
    namespace: config.namespace,
    root: launcherRoot,
    version: packagedVersion,
  });

  const identity = resolveMacInstallIdentity(config);
  const stageRoot = join(dirname(paths.payloadZipPath), "stage");
  const payloadRoot = join(stageRoot, "payload");
  const payloadAppPath = join(payloadRoot, identity.publicAppBundleName);
  const manifest = buildMacLauncherPayloadManifest({
    channel,
    executableName: identity.executableName,
    namespace: config.namespace,
    publicAppBundleName: identity.publicAppBundleName,
    version: packagedVersion,
  });

  await rm(stageRoot, { force: true, recursive: true });
  await rm(paths.payloadZipPath, { force: true, recursive: true });
  await mkdir(payloadRoot, { recursive: true });
  await execFileAsync("ditto", [paths.appPath, payloadAppPath]);
  await writeFile(join(stageRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await mkdir(dirname(paths.payloadZipPath), { recursive: true });
  await execFileAsync("ditto", [
    "-c",
    "-k",
    "--sequesterRsrc",
    "--rsrc",
    ".",
    paths.payloadZipPath,
  ], { cwd: stageRoot });
  await rm(stageRoot, { force: true, recursive: true });

  const archiveStat = await stat(paths.payloadZipPath);
  if (archiveStat.size <= 0) throw new Error(`mac launcher payload archive is empty: ${paths.payloadZipPath}`);
  return paths.payloadZipPath;
}
