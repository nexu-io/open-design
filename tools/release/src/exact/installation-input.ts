import { copyFile, lstat, mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { checkedFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { stageArtifactProduct } from "./artifact-product.ts";

/** Project only signed installation inputs. Resource payloads remain with the
 * publisher; neither release bindings nor their existing digests are rewritten. */
export async function exportInstallationInput(input: Readonly<{ source: string; output: string }>) {
  const source = resolve(input.source);
  const prepared = await readObject(join(source, "prepare-receipt.json"));
  if (prepared.schemaVersion !== 2 || prepared.operation !== "exact.prepare" || !Array.isArray(prepared.shells)) {
    throw new Error("Invalid prepared installation input");
  }
  const files = new Map<string, JsonObject>([
    ["documents/content-metadata.json", prepared.contentMetadata],
    ["trust/keys.json", prepared.trustFile],
  ]);
  for (const shell of prepared.shells) {
    if (shell.type !== "electron") continue;
    if (!Array.isArray(shell.scenes)) throw new Error("Missing Electron installation scenes");
    for (const scene of shell.scenes) {
      if (!["darwin-arm64", "darwin-x64", "win32-x64"].includes(scene.target)
        || typeof scene.capsule?.archive?.file !== "string" || scene.capsule.manifest == null) {
        throw new Error("Incomplete installation Capsule binding");
      }
      const name = basename(scene.capsule.archive.file);
      if (!name || name === "." || name === ".." || name.includes("\\")) throw new Error("Invalid installation Capsule filename");
      for (const [path, descriptor] of [
        [`documents/capsule-${scene.target}.json`, scene.capsule.manifest],
        [`artifacts/${name}`, scene.capsule.archive],
      ] as const) {
        const prior = files.get(path);
        if (prior != null && (prior.sha256 !== descriptor.sha256 || prior.size !== descriptor.size)) {
          throw new Error("Conflicting installation input path");
        }
        files.set(path, descriptor);
      }
    }
  }
  await stageArtifactProduct(input.output, async stage => {
    for (const [path, descriptor] of files) {
      const file = join(source, path), destination = join(stage, path);
      if (descriptor == null || !(await lstat(file)).isFile()) throw new Error("Installation input must be a bound regular file");
      await checkedFile(descriptor, "Installation input", file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(file, destination);
      await checkedFile(descriptor, "Projected installation input", destination);
    }
    await writeObject(join(stage, "prepare-receipt.json"), prepared);
  });
}
