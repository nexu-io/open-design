import { spawn } from "node:child_process";
import { lstat, mkdir, open, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { canonicalBytes, readObject } from "./control-common.ts";
import { createExactPlanFromRegistryFile } from "./plan.ts";

const recipes = {
  "electron.contract.test": [{ directory: "packages/electron-contract", args: ["test"] }],
  "electron.shell.test": [
    { directory: "packages/electron-kit", args: ["test"] },
    { directory: "packages/electron-capsule", args: ["test"] },
    { directory: "shells/electron", args: ["test"] },
    { directory: "packages/standalone", args: ["exec", "vitest", "run", "tests/packages"] },
  ],
  "closure.test": ["apps/closure", "apps/daemon", "apps/web"].map(directory => ({ directory, args: ["test"] })),
} as const;
type TestNode = keyof typeof recipes;

/** Execute a selected test recipe, never a caller-provided command. A result is
 * local evidence only; convergence retains authority over reusable results. */
export async function validateExactPlanNode(input: Readonly<{
  root: string; registry: string; plan: string; node: string; log: string; receipt: string;
}>) {
  if (!Object.hasOwn(recipes, input.node)) throw new Error("unsupported exact validation node");
  const node = input.node as TestNode, root = resolve(input.root), releasePlan = await readObject(input.plan);
  if (releasePlan.schemaVersion !== 1 || !Array.isArray(releasePlan.actions)
    || !releasePlan.actions.some(action => action?.id === node)) throw new Error("validation node is not selected by the release plan");
  if (node !== "electron.contract.test" && releasePlan.plan?.target !== `${process.platform}-${process.arch}`) throw new Error("validation target differs from the executing platform");
  const current = () => createExactPlanFromRegistryFile({ root, registryPath: resolve(root, input.registry),
    target: releasePlan.plan.target, acceptedShellBaseline: releasePlan.plan.acceptedShellBaseline });
  if (!canonicalBytes(await current()).equals(canonicalBytes(releasePlan.plan))) throw new Error("validation plan binding mismatch");
  try { await lstat(input.receipt); throw new Error("validation receipt already exists"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const log = await open(resolve(input.log), "wx"), startedAt = new Date().toISOString();
  const commands: Array<{ directory: string; args: readonly string[] }> = [];
  try {
    for (const command of recipes[node]) {
      commands.push(command);
      await new Promise<void>((done, reject) => {
        const child = spawn("pnpm", [...command.args], { cwd: join(root, command.directory),
          stdio: ["ignore", log.fd, log.fd], env: { ...process.env, CI: "true" } });
        child.once("error", reject);
        child.once("close", (code, signal) => code === 0 && signal == null ? done()
          : reject(new Error(`validation failed in ${command.directory}: ${signal ?? code}`)));
      });
    }
    if (!canonicalBytes(await current()).equals(canonicalBytes(releasePlan.plan))) throw new Error("validation source changed during execution");
    const receipt = { schemaVersion: 1, operation: "exact.validation", status: "passed", node,
      identity: releasePlan.plan.nodes[node].identity, target: releasePlan.plan.target,
      executionPlatform: `${process.platform}-${process.arch}`, startedAt,
      finishedAt: new Date().toISOString(), commands, log: resolve(input.log) };
    await mkdir(dirname(resolve(input.receipt)), { recursive: true });
    await writeFile(input.receipt, canonicalBytes(receipt), { flag: "wx" });
    return receipt;
  } finally { await log.close(); }
}
