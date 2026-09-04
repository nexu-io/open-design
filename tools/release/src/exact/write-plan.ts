import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

import { createExactPlanFromRegistryFile, selectExactPlanActions, type ExactTarget } from "./plan.js";

type ExactPlanCliOptions = Readonly<{
  acceptedShellBaseline: `sha256:${string}`;
  available?: string;
  output: string;
  registry: string;
  root?: string;
  target: ExactTarget;
}>;

async function discoverWorkspaceRoot(start: string): Promise<string> {
  let candidate = resolve(start);
  while (true) {
    try {
      await access(join(candidate, "pnpm-workspace.yaml"));
      return candidate;
    } catch {
      const parent = dirname(candidate);
      if (parent === candidate || candidate === parse(candidate).root) throw new Error(`cannot find pnpm-workspace.yaml above ${start}`);
      candidate = parent;
    }
  }
}

export async function writeExactPlan(options: ExactPlanCliOptions): Promise<void> {
  const root = options.root == null ? await discoverWorkspaceRoot(process.cwd()) : resolve(options.root);
  const plan = await createExactPlanFromRegistryFile({
    acceptedShellBaseline: options.acceptedShellBaseline,
    registryPath: resolve(root, options.registry),
    root,
    target: options.target,
  });
  const available = options.available == null
    ? new Set<string>()
    : new Set(JSON.parse(await readFile(resolve(root, options.available), "utf8")) as string[]);
  const receipt = { actions: selectExactPlanActions(plan, available), plan };
  const output = resolve(root, options.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}
