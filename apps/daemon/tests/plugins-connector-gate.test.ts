// Connector-gate unit tests (spec §9 / §11.3).
//
// Three behaviours under test:
//   1. resolveConnectorBindings returns 'unavailable' for unknown ids and
//      'connected' / 'pending' for known ones (apply path).
//   2. deriveAutoOAuthPrompts auto-creates an oauth-prompt for every
//      not-yet-connected required connector, with the spec-locked
//      __auto_connector_<id> id and persist='project'.
//   3. checkConnectorTokenIssuance allows trusted plugins implicitly and
//      restricts restricted plugins to their explicit grants.

import { describe, expect, it } from 'vitest';
import {
  checkConnectorTokenIssuance,
  deriveAutoOAuthPrompts,
  mergeAutoOAuthPrompts,
  resolveConnectorBindings,
  validateConnectorRefs,
  type ConnectorCatalogEntry,
  type ConnectorProbe,
} from '../src/plugins/connector-gate.js';
import type { PluginManifest } from '@open-design/contracts';

const buildProbe = (entries: ConnectorCatalogEntry[]): ConnectorProbe => ({
  get(id) { return entries.find((e) => e.id === id); },
});

const baseManifest = (): PluginManifest => ({
  name:    'sample-plugin',
  version: '1.0.0',
  od: {
    connectors: {
      required: [
        { id: 'figma', tools: ['figma_get_file'] },
        { id: 'notion', tools: [] },
      ],
      optional: [
        { id: 'slack',  tools: [] },
      ],
    },
    capabilities: ['connector:figma', 'connector:notion'],
  },
});

describe('resolveConnectorBindings', () => {
  it('marks unknown connector ids as unavailable', () => {
    const probe = buildProbe([
      { id: 'figma', status: 'connected', allowedToolNames: ['figma_get_file'] },
    ]);
    const { resolved } = resolveConnectorBindings(baseManifest(), probe);
    const figma = resolved.find((r) => r.id === 'figma');
    const notion = resolved.find((r) => r.id === 'notion');
    expect(figma?.status).toBe('connected');
    expect(notion?.status).toBe('unavailable');
  });

  it('flips required:false on optional[] entries', () => {
    const probe = buildProbe([
      { id: 'figma',  status: 'connected', allowedToolNames: [] },
      { id: 'notion', status: 'connected', allowedToolNames: [] },
      { id: 'slack',  status: 'connected', allowedToolNames: [] },
    ]);
    const { resolved } = resolveConnectorBindings(baseManifest(), probe);
    expect(resolved.find((r) => r.id === 'slack')?.required).toBe(false);
    expect(resolved.find((r) => r.id === 'figma')?.required).toBe(true);
  });

  it('without a probe leaves all bindings pending', () => {
    const { resolved } = resolveConnectorBindings(baseManifest(), undefined);
    for (const r of resolved) expect(r.status).toBe('pending');
  });
});

describe('deriveAutoOAuthPrompts', () => {
  it('only fires for required + not-connected bindings', () => {
    const auto = deriveAutoOAuthPrompts([
      { id: 'figma',  required: true,  status: 'pending',     tools: [] },
      { id: 'notion', required: true,  status: 'connected',   tools: [] },
      { id: 'slack',  required: false, status: 'unavailable', tools: [] },
    ]);
    expect(auto).toHaveLength(1);
    const surface = auto[0]!;
    expect(surface.id).toBe('__auto_connector_figma');
    expect(surface.kind).toBe('oauth-prompt');
    expect(surface.persist).toBe('project');
    expect(surface.oauth?.route).toBe('connector');
    expect(surface.oauth?.connectorId).toBe('figma');
  });
});

describe('mergeAutoOAuthPrompts', () => {
  it('lets plugin-declared surfaces win over auto-derived ones with the same id', () => {
    const declared = [{
      id: '__auto_connector_figma',
      kind: 'oauth-prompt' as const,
      persist: 'project' as const,
      prompt: 'Custom Figma copy',
    }];
    const auto = deriveAutoOAuthPrompts([
      { id: 'figma',  required: true, status: 'pending', tools: [] },
      { id: 'notion', required: true, status: 'pending', tools: [] },
    ]);
    const merged = mergeAutoOAuthPrompts(declared, auto);
    const figma = merged.find((s) => s.id === '__auto_connector_figma');
    expect(figma?.prompt).toBe('Custom Figma copy');
    expect(merged.find((s) => s.id === '__auto_connector_notion')).toBeDefined();
  });
});

describe('validateConnectorRefs', () => {
  it('flags unknown connector ids as errors and missing capabilities as warnings', () => {
    const probe = buildProbe([
      { id: 'figma', status: 'connected', allowedToolNames: ['figma_get_file', 'figma_get_node'] },
      // notion missing on purpose
    ]);
    const manifest = baseManifest();
    delete manifest.od!.capabilities;
    const issues = validateConnectorRefs(manifest, probe);
    const codes = issues.map((i) => i.code).sort();
    expect(codes).toContain('unknown-connector');
    expect(codes).toContain('missing-capability');
  });

  it('flags tools not in allowedToolNames', () => {
    const probe = buildProbe([
      { id: 'figma',  status: 'connected', allowedToolNames: ['figma_get_node'] },
      { id: 'notion', status: 'connected', allowedToolNames: [] },
      { id: 'slack',  status: 'connected', allowedToolNames: [] },
    ]);
    const manifest = baseManifest();
    const issues = validateConnectorRefs(manifest, probe);
    const unknownTool = issues.find((i) => i.code === 'unknown-tool');
    expect(unknownTool?.connectorId).toBe('figma');
    expect(unknownTool?.tools).toContain('figma_get_file');
  });
});

describe('checkConnectorTokenIssuance', () => {
  const snap = { capabilitiesGranted: ['connector:figma'] };
  it('trusted plugins implicitly carry connector:*', () => {
    expect(checkConnectorTokenIssuance({ snapshot: { capabilitiesGranted: [] }, trust: 'trusted', connectorId: 'figma' }))
      .toEqual({ ok: true });
  });
  it('restricted plugins must list each id', () => {
    expect(checkConnectorTokenIssuance({ snapshot: snap, trust: 'restricted', connectorId: 'figma' }))
      .toEqual({ ok: true });
    const reject = checkConnectorTokenIssuance({ snapshot: snap, trust: 'restricted', connectorId: 'notion' });
    expect(reject.ok).toBe(false);
  });
});
