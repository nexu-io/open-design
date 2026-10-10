import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function resolveToolPackRoot(startDir: string): string {
  let candidate = startDir;
  while (true) {
    const packageJsonPath = join(candidate, "package.json");
    if (existsSync(packageJsonPath)) {
      const require = createRequire(packageJsonPath);
      const packageJson = require(packageJsonPath) as { name?: string };
      if (packageJson.name === "@open-design/tools-pack") return candidate;
    }

    const parent = dirname(candidate);
    if (parent === candidate) throw new Error(`could not locate @open-design/tools-pack package from ${startDir}`);
    candidate = parent;
  }
}

function resolveWorkspaceRoot(): string {
  const configured = process.env.OD_TOOLS_PACK_WORKSPACE_ROOT?.trim();
  if (configured != null && configured.length > 0) return resolve(configured);
  return resolve(resolveToolPackRoot(dirname(fileURLToPath(import.meta.url))), "../..");
}

export const TOOL_PACK_ROOT = resolveToolPackRoot(dirname(fileURLToPath(import.meta.url)));
export const WORKSPACE_ROOT = resolveWorkspaceRoot();
