import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  classifyDesignSystemFile,
  collectDesignSystemFiles,
  fileExists,
  isAbsenceError,
  isSafeManifestPath,
  isTextDesignSystemPullFile,
  readFileOptional,
  readProjectManifest,
  sanitizeRelativeFilePath,
  stripPrefixAndValidateId,
} from '../../../../src/design-systems/core/file-utils.js';

// ── pure unit tests ──────────────────────────────────────────────────────────

describe('isAbsenceError', () => {
  it('returns true for ENOENT and ENOTDIR', () => {
    expect(isAbsenceError({ code: 'ENOENT' })).toBe(true);
    expect(isAbsenceError({ code: 'ENOTDIR' })).toBe(true);
  });

  it('returns false for other codes and non-objects', () => {
    expect(isAbsenceError({ code: 'EACCES' })).toBe(false);
    expect(isAbsenceError(null)).toBe(false);
    expect(isAbsenceError('ENOENT')).toBe(false);
    expect(isAbsenceError(undefined)).toBe(false);
  });
});

describe('isSafeManifestPath', () => {
  it('accepts normal relative paths', () => {
    expect(isSafeManifestPath('DESIGN.md')).toBe(true);
    expect(isSafeManifestPath('tokens/colors.css')).toBe(true);
    expect(isSafeManifestPath('ui_kits/app/index.html')).toBe(true);
  });

  it('rejects empty, absolute, and traversal paths', () => {
    expect(isSafeManifestPath('')).toBe(false);
    expect(isSafeManifestPath('   ')).toBe(false);
    expect(isSafeManifestPath('/etc/passwd')).toBe(false);
    expect(isSafeManifestPath('../sibling/file.txt')).toBe(false);
    expect(isSafeManifestPath('dir/../../escape')).toBe(false);
    expect(isSafeManifestPath('dir/./file')).toBe(false);
  });
});

describe('stripPrefixAndValidateId', () => {
  it('strips prefix and validates', () => {
    expect(stripPrefixAndValidateId('user:my-brand', 'user:')).toBe('my-brand');
    expect(stripPrefixAndValidateId('my-brand')).toBe('my-brand');
    expect(stripPrefixAndValidateId('hello_world.v2')).toBe('hello_world.v2');
  });

  it('returns null for bad inputs', () => {
    expect(stripPrefixAndValidateId('user:../escape', 'user:')).toBeNull();
    expect(stripPrefixAndValidateId('hello/world')).toBeNull();
    expect(stripPrefixAndValidateId('.')).toBeNull();
    expect(stripPrefixAndValidateId('..')).toBeNull();
    expect(stripPrefixAndValidateId('wrong:prefix', 'user:')).toBeNull();
    expect(stripPrefixAndValidateId('')).toBeNull();
    expect(stripPrefixAndValidateId('has space')).toBeNull();
  });
});

describe('sanitizeRelativeFilePath', () => {
  it('normalises valid paths', () => {
    expect(sanitizeRelativeFilePath('tokens/colors.css')).toBe('tokens/colors.css');
    expect(sanitizeRelativeFilePath('  file.html  ')).toBe('file.html');
    expect(sanitizeRelativeFilePath('a//b/./c')).toBe('a/b/c');
  });

  it('rejects traversal and absolute paths', () => {
    expect(sanitizeRelativeFilePath('../escape')).toBeNull();
    expect(sanitizeRelativeFilePath('/absolute')).toBeNull();
    expect(sanitizeRelativeFilePath('a/../../escape')).toBeNull();
    expect(sanitizeRelativeFilePath('')).toBeNull();
    expect(sanitizeRelativeFilePath('null\0byte')).toBeNull();
  });

  it('rejects the "." self-reference', () => {
    expect(sanitizeRelativeFilePath('.')).toBeNull();
  });
});

describe('classifyDesignSystemFile', () => {
  it('classifies by extension', () => {
    expect(classifyDesignSystemFile('index.html', false)).toBe('page');
    expect(classifyDesignSystemFile('tokens.css', false)).toBe('stylesheet');
    expect(classifyDesignSystemFile('DESIGN.md', false)).toBe('document');
    expect(classifyDesignSystemFile('data.json', false)).toBe('data');
    expect(classifyDesignSystemFile('logo.svg', false)).toBe('image');
    expect(classifyDesignSystemFile('photo.PNG', false)).toBe('image');
    expect(classifyDesignSystemFile('font.woff2', false)).toBe('asset');
  });

  it('returns folder for directories regardless of extension', () => {
    expect(classifyDesignSystemFile('preview.html', true)).toBe('folder');
  });
});

describe('isTextDesignSystemPullFile', () => {
  it('accepts text-based extensions', () => {
    for (const ext of ['.css', '.html', '.js', '.jsx', '.json', '.md', '.mjs', '.svg', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml']) {
      expect(isTextDesignSystemPullFile(`file${ext}`)).toBe(true);
    }
  });

  it('rejects binary extensions', () => {
    expect(isTextDesignSystemPullFile('image.png')).toBe(false);
    expect(isTextDesignSystemPullFile('font.woff2')).toBe(false);
    expect(isTextDesignSystemPullFile('archive.zip')).toBe(false);
  });
});

// ── filesystem integration tests ─────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await (async () => {
    const dir = path.join(os.tmpdir(), `od-file-utils-test-${Math.random().toString(36).slice(2)}`);
    await mkdir(dir, { recursive: true });
    return dir;
  })();
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('readFileOptional', () => {
  it('returns content for existing file', async () => {
    const file = path.join(tmpDir, 'hello.txt');
    await writeFile(file, 'world', 'utf8');
    expect(await readFileOptional(file)).toBe('world');
  });

  it('returns undefined for missing file', async () => {
    expect(await readFileOptional(path.join(tmpDir, 'nope.txt'))).toBeUndefined();
  });
});

describe('fileExists', () => {
  it('returns true for an existing file', async () => {
    const file = path.join(tmpDir, 'exists.txt');
    await writeFile(file, '', 'utf8');
    expect(await fileExists(file)).toBe(true);
  });

  it('returns false for a missing file', async () => {
    expect(await fileExists(path.join(tmpDir, 'ghost.txt'))).toBe(false);
  });

  it('returns false for a directory (not a file)', async () => {
    expect(await fileExists(tmpDir)).toBe(false);
  });
});

describe('collectDesignSystemFiles', () => {
  it('collects files excluding metadata.json and revisions at root', async () => {
    await writeFile(path.join(tmpDir, 'DESIGN.md'), '', 'utf8');
    await writeFile(path.join(tmpDir, 'metadata.json'), '{}', 'utf8');
    await mkdir(path.join(tmpDir, 'revisions'));
    await mkdir(path.join(tmpDir, 'preview'));
    await writeFile(path.join(tmpDir, 'preview', 'colors.html'), '', 'utf8');

    const files: Parameters<typeof collectDesignSystemFiles>[2] = [];
    await collectDesignSystemFiles(tmpDir, '', files);

    const paths = files.map((f) => f.path);
    expect(paths).toContain('DESIGN.md');
    expect(paths).toContain('preview');
    expect(paths).toContain('preview/colors.html');
    expect(paths).not.toContain('metadata.json');
    expect(paths).not.toContain('revisions');
  });

  it('skips hidden files', async () => {
    await writeFile(path.join(tmpDir, '.hidden'), '', 'utf8');
    await writeFile(path.join(tmpDir, 'visible.txt'), '', 'utf8');

    const files: Parameters<typeof collectDesignSystemFiles>[2] = [];
    await collectDesignSystemFiles(tmpDir, '', files);
    expect(files.map((f) => f.path)).not.toContain('.hidden');
    expect(files.map((f) => f.path)).toContain('visible.txt');
  });
});

describe('readProjectManifest', () => {
  const validManifest = {
    schemaVersion: 'od-design-system-project/v1',
    id: 'my-brand',
    name: 'My Brand',
    category: 'Custom',
    files: {
      design: 'DESIGN.md',
      tokens: 'tokens.css',
    },
  };

  it('returns parsed manifest for valid file', async () => {
    await writeFile(path.join(tmpDir, 'manifest.json'), JSON.stringify(validManifest), 'utf8');
    const result = await readProjectManifest(tmpDir, 'my-brand');
    expect(result?.id).toBe('my-brand');
    expect(result?.name).toBe('My Brand');
  });

  it('returns null when id mismatches', async () => {
    await writeFile(path.join(tmpDir, 'manifest.json'), JSON.stringify(validManifest), 'utf8');
    expect(await readProjectManifest(tmpDir, 'wrong-id')).toBeNull();
  });

  it('returns null when file is absent', async () => {
    expect(await readProjectManifest(tmpDir, 'my-brand')).toBeNull();
  });

  it('returns null when JSON is invalid', async () => {
    await writeFile(path.join(tmpDir, 'manifest.json'), 'not json', 'utf8');
    expect(await readProjectManifest(tmpDir, 'my-brand')).toBeNull();
  });

  it('returns null when required fields are missing', async () => {
    const bad = { ...validManifest, name: '' };
    await writeFile(path.join(tmpDir, 'manifest.json'), JSON.stringify(bad), 'utf8');
    expect(await readProjectManifest(tmpDir, 'my-brand')).toBeNull();
  });
});
