import { chmod, cp, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

export const VELA_CLI_BIN_ENV = "OPEN_DESIGN_VELA_CLI_BIN";
const OPEN_CODE_COMPANION_RELATIVE_PATH = ["libexec", "opencode"] as const;

type VelaCliPlatform = "linux" | "mac" | "win";
type VelaCliResolveResult =
  | string
  | null
  | undefined
  | {
      path?: string | null;
      supported?: boolean;
    };
type VelaCliResolverModule = {
  resolveVelaCliBin?: (
    options?: { strict?: boolean },
  ) => VelaCliResolveResult | Promise<VelaCliResolveResult>;
};

function strictResolutionError(message: string, cause?: unknown): Error {
  return new Error(
    `${message}; install @powerformer/vela-cli through pnpm install or set ${VELA_CLI_BIN_ENV}`,
    cause === undefined ? undefined : { cause },
  );
}

function targetBinaryName(platform: VelaCliPlatform): string {
  return platform === "win" ? "vela.exe" : "vela";
}

export async function copyOptionalVelaCliBinary({
  env = process.env,
  importPackage,
  platform,
  requireBundled = false,
  resourceRoot,
}: {
  env?: NodeJS.ProcessEnv;
  importPackage?: (packageName: string) => Promise<VelaCliResolverModule>;
  platform: VelaCliPlatform;
  requireBundled?: boolean;
  resourceRoot: string;
}): Promise<{ source: string; target: string } | null> {
  const source = await resolveOptionalVelaCliBinary({ env, importPackage, requireBundled });
  if (source == null) return null;
  const target = join(resourceRoot, "bin", targetBinaryName(platform));
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target);
  await copyBundledOpenCodeTree({ requireBundled, resourceRoot, source });
  if (platform !== "win") {
    await chmod(target, 0o755);
  }
  return { source, target };
}

export function resolveVelaCliOpenCodeCompanionTree(source: string): string {
  return join(dirname(source), ...OPEN_CODE_COMPANION_RELATIVE_PATH);
}

export async function resolveOptionalVelaCliOpenCodeCompanionTree(
  source: string,
): Promise<string | null> {
  const sourceTree = resolveVelaCliOpenCodeCompanionTree(source);
  return (await isDirectory(sourceTree)) ? sourceTree : null;
}

async function copyBundledOpenCodeTree({
  requireBundled,
  resourceRoot,
  source,
}: {
  requireBundled: boolean;
  resourceRoot: string;
  source: string;
}): Promise<void> {
  const sourceTree = resolveVelaCliOpenCodeCompanionTree(source);
  const targetTree = join(resourceRoot, "bin", ...OPEN_CODE_COMPANION_RELATIVE_PATH);
  if (!(await isDirectory(sourceTree))) {
    if (requireBundled) {
      throw strictResolutionError(
        `unable to resolve bundled Vela CLI: OpenCode companion directory is missing at ${sourceTree}`,
      );
    }
    return;
  }
  await cp(sourceTree, targetTree, { force: true, recursive: true });
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function resolveOptionalVelaCliBinary({
  env = process.env,
  importPackage = async (packageName: string) =>
    import(packageName) as Promise<VelaCliResolverModule>,
  requireBundled = false,
}: {
  env?: NodeJS.ProcessEnv;
  importPackage?: (packageName: string) => Promise<VelaCliResolverModule>;
  requireBundled?: boolean;
} = {}): Promise<string | null> {
  const envSource = env[VELA_CLI_BIN_ENV]?.trim();
  if (envSource) return envSource;

  let resolver: VelaCliResolverModule;
  try {
    resolver = await importPackage("@powerformer/vela-cli");
  } catch (error) {
    if (requireBundled) {
      throw strictResolutionError(
        "unable to resolve bundled Vela CLI: package @powerformer/vela-cli is unavailable",
        error,
      );
    }
    return null;
  }

  if (typeof resolver.resolveVelaCliBin !== "function") {
    if (requireBundled) {
      throw strictResolutionError(
        "unable to resolve bundled Vela CLI: @powerformer/vela-cli must export resolveVelaCliBin",
      );
    }
    return null;
  }

  const resolved = await resolver.resolveVelaCliBin({ strict: requireBundled });
  if (typeof resolved === "string") {
    const normalized = resolved.trim();
    if (normalized.length > 0) return normalized;
  }
  if (resolved && typeof resolved === "object" && typeof resolved.path === "string") {
    const normalized = resolved.path.trim();
    if (normalized.length > 0) return normalized;
  }
  if (requireBundled) {
    throw strictResolutionError(
      "unable to resolve bundled Vela CLI: @powerformer/vela-cli returned no binary path",
    );
  }
  return null;
}
