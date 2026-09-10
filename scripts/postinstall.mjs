import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const buildTargets = [
  "packages/metatool",
  "packages/release",
  "packages/contracts",
  "packages/standalone",
  "packages/electron-kit",
  "packages/electron-capsule",
  "packages/components",
  "packages/platform",
  "packages/download",
  "packages/archive",
  "packages/electron-contract",
  "packages/registry-protocol",
  "packages/agui-adapter",
  "packages/plugin-runtime",
  "packages/sidecar-proto",
  "packages/sidecar",
  "packages/diagnostics",
  "packages/dsh-runtime",
  "apps/daemon",
  "apps/closure",
  "shells/electron",
  "tools/dev",
  "tools/pack",
  "tools/release",
  "tools/serve",
];

// Preserve the gold bootstrap contract: select roots, then build their complete
// workspace dependency closure. Levels describe capabilities, not workflows.
const postinstallLevels = {
  full: { roots: buildTargets, verifyNativeAddon: true },
  "release-prepare": { roots: ["tools/pack", "tools/release"], verifyNativeAddon: false },
  "release-platform": { roots: ["tools/pack", "tools/release", "tools/serve"], verifyNativeAddon: true },
  "release-smoke": { roots: ["apps/closure", "tools/pack", "tools/release", "tools/serve"], dependencyRoots: ["apps/daemon", "apps/web"], verifyNativeAddon: true },
  "resource-build": { roots: ["apps/closure"], verifyNativeAddon: false },
  "runtime-build": { roots: ["apps/closure"], dependencyRoots: ["apps/daemon", "apps/web"], verifyNativeAddon: false },
  "scene-build": { roots: ["apps/closure", "shells/electron"], verifyNativeAddon: false },
  "electron-build": { roots: ["shells/electron"], verifyNativeAddon: false },
  "terminal-build": { roots: ["apps/closure"], verifyNativeAddon: false },
};

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

function availableBuildTargets() {
  const targets = [];
  for (const target of buildTargets) {
    // Partial install contexts (e.g. deploy/Dockerfile copies only
    // apps/daemon/package.json before `pnpm install`) lack the target's sources;
    // building there fails `tsc -p tsconfig.json` with TS5058. Skip instead —
    // such contexts run the real build later, once sources are in place.
    if (!existsSync(resolve(repoRoot, target, "tsconfig.json"))) {
      process.stdout.write(`postinstall: skipping ${target} (no tsconfig.json in this context)\n`);
      continue;
    }
    targets.push(target);
  }
  return targets;
}

function runBuildTarget(target) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      packageManager.command,
      [...packageManager.argsPrefix, "-C", target, "run", "build"],
      {
        cwd: repoRoot,
        stdio: "inherit",
      },
    );

    child.on("error", rejectPromise);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const suffix = signal != null ? `signal ${signal}` : `exit code ${code ?? 1}`;
      rejectPromise(new Error(`postinstall: ${target} failed with ${suffix}`));
    });
  });
}

function readPackageJson(target) {
  const req = createRequire(resolve(repoRoot, target, "package.json"));
  return req("./package.json");
}

function workspaceDependencyNames(pkg) {
  const names = new Set();
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const dependencies = pkg[field];
    if (dependencies == null || typeof dependencies !== "object") continue;
    for (const [name, specifier] of Object.entries(dependencies)) {
      if (typeof specifier === "string" && specifier.startsWith("workspace:")) {
        names.add(name);
      }
    }
  }
  return names;
}

function buildDependencyMap(targets) {
  const targetSet = new Set(targets);
  const nameToTarget = new Map();
  for (const target of targets) {
    const pkg = readPackageJson(target);
    if (typeof pkg.name === "string") {
      nameToTarget.set(pkg.name, target);
    }
  }

  const dependenciesByTarget = new Map();
  for (const target of targets) {
    const pkg = readPackageJson(target);
    const dependencies = [];
    for (const name of workspaceDependencyNames(pkg)) {
      const dependencyTarget = nameToTarget.get(name);
      if (dependencyTarget != null && targetSet.has(dependencyTarget)) {
        dependencies.push(dependencyTarget);
      }
    }
    dependenciesByTarget.set(target, dependencies);
  }
  return dependenciesByTarget;
}

function postinstallConcurrency() {
  const raw = process.env.OPEN_DESIGN_POSTINSTALL_CONCURRENCY;
  if (raw == null || raw.trim() === "") return 1;

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`OPEN_DESIGN_POSTINSTALL_CONCURRENCY must be a positive integer, got: ${raw}`);
  }
  return value;
}

function postinstallLevel() {
  const level = process.env.OPEN_DESIGN_POSTINSTALL_LEVEL?.trim() || "full";
  if (!Object.hasOwn(postinstallLevels, level)) {
    throw new Error(`OPEN_DESIGN_POSTINSTALL_LEVEL must be one of ${Object.keys(postinstallLevels).join(", ")}; got: ${level}`);
  }
  return level;
}

function buildTargetsForLevel(availableTargets, level) {
  if (level === "full") return availableTargets;
  const dependencies = buildDependencyMap(availableTargets);
  const selected = new Set();
  function visit(target) {
    if (selected.has(target)) return;
    if (!dependencies.has(target)) throw new Error(`postinstall: ${level} requires unavailable build target ${target}`);
    selected.add(target);
    for (const dependency of dependencies.get(target)) visit(dependency);
  }
  for (const root of postinstallLevels[level].roots) visit(root);
  // Runtime producers/tests consume these apps' dependencies, but own the app
  // build themselves. Do not compile daemon/Web twice or bootstrap a Next build.
  const byName = new Map(availableTargets.map(target => [readPackageJson(target).name, target]));
  for (const root of postinstallLevels[level].dependencyRoots ?? []) {
    for (const name of workspaceDependencyNames(readPackageJson(root))) {
      const dependency = byName.get(name);
      if (dependency == null) throw new Error(`postinstall: ${level} requires unavailable dependency ${name} of ${root}`);
      visit(dependency);
    }
  }
  return availableTargets.filter(target => selected.has(target));
}

async function runBuildTargetsInParallel(targets, concurrency) {
  const dependenciesByTarget = buildDependencyMap(targets);
  const remaining = new Set(targets);
  const completed = new Set();

  process.stdout.write(
    `postinstall: dependency-aware parallel build enabled (concurrency=${concurrency})\n`,
  );

  while (remaining.size > 0) {
    const ready = targets.filter(
      (target) =>
        remaining.has(target) &&
        dependenciesByTarget.get(target).every((dependency) => completed.has(dependency)),
    );

    if (ready.length === 0) {
      throw new Error(
        `postinstall: could not find a dependency-ready build target; remaining=${[
          ...remaining,
        ].join(", ")}`,
      );
    }

    for (let index = 0; index < ready.length; index += concurrency) {
      const batch = ready.slice(index, index + concurrency);
      process.stdout.write(`postinstall: building ${batch.join(", ")}\n`);
      await Promise.all(batch.map((target) => runBuildTarget(target)));
      for (const target of batch) {
        remaining.delete(target);
        completed.add(target);
      }
    }
  }
}

async function runBuildTargets(level) {
  const targets = buildTargetsForLevel(availableBuildTargets(), level);
  const concurrency = postinstallConcurrency();
  process.stdout.write(`postinstall: level=${level}; targets=${targets.join(", ")}\n`);
  await runBuildTargetsInParallel(targets, concurrency);
}

let activeLevel;
try {
  activeLevel = postinstallLevel();
  await runBuildTargets(activeLevel);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
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
  // Try to actually use the native addon; merely requiring the JS wrapper
  // succeeds even when the binary is missing (e.g. after `pnpm install --ignore-scripts`).
  if (postinstallLevels[activeLevel].verifyNativeAddon) {
    const Database = req("better-sqlite3");
    new Database(":memory:");
  } else {
    process.stdout.write(`postinstall: skipping native addon verification for level=${activeLevel}\n`);
  }
} catch (e) {
  // MODULE_NOT_FOUND means daemon deps aren't installed yet — not our problem.
  // Any other error (missing binary, ERR_DLOPEN_FAILED, ABI mismatch, etc.) warrants a rebuild.
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
