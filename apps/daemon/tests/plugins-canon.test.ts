// Plan §3.CC1 — `od plugin canon <snapshotId>` route + helper.
//
// The CLI subcommand fetches GET /api/applied-plugins/<id>/canon,
// which calls renderPluginBlock() (re-exported as pluginPromptBlock
// from apps/daemon/src/plugins/index.ts). The route is a 4-line
// thin wrapper so this test directly exercises the helper +
// asserts the canonical block shape stays byte-deterministic.

import { describe, expect, it } from 'vitest';
import type { AppliedPluginSnapshot } from '@open-design/contracts';
import { pluginPromptBlock } from '../src/plugins/index.js';

const snapshot = (over: Partial<AppliedPluginSnapshot> = {}): AppliedPluginSnapshot => ({
  snapshotId: 'snap-1',
  pluginId: 'fixture',
  pluginVersion: '0.1.0',
  manifestSourceDigest: 'd1',
  inputs: {},
  resolvedContext: { items: [], itemRefs: [] } as unknown as AppliedPluginSnapshot['resolvedContext'],
  capabilitiesGranted: [],
  capabilitiesRequired: [],
  assetsStaged: [],
  taskKind: 'new-generation',
  appliedAt: 1,
  connectorsRequired: [],
  connectorsResolved: [],
  mcpServers: [],
  status: 'fresh',
  ...over,
});

describe('pluginPromptBlock — Active plugin block shape', () => {
  it('renders the plugin id + version when title is absent', () => {
    const out = pluginPromptBlock(snapshot({ pluginId: 'p', pluginVersion: '1.0.0' }));
    expect(out).toContain('## Active plugin');
    expect(out).toContain('`p@1.0.0`');
  });

  it('prefers pluginTitle when present', () => {
    const out = pluginPromptBlock(snapshot({ pluginTitle: 'Hero plugin', pluginId: 'p', pluginVersion: '1.0.0' }));
    expect(out).toContain('**Hero plugin**');
    expect(out).toContain('`p@1.0.0`');
  });

  it('appends pluginDescription when present', () => {
    const out = pluginPromptBlock(snapshot({ pluginDescription: 'Does things' }));
    expect(out).toContain('Does things');
  });

  it('renders Plugin inputs block sorted alphabetically by key', () => {
    const out = pluginPromptBlock(snapshot({ inputs: { topic: 'cards', tone: 'warm', spacing: '16px' } }));
    expect(out).toContain('## Plugin inputs');
    const positions = ['spacing', 'tone', 'topic'].map((k) => out.indexOf(`**${k}**`));
    expect(positions[0]).toBeGreaterThan(0);
    expect(positions[0]).toBeLessThan(positions[1]!);
    expect(positions[1]).toBeLessThan(positions[2]!);
  });

  it('returns byte-equal output across two calls with the same snapshot (replay invariance)', () => {
    const snap = snapshot({ pluginTitle: 'X', inputs: { a: '1', b: '2' } });
    expect(pluginPromptBlock(snap)).toBe(pluginPromptBlock(snap));
  });

  it('omits the Plugin inputs block when no inputs are present', () => {
    const out = pluginPromptBlock(snapshot());
    expect(out).not.toContain('## Plugin inputs');
  });

  it('echoes query as a stylized brief when present', () => {
    const out = pluginPromptBlock(snapshot({ query: 'Make a deck about cats' }));
    expect(out).toContain('Make a deck about cats');
  });
});
