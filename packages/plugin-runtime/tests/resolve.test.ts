// Characterization test for resolveContext. Pins the full shape of the
// resolver output — items, digestRefs order (hash-critical), and warnings —
// across every context kind so the resolve.ts decomposition is provably
// behavior-preserving.

import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '@open-design/contracts';
import { resolveContext, type RegistryView } from '../src/resolve.js';

const baseManifest = (od: NonNullable<PluginManifest['od']> | undefined): PluginManifest =>
  ({
    $schema: 'https://open-design.ai/schemas/plugin.v1.json',
    name: 'fixture',
    version: '0.0.1',
    ...(od ? { od } : {}),
  }) as PluginManifest;

const registry: RegistryView = {
  skills: [{ id: 'my-skill', title: 'My Skill' }],
  designSystems: [{ id: 'brand-a', title: 'Brand A' }],
  craft: [{ id: 'typography', title: 'Typography' }],
  atoms: [{ id: 'todo-write', label: 'Todo Write' }],
};

describe('resolveContext (characterization)', () => {
  it('resolves every context kind with stable items, digestRefs order, and warnings', () => {
    const manifest = baseManifest({
      context: {
        skills: [{ ref: 'my-skill' }, { ref: './missing-skill' }],
        designSystem: { ref: 'brand-a' },
        craft: ['typography', 'missing-craft'],
        assets: ['assets/logo.svg'],
        mcp: [{ name: 'notion', command: 'npx notion-mcp' }],
        claudePlugins: [{ ref: 'cc-plugin' }],
        atoms: ['todo-write', 'unknown-atom'],
      },
      pipeline: { stages: [{ id: 's1', atoms: ['todo-write', 'critique'] }] },
    });

    const out = resolveContext(manifest, { registry, warnOnMissing: true });
    expect(out).toMatchInlineSnapshot(`
      {
        "context": {
          "atoms": [
            "todo-write",
            "unknown-atom",
          ],
          "items": [
            {
              "id": "my-skill",
              "kind": "skill",
              "label": "My Skill",
            },
            {
              "id": "brand-a",
              "kind": "design-system",
              "label": "Brand A",
              "primary": true,
            },
            {
              "id": "typography",
              "kind": "craft",
              "label": "Typography",
            },
            {
              "kind": "asset",
              "label": "logo.svg",
              "path": "assets/logo.svg",
            },
            {
              "command": "npx notion-mcp",
              "kind": "mcp",
              "label": "notion",
              "name": "notion",
            },
            {
              "id": "cc-plugin",
              "kind": "claude-plugin",
              "label": "cc-plugin",
            },
            {
              "id": "todo-write",
              "kind": "atom",
              "label": "Todo Write",
            },
            {
              "id": "unknown-atom",
              "kind": "atom",
              "label": "unknown-atom",
            },
          ],
        },
        "digestRefs": [
          {
            "kind": "skill",
            "ref": "my-skill",
          },
          {
            "kind": "design-system",
            "ref": "brand-a",
          },
          {
            "kind": "craft",
            "ref": "typography",
          },
          {
            "kind": "asset",
            "ref": "assets/logo.svg",
          },
          {
            "kind": "mcp",
            "ref": "notion",
          },
          {
            "kind": "claude-plugin",
            "ref": "cc-plugin",
          },
          {
            "kind": "atom",
            "ref": "todo-write",
          },
          {
            "kind": "atom",
            "ref": "unknown-atom",
          },
          {
            "kind": "pipeline-atom",
            "ref": "s1:todo-write",
          },
          {
            "kind": "pipeline-atom",
            "ref": "s1:critique",
          },
        ],
        "warnings": [
          "Unknown skill ref: './missing-skill'",
          "Unknown craft slug: 'missing-craft'",
        ],
      }
    `);
  });

  it('uses the active project design system when the ref is blank', () => {
    const manifest = baseManifest({
      context: { designSystem: { ref: '' } },
    });
    const out = resolveContext(manifest, {
      registry: { ...registry, activeProjectDesignSystem: { id: 'proj-ds', title: 'Project DS' } },
      warnOnMissing: true,
    });
    expect(out).toMatchInlineSnapshot(`
      {
        "context": {
          "atoms": undefined,
          "items": [
            {
              "id": "proj-ds",
              "kind": "design-system",
              "label": "Project DS",
              "primary": true,
            },
          ],
        },
        "digestRefs": [
          {
            "kind": "design-system",
            "ref": "proj-ds",
          },
        ],
        "warnings": [],
      }
    `);
  });

  it('silently drops missing refs when warnOnMissing is false', () => {
    const manifest = baseManifest({
      context: { skills: [{ ref: 'nope' }], craft: ['nope'] },
    });
    const out = resolveContext(manifest, { registry, warnOnMissing: false });
    expect(out).toMatchInlineSnapshot(`
      {
        "context": {
          "atoms": undefined,
          "items": [],
        },
        "digestRefs": [],
        "warnings": [],
      }
    `);
  });

  it('returns an empty context when od.context is absent', () => {
    const out = resolveContext(baseManifest({}), { registry });
    expect(out).toMatchInlineSnapshot(`
      {
        "context": {
          "atoms": undefined,
          "items": [],
        },
        "digestRefs": [],
        "warnings": [],
      }
    `);
  });
});
