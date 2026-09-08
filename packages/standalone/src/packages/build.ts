import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { withStagedNodeRuntime, type StageNodeRuntimeInput } from "./node.js";

const execute = promisify(execFile);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export type BuildNodePlatformInput = StageNodeRuntimeInput & Readonly<{
  dependenciesRoot: string;
  verificationEntryPath: string;
  preparationEntryPath: string;
}>;

/** Product owns dependencies/probes; this atom installs them under the locked official Node. */
export async function buildNodePlatform(input: BuildNodePlatformInput) {
  if (![input.dependenciesRoot, input.verificationEntryPath, input.preparationEntryPath].every(isAbsolute)) throw new Error("platform build paths must be absolute");
  const packagePath = join(input.dependenciesRoot, "package.json");
  const lockPath = join(input.dependenciesRoot, "package-lock.json");
  const [packageBytes, lockBytes] = await Promise.all([readFile(packagePath), readFile(lockPath)]);
  const declaration = JSON.parse(packageBytes.toString("utf8")) as { private?: unknown; dependencies?: Record<string, string> };
  const lock = JSON.parse(lockBytes.toString("utf8")) as { lockfileVersion?: unknown; packages?: Record<string, { dependencies?: Record<string, string> }> };
  if (declaration.private !== true || lock.lockfileVersion !== 3 || declaration.dependencies == null
    || Object.keys(declaration.dependencies).length === 0
    || Object.values(declaration.dependencies).some(version => !/^\d+\.\d+\.\d+$/u.test(version))
    || JSON.stringify(Object.entries(declaration.dependencies).sort()) !== JSON.stringify(Object.entries(lock.packages?.[""]?.dependencies ?? {}).sort())) {
    throw new Error("platform dependencies require a matching private package and npm lock v3");
  }
  return withStagedNodeRuntime(input, async (node, archiveRoot) => {
  await writeFile(join(input.outputRoot, "package.json"), packageBytes, { flag: "wx" });
  await writeFile(join(input.outputRoot, "package-lock.json"), lockBytes, { flag: "wx" });
  const env = { ...process.env, PATH: `${dirname(node.executablePath)}${delimiter}${process.env.PATH ?? ""}`,
    NODE_OPTIONS: "", ELECTRON_RUN_AS_NODE: "", NODE_PATH: join(input.outputRoot, "node_modules") };
  const npmCliPath = join(archiveRoot, input.target === "win32-x64" ? "node_modules/npm/bin/npm-cli.js" : "lib/node_modules/npm/bin/npm-cli.js");
  await execute(node.executablePath, [npmCliPath, "ci", "--omit=dev", "--no-audit", "--no-fund"],
    { cwd: input.outputRoot, env, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  const verificationPath = join(input.outputRoot, "platform-check.cjs");
  await build({ entryPoints: [input.verificationEntryPath], outfile: verificationPath, bundle: true, packages: "external", format: "cjs", platform: "node", target: "node24" });
  const scratch = await mkdtemp(join(input.outputRoot, ".prepare-"));
  try {
    const preparationPath = join(scratch, "prepare.cjs");
    await build({ entryPoints: [input.preparationEntryPath], outfile: preparationPath, bundle: true, packages: "external", format: "cjs", platform: "node", target: "node24" });
    await execute(node.executablePath, [preparationPath, input.outputRoot], { cwd: input.outputRoot, env, timeout: 15_000 });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  const { stdout } = await execute(node.executablePath, [verificationPath], { cwd: input.outputRoot, env, timeout: 15_000 });
  const manifest = Object.freeze({ schemaVersion: 1 as const, node: node.receipt,
    dependencies: declaration.dependencies, packageSha256: sha256(packageBytes), lockSha256: sha256(lockBytes),
    verification: { path: "platform-check.cjs", sha256: sha256(await readFile(verificationPath)) } });
  await writeFile(join(input.outputRoot, "platform.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return Object.freeze({ root: input.outputRoot, manifest, verification: JSON.parse(stdout) as unknown });
  });
}
