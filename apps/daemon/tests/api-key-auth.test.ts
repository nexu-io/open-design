// Spec 112 — unit tests for the api-key-auth middleware utilities.
// Caller: vitest test runner. No file I/O. Env vars restored in afterEach.

import { afterEach, describe, expect, it } from 'vitest';
import {
  readApiKeysFromEnv,
  resolveTenantFromHostHeader,
} from '../src/middleware/api-key-auth.js';

describe('resolveTenantFromHostHeader', () => {
  const originalSuffix = process.env['OPENDESIGN_HOST_SUFFIX'];
  afterEach(() => {
    if (originalSuffix == null) {
      delete process.env['OPENDESIGN_HOST_SUFFIX'];
    } else {
      process.env['OPENDESIGN_HOST_SUFFIX'] = originalSuffix;
    }
  });

  it('extracts the slug from a production-shaped host', () => {
    expect(
      resolveTenantFromHostHeader('ceremonia.opendesign.holalumina.com'),
    ).toBe('ceremonia');
  });

  it('rejects hosts that do not match the suffix', () => {
    expect(resolveTenantFromHostHeader('ceremonia.example.com')).toBeNull();
  });

  it('rejects multi-label slugs', () => {
    expect(
      resolveTenantFromHostHeader('foo.bar.opendesign.holalumina.com'),
    ).toBeNull();
  });

  it('strips port numbers', () => {
    process.env['OPENDESIGN_HOST_SUFFIX'] = '.opendesign.localhost';
    expect(
      resolveTenantFromHostHeader('ceremonia.opendesign.localhost:7456'),
    ).toBe('ceremonia');
  });

  it('lowercases the host', () => {
    expect(
      resolveTenantFromHostHeader('Ceremonia.OpenDesign.HolaLumina.com'),
    ).toBe('ceremonia');
  });

  it('rejects slugs with dots', () => {
    process.env['OPENDESIGN_HOST_SUFFIX'] = '.opendesign.example';
    expect(resolveTenantFromHostHeader('a.b.opendesign.example')).toBeNull();
  });

  it('rejects empty/missing host', () => {
    expect(resolveTenantFromHostHeader(undefined)).toBeNull();
    expect(resolveTenantFromHostHeader('')).toBeNull();
  });

  it('rejects slugs with disallowed characters', () => {
    expect(
      resolveTenantFromHostHeader('CER_EM!.opendesign.holalumina.com'),
    ).toBeNull();
  });
});

describe('readApiKeysFromEnv', () => {
  const originalRaw = process.env['OPENDESIGN_API_KEYS'];
  afterEach(() => {
    if (originalRaw == null) {
      delete process.env['OPENDESIGN_API_KEYS'];
    } else {
      process.env['OPENDESIGN_API_KEYS'] = originalRaw;
    }
  });

  it('returns empty map when env unset', () => {
    delete process.env['OPENDESIGN_API_KEYS'];
    expect(readApiKeysFromEnv()).toEqual({});
  });

  it('parses a JSON map', () => {
    process.env['OPENDESIGN_API_KEYS'] = JSON.stringify({
      ceremonia: 'k1',
      lumina: 'k2',
    });
    expect(readApiKeysFromEnv()).toEqual({ ceremonia: 'k1', lumina: 'k2' });
  });

  it('throws on malformed JSON', () => {
    process.env['OPENDESIGN_API_KEYS'] = 'not_json';
    expect(() => readApiKeysFromEnv()).toThrow(/not valid JSON/);
  });

  it('throws when value is not a JSON object', () => {
    process.env['OPENDESIGN_API_KEYS'] = '"some_string"';
    expect(() => readApiKeysFromEnv()).toThrow(/JSON object/);
  });

  it('throws when a value is not a non-empty string', () => {
    process.env['OPENDESIGN_API_KEYS'] = JSON.stringify({ ceremonia: '' });
    expect(() => readApiKeysFromEnv()).toThrow(/non-empty string/);
  });
});
