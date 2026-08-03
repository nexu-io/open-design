import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createPathConfig, normalizeBasePath, type PathConfig } from '@open-design/path-config';

export const WEB_BASE_PATH_ENV = 'OD_WEB_BASE_PATH';
export const PUBLIC_BASE_URL_ENV = 'OD_PUBLIC_BASE_URL';

export interface DeploymentPathConfig {
  readonly basePath: string;
  readonly paths: PathConfig;
  readonly configuredPublicOrigin: string | null;
  publicOrigin(request: { protocol?: string; get(name: string): string | undefined }): string;
  publicBaseUrl(request: { protocol?: string; get(name: string): string | undefined }): string;
  publicUrl(request: { protocol?: string; get(name: string): string | undefined }, path: string): string;
}

function parseConfiguredPublicOrigin(raw: string | undefined, basePath: string): string | null {
  if (raw == null || raw.trim() === '') return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${PUBLIC_BASE_URL_ENV} must be an absolute http(s) URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${PUBLIC_BASE_URL_ENV} must use http or https`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${PUBLIC_BASE_URL_ENV} must not contain credentials, query, or fragment`);
  }

  const configuredPath = parsed.pathname === '/' ? '' : normalizeBasePath(parsed.pathname);
  if (configuredPath !== basePath) {
    throw new Error(
      `${PUBLIC_BASE_URL_ENV} pathname ${JSON.stringify(configuredPath || '/')} ` +
      `does not match ${WEB_BASE_PATH_ENV} ${JSON.stringify(basePath || '/')}`,
    );
  }
  return parsed.origin;
}

function requestOrigin(
  request: { protocol?: string; get(name: string): string | undefined },
  fallbackPort: string,
): string {
  const host = request.get('host');
  if (!host) return `http://localhost:${fallbackPort}`;
  return `${request.protocol || 'http'}://${host}`;
}

export function resolveDeploymentPathConfig(env: NodeJS.ProcessEnv = process.env): DeploymentPathConfig {
  const basePath = normalizeBasePath(env[WEB_BASE_PATH_ENV]);
  const paths = createPathConfig(basePath);
  const configuredPublicOrigin = parseConfiguredPublicOrigin(env[PUBLIC_BASE_URL_ENV], basePath);
  const fallbackPort = env.OD_PORT || '7456';

  const publicOrigin = (request: { protocol?: string; get(name: string): string | undefined }): string =>
    parseConfiguredPublicOrigin(env[PUBLIC_BASE_URL_ENV], basePath)
      ?? requestOrigin(request, fallbackPort);
  const publicBaseUrl = (request: { protocol?: string; get(name: string): string | undefined }): string =>
    `${publicOrigin(request)}${basePath}`;
  const publicUrl = (
    request: { protocol?: string; get(name: string): string | undefined },
    path: string,
  ): string => `${publicOrigin(request)}${paths.withBasePath(path)}`;

  return {
    basePath,
    configuredPublicOrigin,
    paths,
    publicBaseUrl,
    publicOrigin,
    publicUrl,
  };
}

/** Validate an optional prefix forwarded by a reverse proxy. */
export function forwardedPrefixMatchesBasePath(raw: string | undefined, basePath: string): boolean {
  if (raw == null || raw.trim() === '') return true;
  try {
    const forwarded = raw.trim() === '/' ? '' : normalizeBasePath(raw);
    return forwarded === basePath;
  } catch {
    return false;
  }
}

export function assertStaticBuildMatchesBasePath(staticDir: string, basePath: string): void {
  if (!existsSync(staticDir) || basePath === '') return;

  const manifestPath = join(staticDir, '.open-design-build.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `${WEB_BASE_PATH_ENV}=${basePath} requires a Web build manifest at ${manifestPath}; ` +
      'rebuild the Web with the same OD_WEB_BASE_PATH value',
    );
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error(`invalid Web build manifest at ${manifestPath}`);
  }
  if (
    manifest == null ||
    typeof manifest !== 'object' ||
    (manifest as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    (manifest as { basePath?: unknown }).basePath !== basePath
  ) {
    throw new Error(
      `Web build manifest at ${manifestPath} does not match ${WEB_BASE_PATH_ENV}=${basePath}; ` +
      'rebuild the Web with the same OD_WEB_BASE_PATH value',
    );
  }
}
