import { describe, expect, it } from 'vitest';

import {
  isTrustedConnectorCallbackOrigin,
  sortConnectorsForDisplay,
  sortConnectorsForSearch,
} from '../../src/components/EntryView';
import {
  clearConnectorAuthorizationPending,
  getConnectorDisplayToolCount,
  mergeConnectorActionResult,
  mergeConnectorToolPreview,
  pruneConnectorAuthorizationPending,
  updateConnectorAuthorizationPendingFromConnectResponse,
  updateConnectorAuthorizationPendingFromStatuses,
} from '../../src/components/ConnectorsBrowser';

describe('connector OAuth callback origin', () => {
  it('accepts the app origin', () => {
    expect(isTrustedConnectorCallbackOrigin('http://127.0.0.1:60809', 'http://127.0.0.1:60809')).toBe(true);
  });

  it('accepts loopback daemon origins on a different port', () => {
    expect(isTrustedConnectorCallbackOrigin('http://127.0.0.1:60807', 'http://127.0.0.1:60809')).toBe(true);
    expect(isTrustedConnectorCallbackOrigin('http://localhost:60807', 'http://127.0.0.1:60809')).toBe(true);
  });

  it('rejects non-loopback origins', () => {
    expect(isTrustedConnectorCallbackOrigin('https://example.com', 'http://127.0.0.1:60809')).toBe(false);
    expect(isTrustedConnectorCallbackOrigin('file://callback', 'http://127.0.0.1:60809')).toBe(false);
  });
});

describe('connector display sorting', () => {
  it('preserves discovered tools when a fast action response only changes status', () => {
    const merged = mergeConnectorActionResult(
      {
        id: 'twitter',
        name: 'Twitter',
        provider: 'Composio',
        category: 'Social',
        description: 'Read Twitter/X timelines, tweets, users, and searches.',
        status: 'connected',
        accountLabel: 'ca_twitter',
        toolCount: 72,
        tools: [
          {
            title: 'Search posts',
            name: 'twitter.search_posts',
            safety: { sideEffect: 'read', approval: 'auto', reason: 'Read-only search.' },
            refreshEligible: true,
          },
        ],
      },
      {
        id: 'twitter',
        name: 'Twitter',
        provider: 'Composio',
        category: 'Social',
        description: 'Read Twitter/X timelines, tweets, users, and searches.',
        status: 'available',
        tools: [],
      },
    );

    expect(merged).toMatchObject({
      id: 'twitter',
      status: 'available',
      toolCount: 72,
      tools: [expect.objectContaining({ name: 'twitter.search_posts' })],
    });
  });

  it('uses display tool counts without treating them as hydrated tools', () => {
    const connector = {
      id: 'airtable',
      name: 'Airtable',
      provider: 'Composio',
      category: 'Database',
      status: 'available' as const,
      toolCount: 25,
      tools: [],
    };

    expect(getConnectorDisplayToolCount(connector)).toBe(25);
    expect(connector.tools).toEqual([]);
  });

  it('appends paginated preview tools without duplicating rows', () => {
    const current = {
      id: 'canvas',
      name: 'Canvas',
      provider: 'Composio',
      category: 'Education',
      status: 'available' as const,
      toolCount: 574,
      toolsNextCursor: 'cursor_2',
      toolsHasMore: true,
      tools: [
        {
          title: 'List courses',
          name: 'canvas.list_courses',
          safety: { sideEffect: 'read' as const, approval: 'auto' as const, reason: 'Read-only list.' },
          refreshEligible: true,
        },
      ],
    };
    const next = {
      ...current,
      toolsHasMore: false,
      tools: [
        current.tools[0]!,
        {
          title: 'Get course',
          name: 'canvas.get_course',
          safety: { sideEffect: 'read' as const, approval: 'auto' as const, reason: 'Read-only get.' },
          refreshEligible: true,
        },
      ],
    };

    const merged = mergeConnectorToolPreview(current, next, true);

    expect(merged.tools.map((tool) => tool.name)).toEqual(['canvas.list_courses', 'canvas.get_course']);
    expect(merged.toolsHasMore).toBe(false);
  });

  it('places connected connectors first and sorts the rest alphabetically', () => {
    const sorted = sortConnectorsForDisplay([
      { id: 'zapi', name: 'Zapier', provider: 'Composio', category: 'Automation', status: 'available', tools: [] },
      { id: 'gmail', name: 'Gmail', provider: 'Composio', category: 'Email', status: 'connected', tools: [] },
      { id: 'airtable', name: 'Airtable', provider: 'Composio', category: 'Data', status: 'available', tools: [] },
      { id: 'github', name: 'GitHub', provider: 'Composio', category: 'Code', status: 'connected', tools: [] },
      { id: 'calendar', name: 'Calendar', provider: 'Composio', category: 'Calendar', status: 'available', tools: [] },
    ]);

    expect(sorted.map((connector) => connector.id)).toEqual([
      'github',
      'gmail',
      'airtable',
      'calendar',
      'zapi',
    ]);
  });

  it('ranks exact and prefix name/provider matches above description matches', () => {
    const sorted = sortConnectorsForSearch([
      {
        id: 'linear',
        name: 'Linear',
        provider: 'Composio',
        category: 'Project management',
        status: 'connected',
        description: 'Sync issues from GitHub repositories.',
        tools: [],
        allowedToolNames: [],
        curatedToolNames: [],
      },
      {
        id: 'github-enterprise',
        name: 'GitHub Enterprise',
        provider: 'Composio',
        category: 'Code',
        status: 'available',
        tools: [],
        allowedToolNames: [],
        curatedToolNames: [],
      },
      {
        id: 'github',
        name: 'GitHub',
        provider: 'Composio',
        category: 'Code',
        status: 'available',
        tools: [],
        allowedToolNames: [],
        curatedToolNames: [],
      },
      {
        id: 'slack',
        name: 'Slack',
        provider: 'Composio',
        category: 'Communication',
        status: 'connected',
        tools: [
          {
            title: 'Post GitHub release',
            name: 'post_github_release',
            safety: { sideEffect: 'write', approval: 'confirm', reason: 'Posts a message.' },
            refreshEligible: false,
          },
        ],
        allowedToolNames: [],
        curatedToolNames: [],
      },
    ], 'github');

    expect(sorted.map((connector) => connector.id)).toEqual([
      'github',
      'github-enterprise',
      'slack',
      'linear',
    ]);
  });
});

describe('connector authorization pending state', () => {
  const future = '2026-05-08T10:10:00.000Z';
  const nowMs = Date.parse('2026-05-08T10:00:00.000Z');

  it('marks redirect_required connect responses as pending', () => {
    const pending = updateConnectorAuthorizationPendingFromConnectResponse({}, {
      connector: {
        id: 'exist',
        name: 'Exist',
        provider: 'Composio',
        category: 'Personal',
        status: 'available',
        tools: [],
        allowedToolNames: [],
        curatedToolNames: [],
      },
      auth: {
        kind: 'redirect_required',
        redirectUrl: 'https://example.com/oauth',
        expiresAt: future,
      },
    }, nowMs);

    expect(pending).toEqual({ exist: { expiresAt: future } });
  });

  it('keeps pending state while status polling still reports available', () => {
    const pending = updateConnectorAuthorizationPendingFromStatuses(
      { exist: { expiresAt: future } },
      { exist: { status: 'available' } },
      nowMs,
    );

    expect(pending).toEqual({ exist: { expiresAt: future } });
  });

  it('clears pending state when status polling reports connected', () => {
    const pending = updateConnectorAuthorizationPendingFromStatuses(
      { exist: { expiresAt: future } },
      { exist: { status: 'connected', accountLabel: 'me@example.com' } },
      nowMs,
    );

    expect(pending).toEqual({});
  });

  it('expires pending state after the auth response expiry time', () => {
    const pending = pruneConnectorAuthorizationPending(
      { exist: { expiresAt: '2026-05-08T09:59:59.000Z' } },
      nowMs,
    );

    expect(pending).toEqual({});
  });

  it('clears pending state for immediately connected responses', () => {
    const pending = updateConnectorAuthorizationPendingFromConnectResponse({ exist: { expiresAt: future } }, {
      connector: {
        id: 'exist',
        name: 'Exist',
        provider: 'Composio',
        category: 'Personal',
        status: 'connected',
        tools: [],
        allowedToolNames: [],
        curatedToolNames: [],
      },
      auth: { kind: 'connected' },
    }, nowMs);

    expect(pending).toEqual({});
  });

  it('cancels pending authorization without changing other pending connectors', () => {
    const pending = clearConnectorAuthorizationPending(
      {
        exist: { expiresAt: future },
        airtable: { expiresAt: future },
      },
      'exist',
    );

    expect(pending).toEqual({ airtable: { expiresAt: future } });
  });
});
