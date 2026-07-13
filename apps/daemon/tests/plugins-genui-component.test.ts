// Plan §3.K3 / spec §10.3.5 — od.genui.surfaces[].component manifest field.
//
// Two contracts:
//   1. The Zod schema in @open-design/contracts accepts the new
//      `component: { path, export?, sandbox? }` field on a surface.
//   2. doctorPlugin() flags a surface that ships a component without
//      the matching `genui:custom-component` capability, and rejects
//      path-traversal segments.
//   3. validateCapabilityList accepts `genui:custom-component` as a
//      first-class top-level capability.

import { describe, expect, it } from 'vitest';
import { GenUISurfaceSpecSchema } from '@open-design/contracts';
import { validateSafe } from '@open-design/plugin-runtime';
import { doctorPlugin } from '../src/plugins/doctor.js';
import { validateCapabilityList } from '../src/plugins/trust.js';
import { FIRST_PARTY_ATOMS, type AtomCatalogEntry } from '../src/plugins/atoms.js';
import type { InstalledPluginRecord, PluginManifest } from '@open-design/contracts';

const REGISTRY = {
  skills:        [],
  designSystems: [],
  craft:         [],
  atoms:         FIRST_PARTY_ATOMS.map((a: AtomCatalogEntry) => ({ id: a.id, label: a.label })),
};

function pluginRecord(manifest: PluginManifest): InstalledPluginRecord {
  return {
    id:                  manifest.name,
    title:               manifest.title ?? manifest.name,
    version:             manifest.version,
    sourceKind:          'local',
    source:              '/tmp/test',
    pinnedRef:           undefined,
    sourceMarketplaceId: undefined,
    trust:               'restricted',
    capabilitiesGranted: ['prompt:inject'],
    manifest,
    fsPath:              '/tmp/test',
    installedAt:         0,
    updatedAt:           0,
  };
}

describe('GenUISurfaceSpec.component (manifest schema)', () => {
  it('accepts a component path + export + sandbox triple', () => {
    const result = GenUISurfaceSpecSchema.safeParse({
      id:        'critique-panel',
      kind:      'choice',
      persist:   'run',
      component: { path: './surfaces/critique-panel.tsx', export: 'CritiquePanel', sandbox: 'react' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty component.path', () => {
    const result = GenUISurfaceSpecSchema.safeParse({
      id:        'critique-panel',
      kind:      'choice',
      persist:   'run',
      component: { path: '' },
    });
    expect(result.success).toBe(false);
  });
});

describe('validateCapabilityList — genui:custom-component', () => {
  it('treats genui:custom-component as a first-class top-level capability', () => {
    const { accepted, rejected } = validateCapabilityList([
      'prompt:inject',
      'genui:custom-component',
    ]);
    expect(accepted.sort()).toEqual(['genui:custom-component', 'prompt:inject']);
    expect(rejected).toEqual([]);
  });
});

describe('doctorPlugin — component capability gate', () => {
  const baseManifest: PluginManifest = {
    name:        'sample-plugin',
    title:       'Sample',
    version:     '1.0.0',
    description: 'fixture',
    od: {
      kind:    'skill',
      genui:   {
        surfaces: [
          {
            id:        'critique-panel',
            kind:      'choice',
            persist:   'run',
            component: { path: './surfaces/critique-panel.tsx' },
          },
        ],
      },
      capabilities: ['prompt:inject'],
    },
  };

  it('errors when a surface ships a component without genui:custom-component', () => {
    expect(validateSafe(baseManifest).ok).toBe(true);
    const report = doctorPlugin(pluginRecord(baseManifest), REGISTRY);
    const codes = report.issues.map((d) => d.code);
    expect(codes).toContain('genui.component-capability');
    expect(report.ok).toBe(false);
  });

  it('passes when the matching capability is declared', () => {
    const m: PluginManifest = {
      ...baseManifest,
      od: { ...baseManifest.od, capabilities: ['prompt:inject', 'genui:custom-component'] },
    };
    const report = doctorPlugin(pluginRecord(m), REGISTRY);
    expect(report.issues.find((d) => d.code === 'genui.component-capability')).toBeUndefined();
  });

  it('errors on path-traversal segments inside the component path', () => {
    const m: PluginManifest = {
      ...baseManifest,
      od: {
        ...baseManifest.od,
        capabilities: ['prompt:inject', 'genui:custom-component'],
        genui: {
          surfaces: [
            {
              id:        'critique-panel',
              kind:      'choice',
              persist:   'run',
              component: { path: '../escape/panel.tsx' },
            },
          ],
        },
      },
    };
    const report = doctorPlugin(pluginRecord(m), REGISTRY);
    expect(report.issues.find((d) => d.code === 'genui.component-traversal')).toBeDefined();
    expect(report.ok).toBe(false);
  });
});
