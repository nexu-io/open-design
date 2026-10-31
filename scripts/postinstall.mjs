import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const phase = process.argv[2] ?? process.env.OPEN_DESIGN_POSTINSTALL_PHASE ?? "all";
if (!["all", "dependencies", "build", "describe"].includes(phase)) {
  throw new Error(`Unknown postinstall phase: ${phase}`);
}

const localDevelopment = Object.freeze({
  concurrency: 1,
  targets: Object.freeze([
    "packages/release",
    "packages/contracts",
    "packages/standalone",
    "packages/components",
    "packages/platform",
    "packages/download",
    "packages/host",
    "packages/registry-protocol",
    "packages/agui-adapter",
    "packages/plugin-runtime",
    "packages/sidecar-proto",
    "packages/launcher-proto",
    "packages/sidecar",
    "packages/diagnostics",
    "packages/dsh-runtime",
    "apps/daemon",
    "tools/dev",
    "tools/pack",
    "tools/release",
    "tools/serve",
  ]),
});
const buildTargets = localDevelopment.targets;
const externalPlanPath = process.env.OPEN_DESIGN_POSTINSTALL_PLAN_PATH?.trim() ?? "";
const receiptPath = process.env.OPEN_DESIGN_POSTINSTALL_RECEIPT_PATH?.trim() ?? "";
const planEntry = process.env.OPEN_DESIGN_POSTINSTALL_ENTRY?.trim() || phase;

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value != null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function planDigest(plan) {
  const canonical = {
    schemaVersion: plan.schemaVersion,
    installProfile: plan.installProfile,
    requestedTargets: plan.requestedTargets,
    resolvedTargets: plan.resolvedTargets,
    requirements: plan.requirements,
  };
  return createHash("sha256").update(JSON.stringify(canonicalValue(canonical))).digest("hex");
}

function readExternalPlan() {
  if (externalPlanPath.length === 0) return null;
  const path = resolve(repoRoot, externalPlanPath);
  const plan = JSON.parse(readFileSync(path, "utf8"));
  if (
    plan?.schemaVersion !== 2 ||
    typeof plan.id !== "string" ||
    typeof plan.digest !== "string" ||
    typeof plan.requirements !== "object" ||
    plan.requirements == null ||
    typeof plan.requirements.materializeDomToPptx !== "boolean" ||
    typeof plan.requirements.probeNativeDependencies !== "boolean"
  ) {
    throw new Error("External postinstall plan has an invalid schema");
  }
  if (plan.digest !== planDigest(plan)) {
    throw new Error("External postinstall plan digest is invalid");
  }
  if (plan.entries == null || typeof plan.entries !== "object" || plan.entries[planEntry] == null) {
    throw new Error(`External postinstall plan does not define entry: ${planEntry}`);
  }
  const entry = plan.entries[planEntry];
  if (
    typeof entry !== "object" ||
    entry == null ||
    typeof entry.materializeDomToPptx !== "boolean" ||
    typeof entry.probeNativeDependencies !== "boolean" ||
    !Array.isArray(entry.resolvedTargets) ||
    entry.resolvedTargets.some((target) => typeof target !== "string" || !buildTargets.includes(target)) ||
    new Set(entry.resolvedTargets).size !== entry.resolvedTargets.length ||
    !Number.isInteger(entry.concurrency) ||
    entry.concurrency < 1
  ) {
    throw new Error(`External postinstall plan entry ${planEntry} is invalid`);
  }
  return plan;
}

const externalPlan = readExternalPlan();
const externalEntry = externalPlan?.entries[planEntry] ?? null;
const timingPath = process.env.OPEN_DESIGN_POSTINSTALL_TIMING_PATH?.trim() ?? "";
const postinstallStartedAt = Date.now();
const postinstallStarted = performance.now();
let timingWarningWritten = false;
const targetStatuses = new Map();
const receiptOperations = [];

function recordTiming({ durationMs, operation, startedAt, status, target }) {
  if (timingPath.length === 0) return;
  try {
    const resolvedPath = resolve(repoRoot, timingPath);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    appendFileSync(
      resolvedPath,
      `${JSON.stringify({
        schemaVersion: 1,
        ...(externalPlan == null ? {} : { planId: externalPlan.id, planDigest: externalPlan.digest, entry: planEntry }),
        phase,
        operation,
        ...(target == null ? {} : { target }),
        status,
        startedAt: new Date(startedAt).toISOString(),
        durationMs: Math.max(0, Math.round(durationMs)),
      })}\n`,
      "utf8",
    );
  } catch (error) {
    if (!timingWarningWritten) {
      timingWarningWritten = true;
      process.stderr.write(
        `postinstall: could not write optional timing data: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
}

process.on("exit", (code) => {
  recordTiming({
    durationMs: performance.now() - postinstallStarted,
    operation: "postinstall",
    startedAt: postinstallStartedAt,
    status: code === 0 ? "success" : "failure",
  });
  if (externalPlan != null && receiptPath.length > 0) {
    try {
      const resolvedPath = resolve(repoRoot, receiptPath);
      mkdirSync(dirname(resolvedPath), { recursive: true });
      appendFileSync(
        resolvedPath,
        `${JSON.stringify({
          schemaVersion: externalPlan.schemaVersion,
          planId: externalPlan.id,
          planDigest: externalPlan.digest,
          entry: planEntry,
          status: code === 0 ? "success" : "failure",
          startedAt: new Date(postinstallStartedAt).toISOString(),
          durationMs: Math.max(0, Math.round(performance.now() - postinstallStarted)),
          executedTargets: externalEntry.resolvedTargets.filter((target) => targetStatuses.get(target) === "success"),
          operations: receiptOperations,
        })}\n`,
        "utf8",
      );
    } catch (error) {
      process.stderr.write(
        `postinstall: could not write required execution receipt: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
});

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

function materializeDomToPptxBundle() {
  const startedAt = Date.now();
  const started = performance.now();
  const vendorDir = resolve(repoRoot, "apps", "desktop", "vendor", "dom-to-pptx");
  const compressedBundle = resolve(vendorDir, "dom-to-pptx.bundle.js.gz");
  const bundle = resolve(vendorDir, "dom-to-pptx.bundle.js");

  if (!existsSync(compressedBundle)) {
    recordTiming({
      durationMs: performance.now() - started,
      operation: "materialize-dom-to-pptx",
      startedAt,
      status: "skipped",
    });
    receiptOperations.push({ operation: "materialize-dom-to-pptx", status: "skipped" });
    return;
  }

  try {
    mkdirSync(vendorDir, { recursive: true });
    writeFileSync(bundle, gunzipSync(readFileSync(compressedBundle)));
    process.stdout.write("postinstall: materialized dom-to-pptx browser bundle\n");
    recordTiming({
      durationMs: performance.now() - started,
      operation: "materialize-dom-to-pptx",
      startedAt,
      status: "success",
    });
    receiptOperations.push({ operation: "materialize-dom-to-pptx", status: "success" });
  } catch (error) {
    recordTiming({
      durationMs: performance.now() - started,
      operation: "materialize-dom-to-pptx",
      startedAt,
      status: "failure",
    });
    receiptOperations.push({ operation: "materialize-dom-to-pptx", status: "failure" });
    throw error;
  }
}

function availableBuildTargets() {
  const targets = [];
  for (const target of buildTargets) {
    // Partial install contexts (e.g. deploy/Dockerfile copies only
    // apps/daemon/package.json before `pnpm install`) lack the target's sources;
    // building there fails `tsc -p tsconfig.json` with TS5058. Skip instead —
    // such contexts run the real build later, once sources are in place.
    if (!existsSync(resolve(repoRoot, target, "tsconfig.json"))) {
      if (phase !== "describe") process.stdout.write(`postinstall: skipping ${target} (no tsconfig.json in this context)\n`);
      continue;
    }
    targets.push(target);
  }
  return targets;
}

function runBuildTarget(target) {
  return new Promise((resolvePromise, rejectPromise) => {
    const startedAt = Date.now();
    const started = performance.now();
    let settled = false;
    const finish = (status) => {
      if (settled) return;
      settled = true;
      recordTiming({
        durationMs: performance.now() - started,
        operation: "workspace-build",
        startedAt,
        status,
        target,
      });
      targetStatuses.set(target, status);
    };
    const child = spawn(
      packageManager.command,
      [...packageManager.argsPrefix, "-C", target, "run", "build"],
      {
        cwd: repoRoot,
        stdio: "inherit",
      },
    );

    child.on("error", (error) => {
      finish("failure");
      rejectPromise(error);
    });
    child.on("close", (code, signal) => {
      if (code === 0) {
        finish("success");
        resolvePromise();
        return;
      }

      finish("failure");
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
  if (externalEntry != null) {
    const value = externalEntry.concurrency;
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`External postinstall plan entry ${planEntry} has invalid concurrency`);
    }
    return value;
  }
  const raw = process.env.OPEN_DESIGN_POSTINSTALL_CONCURRENCY;
  if (raw == null || raw.trim() === "") return localDevelopment.concurrency;

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`OPEN_DESIGN_POSTINSTALL_CONCURRENCY must be a positive integer, got: ${raw}`);
  }
  return value;
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

function selectedBuildTargets() {
  const available = availableBuildTargets();
  if (externalEntry != null) {
    const requested = externalEntry.resolvedTargets;
    if (!Array.isArray(requested) || requested.some((target) => typeof target !== "string" || !buildTargets.includes(target))) {
      throw new Error(`External postinstall plan entry ${planEntry} has invalid resolvedTargets`);
    }
    const missing = requested.filter((target) => !available.includes(target));
    if (missing.length > 0) {
      throw new Error(`External postinstall plan targets are unavailable in this checkout: ${missing.join(", ")}`);
    }
    return requested;
  }
  const raw = process.env.OPEN_DESIGN_POSTINSTALL_TARGETS;
  let targets = available;
  if (raw != null && raw.trim() !== "") {
    const requested = JSON.parse(raw);
    if (!Array.isArray(requested) || requested.some((target) => typeof target !== "string" || !available.includes(target))) {
      throw new Error("OPEN_DESIGN_POSTINSTALL_TARGETS must be a JSON array of available build target directories");
    }
    // Execution scope, not a cache policy: retain the ordinary dependency graph
    // and rebuild selected tools plus their workspace dependencies. Install-time
    // materialization and native-addon validation remain unconditional.
    const dependencies = buildDependencyMap(available);
    const selected = new Set();
    function include(target) {
      if (selected.has(target)) return;
      selected.add(target);
      for (const dependency of dependencies.get(target)) include(dependency);
    }
    for (const target of requested) include(target);
    targets = available.filter((target) => selected.has(target));
  }
  return targets;
}

async function runBuildTargets() {
  const startedAt = Date.now();
  const started = performance.now();
  const targets = selectedBuildTargets();
  process.stdout.write(`postinstall: selected build closure ${JSON.stringify(targets)}\n`);
  const concurrency = postinstallConcurrency();
  try {
    await runBuildTargetsInParallel(targets, concurrency);
    recordTiming({
      durationMs: performance.now() - started,
      operation: "workspace-build-closure",
      startedAt,
      status: "success",
    });
    receiptOperations.push({ operation: "workspace-build-closure", status: "success", targets });
  } catch (error) {
    recordTiming({
      durationMs: performance.now() - started,
      operation: "workspace-build-closure",
      startedAt,
      status: "failure",
    });
    receiptOperations.push({ operation: "workspace-build-closure", status: "failure", targets });
    throw error;
  }
}

// Separate installation side effects from source compilation. The default
// lifecycle still does both; CI may restore independently prepared tool outputs.
if (phase === "describe") {
  process.stdout.write(`${JSON.stringify(selectedBuildTargets())}\n`);
  process.exit(0);
}
const materializeEnabled = externalEntry?.materializeDomToPptx ?? phase !== "build";
const nativeProbeEnabled = externalEntry?.probeNativeDependencies ?? phase !== "build";
const buildEnabled = externalEntry != null ? externalEntry.resolvedTargets.length > 0 : phase !== "dependencies";
if (materializeEnabled) materializeDomToPptxBundle();
try {
  if (buildEnabled) await runBuildTargets();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

if (!nativeProbeEnabled) process.exit(0);

// Verify the better-sqlite3 native addon loads under the current Node.js ABI.
// better-sqlite3 is a dep of apps/daemon (not the workspace root), so resolve
// it from the daemon package context. prebuild-install may have fetched a
// prebuilt binary for a different ABI (e.g. after switching between Node 22 /
// 24 / 25). When the addon fails to dlopen, pnpm rebuild handles the rebuild
// using its own node-gyp lifecycle — no assumptions about where node-gyp lives.
const req = createRequire(resolve(repoRoot, "apps/daemon/package.json"));
let needsRebuild = false;
const nativeProbeStartedAt = Date.now();
const nativeProbeStarted = performance.now();
try {
  // Try to actually use the native addon; merely requiring the JS wrapper
  // succeeds even when the binary is missing (e.g. after `pnpm install --ignore-scripts`).
  const Database = req("better-sqlite3");
  new Database(":memory:");
} catch (e) {
  // MODULE_NOT_FOUND means daemon deps aren't installed yet — not our problem.
  // Any other error (missing binary, ERR_DLOPEN_FAILED, ABI mismatch, etc.) warrants a rebuild.
  if (e?.code !== "MODULE_NOT_FOUND") {
    needsRebuild = true;
  }
}
recordTiming({
  durationMs: performance.now() - nativeProbeStarted,
  operation: "better-sqlite3-probe",
  startedAt: nativeProbeStartedAt,
  status: "success",
});
receiptOperations.push({ operation: "better-sqlite3-probe", status: "success" });

if (needsRebuild) {
  process.stdout.write(
    `postinstall: rebuilding better-sqlite3 for Node.js ${process.version}...\n`,
  );
  const rebuildStartedAt = Date.now();
  const rebuildStarted = performance.now();
  const rebuild = spawnSync(
    packageManager.command,
    [...packageManager.argsPrefix, "--filter", "@open-design/daemon", "rebuild", "better-sqlite3"],
    { cwd: repoRoot, stdio: "inherit" },
  );
  recordTiming({
    durationMs: performance.now() - rebuildStarted,
    operation: "better-sqlite3-rebuild",
    startedAt: rebuildStartedAt,
    status: rebuild.error == null && rebuild.status === 0 ? "success" : "failure",
  });
  receiptOperations.push({
    operation: "better-sqlite3-rebuild",
    status: rebuild.error == null && rebuild.status === 0 ? "success" : "failure",
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
