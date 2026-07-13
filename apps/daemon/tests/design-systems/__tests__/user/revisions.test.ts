import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cleanProjectIdForMetadata,
  normalizeArtifactMode,
  readUserMetadata,
} from '../../../../src/design-systems/core/metadata.js';
import {
  normalizeRevisionFileChanges,
  parseDesignSystemRevision,
  sanitizeRevisionId,
  writeTextFilesAtomically,
  writeUserMetadata,
} from '../../../../src/design-systems/user/revisions.js';
import type { UserDesignSystemMetadata } from '../../../../src/design-systems/core/types.js';

// ── pure unit ────────────────────────────────────────────────────────────────

describe('cleanProjectIdForMetadata', () => {
  it('accepts valid project IDs', () => {
    expect(cleanProjectIdForMetadata('proj-123')).toBe('proj-123');
    expect(cleanProjectIdForMetadata('my.project_v2:beta')).toBe('my.project_v2:beta');
    expect(cleanProjectIdForMetadata('  spaced  ')).toBe('spaced');
  });

  it('rejects invalid inputs', () => {
    expect(cleanProjectIdForMetadata('')).toBeNull();
    expect(cleanProjectIdForMetadata(42)).toBeNull();
    expect(cleanProjectIdForMetadata('.')).toBeNull();
    expect(cleanProjectIdForMetadata('..')).toBeNull();
    expect(cleanProjectIdForMetadata('has space')).toBeNull();
    expect(cleanProjectIdForMetadata('has/slash')).toBeNull();
    expect(cleanProjectIdForMetadata('a'.repeat(161))).toBeNull();
  });

  it('accepts IDs up to 160 characters', () => {
    expect(cleanProjectIdForMetadata('a'.repeat(160))).toBe('a'.repeat(160));
  });
});

describe('normalizeArtifactMode', () => {
  it('returns valid modes unchanged', () => {
    expect(normalizeArtifactMode('generated')).toBe('generated');
    expect(normalizeArtifactMode('agent-managed')).toBe('agent-managed');
  });

  it('returns undefined for unrecognised values', () => {
    expect(normalizeArtifactMode('manual')).toBeUndefined();
    expect(normalizeArtifactMode(null)).toBeUndefined();
    expect(normalizeArtifactMode(42)).toBeUndefined();
  });
});

describe('sanitizeRevisionId', () => {
  it('accepts alphanumeric-hyphen IDs', () => {
    expect(sanitizeRevisionId('abc-123')).toBe('abc-123');
    expect(sanitizeRevisionId('  trimmed  ')).toBe('trimmed');
  });

  it('rejects IDs with invalid characters', () => {
    expect(sanitizeRevisionId('under_score')).toBeNull();
    expect(sanitizeRevisionId('has.dot')).toBeNull();
    expect(sanitizeRevisionId('')).toBeNull();
    expect(sanitizeRevisionId(undefined)).toBeNull();
  });
});

describe('parseDesignSystemRevision', () => {
  const validRaw = {
    id: 'rev-001',
    status: 'pending',
    feedback: 'Some feedback',
    baseBody: '# Base\n\nBase body.',
    proposedBody: '# Proposed\n\nProposed body.',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
  };

  it('parses a valid revision', () => {
    const result = parseDesignSystemRevision(validRaw, 'my-ds');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('rev-001');
    expect(result?.designSystemId).toBe('my-ds');
    expect(result?.status).toBe('pending');
  });

  it('defaults status to pending for unknown values', () => {
    const result = parseDesignSystemRevision({ ...validRaw, status: 'unknown' }, 'ds');
    expect(result?.status).toBe('pending');
  });

  it('returns null when required fields are missing', () => {
    expect(parseDesignSystemRevision({ ...validRaw, id: '' }, 'ds')).toBeNull();
    expect(parseDesignSystemRevision({ ...validRaw, feedback: '' }, 'ds')).toBeNull();
    expect(parseDesignSystemRevision({ ...validRaw, baseBody: '' }, 'ds')).toBeNull();
    expect(parseDesignSystemRevision({ ...validRaw, proposedBody: '' }, 'ds')).toBeNull();
    expect(parseDesignSystemRevision(null, 'ds')).toBeNull();
    expect(parseDesignSystemRevision([], 'ds')).toBeNull();
  });

  it('binds the caller-supplied designSystemId', () => {
    const result = parseDesignSystemRevision(validRaw, 'overridden-id');
    expect(result?.designSystemId).toBe('overridden-id');
  });
});

describe('normalizeRevisionFileChanges', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizeRevisionFileChanges(null)).toEqual([]);
    expect(normalizeRevisionFileChanges('string')).toEqual([]);
  });

  it('filters out entries with invalid paths', () => {
    const raw = [
      { path: '../escape', baseContent: '', proposedContent: '' },
      { path: 'valid/file.css', baseContent: 'old', proposedContent: 'new' },
    ];
    const result = normalizeRevisionFileChanges(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe('valid/file.css');
  });

  it('deduplicates by path', () => {
    const raw = [
      { path: 'tokens.css', baseContent: 'a', proposedContent: 'b' },
      { path: 'tokens.css', baseContent: 'c', proposedContent: 'd' },
    ];
    const result = normalizeRevisionFileChanges(raw);
    expect(result).toHaveLength(1);
  });

  it('drops entries exceeding 200 KB', () => {
    const big = 'x'.repeat(200 * 1024 + 1);
    const raw = [{ path: 'large.css', baseContent: '', proposedContent: big }];
    const result = normalizeRevisionFileChanges(raw);
    expect(result).toHaveLength(0);
  });
});

// ── filesystem integration ───────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `od-revisions-test-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('readUserMetadata / writeUserMetadata', () => {
  it('round-trips a metadata object', async () => {
    const id = 'my-ds';
    const dsDir = path.join(tmpDir, id);
    await mkdir(dsDir);

    const metadata: UserDesignSystemMetadata = {
      title: 'My DS',
      category: 'Custom',
      surface: 'web',
      status: 'draft',
      artifactMode: 'generated',
    };

    await writeUserMetadata(tmpDir, id, metadata);
    const read = await readUserMetadata(tmpDir, id);

    expect(read.title).toBe('My DS');
    expect(read.category).toBe('Custom');
    expect(read.surface).toBe('web');
    expect(read.status).toBe('draft');
    expect(read.artifactMode).toBe('generated');
  });

  it('returns empty object when the file is missing', async () => {
    await mkdir(path.join(tmpDir, 'ghost-ds'));
    expect(await readUserMetadata(tmpDir, 'ghost-ds')).toEqual({});
  });

  it('returns empty object for corrupt JSON', async () => {
    const dsDir = path.join(tmpDir, 'bad-ds');
    await mkdir(dsDir);
    await writeFile(path.join(dsDir, 'metadata.json'), 'not json', 'utf8');
    expect(await readUserMetadata(tmpDir, 'bad-ds')).toEqual({});
  });

  it('strips unknown/invalid fields from stored metadata', async () => {
    const dsDir = path.join(tmpDir, 'strip-ds');
    await mkdir(dsDir);
    const raw = { title: 'Valid', surface: 'invalid-surface', status: 'draft' };
    await writeFile(path.join(dsDir, 'metadata.json'), JSON.stringify(raw), 'utf8');

    const read = await readUserMetadata(tmpDir, 'strip-ds');
    expect(read.title).toBe('Valid');
    expect(read.status).toBe('draft');
    expect(read.surface).toBeUndefined();
  });
});

describe('writeTextFilesAtomically', () => {
  it('writes multiple files in one call', async () => {
    await writeTextFilesAtomically(tmpDir, [
      { targetPath: path.join(tmpDir, 'a', 'tokens.css'), content: ':root { --color: red; }' },
      { targetPath: path.join(tmpDir, 'b', 'index.html'), content: '<!DOCTYPE html>' },
    ]);

    const a = await readFile(path.join(tmpDir, 'a', 'tokens.css'), 'utf8');
    const b = await readFile(path.join(tmpDir, 'b', 'index.html'), 'utf8');
    expect(a).toBe(':root { --color: red; }');
    expect(b).toBe('<!DOCTYPE html>');
  });

  it('overwrites existing files', async () => {
    await mkdir(path.join(tmpDir, 'c'), { recursive: true });
    await writeFile(path.join(tmpDir, 'c', 'file.txt'), 'old', 'utf8');

    await writeTextFilesAtomically(tmpDir, [
      { targetPath: path.join(tmpDir, 'c', 'file.txt'), content: 'new' },
    ]);

    const content = await readFile(path.join(tmpDir, 'c', 'file.txt'), 'utf8');
    expect(content).toBe('new');
  });
});
