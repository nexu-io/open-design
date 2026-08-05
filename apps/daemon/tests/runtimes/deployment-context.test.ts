import { describe, expect, it } from 'vitest';
import {
  cloudflarePagesDeploymentMetadata,
  cloudflarePagesProjectNameFromDeployment,
  cloudflarePagesProjectNameFromUrl,
  publicDeployment,
  publicDeployments,
} from '../../src/runtimes/deployment-context.js';

describe('deployment context runtime', () => {
  it('normalizes Cloudflare project metadata and pages.dev URLs', () => {
    expect(cloudflarePagesDeploymentMetadata('  demo-pages  ')).toEqual({
      cloudflarePagesProjectName: 'demo-pages',
    });
    expect(cloudflarePagesDeploymentMetadata('   ')).toBeUndefined();
    expect(cloudflarePagesProjectNameFromUrl('https://team.demo-pages.pages.dev/path'))
      .toBe('demo-pages');
    expect(cloudflarePagesProjectNameFromUrl('https://example.com')).toBe('');
    expect(cloudflarePagesProjectNameFromUrl('not a url')).toBe('');
  });

  it('prefers persisted provider metadata over URL inference', () => {
    expect(cloudflarePagesProjectNameFromDeployment({
      url: 'https://old-name.pages.dev',
      providerMetadata: { cloudflarePagesProjectName: '  stable-name ' },
    })).toBe('stable-name');
    expect(cloudflarePagesProjectNameFromDeployment({
      url: 'https://inferred.pages.dev',
    })).toBe('inferred');
  });

  it('removes private provider metadata from public deployment shapes', () => {
    const deployment = { id: 'd1', url: 'https://example.com', providerMetadata: { token: 'secret' } };
    expect(publicDeployment(deployment)).toEqual({ id: 'd1', url: 'https://example.com' });
    expect(publicDeployments([deployment, null])).toEqual([
      { id: 'd1', url: 'https://example.com' },
      null,
    ]);
  });
});
