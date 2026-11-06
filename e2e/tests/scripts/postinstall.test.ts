import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const e2eRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const workspaceRoot = dirname(e2eRoot);
const postinstallPath = join(workspaceRoot, "scripts", "postinstall.mjs");
const workflowPostinstallPath = join(workspaceRoot, ".github", "scripts", "postinstall.py");

type JsonObject = Record<string, unknown>;

type StubEvent = {
  args: string[];
  event: "start" | "done";
  target: string;
};

type TimingEvent = {
  durationMs: number;
  operation: string;
  phase: string;
  schemaVersion: number;
  startedAt: string;
  status: string;
  target?: string;
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(workspaceRoot, path), "utf8")) as unknown;
}

function readJsonObject(path: string): JsonObject {
  const value = readJson(path);
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error(`${path} must contain a JSON object`);
  }
  return value as JsonObject;
}

function packageName(manifest: unknown): string {
  if (typeof manifest !== "object" || manifest == null || Array.isArray(manifest)) {
    throw new Error("package manifest must be an object");
  }
  const name = (manifest as { name?: unknown }).name;
  if (typeof name !== "string") {
    throw new Error("package manifest must define a string name");
  }
  return name;
}

function packageBinTargets(manifest: unknown): string[] {
  if (typeof manifest !== "object" || manifest == null || Array.isArray(manifest)) {
    throw new Error("package manifest must be an object");
  }
  const bin = (manifest as { bin?: unknown }).bin;
  if (typeof bin === "string") return [bin];
  if (typeof bin !== "object" || bin == null || Array.isArray(bin)) return [];
  return Object.values(bin).filter((value): value is string => typeof value === "string");
}

function dependencySpecifier(manifest: JsonObject, name: string): string | undefined {
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const dependencies = manifest[field];
    if (typeof dependencies !== "object" || dependencies == null || Array.isArray(dependencies)) continue;
    const specifier = (dependencies as JsonObject)[name];
    if (typeof specifier === "string") return specifier;
  }
  return undefined;
}

function workspaceDependencyNames(manifest: unknown, includeDevDependencies = false): Set<string> {
  if (typeof manifest !== "object" || manifest == null || Array.isArray(manifest)) {
    throw new Error("package manifest must be an object");
  }

  const dependencyFields = includeDevDependencies
    ? ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
    : ["dependencies", "optionalDependencies", "peerDependencies"];
  const names = new Set<string>();

  for (const field of dependencyFields) {
    const dependencies = (manifest as JsonObject)[field];
    if (typeof dependencies !== "object" || dependencies == null || Array.isArray(dependencies)) continue;
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version === "string" && version.startsWith("workspace:")) {
        names.add(name);
      }
    }
  }

  return names;
}

function postinstallBuildTargetList(): string[] {
  const result = spawnSync(process.execPath, [postinstallPath, "describe"], {
    cwd: workspaceRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
  const targets = JSON.parse(result.stdout) as unknown;
  if (!Array.isArray(targets) || targets.some((target) => typeof target !== "string")) {
    throw new Error("postinstall describe requires string targets");
  }
  return targets;
}

function postinstallBuildTargets(): Set<string> {
  return new Set(postinstallBuildTargetList());
}

function workspacePackageDirectories(): string[] {
  const scopedPackageDirectories = ["apps", "packages", "tools"].flatMap((scope) =>
    readdirSync(join(workspaceRoot, scope), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${scope}/${entry.name}`),
  );
  return ["e2e", ...scopedPackageDirectories]
    .filter((directory) => existsSync(join(workspaceRoot, directory, "package.json")))
    .sort();
}

function distDelegatingBinTargets(directory: string, manifest: unknown): string[] {
  return packageBinTargets(manifest).filter((binTarget) => {
    if (binTarget.startsWith("./dist/")) return true;
    const binPath = join(workspaceRoot, directory, binTarget);
    if (!existsSync(binPath)) return true;
    const source = readFileSync(binPath, "utf8");
    return source.includes("../dist/") || source.includes("./dist/") || source.includes("/dist/");
  });
}

function createSandbox(): string {
  const sandbox = mkdtempSync(join(tmpdir(), "od-postinstall-"));
  mkdirSync(join(sandbox, "scripts"), { recursive: true });
  writeFileSync(join(sandbox, "scripts", "postinstall.mjs"), readFileSync(postinstallPath));
  return sandbox;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object" && value != null) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue((value as JsonObject)[key])]));
  }
  return value;
}

function writeExternalPlan(sandbox: string, targets: string[]): string {
  const canonical = {
    schemaVersion: 2,
    installProfile: "workspace",
    requestedTargets: targets,
    resolvedTargets: targets,
    requirements: { materializeDomToPptx: true, probeNativeDependencies: true },
  };
  const unsigned = {
    ...canonical,
    id: "fixture/postinstall",
    intent: "fixture",
    cacheTools: false,
    entries: {
      dependencies: { materializeDomToPptx: true, probeNativeDependencies: true, resolvedTargets: [], concurrency: 1 },
      build: { materializeDomToPptx: false, probeNativeDependencies: false, resolvedTargets: targets, concurrency: 1 },
      all: { materializeDomToPptx: true, probeNativeDependencies: true, resolvedTargets: targets, concurrency: 1 },
    },
  };
  const digest = createHash("sha256").update(JSON.stringify(canonicalValue(canonical))).digest("hex");
  const path = join(sandbox, "postinstall-plan.json");
  writeFileSync(path, `${JSON.stringify({ ...unsigned, digest })}\n`);
  return path;
}

function writeTarget(
  sandbox: string,
  target: string,
  manifest: { dependencies?: Record<string, string>; name: string; tsconfig?: boolean },
): void {
  mkdirSync(join(sandbox, target), { recursive: true });
  writeFileSync(
    join(sandbox, target, "package.json"),
    `${JSON.stringify(
      {
        name: manifest.name,
        ...(manifest.dependencies == null ? {} : { dependencies: manifest.dependencies }),
      },
      null,
      2,
    )}\n`,
  );
  if (manifest.tsconfig !== false) {
    writeFileSync(join(sandbox, target, "tsconfig.json"), "{}\n");
  }
}

function writePnpmStub(sandbox: string): string {
  const invocationLog = join(sandbox, "invocations.jsonl");
  writeFileSync(
    join(sandbox, "pnpm-stub.mjs"),
    [
      'import { appendFileSync } from "node:fs";',
      'import { setTimeout as delay } from "node:timers/promises";',
      "const args = process.argv.slice(2);",
      'const targetFlagIndex = args.indexOf("-C");',
      'const target = targetFlagIndex >= 0 ? args[targetFlagIndex + 1] ?? "" : "";',
      `const logPath = ${JSON.stringify(invocationLog)};`,
      'appendFileSync(logPath, JSON.stringify({ event: "start", target, args }) + "\\n");',
      'if (target === "packages/release") await delay(50);',
      'appendFileSync(logPath, JSON.stringify({ event: "done", target, args }) + "\\n");',
    ].join("\n"),
  );
  return invocationLog;
}

function runFixturePostinstall(sandbox: string, env: Record<string, string | undefined>): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [join(sandbox, "scripts", "postinstall.mjs")], {
    cwd: sandbox,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_execpath: join(sandbox, "pnpm-stub.mjs"),
      OPEN_DESIGN_POSTINSTALL_ENTRY: undefined,
      OPEN_DESIGN_POSTINSTALL_PLAN_PATH: undefined,
      OPEN_DESIGN_POSTINSTALL_RECEIPT_PATH: undefined,
      OPEN_DESIGN_POSTINSTALL_TARGETS: undefined,
      OPEN_DESIGN_POSTINSTALL_TIMING_PATH: undefined,
      ...env,
    },
  });
}

function readTimingEvents(path: string): TimingEvent[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TimingEvent);
}

function readStubEvents(invocationLog: string): StubEvent[] {
  if (!existsSync(invocationLog)) return [];
  return readFileSync(invocationLog, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StubEvent);
}

function eventIndex(events: StubEvent[], event: StubEvent["event"], target: string): number {
  const index = events.findIndex((entry) => entry.event === event && entry.target === target);
  expect(index, `${event} ${target}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe("postinstall script contract", () => {
  it("[P2] validates workflow intents and produces a frozen target closure", () => {
    const output = join(tmpdir(), `od-postinstall-plan-${process.pid}.json`);
    try {
      const validation = spawnSync("python3", [workflowPostinstallPath, "validate"], {
        cwd: workspaceRoot,
        encoding: "utf8",
        env: { ...process.env, OPEN_DESIGN_POSTINSTALL_TARGETS: '["tools/pack"]' },
      });
      expect(validation.status, validation.stderr).toBe(0);
      const planned = spawnSync("python3", [
        workflowPostinstallPath,
        "plan",
        "--intent", "shared-javascript",
        "--cache-tools", "true",
        "--output", output,
      ], { cwd: workspaceRoot, encoding: "utf8" });
      expect(planned.status, planned.stderr).toBe(0);
      const plan = JSON.parse(readFileSync(output, "utf8")) as JsonObject;
      expect(plan.intent).toBe("shared-javascript");
      expect(plan.installProfile).toBe("workspace");
      expect(plan.requestedTargets).toEqual(["tools/pack"]);
      expect(plan.resolvedTargets).toEqual(expect.arrayContaining(["packages/release", "tools/pack"]));
      expect(typeof plan.digest).toBe("string");

      const semanticDigest = plan.digest;
      const alternateExecution = spawnSync("python3", [
        workflowPostinstallPath,
        "plan",
        "--intent", "shared-javascript",
        "--cache-tools", "false",
        "--concurrency", "7",
        "--output", output,
      ], {
        cwd: workspaceRoot,
        encoding: "utf8",
        env: { ...process.env, GITHUB_WORKFLOW: "alternate", GITHUB_JOB: "alternate" },
      });
      expect(alternateExecution.status, alternateExecution.stderr).toBe(0);
      const alternatePlan = JSON.parse(readFileSync(output, "utf8")) as JsonObject;
      expect(alternatePlan.digest).toBe(semanticDigest);
      expect(alternatePlan.id).toBe("alternate/alternate/shared-javascript");
      expect(alternatePlan.cacheTools).toBe(false);
      expect((alternatePlan.entries as JsonObject).all).toEqual(expect.objectContaining({ concurrency: 7 }));

      const exactInstallProfiles: Record<string, string> = {
        "release-control": "release-tools",
        "release-publish": "release-tools",
        "release-validation": "release-validation",
      };
      for (const [intent, installProfile] of Object.entries(exactInstallProfiles)) {
        const result = spawnSync("python3", [
          workflowPostinstallPath,
          "plan",
          "--intent", intent,
          "--output", output,
        ], { cwd: workspaceRoot, encoding: "utf8" });
        expect(result.status, result.stderr).toBe(0);
        expect(JSON.parse(readFileSync(output, "utf8")).installProfile).toBe(installProfile);
      }

      const exactWorkflowTargets: Record<string, string[] | "all"> = {
        "release-smoke": ["tools/pack", "tools/serve"],
        "ci-workspace-unit": "all",
        "ci-windows-tools-pack": "all",
        "ci-daemon": "all",
        "ci-e2e": "all",
        "ci-ui": "all",
        "ci-web": "all",
      };
      for (const [intent, requestedTargets] of Object.entries(exactWorkflowTargets)) {
        const result = spawnSync("python3", [
          workflowPostinstallPath,
          "plan",
          "--intent", intent,
          "--output", output,
        ], { cwd: workspaceRoot, encoding: "utf8" });
        expect(result.status, result.stderr).toBe(0);
        const plannedTargets = JSON.parse(readFileSync(output, "utf8")).requestedTargets;
        if (requestedTargets === "all") expect(plannedTargets).toEqual(postinstallBuildTargetList());
        else expect(plannedTargets).toEqual(requestedTargets);
      }
    } finally {
      rmSync(output, { force: true });
    }
  });

  it("[P2] executes a frozen workflow plan and emits a bound receipt", () => {
    const sandbox = createSandbox();
    try {
      writeTarget(sandbox, "packages/release", { name: "@open-design/release" });
      writeTarget(sandbox, "tools/pack", {
        name: "@open-design/tools-pack", dependencies: { "@open-design/release": "workspace:*" },
      });
      const log = writePnpmStub(sandbox);
      const planPath = writeExternalPlan(sandbox, ["packages/release", "tools/pack"]);
      const receiptPath = join(sandbox, "postinstall-receipts.jsonl");
      const result = runFixturePostinstall(sandbox, {
        OPEN_DESIGN_POSTINSTALL_ENTRY: "all",
        OPEN_DESIGN_POSTINSTALL_PLAN_PATH: planPath,
        OPEN_DESIGN_POSTINSTALL_RECEIPT_PATH: receiptPath,
        OPEN_DESIGN_POSTINSTALL_TARGETS: '["apps/daemon"]',
      });
      expect(result.status, String(result.stderr)).toBe(0);
      expect(readStubEvents(log).filter((event) => event.event === "start").map((event) => event.target))
        .toEqual(["packages/release", "tools/pack"]);
      const receipts = readFileSync(receiptPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line) as JsonObject);
      expect(receipts).toHaveLength(1);
      expect(receipts[0]).toMatchObject({
        entry: "all",
        executedTargets: ["packages/release", "tools/pack"],
        planId: "fixture/postinstall",
        schemaVersion: 2,
        status: "success",
      });
      const resultPath = join(sandbox, "postinstall-result.json");
      const consumed = spawnSync("python3", [
        workflowPostinstallPath,
        "consume",
        "--plan", planPath,
        "--receipts", receiptPath,
        "--tools-cache-hit", "false",
        "--output", resultPath,
      ], { cwd: workspaceRoot, encoding: "utf8" });
      expect(consumed.status, consumed.stderr).toBe(0);
      expect(JSON.parse(readFileSync(resultPath, "utf8"))).toMatchObject({
        executedTargets: ["packages/release", "tools/pack"],
        planId: "fixture/postinstall",
        restoredTargets: [],
        status: "success",
      });

      writeFileSync(receiptPath, `${JSON.stringify({ ...receipts[0], planDigest: "tampered" })}\n`);
      const rejected = spawnSync("python3", [
        workflowPostinstallPath,
        "consume",
        "--plan", planPath,
        "--receipts", receiptPath,
        "--tools-cache-hit", "false",
        "--output", resultPath,
      ], { cwd: workspaceRoot, encoding: "utf8" });
      expect(rejected.status).toBe(2);
      expect(rejected.stderr).toContain("receipt does not belong to the frozen plan");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("[P2] keys dependency preparation separately from tool compilation and business source", () => {
    const sandbox = createSandbox();
    try {
      writeTarget(sandbox, "packages/release", { name: "@open-design/release" });
      writeTarget(sandbox, "tools/pack", {
        name: "@open-design/tools-pack", dependencies: { "@open-design/release": "workspace:*" },
      });
      writeTarget(sandbox, "apps/daemon", { name: "@open-design/daemon" });
      for (const path of [
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "scripts/postinstall.mjs",
        ".github/config/postinstall.json",
        ".github/scripts/postinstall.py",
        ".github/actions/setup-workspace/action.yml",
      ]) {
        mkdirSync(dirname(join(sandbox, path)), { recursive: true });
        const source = join(workspaceRoot, path);
        writeFileSync(join(sandbox, path), existsSync(source) ? readFileSync(source) : "{}\n");
      }
      mkdirSync(join(sandbox, ".github/scripts"), { recursive: true });
      writeFileSync(join(sandbox, ".github/scripts/workspace.py"), readFileSync(join(workspaceRoot, ".github/scripts/workspace.py")));
      for (const path of ["tools/pack/src/index.ts", "apps/daemon/src/index.ts"]) {
        mkdirSync(dirname(join(sandbox, path)), { recursive: true });
        writeFileSync(join(sandbox, path), "export {};\n");
      }
      expect(spawnSync("git", ["init", "--quiet"], { cwd: sandbox }).status).toBe(0);
      expect(spawnSync("git", ["add", "."], { cwd: sandbox }).status).toBe(0);
      const describe = () => {
        const result = spawnSync("python3", ["-c", "import json,runpy; from pathlib import Path; print(json.dumps(runpy.run_path('.github/scripts/workspace.py')['describe'](Path.cwd())))"], {
          cwd: sandbox, encoding: "utf8", env: { ...process.env, OPEN_DESIGN_POSTINSTALL_TARGETS: '["tools/pack"]' },
        });
        expect(result.status, result.stderr).toBe(0);
        return JSON.parse(result.stdout) as { key: string; paths: string[]; "dependencies-key": string };
      };
      const initial = describe();
      expect(initial.paths).toEqual(["packages/release/dist", "tools/pack/dist"]);
      writeFileSync(join(sandbox, "apps/daemon/src/index.ts"), "export const changed = true;\n");
      expect(describe()).toEqual(initial);
      writeFileSync(join(sandbox, "tools/pack/src/index.ts"), "export const changed = true;\n");
      const toolChange = describe();
      expect(toolChange.key).not.toBe(initial.key);
      expect(toolChange["dependencies-key"]).toBe(initial["dependencies-key"]);
      writeFileSync(join(sandbox, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
      expect(describe()["dependencies-key"]).not.toBe(initial["dependencies-key"]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("[P2] separates dependency preparation, closure description and tool compilation", () => {
    const sandbox = createSandbox();
    try {
      writeTarget(sandbox, "packages/release", { name: "@open-design/release" });
      writeTarget(sandbox, "tools/pack", {
        name: "@open-design/tools-pack", dependencies: { "@open-design/release": "workspace:*" },
      });
      const log = writePnpmStub(sandbox);
      const env = { OPEN_DESIGN_POSTINSTALL_TARGETS: '["tools/pack"]' };
      const description = runFixturePostinstall(sandbox, { ...env, OPEN_DESIGN_POSTINSTALL_PHASE: "describe" });
      expect(description.status, String(description.stderr)).toBe(0);
      expect(JSON.parse(String(description.stdout))).toEqual(["packages/release", "tools/pack"]);
      expect(readStubEvents(log)).toEqual([]);
      const dependencies = runFixturePostinstall(sandbox, { ...env, OPEN_DESIGN_POSTINSTALL_PHASE: "dependencies" });
      expect(dependencies.status, String(dependencies.stderr)).toBe(0);
      expect(readStubEvents(log)).toEqual([]);
      const build = runFixturePostinstall(sandbox, { ...env, OPEN_DESIGN_POSTINSTALL_PHASE: "build" });
      expect(build.status, String(build.stderr)).toBe(0);
      expect(readStubEvents(log).filter((entry) => entry.event === "start").map((entry) => entry.target))
        .toEqual(["packages/release", "tools/pack"]);
      expect(runFixturePostinstall(sandbox, { ...env, OPEN_DESIGN_POSTINSTALL_PHASE: "invalid" }).status).not.toBe(0);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("[P2] selects a transitive tool build closure without compiling unrelated applications", () => {
    const sandbox = createSandbox();
    try {
      writeTarget(sandbox, "packages/release", { name: "@open-design/release" });
      writeTarget(sandbox, "packages/contracts", {
        name: "@open-design/contracts", dependencies: { "@open-design/release": "workspace:*" },
      });
      writeTarget(sandbox, "tools/pack", {
        name: "@open-design/tools-pack", dependencies: { "@open-design/contracts": "workspace:*" },
      });
      writeTarget(sandbox, "apps/daemon", { name: "@open-design/daemon" });
      const log = writePnpmStub(sandbox);
      const result = runFixturePostinstall(sandbox, {
        OPEN_DESIGN_POSTINSTALL_TARGETS: '["tools/pack","tools/pack"]',
        OPEN_DESIGN_POSTINSTALL_CONCURRENCY: "2",
      });
      expect(result.status, String(result.stderr)).toBe(0);
      expect(readStubEvents(log).filter((event) => event.event === "start").map((event) => event.target))
        .toEqual(["packages/release", "packages/contracts", "tools/pack"]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it.each(['"tools/pack"', '["tools/missing"]', '[42]', '{'])
    ("[P2] rejects invalid install build scopes before invoking builds: %s", (scope) => {
      const sandbox = createSandbox();
      try {
        writeTarget(sandbox, "packages/release", { name: "@open-design/release" });
        const log = writePnpmStub(sandbox);
        const result = runFixturePostinstall(sandbox, { OPEN_DESIGN_POSTINSTALL_TARGETS: scope });
        expect(result.status).not.toBe(0);
        expect(readStubEvents(log)).toEqual([]);
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    });

  it("[P2] keeps consumed workspace bin entries linkable before postinstall", () => {
    const manifests = new Map(workspacePackageDirectories().map((directory) => [directory, readJson(`${directory}/package.json`)]));
    const consumedWorkspacePackages = new Set<string>();
    for (const manifest of manifests.values()) {
      for (const name of workspaceDependencyNames(manifest)) {
        consumedWorkspacePackages.add(name);
      }
    }

    const unlinkableBins = [...manifests.entries()]
      .filter(([, manifest]) => consumedWorkspacePackages.has(packageName(manifest)))
      .flatMap(([directory, manifest]) =>
        packageBinTargets(manifest).map((binTarget) => ({
          binTarget,
          directory,
          resolvedPath: join(workspaceRoot, directory, binTarget),
        })),
      )
      .filter(({ resolvedPath }) => !existsSync(resolvedPath))
      .map(({ binTarget, directory }) => `${directory}:${binTarget}`);

    expect(unlinkableBins).toEqual([]);
  });

  it("[P2] keeps postinstall build targets aligned with dist-backed workspace bins", () => {
    const rootManifest = readJsonObject("package.json");
    const manifests = new Map(workspacePackageDirectories().map((directory) => [directory, readJson(`${directory}/package.json`)]));
    const consumedWorkspacePackages = new Set<string>();
    for (const name of workspaceDependencyNames(rootManifest, true)) {
      consumedWorkspacePackages.add(name);
    }
    for (const manifest of manifests.values()) {
      for (const name of workspaceDependencyNames(manifest)) {
        consumedWorkspacePackages.add(name);
      }
    }

    const missingBuildTargets = [...manifests.entries()]
      .filter(([, manifest]) => consumedWorkspacePackages.has(packageName(manifest)))
      .filter(([directory, manifest]) => distDelegatingBinTargets(directory, manifest).length > 0)
      .map(([directory]) => directory)
      .filter((directory) => !postinstallBuildTargets().has(directory));

    const missingTsconfigs = [...postinstallBuildTargets()]
      .filter((target) => existsSync(join(workspaceRoot, target, "package.json")))
      .filter((target) => !existsSync(join(workspaceRoot, target, "tsconfig.json")));

    const targets = postinstallBuildTargetList();
    expect(missingBuildTargets).toEqual([]);
    expect(missingTsconfigs).toEqual([]);
    expect(dependencySpecifier(rootManifest, "@open-design/daemon")).toBe("workspace:*");
    expect(targets.indexOf("packages/release")).toBeGreaterThanOrEqual(0);
    expect(targets.indexOf("packages/contracts")).toBeGreaterThanOrEqual(0);
    expect(targets.indexOf("packages/release")).toBeLessThan(targets.indexOf("packages/contracts"));

  });

  it("[P2] skips absent tsconfig targets in partial install contexts on the default path", () => {
    const sandbox = createSandbox();
    try {
      writeTarget(sandbox, "packages/release", { name: "@open-design/release" });
      writeTarget(sandbox, "packages/contracts", {
        dependencies: { "@open-design/release": "workspace:*" },
        name: "@open-design/contracts",
      });
      writeTarget(sandbox, "packages/components", {
        dependencies: { "@open-design/contracts": "workspace:*" },
        name: "@open-design/components",
      });
      writeTarget(sandbox, "apps/daemon", { name: "@open-design/daemon", tsconfig: false });
      const invocationLog = writePnpmStub(sandbox);

      const result = runFixturePostinstall(sandbox, { OPEN_DESIGN_POSTINSTALL_CONCURRENCY: "" });
      expect(result.status, String(result.stderr)).toBe(0);
      expect(result.stdout).toContain("postinstall: dependency-aware parallel build enabled (concurrency=1)");
      expect(result.stdout).toContain("postinstall: skipping apps/daemon (no tsconfig.json in this context)");

      const events = readStubEvents(invocationLog);
      expect(events.filter((event) => event.event === "start").map((event) => event.target)).toEqual([
        "packages/release",
        "packages/contracts",
        "packages/components",
      ]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("[P2] preserves workspace dependency ordering when postinstall builds in parallel", () => {
    const sandbox = createSandbox();
    try {
      writeTarget(sandbox, "packages/release", { name: "@open-design/release" });
      writeTarget(sandbox, "packages/contracts", {
        dependencies: { "@open-design/release": "workspace:*" },
        name: "@open-design/contracts",
      });
      writeTarget(sandbox, "packages/components", {
        dependencies: { "@open-design/contracts": "workspace:*" },
        name: "@open-design/components",
      });
      writeTarget(sandbox, "packages/download", { name: "@open-design/download" });
      const invocationLog = writePnpmStub(sandbox);

      const result = runFixturePostinstall(sandbox, { OPEN_DESIGN_POSTINSTALL_CONCURRENCY: "2" });
      expect(result.status, String(result.stderr)).toBe(0);
      expect(result.stdout).toContain("postinstall: dependency-aware parallel build enabled (concurrency=2)");

      const events = readStubEvents(invocationLog);
      expect(eventIndex(events, "done", "packages/release")).toBeLessThan(eventIndex(events, "start", "packages/contracts"));
      expect(eventIndex(events, "done", "packages/contracts")).toBeLessThan(eventIndex(events, "start", "packages/components"));
      expect(events.filter((event) => event.event === "start").map((event) => event.target)).toContain("packages/download");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("[P2] records optional postinstall timings without changing the build closure", () => {
    const sandbox = createSandbox();
    try {
      writeTarget(sandbox, "packages/release", { name: "@open-design/release" });
      writeTarget(sandbox, "tools/pack", {
        dependencies: { "@open-design/release": "workspace:*" },
        name: "@open-design/tools-pack",
      });
      const invocationLog = writePnpmStub(sandbox);
      const timingPath = join(sandbox, "observations", "postinstall.jsonl");

      const result = runFixturePostinstall(sandbox, {
        OPEN_DESIGN_POSTINSTALL_PHASE: "build",
        OPEN_DESIGN_POSTINSTALL_TARGETS: '["tools/pack"]',
        OPEN_DESIGN_POSTINSTALL_TIMING_PATH: timingPath,
      });
      expect(result.status, String(result.stderr)).toBe(0);
      expect(readStubEvents(invocationLog).filter((event) => event.event === "start").map((event) => event.target))
        .toEqual(["packages/release", "tools/pack"]);

      const timings = readTimingEvents(timingPath);
      expect(timings.map(({ operation, target, status }) => ({ operation, target, status }))).toEqual([
        { operation: "workspace-build", status: "success", target: "packages/release" },
        { operation: "workspace-build", status: "success", target: "tools/pack" },
        { operation: "workspace-build-closure", status: "success", target: undefined },
        { operation: "postinstall", status: "success", target: undefined },
      ]);
      expect(timings.every((event) => event.schemaVersion === 1 && event.phase === "build")).toBe(true);
      expect(timings.every((event) => event.durationMs >= 0 && Number.isFinite(event.durationMs))).toBe(true);
      expect(timings.every((event) => !Number.isNaN(Date.parse(event.startedAt)))).toBe(true);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("[P2] does not fail postinstall when optional timing storage is unavailable", () => {
    const sandbox = createSandbox();
    try {
      writeTarget(sandbox, "packages/release", { name: "@open-design/release" });
      writePnpmStub(sandbox);
      const timingPath = join(sandbox, "timing-directory");
      mkdirSync(timingPath);

      const result = runFixturePostinstall(sandbox, {
        OPEN_DESIGN_POSTINSTALL_PHASE: "build",
        OPEN_DESIGN_POSTINSTALL_TIMING_PATH: timingPath,
      });
      expect(result.status, String(result.stderr)).toBe(0);
      expect(result.stderr).toContain("could not write optional timing data");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it.each([undefined, "[]"])("[P2] retains native-addon validation with install build scope %s", (scope) => {
    const sandbox = createSandbox();
    try {
      writeTarget(sandbox, "apps/daemon", { name: "@open-design/daemon", tsconfig: false });
      const addonDirectory = join(sandbox, "apps/daemon/node_modules/better-sqlite3");
      mkdirSync(addonDirectory, { recursive: true });
      writeFileSync(join(addonDirectory, "package.json"), '{"name":"better-sqlite3","main":"index.cjs"}\n');
      writeFileSync(
        join(addonDirectory, "index.cjs"),
        'const error = new Error("native ABI mismatch"); error.code = "ERR_DLOPEN_FAILED"; throw error;\n',
      );
      const invocationLog = writePnpmStub(sandbox);

      const result = runFixturePostinstall(sandbox, { OPEN_DESIGN_POSTINSTALL_TARGETS: scope });
      expect(result.status, String(result.stderr)).toBe(0);
      expect(result.stdout).toContain("postinstall: rebuilding better-sqlite3");
      expect(readStubEvents(invocationLog)).toContainEqual({
        args: ["--filter", "@open-design/daemon", "rebuild", "better-sqlite3"],
        event: "start",
        target: "",
      });
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
