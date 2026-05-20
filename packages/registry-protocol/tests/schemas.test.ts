import { describe, expect, it } from 'vitest';
import {
  RegistryDoctorIssueSchema,
  RegistryDoctorReportSchema,
  RegistryEntrySchema,
  RegistrySearchQuerySchema,
  RegistrySignatureSchema,
  RegistryVersionSchema,
  RegistryYankOutcomeSchema,
  ResolvedRegistryEntrySchema,
} from '../src/index.js';

const entry = RegistryEntrySchema.parse({
  name: 'vendor/example',
  version: '1.0.0',
  source: 'github:vendor/example@v1.0.0/plugin',
});

describe('RegistrySearchQuerySchema', () => {
  it('defaults query to empty string when omitted', () => {
    const parsed = RegistrySearchQuerySchema.parse({});
    expect(parsed.query).toBe('');
  });

  it('accepts limit at the positive integer boundary', () => {
    expect(RegistrySearchQuerySchema.parse({ query: 'x', limit: 1 }).limit).toBe(1);
    expect(RegistrySearchQuerySchema.parse({ query: 'x', limit: 500 }).limit).toBe(500);
  });

  it('rejects limit outside positive integer bounds', () => {
    expect(() => RegistrySearchQuerySchema.parse({ query: 'x', limit: 0 })).toThrow();
    expect(() => RegistrySearchQuerySchema.parse({ query: 'x', limit: -1 })).toThrow();
    expect(() => RegistrySearchQuerySchema.parse({ query: 'x', limit: 501 })).toThrow();
    expect(() => RegistrySearchQuerySchema.parse({ query: 'x', limit: 1.5 })).toThrow();
  });
});

describe('RegistryVersionSchema', () => {
  it('treats deprecated, yanked, and yankReason as optional', () => {
    const minimal = RegistryVersionSchema.parse({ version: '1.0.0' });
    expect(minimal.deprecated).toBeUndefined();
    expect(minimal.yanked).toBeUndefined();
    expect(minimal.yankReason).toBeUndefined();
  });

  it('accepts boolean and string forms of deprecated', () => {
    expect(RegistryVersionSchema.parse({ version: '1.0.0', deprecated: true }).deprecated).toBe(true);
    expect(RegistryVersionSchema.parse({ version: '1.0.0', deprecated: 'use 2.x' }).deprecated).toBe('use 2.x');
  });

  it('captures yank metadata when present', () => {
    const parsed = RegistryVersionSchema.parse({
      version: '1.0.0',
      yanked: true,
      yankedAt: '2024-01-01T00:00:00Z',
      yankReason: 'security advisory',
    });
    expect(parsed.yanked).toBe(true);
    expect(parsed.yankReason).toBe('security advisory');
  });
});

describe('RegistrySignatureSchema', () => {
  it('requires a non-empty signature and a known kind', () => {
    expect(() => RegistrySignatureSchema.parse({ kind: 'github-oidc', signature: '' })).toThrow();
    expect(() => RegistrySignatureSchema.parse({ kind: 'unknown', signature: 'sha256-x' })).toThrow();
    expect(RegistrySignatureSchema.parse({ kind: 'cosign', signature: 'sha256-x' }).kind).toBe('cosign');
  });
});

describe('RegistryYankOutcomeSchema', () => {
  it('defaults warnings to an empty array on success', () => {
    const outcome = RegistryYankOutcomeSchema.parse({
      ok: true,
      name: 'vendor/example',
      version: '1.0.0',
      reason: 'security',
    });
    expect(outcome.warnings).toEqual([]);
  });

  it('rejects empty required identity fields', () => {
    expect(() =>
      RegistryYankOutcomeSchema.parse({ ok: false, name: '', version: '1.0.0', reason: 'x' }),
    ).toThrow();
    expect(() =>
      RegistryYankOutcomeSchema.parse({ ok: false, name: 'vendor/example', version: '1.0.0', reason: '' }),
    ).toThrow();
  });
});

describe('RegistryDoctorReportSchema', () => {
  it('restricts issue severity to error, warning, or info', () => {
    expect(() => RegistryDoctorIssueSchema.parse({ severity: 'fatal', code: 'x', message: 'y' })).toThrow();
    expect(RegistryDoctorIssueSchema.parse({ severity: 'warning', code: 'x', message: 'y' }).severity).toBe('warning');
  });

  it('requires an issues array even when empty', () => {
    const report = RegistryDoctorReportSchema.parse({
      ok: true,
      backendId: 'fixture',
      checkedAt: 123,
      entriesChecked: 0,
      issues: [],
    });
    expect(report.issues).toEqual([]);
    expect(() =>
      RegistryDoctorReportSchema.parse({ ok: true, backendId: 'fixture', checkedAt: 123, entriesChecked: 0 }),
    ).toThrow();
  });
});

describe('ResolvedRegistryEntrySchema', () => {
  it('binds an entry to a backend identity with a chosen version', () => {
    const resolved = ResolvedRegistryEntrySchema.parse({
      backendId: 'fixture',
      backendKind: 'local',
      trust: 'restricted',
      entry,
      version: { version: entry.version, source: entry.source },
      source: entry.source,
    });
    expect(resolved.backendKind).toBe('local');
    expect(resolved.entry.name).toBe('vendor/example');
    expect(resolved.version.version).toBe('1.0.0');
  });

  it('rejects unknown backend kind and trust values', () => {
    const base = {
      backendId: 'fixture',
      entry,
      version: { version: entry.version, source: entry.source },
      source: entry.source,
    };
    expect(() => ResolvedRegistryEntrySchema.parse({ ...base, backendKind: 'svn', trust: 'restricted' })).toThrow();
    expect(() => ResolvedRegistryEntrySchema.parse({ ...base, backendKind: 'local', trust: 'unknown' })).toThrow();
  });
});
