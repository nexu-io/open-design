import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const buildTargets = [
  "packages/contracts",
  "packages/sidecar-proto",
  "packages/sidecar",
  "packages/platform",
  "tools/dev",
  "tools/pack",
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
// prebuild-install may have fetched a prebuilt binary for a different ABI (e.g.
// after switching between Node 22 / 24 / 25). When the addon fails to dlopen,
// rebuild from source using the node-gyp bundled with better-sqlite3 in the
// pnpm virtual store — no external tooling required beyond a C++ compiler.
const b3Link = resolve(repoRoot, "node_modules", "better-sqlite3");
if (existsSync(b3Link)) {
  const req = createRequire(import.meta.url);
  let b3Loads = false;
  try {
    req(b3Link);
    b3Loads = true;
  } catch {}

  if (!b3Loads) {
    // realpathSync resolves the pnpm symlink to the actual store path, e.g.
    // node_modules/.pnpm/better-sqlite3@X.Y.Z/node_modules/better-sqlite3
    // node-gyp is a direct dep and lives one level up in the same subtree.
    const b3Dir = realpathSync(b3Link);
    const nodeGypScript = resolve(b3Dir, "..", "node-gyp", "bin", "node-gyp.js");

    if (!existsSync(nodeGypScript)) {
      process.stderr.write(
        "postinstall: node-gyp not found in the pnpm store alongside better-sqlite3.\n" +
          "Run `pnpm install` again, or install build tools and retry.\n",
      );
      process.exit(1);
    }

    process.stdout.write(
      `postinstall: rebuilding better-sqlite3 for Node.js ${process.version}...\n`,
    );
    const rebuild = spawnSync(process.execPath, [nodeGypScript, "rebuild"], {
      cwd: b3Dir,
      stdio: "inherit",
    });
    if (rebuild.error != null) throw rebuild.error;
    if (rebuild.status !== 0) {
      process.stderr.write(
        "postinstall: better-sqlite3 rebuild failed.\n" +
          "Install build tools (python3, make, g++ or clang++) then run: pnpm install\n",
      );
      process.exit(rebuild.status ?? 1);
    }
  }
}
