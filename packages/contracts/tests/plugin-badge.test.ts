import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { PluginManifestSchema } from '../src/plugins/manifest.js';

const base = {
  $schema: 'x', specVersion: '1.0.0', name: 'example-x', version: '0.1.0',
  description: 'd', license: 'MIT',
};

describe('od.badge', () => {
  it('parses a valid badge', () => {
    const r = PluginManifestSchema.safeParse({
      ...base, od: { kind: 'scenario', badge: { label: 'In-App Message', tone: 'pink' } },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.od?.badge).toEqual({ label: 'In-App Message', tone: 'pink' });
  });

  it('allows badge without tone', () => {
    const r = PluginManifestSchema.safeParse({ ...base, od: { badge: { label: 'X' } } });
    expect(r.success).toBe(true);
  });

  it('rejects an out-of-enum tone', () => {
    const r = PluginManifestSchema.safeParse({ ...base, od: { badge: { label: 'X', tone: 'chartreuse' } } });
    expect(r.success).toBe(false);
  });

  it('rejects a label longer than 40 chars', () => {
    const r = PluginManifestSchema.safeParse({ ...base, od: { badge: { label: 'x'.repeat(41) } } });
    expect(r.success).toBe(false);
  });

  it('rejects an empty label', () => {
    const r = PluginManifestSchema.safeParse({ ...base, od: { badge: { label: '' } } });
    expect(r.success).toBe(false);
  });
});

it('braze-iam manifest declares the In-App Message badge', () => {
  const path = fileURLToPath(new URL(
    '../../../plugins/_official/examples/braze-iam/open-design.json', import.meta.url));
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const r = PluginManifestSchema.safeParse(manifest);
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.od?.badge).toEqual({ label: 'In-App Message', tone: 'pink' });
});
