import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DataPathError,
  assertWithinTenantDir,
  resolveDataDir,
} from '../src/data-paths.js';

describe('resolveDataDir', () => {
  const originalRoot = process.env.OD_DATA_ROOT;

  afterEach(() => {
    if (originalRoot === undefined) {
      delete process.env.OD_DATA_ROOT;
    } else {
      process.env.OD_DATA_ROOT = originalRoot;
    }
  });

  it('(a) returns absolute tenant-scoped path when OD_DATA_ROOT defaults to /', () => {
    delete process.env.OD_DATA_ROOT;
    const out = resolveDataDir(
      { tenant_id: 'ericedmeades', data_dir: '/data/ericedmeades' },
      'abc123',
    );
    expect(out).toBe('/data/ericedmeades/abc123');
  });

  it('(b) rejects projectId containing ".." with kind=traversal', () => {
    try {
      resolveDataDir({ tenant_id: 't', data_dir: '/data/t' }, '..');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataPathError);
      expect((err as DataPathError).kind).toBe('traversal');
    }
  });

  it('(b2) rejects projectId containing embedded ".." with kind=traversal', () => {
    try {
      resolveDataDir({ tenant_id: 't', data_dir: '/data/t' }, 'foo..bar');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataPathError);
      expect((err as DataPathError).kind).toBe('traversal');
    }
  });

  it('(c) rejects projectId containing "/" with kind=invalid_chars', () => {
    try {
      resolveDataDir({ tenant_id: 't', data_dir: '/data/t' }, 'foo/bar');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataPathError);
      expect((err as DataPathError).kind).toBe('invalid_chars');
    }
  });

  it('(c2) rejects projectId containing backslash with kind=invalid_chars', () => {
    try {
      resolveDataDir({ tenant_id: 't', data_dir: '/data/t' }, 'foo\\bar');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataPathError);
      expect((err as DataPathError).kind).toBe('invalid_chars');
    }
  });

  it('(d) rejects projectId containing null byte with kind=invalid_chars', () => {
    try {
      resolveDataDir({ tenant_id: 't', data_dir: '/data/t' }, 'foo\0bar');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataPathError);
      expect((err as DataPathError).kind).toBe('invalid_chars');
    }
  });

  it('(e) resolved path always startsWith ctx.data_dir + "/"', () => {
    delete process.env.OD_DATA_ROOT;
    const out = resolveDataDir(
      { tenant_id: 'eric', data_dir: '/data/eric' },
      'project1',
    );
    expect(out.startsWith('/data/eric/')).toBe(true);
    expect(out.startsWith('/data/ceremonia')).toBe(false);
  });

  it('(h) rejects empty projectId with kind=invalid_chars', () => {
    try {
      resolveDataDir({ tenant_id: 't', data_dir: '/data/t' }, '');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataPathError);
      expect((err as DataPathError).kind).toBe('invalid_chars');
    }
  });

  it('(i) accepts projectId of only dashes (matches alphanumeric+dash regex)', () => {
    delete process.env.OD_DATA_ROOT;
    const out = resolveDataDir(
      { tenant_id: 't', data_dir: '/data/t' },
      '---',
    );
    expect(out).toBe('/data/t/---');
  });

  it('(j) rejects projectId longer than 64 chars with kind=invalid_chars', () => {
    const long = 'a'.repeat(65);
    try {
      resolveDataDir({ tenant_id: 't', data_dir: '/data/t' }, long);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataPathError);
      expect((err as DataPathError).kind).toBe('invalid_chars');
    }
  });
});

describe('assertWithinTenantDir', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-paths-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('(f) throws cross_tenant when realPath is outside tenantDataDir', () => {
    const tenantDir = fs.realpathSync.native(
      fs.mkdirSync(path.join(tmpRoot, 'tenantA'), { recursive: true }) ??
        path.join(tmpRoot, 'tenantA'),
    );
    const otherDir = path.join(tmpRoot, 'tenantB', 'foo');
    fs.mkdirSync(otherDir, { recursive: true });
    const realOther = fs.realpathSync.native(otherDir);

    try {
      assertWithinTenantDir(realOther, tenantDir);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataPathError);
      expect((err as DataPathError).kind).toBe('cross_tenant');
    }
  });

  it('(g) rejects symlink that points outside tenantDataDir', () => {
    const tenantDirRaw = path.join(tmpRoot, 'tenantA');
    const outsideTarget = path.join(tmpRoot, 'outside');
    fs.mkdirSync(tenantDirRaw, { recursive: true });
    fs.mkdirSync(outsideTarget, { recursive: true });
    const tenantDir = fs.realpathSync.native(tenantDirRaw);

    const linkPath = path.join(tenantDirRaw, 'evil');
    fs.symlinkSync(outsideTarget, linkPath);

    const realLink = fs.realpathSync.native(linkPath);
    try {
      assertWithinTenantDir(realLink, tenantDir);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DataPathError);
      expect((err as DataPathError).kind).toBe('cross_tenant');
    }
  });

  it('(g2) accepts realPath inside tenantDataDir', () => {
    const tenantDirRaw = path.join(tmpRoot, 'tenantA');
    const insideDir = path.join(tenantDirRaw, 'project');
    fs.mkdirSync(insideDir, { recursive: true });
    const tenantDir = fs.realpathSync.native(tenantDirRaw);
    const real = fs.realpathSync.native(insideDir);
    expect(() => assertWithinTenantDir(real, tenantDir)).not.toThrow();
  });
});
