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
      { id: 'zapi', name: 'Zapier', provider: 'Composio', category: 'Automation', status: 'available', tools: [], allowedToolNames: [], curatedToolNames: [] },
      { id: 'gmail', name: 'Gmail', provider: 'Composio', category: 'Email', status: 'connected', tools: [], allowedToolNames: [], curatedToolNames: [] },
      { id: 'airtable', name: 'Airtable', provider: 'Composio', category: 'Data', status: 'available', tools: [], allowedToolNames: [], curatedToolNames: [] },
      { id: 'github', name: 'GitHub', provider: 'Composio', category: 'Code', status: 'connected', tools: [], allowedToolNames: [], curatedToolNames: [] },
      { id: 'calendar', name: 'Calendar', provider: 'Composio', category: 'Calendar', status: 'available', tools: [], allowedToolNames: [], curatedToolNames: [] },
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

// Issues #748 + #767 reviews: the connector card / drawer header
// badge must track the curated catalog size — stable across Composio
// hydration, never extended by provider discovery. Crucially, this
// curated count must NOT be reused for drawer empty-state / loading-
// gate decisions, because the drawer renders the full inventory; a
// connector with an empty allowlist but a non-empty inventory must
// still show the list.
describe('getConnectorBadgeToolCount (issues #748, #767)', () => {
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
      curatedToolNames: [],
      ...overrides,
    };
  }

  it('uses curatedToolNames length as the badge source', () => {
    const connector = makeConnector({
      tools: [makeRawTool({ name: 'docs.search' }), makeRawTool({ name: 'docs.fetch' })],
      allowedToolNames: ['docs.search', 'docs.fetch'],
      curatedToolNames: ['docs.search', 'docs.fetch'],
    });
    expect(getConnectorBadgeToolCount(connector)).toBe(2);
  });

  it('stays at the curated size after hydration grows allowedToolNames with read-only auto-discovered tools (#748 / #767 stability guarantee)', () => {
    // The scenario @lefarcen called out in the #767 review: a
    // hydrated connector where Composio discovery added ~50 read +
    // auto-approval tools to the execution allowlist. `tools` is
    // huge, `allowedToolNames` is moderately bigger than the catalog,
    // but `curatedToolNames` is locked to the catalog. The badge must
    // report the catalog size; the previous fix that read from
    // `allowedToolNames` would have shown 52 here, the buggy
    // pre-fix code would have shown 800.
    const inventory = Array.from({ length: 800 }, (_, index) =>
      makeRawTool({ name: `docs.bulk_op_${index}` }),
    );
    const autoAllowed = Array.from({ length: 50 }, (_, index) => `docs.read_op_${index}`);
    const connector = makeConnector({
      tools: inventory,
      allowedToolNames: ['docs.search', 'docs.fetch', ...autoAllowed],
      curatedToolNames: ['docs.search', 'docs.fetch'],
    });
    expect(getConnectorBadgeToolCount(connector)).toBe(2);
    // Sanity: the other two counts are intentionally different.
    expect(connector.allowedToolNames.length).toBe(52);
    expect(connector.tools.length).toBe(800);
  });

  it('falls back through allowedToolNames then tools.length when curatedToolNames is missing (older daemon, defensive)', () => {
    // Half-deployed: daemon has shipped allowedToolNames (post-#748)
    // but not curatedToolNames (pre-#767-review fix). Falls back to
    // allowedToolNames so the badge still renders something close to
    // "tools the agent can invoke" instead of regressing to the raw
    // inventory.
    const partial = makeConnector({
      tools: [makeRawTool({ name: 'docs.search' }), makeRawTool({ name: 'docs.fetch' })],
      allowedToolNames: ['docs.search', 'docs.fetch'],
    });
    delete (partial as Partial<ConnectorDetail>).curatedToolNames;
    expect(getConnectorBadgeToolCount(partial)).toBe(2);

    // Fully old daemon: neither field present, last-resort fallback
    // is the raw inventory length so the badge never crashes.
    const ancient = makeConnector({
      tools: [makeRawTool({ name: 'docs.search' })],
    });
    delete (ancient as Partial<ConnectorDetail>).curatedToolNames;
    delete (ancient as Partial<ConnectorDetail>).allowedToolNames;
    expect(getConnectorBadgeToolCount(ancient)).toBe(1);
  });

  it('returns 0 when curatedToolNames is empty even if the inventory is huge — drawer empty-state is the inventory caller\'s job', () => {
    // The #767-review drawer regression: a hydrated connector with
    // 800 raw provider tools but no curated catalog entries. The
    // badge correctly reports 0, but the drawer still has 800 tools
    // to enumerate, so the empty-state branch must use the inventory
    // count, never the badge count.
    const inventory = Array.from({ length: 800 }, (_, index) =>
      makeRawTool({ name: `docs.bulk_op_${index}` }),
    );
    const connector = makeConnector({ tools: inventory });
    expect(getConnectorBadgeToolCount(connector)).toBe(0);
    expect(connector.tools.length).toBe(800);
  });

  it('treats an empty inventory + empty curated as a real "0 tools" badge (not loading)', () => {
    expect(getConnectorBadgeToolCount(makeConnector())).toBe(0);
  });
});
