import { describe, expect, it } from 'vitest';

import {
  isTrustedConnectorCallbackOrigin,
  sortConnectorsForDisplay,
  sortConnectorsForSearch,
} from '../../src/components/EntryView';

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
      },
      {
        id: 'github-enterprise',
        name: 'GitHub Enterprise',
        provider: 'Composio',
        category: 'Code',
        status: 'available',
        tools: [],
      },
      {
        id: 'github',
        name: 'GitHub',
        provider: 'Composio',
        category: 'Code',
        status: 'available',
        tools: [],
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
