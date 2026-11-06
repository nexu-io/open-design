import { describe, expect, it } from 'vitest';
import { renderPluginBlock } from '../src/prompts/plugin-block.js';
import type { AppliedPluginSnapshot } from '../src/plugins/apply.js';

function makeSnapshot(overrides: Partial<AppliedPluginSnapshot> = {}): AppliedPluginSnapshot {
  return {
    snapshotId: 'snap-1',
    pluginId: 'demo-plugin',
    pluginVersion: '1.0.0',
    manifestSourceDigest: 'sha256:0',
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: [],
    capabilitiesRequired: [],
    assetsStaged: [],
    taskKind: 'new-generation',
    appliedAt: 0,
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
    status: 'fresh',
    ...overrides,
  } as AppliedPluginSnapshot;
}

describe('renderPluginBlock', () => {
  it('uses pluginTitle when present, falls back to pluginId otherwise', () => {
    const withTitle = renderPluginBlock(makeSnapshot({ pluginTitle: 'Pitch Deck' }));
    expect(withTitle).toContain('**Pitch Deck** (`demo-plugin@1.0.0`)');

    const noTitle = renderPluginBlock(makeSnapshot());
    expect(noTitle).toContain('**demo-plugin** (`demo-plugin@1.0.0`)');
  });

  it('omits Plugin inputs section when no inputs supplied', () => {
    const out = renderPluginBlock(makeSnapshot());
    expect(out).not.toContain('## Plugin inputs');
  });

  it('renders inputs in sorted-key order, formatting empty strings as (empty)', () => {
    const out = renderPluginBlock(
      makeSnapshot({
        inputs: { topic: 'pricing', empty: '', count: 3, flag: true },
      }),
    );
    expect(out).toContain('## Plugin inputs');
    expect(out).toContain('- **count**: 3');
    expect(out).toContain('- **empty**: (empty)');
    expect(out).toContain('- **flag**: true');
    expect(out).toContain('- **topic**: pricing');

    const indices = ['count', 'empty', 'flag', 'topic'].map((k) =>
      out.indexOf(`- **${k}**`),
    );
    for (let i = 1; i < indices.length; i += 1) {
      expect(indices[i]!).toBeGreaterThan(indices[i - 1]!);
    }
  });

  it('omits Plugin atoms section when resolvedContext.atoms is empty or absent', () => {
    expect(renderPluginBlock(makeSnapshot())).not.toContain('## Plugin atoms');
    expect(
      renderPluginBlock(
        makeSnapshot({ resolvedContext: { items: [], atoms: [] } }),
      ),
    ).not.toContain('## Plugin atoms');
  });

  it('renders one bullet per atom id when atoms are present', () => {
    const out = renderPluginBlock(
      makeSnapshot({
        resolvedContext: { items: [], atoms: ['todo-write', 'direction-picker'] },
      }),
    );
    expect(out).toContain('## Plugin atoms');
    expect(out).toContain('- `todo-write`');
    expect(out).toContain('- `direction-picker`');
  });

  it('trims plugin description and example query', () => {
    const out = renderPluginBlock(
      makeSnapshot({
        pluginDescription: '  Walks a designer through a pitch deck.  \n',
        query: '   write me a deck about fluorine   ',
      }),
    );
    expect(out).toContain('Walks a designer through a pitch deck.');
    expect(out).not.toContain('  Walks');
    expect(out).toContain('_write me a deck about fluorine_');
  });
});
