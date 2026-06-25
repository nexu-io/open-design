import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const e2eRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const workspaceRoot = dirname(e2eRoot);
const postinstallPath = join(workspaceRoot, "scripts", "postinstall.mjs");

type JsonObject = Record<string, unknown>;

type StubEvent = {
  args: string[];
  event: "start" | "done";
  target: string;
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
  const source = readFileSync(postinstallPath, "utf8");
  const match = source.match(/const buildTargets = \[([\s\S]*?)\];/);
  if (match == null || match[1] == null) {
    throw new Error("Could not find postinstall buildTargets array");
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((targetMatch) => {
    const target = targetMatch[1];
    if (target == null) throw new Error("Malformed postinstall build target");
    return target;
  });
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
      ...env,
    },
  });
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
      expect(result.stdout).not.toContain("dependency-aware parallel build enabled");
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
});
