import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const buildTargets = [
  "packages/sidecar-proto",
  "packages/sidecar",
  "packages/platform",
  "tools/dev",
];

function resolvePackageManagerInvocation() {
  const pnpmExecPath = process.env.npm_execpath;
  if (pnpmExecPath != null && pnpmExecPath.length > 0) {
    return { argsPrefix: [pnpmExecPath], command: process.execPath };
  }

  return { argsPrefix: [], command: process.platform === "win32" ? "pnpm.cmd" : "pnpm" };
}

const packageManager = resolvePackageManagerInvocation();

for (const target of buildTargets) {
  const result = spawnSync(
    packageManager.command,
    [...packageManager.argsPrefix, "-C", target, "run", "build"],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );

  if (result.error != null) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
