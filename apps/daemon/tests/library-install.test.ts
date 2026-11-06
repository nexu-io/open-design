import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  containsSymlink,
  sanitizeRepoName,
  GITHUB_URL_RE,
  SAFE_NAME_RE,
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

describe('containsSymlink', () => {
  // A freshly cloned third-party extension must not carry symlinks: the daemon's
  // design-system / skill readers follow them, so a committed `DESIGN.md ->
  // /etc/passwd` would exfiltrate arbitrary files. installFromGithub rejects a
  // clone when this returns true.
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-contains-symlink-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns false for a plain tree with files and nested directories', async () => {
    await writeFile(path.join(root, 'DESIGN.md'), '# ok');
    await mkdir(path.join(root, 'assets'), { recursive: true });
    await writeFile(path.join(root, 'assets', 'logo.svg'), '<svg/>');
    expect(await containsSymlink(root)).toBe(false);
  });

  it('detects a top-level symlink', async () => {
    await writeFile(path.join(root, 'secret-target'), 'x');
    await symlink(path.join(root, 'secret-target'), path.join(root, 'evil.md'));
    expect(await containsSymlink(root)).toBe(true);
  });

  it('detects a symlink nested in a subdirectory', async () => {
    await mkdir(path.join(root, 'a', 'b'), { recursive: true });
    await symlink('/etc/hostname', path.join(root, 'a', 'b', 'link.txt'));
    expect(await containsSymlink(root)).toBe(true);
  });

  it('detects a symlink that points at a directory without following it', async () => {
    // A symlinked dir must be flagged, not descended into (following it could
    // recurse outside the tree).
    const outside = await mkdtemp(path.join(tmpdir(), 'od-symlink-outside-'));
    try {
      await symlink(outside, path.join(root, 'linked-dir'));
      expect(await containsSymlink(root)).toBe(true);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('returns false for a missing directory', async () => {
    expect(await containsSymlink(path.join(root, 'does-not-exist'))).toBe(false);
  });
});
