export const CLOUDFLARE_PAGES_PROJECT_METADATA_KEY = 'cloudflarePagesProjectName';

type DeploymentRecord = Record<string, unknown>;

export function cloudflarePagesDeploymentMetadata(
  projectName: unknown,
): Record<string, string> | undefined {
  const normalized = typeof projectName === 'string' ? projectName.trim() : '';
  return normalized
    ? { [CLOUDFLARE_PAGES_PROJECT_METADATA_KEY]: normalized }
    : undefined;
}

export function cloudflarePagesProjectNameFromDeployment(
  deployment: unknown,
): string {
  if (!deployment || typeof deployment !== 'object' || Array.isArray(deployment)) {
    return '';
  }
  const record = deployment as DeploymentRecord;
  const providerMetadata = record.providerMetadata;
  if (providerMetadata && typeof providerMetadata === 'object' && !Array.isArray(providerMetadata)) {
    const value = (providerMetadata as DeploymentRecord)[CLOUDFLARE_PAGES_PROJECT_METADATA_KEY];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return cloudflarePagesProjectNameFromUrl(record.url);
}

export function cloudflarePagesProjectNameFromUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (!host.endsWith('.pages.dev')) return '';
    const labels = host.slice(0, -'.pages.dev'.length).split('.').filter(Boolean);
    return labels.at(-1) || '';
  } catch {
    return '';
  }
}

export function publicDeployment(deployment: unknown): unknown {
  if (!deployment || typeof deployment !== 'object') {
    return deployment;
  }
  const { providerMetadata: _providerMetadata, ...publicShape } = deployment as DeploymentRecord;
  return publicShape;
}

export function publicDeployments(deployments: readonly unknown[] | null | undefined): unknown[] {
  return (deployments || []).map(publicDeployment);
}
