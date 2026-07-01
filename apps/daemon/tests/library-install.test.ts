import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  sanitizeRepoName,
  GITHUB_URL_RE,
  SAFE_NAME_RE,
  installFromTarget,
} from '../src/library-install.js';

describe('sanitizeRepoName', () => {
  it('extracts repo name from a github URL', () => {
    expect(sanitizeRepoName('https://github.com/owner/repo')).toBe('repo');
  });

  it('strips a trailing .git suffix', () => {
    expect(sanitizeRepoName('https://github.com/owner/repo.git')).toBe('repo');
  });

  it('tolerates trailing slashes', () => {
    expect(sanitizeRepoName('https://github.com/owner/repo/')).toBe('repo');
    expect(sanitizeRepoName('https://github.com/owner/repo///')).toBe('repo');
  });

  it('keeps hyphens, dots, and underscores', () => {
    expect(sanitizeRepoName('https://github.com/owner/my-repo.v2_x')).toBe('my-repo.v2_x');
  });

  it('truncates to 64 characters', () => {
    const longName = 'a'.repeat(120);
    expect(sanitizeRepoName(`https://github.com/owner/${longName}`)).toBe('a'.repeat(64));
  });

  it('rejects names with forbidden characters via a generated fallback', () => {
    expect(sanitizeRepoName('https://github.com/owner/bad name')).toMatch(/^skill-\d+$/);
    expect(sanitizeRepoName('https://github.com/owner/bad$name')).toMatch(/^skill-\d+$/);
  });

  it('treats inner slashes as path separators and takes the last segment', () => {
    expect(sanitizeRepoName('https://github.com/owner/bad/name')).toBe('name');
  });

  it('rejects non-ASCII names', () => {
    expect(sanitizeRepoName('https://github.com/owner/测试')).toMatch(/^skill-\d+$/);
  });
});

describe('GITHUB_URL_RE', () => {
  it('accepts canonical owner/repo URLs', () => {
    expect(GITHUB_URL_RE.test('https://github.com/owner/repo')).toBe(true);
    expect(GITHUB_URL_RE.test('https://github.com/owner/repo/')).toBe(true);
    expect(GITHUB_URL_RE.test('https://github.com/owner/repo.git')).toBe(true);
    expect(GITHUB_URL_RE.test('https://github.com/my-org_1/my.repo-2')).toBe(true);
  });

  it('rejects non-https schemes', () => {
    expect(GITHUB_URL_RE.test('http://github.com/owner/repo')).toBe(false);
    expect(GITHUB_URL_RE.test('git@github.com:owner/repo.git')).toBe(false);
  });

  it('rejects non-github hosts', () => {
    expect(GITHUB_URL_RE.test('https://gitlab.com/owner/repo')).toBe(false);
    expect(GITHUB_URL_RE.test('https://example.com/owner/repo')).toBe(false);
  });

  it('rejects deeper paths and malformed inputs', () => {
    expect(GITHUB_URL_RE.test('https://github.com/owner')).toBe(false);
    expect(GITHUB_URL_RE.test('https://github.com/owner/repo/tree/main')).toBe(false);
    expect(GITHUB_URL_RE.test('https://github.com/owner/repo with space')).toBe(false);
    expect(GITHUB_URL_RE.test('')).toBe(false);
  });
});

describe('SAFE_NAME_RE', () => {
  it('accepts alphanumerics, dot, dash, underscore', () => {
    expect(SAFE_NAME_RE.test('repo')).toBe(true);
    expect(SAFE_NAME_RE.test('My-Repo_v2.0')).toBe(true);
  });

  it('rejects path separators', () => {
    expect(SAFE_NAME_RE.test('foo/bar')).toBe(false);
    expect(SAFE_NAME_RE.test('foo\\bar')).toBe(false);
  });

  it('rejects whitespace and non-ASCII characters', () => {
    expect(SAFE_NAME_RE.test('foo bar')).toBe(false);
    expect(SAFE_NAME_RE.test('测试')).toBe(false);
    expect(SAFE_NAME_RE.test('repo!')).toBe(false);
  });
});

describe('installFromTarget (local install copies instead of linking)', () => {
  it('installs a local design system as a real directory, not a junction', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-libinstall-'));
    try {
      const source = path.join(tmp, 'my-ds');
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(path.join(source, 'DESIGN.md'), '# My DS\n');
      const userDir = path.join(tmp, 'user-design-systems');
      fs.mkdirSync(userDir, { recursive: true });

      const res = await installFromTarget(
        { source: 'local', path: source },
        userDir,
        'design-system',
      );
      expect(res.ok).toBe(true);

      // The installed item must be a real directory (not a symlink/junction)
      // so the daemon's resolveSafeReal guard can read it inside a project.
      const dest = path.join(userDir, 'my-ds');
      expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false);
      expect(fs.lstatSync(dest).isDirectory()).toBe(true);
      expect(fs.readFileSync(path.join(dest, 'DESIGN.md'), 'utf8')).toBe('# My DS\n');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('dereferences symlinks inside the source so nothing resolves outside the copy', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-libinstall-'));
    try {
      const outside = path.join(tmp, 'outside');
      fs.mkdirSync(outside, { recursive: true });
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'linked\n');

      const source = path.join(tmp, 'ds-with-link');
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(path.join(source, 'DESIGN.md'), '# DS\n');

      let symlinkSupported = true;
      try {
        fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(source, 'linked.txt'));
      } catch {
        // Some environments (e.g. Windows without privilege) can't create
        // symlinks; the copy-not-link behavior is still covered by the test
        // above, so skip the dereference assertion here.
        symlinkSupported = false;
      }
      if (!symlinkSupported) return;

      const userDir = path.join(tmp, 'user');
      fs.mkdirSync(userDir, { recursive: true });
      const res = await installFromTarget(
        { source: 'local', path: source },
        userDir,
        'design-system',
      );
      expect(res.ok).toBe(true);

      const linked = path.join(userDir, 'ds-with-link', 'linked.txt');
      expect(fs.lstatSync(linked).isSymbolicLink()).toBe(false);
      expect(fs.readFileSync(linked, 'utf8')).toBe('linked\n');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects a local source without the expected manifest', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'od-libinstall-'));
    try {
      const source = path.join(tmp, 'no-manifest');
      fs.mkdirSync(source, { recursive: true });
      const userDir = path.join(tmp, 'user');
      fs.mkdirSync(userDir, { recursive: true });

      const res = await installFromTarget(
        { source: 'local', path: source },
        userDir,
        'design-system',
      );
      expect(res.ok).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
