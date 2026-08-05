import type {
  CloudflarePagesDeploymentInfo,
  DeploymentLinkStatus,
} from '@open-design/contracts';

export interface DeploymentRecord {
  providerId?: string | undefined;
  url?: string | undefined;
  providerMetadata?: Record<string, unknown> | undefined;
  cloudflarePages?: CloudflarePagesDeploymentInfo | undefined;
}

export interface DeploymentConfig {
  token?: string | undefined;
  accountId?: string | undefined;
  projectName?: string | undefined;
}

export interface DeploymentUrlCheck {
  reachable: boolean;
  status?: DeploymentLinkStatus | undefined;
  statusMessage?: string | undefined;
}

export interface CloudflarePagesDomain {
  status?: string | undefined;
  validation_data?: unknown;
  verification_data?: unknown;
}

export interface DeploymentLinksDependencies {
  cloudflareProviderId: string;
  projectNameFromDeployment: (deployment: unknown) => string;
  projectNameForProject: (projectId: string, projectName?: string) => string;
  listDeployments: (db: unknown, projectId: string) => readonly DeploymentRecord[];
  readConfig: () => Promise<DeploymentConfig>;
  checkUrl: (url: unknown) => Promise<DeploymentUrlCheck>;
  readDomain: (
    config: DeploymentConfig & { projectName: string },
    hostname: string,
  ) => Promise<CloudflarePagesDomain | null>;
  aggregateStatus: (
    pagesDev: Record<string, unknown>,
    customDomain?: Record<string, unknown>,
  ) => { status: DeploymentLinkStatus; statusMessage?: string };
  now?: () => number;
}

export function cloudflarePagesProjectNameForDeploy(
  db: unknown,
  projectId: string,
  projectName: string | undefined,
  prior: unknown,
  dependencies: Pick<
    DeploymentLinksDependencies,
    'cloudflareProviderId' | 'projectNameFromDeployment' | 'projectNameForProject' | 'listDeployments'
  >,
): string {
  const priorName = dependencies.projectNameFromDeployment(prior);
  if (priorName) return priorName;

  for (const deployment of dependencies.listDeployments(db, projectId)) {
    if (deployment.providerId !== dependencies.cloudflareProviderId) continue;
    const stableName = dependencies.projectNameFromDeployment(deployment);
    if (stableName) return stableName;
  }

  return dependencies.projectNameForProject(projectId, projectName);
}

export async function checkCloudflarePagesDeploymentLinks(
  existing: DeploymentRecord,
  dependencies: DeploymentLinksDependencies,
): Promise<{
  url: string;
  status: DeploymentLinkStatus;
  statusMessage?: string;
  reachableAt?: number;
  cloudflarePages: CloudflarePagesDeploymentInfo;
  providerMetadata: Record<string, unknown>;
}> {
  const current = existing.cloudflarePages ?? {} as CloudflarePagesDeploymentInfo;
  const projectName = current.projectName || dependencies.projectNameFromDeployment(existing);
  const config = await dependencies.readConfig();
  const pagesDevUrl = current.pagesDev?.url || existing.url || '';
  const pagesDevResult = await dependencies.checkUrl(pagesDevUrl);
  const pagesDev = {
    ...(current.pagesDev ?? {}),
    url: pagesDevUrl,
    status: pagesDevResult.reachable ? 'ready' : pagesDevResult.status || 'link-delayed',
    statusMessage: pagesDevResult.reachable
      ? 'Public link is ready.'
      : pagesDevResult.statusMessage || current.pagesDev?.statusMessage || 'Cloudflare Pages is still preparing the pages.dev link.',
    reachableAt: pagesDevResult.reachable
      ? (dependencies.now ?? Date.now)()
      : current.pagesDev?.reachableAt,
  };

  let customDomain = current.customDomain;
  if (customDomain?.url && customDomain.status !== 'conflict') {
    let pagesDomain: CloudflarePagesDomain | null = null;
    if (config.token && config.accountId && projectName) {
      try {
        pagesDomain = await dependencies.readDomain(
          { ...config, projectName },
          customDomain.hostname,
        );
      } catch {
        pagesDomain = null;
      }
    }
    const customResult = await dependencies.checkUrl(customDomain.url);
    const pagesDomainStatus = pagesDomain?.status || customDomain.pagesDomainStatus;
    const normalizedPagesDomainStatus = String(pagesDomainStatus || '').toLowerCase();
    const failedByApi = ['error', 'blocked', 'deactivated'].includes(normalizedPagesDomainStatus);
    const activeByApi = normalizedPagesDomainStatus === 'active';
    const readyByReachability = customResult.reachable && activeByApi;
    const nextCustomDomain = {
      ...customDomain,
      ...(pagesDomain
        ? {
            domainStatus: pagesDomain.status === 'active'
              ? 'active'
              : failedByApi
                ? 'failed'
                : 'pending',
          }
        : {}),
      ...(pagesDomainStatus !== undefined ? { pagesDomainStatus } : {}),
      ...(pagesDomain?.validation_data !== undefined
        ? { validationData: pagesDomain.validation_data }
        : {}),
      ...(pagesDomain?.verification_data !== undefined
        ? { verificationData: pagesDomain.verification_data }
        : {}),
      status: readyByReachability
        ? 'ready'
        : customDomain.status === 'failed' || failedByApi
          ? 'failed'
          : 'pending',
      statusMessage: readyByReachability
        ? 'Custom domain is ready.'
        : failedByApi
          ? 'Cloudflare Pages reported a custom-domain error.'
          : customResult.statusMessage || customDomain.statusMessage || 'Custom domain is still being prepared.',
    } as NonNullable<CloudflarePagesDeploymentInfo['customDomain']>;
    customDomain = nextCustomDomain;
  }

  const cloudflarePages = {
    ...current,
    projectName,
    pagesDev,
    ...(customDomain ? { customDomain } : {}),
  } as CloudflarePagesDeploymentInfo;
  const aggregate = dependencies.aggregateStatus(pagesDev, customDomain as unknown as Record<string, unknown>);
  return {
    url: pagesDev.url,
    status: aggregate.status,
    ...(aggregate.statusMessage !== undefined ? { statusMessage: aggregate.statusMessage } : {}),
    cloudflarePages,
    providerMetadata: {
      ...(existing.providerMetadata ?? {}),
      cloudflarePages,
    },
  };
}
