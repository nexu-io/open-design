import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

type RuntimeManifest = {
  dependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
};

function packageManifestPath(nodeModulesRoot: string, packageName: string): string {
  return join(nodeModulesRoot, ...packageName.split("/"), "package.json");
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function assertMacRuntimeDependenciesResolvable(options: {
  manifestPath: string;
  runtimeRoot: string;
}): Promise<void> {
  const manifest = JSON.parse(await readFile(options.manifestPath, "utf8")) as RuntimeManifest;
  const packageNames = [
    ...new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ]),
  ].sort();
  const nodeModulesRoot = join(options.runtimeRoot, "node_modules");
  const ignoredRoot = join(nodeModulesRoot, ".ignored");
  const quarantined: string[] = [];
  const missing: string[] = [];

  for (const packageName of packageNames) {
    if (await isFile(packageManifestPath(nodeModulesRoot, packageName))) continue;
    if (await isFile(packageManifestPath(ignoredRoot, packageName))) {
      quarantined.push(packageName);
    } else {
      missing.push(packageName);
    }
  }

  if (quarantined.length === 0 && missing.length === 0) return;

  const problems = [
    quarantined.length === 0
      ? null
      : `quarantined under node_modules/.ignored: ${quarantined.join(", ")}`,
    missing.length === 0 ? null : `missing from top-level node_modules: ${missing.join(", ")}`,
  ].filter((problem): problem is string => problem != null);
  throw new Error(
    `mac packaged runtime dependencies are not resolvable from ${nodeModulesRoot}: ${problems.join("; ")}`,
  );
}
