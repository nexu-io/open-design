import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { ToolPackConfig } from "../config.js";
import { PRODUCT_NAME } from "./constants.js";
import { clearQuarantine, pathExists } from "./fs.js";
import { readPackagedVersion } from "./manifest.js";
import { sanitizeNamespace } from "./paths.js";
import type { MacPackResult, MacPaths } from "./types.js";

async function moveBuilderArtifact(options: {
  destinationPath: string;
  label: string;
  sourcePath: string;
}): Promise<string> {
  if (!(await pathExists(options.sourcePath))) {
    throw new Error(`no ${options.label} produced at ${options.sourcePath}`);
  }
  await mkdir(dirname(options.destinationPath), { recursive: true });
  await rm(options.destinationPath, { force: true, recursive: true });
  await rename(options.sourcePath, options.destinationPath);
  await clearQuarantine(options.destinationPath);
  return options.destinationPath;
}

async function cleanBuilderScratchMetadata(paths: MacPaths): Promise<void> {
  const entries = await readdir(paths.appBuilderOutputRoot).catch(() => []);

  await Promise.all(
    entries
      .filter((entry) => entry === "latest-mac.yml" || entry.endsWith(".blockmap"))
      .map(async (entry) => {
        await rm(join(paths.appBuilderOutputRoot, entry), { force: true, recursive: true });
      }),
  );
}

async function writeLocalLatestMacYml(config: ToolPackConfig, paths: MacPaths): Promise<void> {
  const packagedVersion = await readPackagedVersion(config);
  const zipName = basename(paths.zipPath);
  const zipPayload = await readFile(paths.zipPath);
  const zipMetadata = await stat(paths.zipPath);
  const sha512 = createHash("sha512").update(zipPayload).digest("base64");

  await mkdir(dirname(paths.latestMacYmlPath), { recursive: true });
  await writeFile(
    paths.latestMacYmlPath,
    [
      `version: ${JSON.stringify(packagedVersion)}`,
      "files:",
      `  - url: ${JSON.stringify(zipName)}`,
      `    sha512: ${JSON.stringify(sha512)}`,
      `    size: ${zipMetadata.size}`,
      `path: ${JSON.stringify(zipName)}`,
      `sha512: ${JSON.stringify(sha512)}`,
      `releaseDate: ${JSON.stringify(new Date().toISOString())}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

export async function finalizeMacArtifacts(
  config: ToolPackConfig,
  paths: MacPaths,
): Promise<Pick<MacPackResult, "dmgPath" | "latestMacYmlPath" | "zipPath">> {
  const namespaceToken = sanitizeNamespace(config.namespace);
  let dmgPath: string | null = null;
  let latestMacYmlPath: string | null = null;
  let zipPath: string | null = null;

  if (config.to === "dmg" || config.to === "all") {
    dmgPath = await moveBuilderArtifact({
      destinationPath: paths.dmgPath,
      label: "dmg artifact",
      sourcePath: join(paths.appBuilderOutputRoot, `${PRODUCT_NAME}-${namespaceToken}.dmg`),
    });
  }

  if (config.to === "zip" || config.to === "all") {
    zipPath = await moveBuilderArtifact({
      destinationPath: paths.zipPath,
      label: "zip artifact",
      sourcePath: join(paths.appBuilderOutputRoot, `${PRODUCT_NAME}-${namespaceToken}.zip`),
    });
    await writeLocalLatestMacYml(config, paths);
    latestMacYmlPath = paths.latestMacYmlPath;
  }

  await cleanBuilderScratchMetadata(paths);

  return { dmgPath, latestMacYmlPath, zipPath };
}
