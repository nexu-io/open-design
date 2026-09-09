import { spawn } from "node:child_process";
import { lstat, mkdir, open, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { canonicalBytes } from "./control-common.ts";

const recipes = {
  "electron.contract.test": [{ directory: "packages/electron-contract", args: ["test"] }],
  "electron.shell.test": [
    { directory: "packages/electron-kit", args: ["test"] },
    { directory: "packages/electron-capsule", args: ["test"] },
    { directory: "shells/electron", args: ["test"] },
    { directory: "packages/standalone", args: ["exec", "vitest", "run", "tests/packages"] },
  ],
  "closure.test": [
    { directory: "apps/closure", args: ["test"] },
    { directory: "apps/daemon", args: ["exec", "vitest", "run", "tests/product-resource-paths.test.ts", "tests/server-paths.test.ts",
      "tests/sidecar-startup.test.ts", "tests/sidecar-status-snapshot.test.ts"] },
    { directory: "apps/web", args: ["exec", "vitest", "run", "tests/sidecar-proxy.test.ts", "tests/sidecar-shutdown.test.ts",
      "tests/sidecar-proxy-keepalive.test.ts", "tests/sidecar-proxy-daemon-unavailable.test.ts", "--maxWorkers=2"] },
  ],
} as const;
type TestNode = keyof typeof recipes;

/** Architecture is the release default. Business aggregates are an explicit,
 * reasoned request and never masquerade as an architecture-node cache result. */
export function resolveExactValidationRecipe(node: string, coverage = "architecture", reason?: string) {
  if (!Object.hasOwn(recipes, node)) throw new Error("unsupported exact validation node");
  if (coverage !== "architecture" && coverage !== "business") throw new Error("unsupported validation coverage");
  if (coverage === "business") {
    if (node !== "closure.test") throw new Error("business coverage supports only Closure validation");
    if (!reason?.trim()) throw new Error("business validation requires an explicit risk reason");
    return { node: node as TestNode, coverage, reason: reason.trim(),
      commands: ["apps/closure", "apps/daemon", "apps/web"].map(directory => ({ directory, args: ["test"] })) };
  }
  if (reason != null) throw new Error("risk reason is only supported for business validation");
  return { node: node as TestNode, coverage, commands: recipes[node as TestNode] };
}

/** Execute a selected test recipe, never a caller-provided command. A result is
 * local evidence only; convergence retains authority over reusable results. */
export async function validateReleaseRecipe(input: Readonly<{
  root: string; target: string; sourceCommit: string; node: string; log: string; receipt: string;
  coverage?: string; reason?: string;
}>) {
  const recipe = resolveExactValidationRecipe(input.node, input.coverage, input.reason);
  const node = recipe.node, root = resolve(input.root);
  if (!["darwin-arm64", "darwin-x64", "win32-x64"].includes(input.target)) throw new Error("unsupported validation target");
  if (!/^[a-f0-9]{40}$/u.test(input.sourceCommit)) throw new Error("validation requires a full source commit");
  if (node !== "electron.contract.test" && input.target !== process.platform + "-" + process.arch) throw new Error("validation target differs from the executing platform");
  try { await lstat(input.receipt); throw new Error("validation receipt already exists"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const log = await open(resolve(input.log), "wx"), startedAt = new Date().toISOString();
  const commands: Array<{ directory: string; args: readonly string[] }> = [];
  try {
    for (const command of recipe.commands) {
      commands.push(command);
      await new Promise<void>((done, reject) => {
        const child = spawn("pnpm", [...command.args], { cwd: join(root, command.directory),
          stdio: ["ignore", log.fd, log.fd], env: { ...process.env, CI: "true" } });
        child.once("error", reject);
        child.once("close", (code, signal) => code === 0 && signal == null ? done()
          : reject(new Error(`validation failed in ${command.directory}: ${signal ?? code}`)));
      });
    }
    const receipt = { schemaVersion: 1,
      operation: recipe.coverage === "business" ? "exact.business-validation" : "exact.validation",
      status: "passed", node, coverage: recipe.coverage,
      ...(recipe.coverage === "business" ? { reason: recipe.reason } : {}), target: input.target,
      sourceCommit: input.sourceCommit,
      executionPlatform: `${process.platform}-${process.arch}`, startedAt,
      finishedAt: new Date().toISOString(), commands, log: resolve(input.log) };
    await mkdir(dirname(resolve(input.receipt)), { recursive: true });
    await writeFile(input.receipt, canonicalBytes(receipt), { flag: "wx" });
    return receipt;
  } finally { await log.close(); }
}
