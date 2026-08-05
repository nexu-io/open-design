import { describe, expect, it, vi } from 'vitest';
import {
  checkCloudflarePagesDeploymentLinks,
  cloudflarePagesProjectNameForDeploy,
} from '../../src/runtimes/deployment-links.js';

describe('deployment link boundaries', () => {
  it('prefers prior and existing Cloudflare project identity before generating one', () => {
    const listDeployments = vi.fn(() => [{ providerId: 'cloudflare-pages', providerMetadata: { cloudflarePagesProjectName: 'stable-name' } }]);
    const dependencies = {
      cloudflareProviderId: 'cloudflare-pages',
      projectNameFromDeployment: (deployment: unknown) =>
        deployment && typeof deployment === 'object' && 'providerMetadata' in deployment
          ? String((deployment.providerMetadata as Record<string, unknown>)?.cloudflarePagesProjectName ?? '')
          : '',
      projectNameForProject: vi.fn(() => 'generated-name'),
      listDeployments,
    };

    expect(cloudflarePagesProjectNameForDeploy('db', 'project', 'Project', null, dependencies)).toBe('stable-name');
    expect(cloudflarePagesProjectNameForDeploy('db', 'project', 'Project', {
      providerMetadata: { cloudflarePagesProjectName: 'prior-name' },
    }, dependencies)).toBe('prior-name');
    expect(dependencies.projectNameForProject).not.toHaveBeenCalled();
  });

  it('reconciles pages.dev and custom-domain status through injected network contracts', async () => {
    const checkUrl = vi.fn(async (url: unknown) => ({
      reachable: url === 'https://demo.pages.dev' || url === 'https://custom.example',
      statusMessage: url === 'https://custom.example' ? 'still pending' : undefined,
    }));
    const result = await checkCloudflarePagesDeploymentLinks({
      url: 'https://demo.pages.dev',
      providerMetadata: {},
      cloudflarePages: {
        projectName: 'demo',
        pagesDev: { url: 'https://demo.pages.dev', status: 'link-delayed' },
        customDomain: {
          hostname: 'custom.example',
          url: 'https://custom.example',
          zoneId: 'zone',
          zoneName: 'example',
          domainPrefix: 'custom',
          status: 'pending',
        },
      },
    }, {
      cloudflareProviderId: 'cloudflare-pages',
      projectNameFromDeployment: () => 'demo',
      projectNameForProject: () => 'generated',
      listDeployments: () => [],
      readConfig: async () => ({ token: 'token', accountId: 'account' }),
      readDomain: async () => ({ status: 'active', validation_data: { cname: 'demo.pages.dev' } }),
      checkUrl,
      aggregateStatus: (pagesDev, customDomain) => ({
        status: customDomain?.status === 'ready' && pagesDev.status === 'ready' ? 'ready' : 'link-delayed',
        statusMessage: 'aggregate',
      }),
      now: () => 123,
    });

    expect(checkUrl).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('ready');
    expect(result.cloudflarePages.pagesDev.status).toBe('ready');
    expect(result.cloudflarePages.customDomain?.status).toBe('ready');
    expect(result.cloudflarePages.customDomain?.validationData).toEqual({ cname: 'demo.pages.dev' });
    expect(result.cloudflarePages.pagesDev.reachableAt).toBe(123);
  });
});
