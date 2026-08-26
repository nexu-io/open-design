import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export type PackageResourceRequest = Readonly<{
  packageName: string;
  resourcePath: string;
  startDirectory: string;
}>;

function assertRelativeResourcePath(resourcePath: string): void {
  if (resourcePath.length === 0 || isAbsolute(resourcePath)) throw new Error("package resource path must be relative");
  const segments = resourcePath.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error("package resource path cannot leave its package");
  }
}

/** Locate a package by walking parent package.json files; no workspace layout or package-manager internals are assumed. */
export async function resolvePackageResourcePath(input: PackageResourceRequest): Promise<string> {
  if (input.packageName.trim().length === 0) throw new Error("package resource owner name is required");
  assertRelativeResourcePath(input.resourcePath);
  let directory = resolve(input.startDirectory);
  for (;;) {
    const packageJsonPath = join(directory, "package.json");
    try {
      const manifest = JSON.parse(await readFile(packageJsonPath, "utf8")) as { name?: unknown };
      if (manifest.name === input.packageName) {
        const resourcePath = resolve(directory, input.resourcePath);
        const packageRelativePath = relative(directory, resourcePath);
        if (packageRelativePath.startsWith("..") || isAbsolute(packageRelativePath)) {
          throw new Error("package resource path cannot leave its package");
        }
        return resourcePath;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw new Error(`cannot inspect package manifest: ${packageJsonPath}`, { cause: error });
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`cannot find package ${input.packageName} from ${input.startDirectory}`);
}

export async function readPackageResource(input: PackageResourceRequest): Promise<Buffer> {
  return await readFile(await resolvePackageResourcePath(input));
}

export async function readPackageResourceText(input: PackageResourceRequest): Promise<string> {
  return (await readPackageResource(input)).toString("utf8");
}
