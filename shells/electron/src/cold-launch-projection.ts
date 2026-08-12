import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export const PACKAGED_COLD_LAUNCH_PROJECTION_FILE = "open-design-cold-launch.json";

export type PackagedColdLaunchProjection = {
  namespace: string;
  namespaceBaseRoot: string;
  schemaVersion: 1;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

export function packagedColdLaunchProjectionPath(electronUserDataRoot: string): string {
  return join(electronUserDataRoot, PACKAGED_COLD_LAUNCH_PROJECTION_FILE);
}

export function projectPackagedColdLaunchConfig(input: {
  namespace?: string;
  namespaceBaseRoot?: string;
}): PackagedColdLaunchProjection | null {
  const namespace = input.namespace?.trim();
  const namespaceBaseRoot = input.namespaceBaseRoot?.trim();
  if (!namespace || !namespaceBaseRoot) return null;
  return {
    namespace,
    namespaceBaseRoot: resolve(namespaceBaseRoot),
    schemaVersion: 1,
  };
}

export async function readPackagedColdLaunchProjection(
  electronUserDataRoot: string,
): Promise<PackagedColdLaunchProjection | null> {
  try {
    const value = JSON.parse(
      await readFile(packagedColdLaunchProjectionPath(electronUserDataRoot), "utf8"),
    ) as unknown;
    if (
      !isRecord(value)
      || value.schemaVersion !== 1
      || typeof value.namespace !== "string"
      || typeof value.namespaceBaseRoot !== "string"
    ) {
      return null;
    }
    return projectPackagedColdLaunchConfig(value);
  } catch {
    return null;
  }
}

export async function writePackagedColdLaunchProjection(
  electronUserDataRoot: string,
  projection: PackagedColdLaunchProjection,
): Promise<void> {
  const targetPath = packagedColdLaunchProjectionPath(electronUserDataRoot);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(projection, null, 2)}\n`, "utf8");
}
