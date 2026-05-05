import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, parse as parsePath } from 'node:path';

export const APP_VERSION_FALLBACK = '0.0.0';

// Keep this structurally aligned with `@open-design/contracts` AppVersionInfo.
// Daemon cannot import the package root type directly yet because its NodeNext
// test typecheck follows the contracts source re-exports and requires explicit
// `.js` extensions across that package.
export interface AppVersionInfo {
  version: string;
  channel: string;
  packaged: boolean;
  platform: string;
  arch: string;
}

interface PackageMetadata {
  version?: unknown;
}

export interface ResolveAppVersionInfoOptions {
  env?: NodeJS.ProcessEnv | undefined;
  packageMetadata?: PackageMetadata | null;
  resourcesPath?: string | undefined;
  execPath?: string | undefined;
  platform?: NodeJS.Platform | undefined;
  arch?: NodeJS.Architecture | undefined;
}

export interface ReadAppVersionInfoOptions extends ResolveAppVersionInfoOptions {
  packageJsonUrl?: URL | undefined;
}

const processWithResources = process as NodeJS.Process & { resourcesPath?: string };

// The compiled daemon ships in two layouts depending on which tsconfig produced
// it: `dist/app-version.js` (rootDir=src, used by the `od` CLI) and
// `dist/src/app-version.js` (rootDir=., used by the packaged sidecar entry).
// A fixed relative path like `../package.json` only points at the daemon
// `package.json` in the first layout — in the sidecar layout it resolves to
// `dist/package.json`, which does not exist, so the version silently falls
// back to `APP_VERSION_FALLBACK`. Walk up from `import.meta.url` until we find
// a real `package.json` so both build outputs (and the TypeScript source
// during `tools-dev`) read the daemon's actual version. Callers that already
// inject the version via `OD_APP_VERSION` (packaged runtime) keep working
// because that env still wins inside `resolveAppVersionInfo`.
async function findNearestPackageJsonUrl(startUrl: URL): Promise<URL | null> {
  let currentDir: string;
  try {
    currentDir = dirname(fileURLToPath(startUrl));
  } catch {
    return null;
  }

  const root = parsePath(currentDir).root;
  while (true) {
    const candidate = join(currentDir, 'package.json');
    try {
      const stats = await stat(candidate);
      if (stats.isFile()) return pathToFileURL(candidate);
    } catch {
      // try the parent directory
    }
    if (currentDir === root) return null;
    const parent = dirname(currentDir);
    if (parent === currentDir) return null;
    currentDir = parent;
  }
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function isPackagedRuntime({
  resourcesPath = processWithResources.resourcesPath,
  execPath = process.execPath,
  platform = process.platform,
}: Pick<ResolveAppVersionInfoOptions, 'resourcesPath' | 'execPath' | 'platform'> = {}): boolean {
  if (cleanString(resourcesPath)) return true;
  const normalizedExecPath = cleanString(execPath)?.replace(/\\/g, '/').toLowerCase();
  if (!normalizedExecPath) return false;

  switch (platform) {
    case 'darwin':
      return normalizedExecPath.includes('/contents/resources/');
    case 'win32':
      return normalizedExecPath.includes('/resources/') || normalizedExecPath.includes('/app.asar');
    case 'linux':
      return normalizedExecPath.includes('/usr/share/')
        || normalizedExecPath.includes('/opt/')
        || normalizedExecPath.includes('/resources/');
    default:
      return normalizedExecPath.includes('/resources/') || normalizedExecPath.includes('/app.asar');
  }
}

export function resolveAppVersionInfo({
  env = process.env,
  packageMetadata,
  resourcesPath,
  execPath,
  platform = process.platform,
  arch = process.arch,
}: ResolveAppVersionInfoOptions = {}): AppVersionInfo {
  const packaged = isPackagedRuntime({ resourcesPath, execPath, platform });
  const version = cleanString(env.OD_APP_VERSION)
    ?? cleanString(packageMetadata?.version)
    ?? APP_VERSION_FALLBACK;
  const prereleaseChannel = version.match(/^\d+\.\d+\.\d+-([0-9A-Za-z-]+)/)?.[1]?.split('.')[0] ?? null;
  const channel = cleanString(env.OD_RELEASE_CHANNEL)
    ?? cleanString(env.OD_APP_CHANNEL)
    ?? prereleaseChannel
    ?? (packaged ? 'stable' : 'development');

  return { version, channel, packaged, platform, arch };
}

async function readPackageMetadata(packageJsonUrl: URL): Promise<PackageMetadata | null> {
  try {
    const raw = await readFile(packageJsonUrl, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readCurrentAppVersionInfo({
  packageJsonUrl,
  packageMetadata,
  env,
  resourcesPath,
  execPath,
  platform,
  arch,
}: ReadAppVersionInfoOptions = {}): Promise<AppVersionInfo> {
  const resolvedUrl = packageJsonUrl ?? await findNearestPackageJsonUrl(new URL(import.meta.url));
  const metadata = packageMetadata
    ?? (resolvedUrl ? await readPackageMetadata(resolvedUrl) : null);
  return resolveAppVersionInfo({ env, packageMetadata: metadata, resourcesPath, execPath, platform, arch });
}
