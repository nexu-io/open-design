// Plan §3.A3 / spec §9: connector tool-token capability gate.
//
// Token-level §5.3 enforcement (no SQLite reads needed at execute time):
//
//   1. Non-plugin runs: grant has no plugin context; gate is bypassed.
//   2. Trusted plugins: implicit `connector:*`; any connector id passes.
//   3. Restricted plugins: must list `connector:<id>` in
//      pluginCapabilitiesGranted; otherwise the call is rejected so a
//      replayed token can't reach a connector that was never granted.

import { describe, expect, it } from 'vitest';
import {
  checkConnectorAccess,
  ToolTokenRegistry,
  type ToolTokenGrant,
} from '../src/tool-tokens.js';

function mintGrant(registry: ToolTokenRegistry, overrides: Partial<{
  pluginSnapshotId: string;
  pluginTrust: 'trusted' | 'restricted' | 'bundled';
  pluginCapabilitiesGranted: string[];
}> = {}): ToolTokenGrant {
  return registry.mint({
    runId:     'run-1',
    projectId: 'project-1',
    ...overrides,
  });
}

describe('checkConnectorAccess', () => {
  it('lets non-plugin runs through (no snapshot id on the grant)', () => {
    const registry = new ToolTokenRegistry();
    const grant = mintGrant(registry);
    expect(checkConnectorAccess(grant, 'slack')).toEqual({ ok: true });
  });

  it('lets trusted plugins through (implicit connector:*)', () => {
    const registry = new ToolTokenRegistry();
    const grant = mintGrant(registry, {
      pluginSnapshotId: 'snap-1',
      pluginTrust: 'trusted',
      pluginCapabilitiesGranted: ['prompt:inject'],
    });
    expect(checkConnectorAccess(grant, 'slack')).toEqual({ ok: true });
  });

  it('rejects restricted plugins missing connector:<id>', () => {
    const registry = new ToolTokenRegistry();
    const grant = mintGrant(registry, {
      pluginSnapshotId: 'snap-2',
      pluginTrust: 'restricted',
      pluginCapabilitiesGranted: ['prompt:inject', 'fs:read'],
    });
    const result = checkConnectorAccess(grant, 'slack');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/connector:slack/);
    }
  });

  it('accepts restricted plugins with the explicit connector:<id> grant', () => {
    const registry = new ToolTokenRegistry();
    const grant = mintGrant(registry, {
      pluginSnapshotId: 'snap-3',
      pluginTrust: 'restricted',
      pluginCapabilitiesGranted: ['prompt:inject', 'connector:notion'],
    });
    expect(checkConnectorAccess(grant, 'notion')).toEqual({ ok: true });
    expect(checkConnectorAccess(grant, 'slack').ok).toBe(false);
  });

  it('accepts the coarse `connector` grant for any id', () => {
    const registry = new ToolTokenRegistry();
    const grant = mintGrant(registry, {
      pluginSnapshotId: 'snap-4',
      pluginTrust: 'restricted',
      pluginCapabilitiesGranted: ['prompt:inject', 'connector'],
    });
    expect(checkConnectorAccess(grant, 'slack')).toEqual({ ok: true });
    expect(checkConnectorAccess(grant, 'notion')).toEqual({ ok: true });
  });
});
