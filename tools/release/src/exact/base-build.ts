import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { acquireBuildArchive } from "@open-design/tools-pack/build";
import { electronBuilder, target, type BuildInput } from "./native-builder.ts";
import { writeObject } from "./control-common.ts";

/** Channel-native production, independent of scenes and version projection. */
export async function buildReleaseBase(input: BuildInput & Readonly<{ channel: string; runtimeArchive?: string }>) {
  if (input.shell !== "electron") throw new Error("base build requires electron");
  const buildTarget = target(input);
  if (!buildTarget.startsWith("darwin-") || buildTarget !== `${process.platform}-${process.arch}`) throw new Error("base build target mismatch");
  const { buildElectronBase, resolveElectronBaseArchive } = await electronBuilder(input.root);
  const source = await resolveElectronBaseArchive(buildTarget);
  const archivePath = input.runtimeArchive ? resolve(input.runtimeArchive) : (await acquireBuildArchive({
    cacheRoot: join(dirname(resolve(input.output)), ".build-cache"), fileName: source.fileName, url: source.url, sha256: source.sha256,
  })).path;
  await mkdir(dirname(resolve(input.output)), { recursive: true });
  const base = await buildElectronBase({ channel: input.channel, target: buildTarget, archivePath, outputRoot: resolve(input.output) });
  const receipt = { schemaVersion: 1, operation: "electron.base.build", target: buildTarget, base };
  await writeObject(input.receipt, receipt);
  return receipt;
}
