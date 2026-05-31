import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = join(import.meta.dirname, "..");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
}

function readPackageJson(path: string): Record<string, unknown> {
  const manifest = readJson(path);
  assert(typeof manifest === "object" && manifest !== null);
  return manifest as Record<string, unknown>;
}

function packageName(manifest: unknown): string {
  assert(typeof manifest === "object" && manifest !== null);
  const name = (manifest as { name?: unknown }).name;
  assert(typeof name === "string");
  return name;
}

function packageBinTargets(manifest: unknown): string[] {
  assert(typeof manifest === "object" && manifest !== null);
  const bin = (manifest as { bin?: unknown }).bin;
  if (typeof bin === "string") return [bin];
  if (typeof bin !== "object" || bin === null) return [];
  return Object.values(bin).filter((value): value is string => typeof value === "string");
}

function dependencySpecifier(manifest: Record<string, unknown>, name: string): string | undefined {
  const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;
  for (const field of dependencyFields) {
    const dependencies = manifest[field];
    if (typeof dependencies !== "object" || dependencies === null) continue;
    const specifier = (dependencies as Record<string, unknown>)[name];
    if (typeof specifier === "string") return specifier;
  }
  return undefined;
}

function distDelegatingBinTargets(directory: string, manifest: unknown): string[] {
  return packageBinTargets(manifest).filter((binTarget) => {
    if (binTarget.startsWith("./dist/")) return true;
    const source = readFileSync(join(repoRoot, directory, binTarget), "utf8");
    return source.includes("../dist/") || source.includes("./dist/") || source.includes("/dist/");
  });
}

function workspaceDependencyNames(manifest: unknown, includeDevDependencies = false): Set<string> {
  assert(typeof manifest === "object" && manifest !== null);
  const dependencyFields = includeDevDependencies
    ? ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
    : ["dependencies", "optionalDependencies", "peerDependencies"];
  const names = new Set<string>();

  for (const field of dependencyFields) {
    const dependencies = (manifest as Record<string, unknown>)[field];
    if (typeof dependencies !== "object" || dependencies === null) continue;
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version === "string" && version.startsWith("workspace:")) {
        names.add(name);
      }
    }
  }

  return names;
}

function postinstallBuildTargets(): Set<string> {
  const source = readFileSync(join(repoRoot, "scripts/postinstall.mjs"), "utf8");
  const targets = [...source.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value): value is string => value != null && /^(?:apps|packages|tools)\//.test(value));
  return new Set(targets);
}

function workspacePackageDirectories(): string[] {
  const scopedPackageDirectories = ["apps", "packages", "tools"].flatMap((scope) =>
    readdirSync(join(repoRoot, scope), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${scope}/${entry.name}`),
  );
  return ["e2e", ...scopedPackageDirectories]
    .filter((directory) => existsSync(join(repoRoot, directory, "package.json")))
    .sort();
}

test("workspace bin entries use checked-in targets so pnpm can link them before postinstall", () => {
  const manifests = new Map(
    workspacePackageDirectories().map((directory) => [
      directory,
      readJson(`${directory}/package.json`),
    ]),
  );
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
        resolvedPath: join(repoRoot, directory, binTarget),
      })),
    )
    .filter(({ resolvedPath }) => !existsSync(resolvedPath))
    .map(({ binTarget, directory }) => `${directory}:${binTarget}`);

  assert.deepEqual(unlinkableBins, []);
});

test("root workspace depends on the daemon package so pnpm exec resolves the od bin", () => {
  const rootManifest = readPackageJson("package.json");
  const daemonManifest = readPackageJson("apps/daemon/package.json");

  assert.equal(dependencySpecifier(rootManifest, "@open-design/daemon"), "workspace:*");
  assert.deepEqual((rootManifest as { bin?: unknown }).bin, {
    od: "./apps/daemon/bin/od.mjs",
  });
  assert.deepEqual((daemonManifest as { bin?: unknown }).bin, {
    od: "./bin/od.mjs",
  });
  assert.equal(existsSync(join(repoRoot, "apps/daemon/bin/od.mjs")), true);
});

test("postinstall builds workspace packages whose linkable bins delegate to dist", () => {
  const rootManifest = readPackageJson("package.json");
  const manifests = new Map(
    workspacePackageDirectories().map((directory) => [
      directory,
      readJson(`${directory}/package.json`),
    ]),
  );
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

  assert.deepEqual(missingBuildTargets, []);
});
