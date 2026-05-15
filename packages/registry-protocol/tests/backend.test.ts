import { describe, expect, it } from 'vitest';
import {
  RegistryEntrySchema,
  RegistryPublishOutcomeSchema,
  type RegistryBackend,
} from '../src/index.js';

const entry = RegistryEntrySchema.parse({
  name: 'vendor/example',
  version: '1.0.0',
  source: 'github:vendor/example@v1.0.0/plugin',
  title: 'Example',
  capabilitiesSummary: ['prompt:inject'],
});

describe('registry protocol', () => {
  it('requires stable vendor/plugin-name ids', () => {
    expect(() => RegistryEntrySchema.parse({ ...entry, name: 'example' })).toThrow();
    expect(RegistryEntrySchema.parse(entry).name).toBe('vendor/example');
  });

  it('accepts optional metrics and marketplace signatures for future hardening', () => {
    const parsed = RegistryEntrySchema.parse({
      ...entry,
      metrics: {
        downloads: 42,
        installs: 7,
      },
      signatures: [
        {
          kind: 'github-oidc',
          issuer: 'https://token.actions.githubusercontent.com',
          subject: 'repo:vendor/example:ref:refs/heads/main',
          signature: 'sha256-fixture',
        },
      ],
    });
    expect(parsed.metrics?.downloads).toBe(42);
    expect(parsed.signatures?.[0]?.kind).toBe('github-oidc');
  });

  it('keeps all backend implementations behind one async contract', async () => {
    const backend: RegistryBackend = {
      id: 'fixture',
      kind: 'local',
      trust: 'restricted',
      async list() {
        return [entry];
      },
      async search(query) {
        return query.query === 'Example'
          ? [{ entry, score: 1, matched: ['title'] }]
          : [];
      },
      async resolve(name) {
        if (name !== entry.name) return null;
        return {
          backendId: this.id,
          backendKind: this.kind,
          trust: this.trust,
          entry,
          version: { version: entry.version, source: entry.source },
          source: entry.source,
        };
      },
      async manifest(name) {
        return name === entry.name ? entry : null;
      },
      async doctor() {
        return {
          ok: true,
          backendId: this.id,
          checkedAt: 123,
          entriesChecked: 1,
          issues: [],
        };
      },
      async publish(request) {
        return RegistryPublishOutcomeSchema.parse({
          ok: true,
          dryRun: request.dryRun,
          changedFiles: [`plugins/${request.entry.name}/versions/${request.entry.version}.json`],
          warnings: [],
        });
      },
    };

    await expect(backend.list()).resolves.toHaveLength(1);
    await expect(backend.search({ query: 'Example' })).resolves.toHaveLength(1);
    await expect(backend.resolve('vendor/example')).resolves.toMatchObject({
      backendId: 'fixture',
      source: entry.source,
    });
    await expect(backend.doctor()).resolves.toMatchObject({ ok: true, entriesChecked: 1 });
    await expect(backend.publish?.({ entry, dryRun: true })).resolves.toMatchObject({
      ok: true,
      dryRun: true,
    });
  });
});
