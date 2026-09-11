import { lstat, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pack, extract } from "@open-design/archive/build";
import { assertArtifactDestinationAbsent, openArtifactProduct, stageArtifactProduct } from "./artifact-product.ts";
import { checkedFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { packageBuilder } from "./native-builder.ts";

const ARCHIVE = "toolchain.zip", RECEIPT = "toolchain.json";
const PACKAGE = "@open-design/shell-electron";
function host(target: string) {
  if (process.platform !== "darwin" || target !== `${process.platform}-${process.arch}`) throw new Error("Electron toolchain currently requires its matching macOS host");
}
function bound(receipt: JsonObject, target: string) {
  host(target);
  if (Object.keys(receipt).sort().join(",") !== "archive,nodeMajor,operation,packageName,packageVersion,schemaVersion,target"
    || receipt.schemaVersion !== 1 || receipt.operation !== "electron.toolchain.build" || receipt.target !== target
    || receipt.packageName !== PACKAGE || typeof receipt.packageVersion !== "string" || !receipt.packageVersion
    || receipt.nodeMajor !== Number(process.versions.node.split(".")[0])
    || !/^[a-f0-9]{64}$/u.test(receipt.archive?.sha256 ?? "")
    || !Number.isSafeInteger(receipt.archive?.size) || receipt.archive.size <= 0) throw new Error("toolchain artifact binding mismatch");
}

/** Export the built public Shell package closure, not an installed workspace or
 * a second build. Python owns the reusable workload and its storage identity. */
export async function buildToolchain(input: Readonly<{ root: string; target: string; output: string }>) {
  host(input.target);
  const scratch = await mkdtemp(join(tmpdir(), "release-toolchain-"));
  try {
    const { deployWorkspacePackage } = await packageBuilder(input.root);
    const product = await deployWorkspacePackage({ workspaceRoot: resolve(input.root),
      packageDirectory: join(resolve(input.root), "shells/electron"), outputRoot: join(scratch, "portable") });
    if (product.name !== PACKAGE) throw new Error("toolchain package identity mismatch");
    await stageArtifactProduct(input.output, async stage => {
      const archive = await pack(product.root, join(stage, ARCHIVE), { allowInternalLinks: true });
      await writeObject(join(stage, RECEIPT), { schemaVersion: 1, operation: "electron.toolchain.build", target: input.target,
        packageName: product.name, packageVersion: product.version, nodeMajor: Number(process.versions.node.split(".")[0]),
        archive: { sha256: archive.sha256, size: archive.size } });
    });
    return { artifactDirectory: resolve(input.output) };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

export async function unpackToolchain(input: Readonly<{ target: string; source: string; output: string }>) {
  host(input.target);
  await stageArtifactProduct(input.output, async stage => {
    if ((await readdir(input.source)).sort().join(",") !== [ARCHIVE, RECEIPT].sort().join(",")) throw new Error("unexpected toolchain transport payloads");
    for (const name of [ARCHIVE, RECEIPT]) {
      const stat = await lstat(join(input.source, name));
      if (!stat.isFile() || stat.size > (name === RECEIPT ? 64 * 1024 : 2 * 1024 ** 3)) throw new Error("invalid toolchain transport file");
    }
    const receipt = await readObject(join(input.source, RECEIPT)); bound(receipt, input.target);
    await checkedFile(receipt.archive, "toolchain archive", join(input.source, ARCHIVE));
    const unpacked = join(stage, "content");
    await extract(join(input.source, ARCHIVE), unpacked, { allowInternalLinks: true });
    if ((await readdir(unpacked)).join(",") !== "package") throw new Error("invalid portable package envelope");
    const manifest = await readObject(join(unpacked, "package/package.json"));
    if (manifest.name !== receipt.packageName || manifest.version !== receipt.packageVersion) throw new Error("toolchain package identity mismatch");
    await writeObject(join(stage, RECEIPT), receipt);
  });
  return { packageDirectory: join(resolve(input.output), "content/package") };
}

export async function resolveToolchainPackage(directory: string, target: string) {
  const receipt = await readObject(join(resolve(directory), RECEIPT)); bound(receipt, target);
  const packageDirectory = join(resolve(directory), "content/package");
  const manifest = await readObject(join(packageDirectory, "package.json"));
  if (manifest.name !== receipt.packageName || manifest.version !== receipt.packageVersion) throw new Error("toolchain package identity mismatch");
  return packageDirectory;
}

export async function importToolchain(input: Readonly<{ target: string; descriptor: string; output: string }>) {
  host(input.target);
  await assertArtifactDestinationAbsent(resolve(input.output));
  const descriptor = await readObject(input.descriptor);
  await using product = await openArtifactProduct({ url: descriptor.url, sha256: descriptor.sha256 });
  return { ...await unpackToolchain({ ...input, source: product.archive.root }), acquisition: product.acquisition };
}
