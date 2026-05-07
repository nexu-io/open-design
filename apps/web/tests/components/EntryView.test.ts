import { describe, expect, it } from 'vitest';

import type { ConnectorDetail, ConnectorToolDetail } from '@open-design/contracts';

import {
  getConnectorBadgeToolCount,
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
      { id: 'zapi', name: 'Zapier', provider: 'Composio', category: 'Automation', status: 'available', tools: [], allowedToolNames: [] },
      { id: 'gmail', name: 'Gmail', provider: 'Composio', category: 'Email', status: 'connected', tools: [], allowedToolNames: [] },
      { id: 'airtable', name: 'Airtable', provider: 'Composio', category: 'Data', status: 'available', tools: [], allowedToolNames: [] },
      { id: 'github', name: 'GitHub', provider: 'Composio', category: 'Code', status: 'connected', tools: [], allowedToolNames: [] },
      { id: 'calendar', name: 'Calendar', provider: 'Composio', category: 'Calendar', status: 'available', tools: [], allowedToolNames: [] },
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
      },
      {
        id: 'github-enterprise',
        name: 'GitHub Enterprise',
        provider: 'Composio',
        category: 'Code',
        status: 'available',
        tools: [],
        allowedToolNames: [],
      },
      {
        id: 'github',
        name: 'GitHub',
        provider: 'Composio',
        category: 'Code',
        status: 'available',
        tools: [],
        allowedToolNames: [],
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

// Issue #748 + #767 review: the connector card / drawer header badge
// must track the curated allowlist size (so the number stays close to
// "tools the agent can actually invoke" instead of jumping from ≈2 to
// ≈868 when Composio hydrates the full provider inventory). Crucially,
// this curated count must NOT be reused for drawer empty-state /
// loading-gate decisions, because the drawer renders the full
// inventory — a connector with an empty allowlist but a non-empty
// inventory must still show the list.
describe('getConnectorBadgeToolCount (issue #748)', () => {
  function makeRawTool(overrides: Partial<ConnectorToolDetail> = {}): ConnectorToolDetail {
    return {
      name: 'docs.bulk_op',
      title: 'Bulk op',
      safety: { sideEffect: 'write', approval: 'confirm', reason: 'Write op.' },
      refreshEligible: false,
      ...overrides,
    };
  }
  function makeConnector(overrides: Partial<ConnectorDetail> = {}): ConnectorDetail {
    return {
      id: 'docs',
      name: 'Docs',
      provider: 'composio',
      category: 'docs',
      status: 'available',
      tools: [],
      allowedToolNames: [],
      ...overrides,
    };
  }

  it('uses the curated allowedToolNames length for the badge', () => {
    const connector = makeConnector({
      tools: [makeRawTool({ name: 'docs.search' }), makeRawTool({ name: 'docs.fetch' })],
      allowedToolNames: ['docs.search', 'docs.fetch'],
    });
    expect(getConnectorBadgeToolCount(connector)).toBe(2);
  });

  it('falls back to tools.length when allowedToolNames is missing (older daemon, defensive)', () => {
    const connector = makeConnector({
      tools: [makeRawTool({ name: 'docs.search' })],
    });
    // Strip the field to simulate a wire payload from a daemon build
    // that hasn't shipped allowedToolNames yet — the badge must still
    // render some count instead of NaN/crash.
    delete (connector as Partial<ConnectorDetail>).allowedToolNames;
    expect(getConnectorBadgeToolCount(connector)).toBe(1);
  });

  it('returns 0 when the allowlist is empty even if the inventory is huge — drawer empty-state is the inventory caller\'s job', () => {
    // The exact #767-review regression: a hydrated connector with 800
    // raw provider tools (e.g. write-only Composio surface) but no
    // execution-safe tools auto-allowed yet. The badge correctly
    // reports 0 — but the drawer still has 800 tools to enumerate, so
    // it must NOT pipe this number into its empty-state branch.
    const inventory = Array.from({ length: 800 }, (_, index) =>
      makeRawTool({ name: `docs.bulk_op_${index}` }),
    );
    const connector = makeConnector({ tools: inventory, allowedToolNames: [] });
    expect(getConnectorBadgeToolCount(connector)).toBe(0);
    // Sanity: the drawer's inventory-side number stays at the full
    // count. These two numbers being different is the contract.
    expect(connector.tools.length).toBe(800);
  });

  it('treats an empty inventory + empty allowlist as a real "0 tools" badge (not loading)', () => {
    expect(getConnectorBadgeToolCount(makeConnector())).toBe(0);
  });
});
