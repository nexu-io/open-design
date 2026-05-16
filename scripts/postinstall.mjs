import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const buildTargets = [
  "packages/contracts",
  "packages/registry-protocol",
  "packages/agui-adapter",
  "packages/plugin-runtime",
  "packages/sidecar-proto",
  "packages/sidecar",
  "packages/platform",
  "tools/dev",
  "tools/pack",
  "tools/pr",
];

const jsExtensions = new Set([".js", ".cjs", ".mjs"]);

function resolvePackageManagerInvocation() {
  const pnpmExecPath = process.env.npm_execpath;
  if (pnpmExecPath != null && pnpmExecPath.length > 0) {
    if (jsExtensions.has(extname(pnpmExecPath).toLowerCase())) {
      return { argsPrefix: [pnpmExecPath], command: process.execPath };
    }
    return { argsPrefix: [], command: pnpmExecPath };
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

// Verify the better-sqlite3 native addon loads under the current Node.js ABI.
// better-sqlite3 is a dep of apps/daemon (not the workspace root), so resolve
// it from the daemon package context. prebuild-install may have fetched a
// prebuilt binary for a different ABI (e.g. after switching between Node 22 /
// 24 / 25). When the addon fails to dlopen, pnpm rebuild handles the rebuild
// using its own node-gyp lifecycle — no assumptions about where node-gyp lives.
const req = createRequire(resolve(repoRoot, "apps/daemon/package.json"));
let needsRebuild = false;
try {
  req("better-sqlite3");
} catch (e) {
  // MODULE_NOT_FOUND means daemon deps aren't installed yet — not our problem.
  // Any other error (ERR_DLOPEN_FAILED, ABI mismatch, etc.) warrants a rebuild.
  if (e?.code !== "MODULE_NOT_FOUND") {
    needsRebuild = true;
  }
}

if (needsRebuild) {
  process.stdout.write(
    `postinstall: rebuilding better-sqlite3 for Node.js ${process.version}...\n`,
  );
  const rebuild = spawnSync(
    packageManager.command,
    [...packageManager.argsPrefix, "--filter", "@open-design/daemon", "rebuild", "better-sqlite3"],
    { cwd: repoRoot, stdio: "inherit" },
  );
  if (rebuild.error != null) throw rebuild.error;
  if (rebuild.status !== 0) {
    process.stderr.write(
      "postinstall: better-sqlite3 rebuild failed.\n" +
        "Install build tools (python3, make, g++ or clang++) then run: pnpm install\n",
    );
    process.exit(rebuild.status ?? 1);
  }
}
