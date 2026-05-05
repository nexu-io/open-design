import { readFile } from 'node:fs/promises';

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

const DEFAULT_PACKAGE_JSON_URL = new URL('../package.json', import.meta.url);
const processWithResources = process as NodeJS.Process & { resourcesPath?: string };

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
  packageJsonUrl = DEFAULT_PACKAGE_JSON_URL,
  packageMetadata,
  env,
  resourcesPath,
  execPath,
  platform,
  arch,
}: ReadAppVersionInfoOptions = {}): Promise<AppVersionInfo> {
  const metadata = packageMetadata ?? await readPackageMetadata(packageJsonUrl);
  return resolveAppVersionInfo({ env, packageMetadata: metadata, resourcesPath, execPath, platform, arch });
}
