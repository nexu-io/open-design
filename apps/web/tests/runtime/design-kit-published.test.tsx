// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type Brand, type WorkspaceCollabContext } from '@open-design/contracts';
import { useDesignKit } from '../../src/runtime/design-kit';

const brand: Brand = {
  name: 'Shared brand', tagline: '', description: '', sourceUrl: '',
  logo: { primary: 'assets/logo.svg', alternates: [], notes: '' },
  colors: [],
  typography: {
    display: { family: 'Inter', fallbacks: [], weights: [700] },
    body: { family: 'Inter', fallbacks: [], weights: [400] },
  },
  voice: { adjectives: [], tone: '', messagingPillars: [], vocabulary: { use: [], avoid: [] } },
  imagery: { style: '', subjects: [], treatment: '', avoid: [] },
  layout: { radius: '', borderWeight: '', spacing: '', postureRules: [] },
};
const context: WorkspaceCollabContext = {
  workspaceId: 'team-a', teamId: 'team-a', workspaceType: 'team', workspaceMemberId: 'member-a',
  role: 'member', memberStatus: 'active', lifecycleState: 'active', billingState: 'active',
  planId: null, providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
  permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([true, false])('publishedAssets=%s uses only its authorized resource family', async publishedAssets => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers) });
    const response = Response.json(brand, { headers: { 'content-location': '/api/design-systems/user%3Ashared/static/previews/scope-a/files/DESIGN.md' } });
    Object.defineProperty(response, 'url', { value: 'od://app/api/design-systems/user%3Ashared/static?path=DESIGN.md' });
    return response;
  }));
  const { result } = renderHook(() => useDesignKit({
    designSystemId: 'user:shared', projectId: 'private-backing-project', title: 'Shared brand',
    body: '# Shared brand', editable: false, publishedAssets, workspaceContext: context,
  }));
  await waitFor(() => expect(result.current.kit?.logoSrc).toBeTruthy());
  expect(requests).toHaveLength(publishedAssets ? 2 : 1);
  expect(requests[0]?.headers.get('x-od-workspace-id')).toBe('team-a');
  expect(requests[0]?.headers.get('x-od-workspace-member-id')).toBe('member-a');
  if (publishedAssets) {
    expect(requests.some(request => request.url.includes('/api/design-systems/user%3Ashared/static?path=brand.json'))).toBe(true);
    expect(requests[0]?.url).not.toContain('/api/projects/');
    expect(result.current.kit?.logoSrc).toBe('od://app/api/design-systems/user%3Ashared/static/previews/scope-a/files/assets/logo.svg');
    expect(result.current.kit?.logoSrc).not.toContain('private-backing-project');
  } else {
    expect(requests[0]?.url).toContain('/api/projects/private-backing-project/');
    expect(result.current.kit?.logoSrc).toContain('/api/projects/private-backing-project/raw/assets/logo.svg');
  }
});

const packageInfo = {
  availableFiles: ['docs/DESIGN.md', 'system/kit.html', 'pages/start.html'],
  manifest: {
    schemaVersion: 'od-design-system-project/v1' as const, id: 'demo', name: 'Demo', category: 'Starter',
    files: { design: 'docs/DESIGN.md', tokens: 'tokens.css', components: 'components.html' },
    preview: { pages: [{ path: 'pages/start.html', title: 'Start' }] },
  },
};

it.each(['docs/DESIGN.md', './docs/DESIGN.md', 'docs\\DESIGN.md'])(
  'initializes read-only iframe and page URLs from canonical scope for %s', async designPath => {
  const pathPackageInfo = { ...packageInfo, manifest: { ...packageInfo.manifest, files: { ...packageInfo.manifest.files, design: designPath } } };
  const requests: RequestInit[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(init ?? {});
    const response = new Response('# Demo', { headers: {
      'content-location': '/api/design-systems/demo/static/previews/scoped/files/docs/DESIGN.md',
    } });
    Object.defineProperty(response, 'url', { value: 'od://app/api/design-systems/demo/static?path=docs%2FDESIGN.md' });
    return response;
  }));
  const { result } = renderHook(() => useDesignKit({
    designSystemId: 'demo', title: 'Demo', body: '# Demo', editable: false,
    packageInfo: pathPackageInfo,
  }));
  await waitFor(() => expect(result.current.kit?.system?.kitUrl).toBe(
    'od://app/api/design-systems/demo/static/previews/scoped/files/system/kit.html',
  ));
  expect(result.current.kit?.assets?.[0]?.url).toBe(
    'od://app/api/design-systems/demo/static/previews/scoped/files/pages/start.html',
  );
  expect(new Headers(requests[0]?.headers).get('x-od-design-system-preview')).toBe('1');
});

it('does not expose uninitialized static URLs when the host entry is denied', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })));
  const { result } = renderHook(() => useDesignKit({
    designSystemId: 'demo', title: 'Demo', body: '# Demo', editable: false, packageInfo,
  }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.kit?.name).toBe('Demo');
  expect(result.current.kit?.system).toBeUndefined();
  expect(result.current.kit?.assets).toBeUndefined();
});

it('discards a pending package scope after switching workspace identity', async () => {
  let resolveOld!: (value: Response) => void;
  const oldResponse = new Promise<Response>(resolve => { resolveOld = resolve; });
  const response = (scope: string) => {
    const value = new Response('# Demo', { headers: {
      'content-location': `/api/design-systems/demo/static/previews/${scope}/files/docs/DESIGN.md`,
    } });
    Object.defineProperty(value, 'url', { value: 'od://app/api/design-systems/demo/static?path=docs%2FDESIGN.md' });
    return value;
  };
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    return new Headers(init?.headers).get('x-od-workspace-id') === 'team-a'
      ? oldResponse : response('scope-b');
  }));
  const { result, rerender } = renderHook(({ workspaceContext }) => useDesignKit({
    designSystemId: 'demo', title: 'Demo', body: '# Demo', editable: false, packageInfo, workspaceContext,
  }), { initialProps: { workspaceContext: context } });
  expect(result.current.kit).toBeNull();
  rerender({ workspaceContext: { ...context, workspaceId: 'team-b', workspaceMemberId: 'member-b' } });
  await waitFor(() => expect(result.current.kit?.system?.kitUrl).toContain('/scope-b/'));
  await act(async () => { resolveOld(response('scope-a')); await oldResponse; });
  expect(result.current.kit?.system?.kitUrl).toContain('/scope-b/');
  expect(result.current.loading).toBe(false);
});
