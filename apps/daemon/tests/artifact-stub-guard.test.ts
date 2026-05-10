import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ArtifactRegressionError,
  DEFAULT_ARTIFACT_STUB_GUARD_CONFIG,
  classifyArtifactStubGuard,
  evaluateArtifactStubGuard,
  findPriorArtifactSiblings,
  readArtifactStubGuardConfigFromEnv,
  type ArtifactStubGuardConfig,
} from '../src/artifact-stub-guard.js';

function rejectingConfig(overrides: Partial<ArtifactStubGuardConfig> = {}): ArtifactStubGuardConfig {
  return { ...DEFAULT_ARTIFACT_STUB_GUARD_CONFIG, mode: 'reject', ...overrides };
}

function warningConfig(overrides: Partial<ArtifactStubGuardConfig> = {}): ArtifactStubGuardConfig {
  return { ...DEFAULT_ARTIFACT_STUB_GUARD_CONFIG, mode: 'warn', ...overrides };
}

describe('classifyArtifactStubGuard', () => {
  it('passes when no priors exist', () => {
    const result = classifyArtifactStubGuard([], 'dashboard', 80, rejectingConfig());
    expect(result.outcome).toBe('pass');
    expect(result.warning).toBeUndefined();
  });

  it('passes when guard mode is off', () => {
    const result = classifyArtifactStubGuard(
      [{ name: 'dashboard.html', size: 80_000 }],
      'dashboard',
      120,
      { ...DEFAULT_ARTIFACT_STUB_GUARD_CONFIG, mode: 'off' },
    );
    expect(result.outcome).toBe('pass');
  });

  it('passes when identifier is empty', () => {
    const result = classifyArtifactStubGuard(
      [{ name: 'dashboard.html', size: 80_000 }],
      '',
      120,
      rejectingConfig(),
    );
    expect(result.outcome).toBe('pass');
  });

  it('passes when largest prior is below the floor', () => {
    const result = classifyArtifactStubGuard(
      [{ name: 'dashboard.html', size: 1_024 }],
      'dashboard',
      32,
      rejectingConfig({ minPriorBytes: 4_096 }),
    );
    expect(result.outcome).toBe('pass');
  });

  it('passes when the new body keeps at least minRetainedRatio of the prior', () => {
    const result = classifyArtifactStubGuard(
      [{ name: 'dashboard.html', size: 80_000 }],
      'dashboard',
      40_000,
      rejectingConfig({ minRetainedRatio: 0.2 }),
    );
    expect(result.outcome).toBe('pass');
  });

  it('rejects when the new body collapses below the ratio of the largest prior', () => {
    const result = classifyArtifactStubGuard(
      [
        { name: 'dashboard.html', size: 80_000 },
        { name: 'dashboard-2.html', size: 95_000 },
      ],
      'dashboard',
      120,
      rejectingConfig({ minRetainedRatio: 0.2, minPriorBytes: 4_096 }),
    );
    expect(result.outcome).toBe('reject');
    expect(result.warning).toMatchObject({
      code: 'ARTIFACT_REGRESSION',
      identifier: 'dashboard',
      newSize: 120,
      priorSize: 95_000,
      priorName: 'dashboard-2.html',
    });
    expect(result.warning?.message).toContain('dashboard-2.html');
  });

  it('warns instead of rejecting when mode is warn', () => {
    const result = classifyArtifactStubGuard(
      [{ name: 'report.html', size: 50_000 }],
      'report',
      300,
      warningConfig(),
    );
    expect(result.outcome).toBe('warn');
    expect(result.warning?.priorSize).toBe(50_000);
  });
});

describe('findPriorArtifactSiblings', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  async function makeDir() {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-stub-guard-'));
    tempDirs.push(dir);
    return dir;
  }

  it('finds bare and suffixed siblings, including the same-named target if it exists', async () => {
    const dir = await makeDir();
    await writeFile(path.join(dir, 'report.html'), 'a'.repeat(20_000));
    await writeFile(path.join(dir, 'report-2.html'), 'b'.repeat(40_000));
    await writeFile(path.join(dir, 'report-3.html'), 'c'.repeat(60_000));
    await writeFile(path.join(dir, 'unrelated.html'), 'x'.repeat(50_000));
    await writeFile(path.join(dir, 'report-2.html.artifact.json'), '{}');

    // The target 'report-3.html' is included because it currently exists on
    // disk and its current size is the prior content (the overwrite that
    // would replace it has not happened yet at scan time). This is the
    // same-name-overwrite case: see lefarcen P1.
    const priors = await findPriorArtifactSiblings(dir, 'report');
    const names = priors.map((p) => p.name).sort();
    expect(names).toEqual(['report-2.html', 'report-3.html', 'report.html']);
  });

  it('returns an empty list when the directory does not exist', async () => {
    const priors = await findPriorArtifactSiblings('/nonexistent/od/projects/missing', 'dashboard');
    expect(priors).toEqual([]);
  });

  it('does not match identifiers that share a prefix', async () => {
    const dir = await makeDir();
    await writeFile(path.join(dir, 'landing.html'), 'a'.repeat(1_000));
    await writeFile(path.join(dir, 'landing-page.html'), 'b'.repeat(1_000));

    const priors = await findPriorArtifactSiblings(dir, 'landing');
    const names = priors.map((p) => p.name).sort();
    expect(names).toEqual(['landing.html']);
  });

  it('also matches .htm siblings', async () => {
    const dir = await makeDir();
    await writeFile(path.join(dir, 'overview-doc.htm'), 'a'.repeat(20_000));
    await writeFile(path.join(dir, 'overview-doc-2.html'), 'b'.repeat(30_000));

    const priors = await findPriorArtifactSiblings(dir, 'overview-doc');
    const names = priors.map((p) => p.name).sort();
    expect(names).toEqual(['overview-doc-2.html', 'overview-doc.htm']);
  });

  it('matches siblings using the slugified form of a non-slug identifier', async () => {
    const dir = await makeDir();
    // Frontend persistArtifact slugifies "Landing Page" -> "landing-page"
    // for the filename but keeps the raw "Landing Page" in the manifest.
    // Both forms must find the same prior sibling on disk.
    await writeFile(path.join(dir, 'landing-page.html'), 'a'.repeat(40_000));

    const priors = await findPriorArtifactSiblings(dir, 'Landing Page');
    expect(priors.map((p) => p.name)).toEqual(['landing-page.html']);
  });
});

describe('evaluateArtifactStubGuard (integration with disk scan)', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  async function makeDir() {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-stub-guard-eval-'));
    tempDirs.push(dir);
    return dir;
  }

  it('rejects a stub-sized rewrite of an existing identifier', async () => {
    const dir = await makeDir();
    await writeFile(path.join(dir, 'presentation.html'), 'p'.repeat(60_000));

    const result = await evaluateArtifactStubGuard({
      scanDir: dir,
      identifier: 'presentation',
      newSize: 200,
      config: rejectingConfig(),
    });

    expect(result.outcome).toBe('reject');
    expect(result.warning?.priorName).toBe('presentation.html');
  });

  it('passes when the new body comparable in size to the prior', async () => {
    const dir = await makeDir();
    await writeFile(path.join(dir, 'presentation.html'), 'p'.repeat(60_000));

    const result = await evaluateArtifactStubGuard({
      scanDir: dir,
      identifier: 'presentation',
      newSize: 50_000,
      config: rejectingConfig(),
    });

    expect(result.outcome).toBe('pass');
  });
});

describe('readArtifactStubGuardConfigFromEnv', () => {
  it('returns defaults when env vars are absent', () => {
    const config = readArtifactStubGuardConfigFromEnv({});
    expect(config).toEqual(DEFAULT_ARTIFACT_STUB_GUARD_CONFIG);
  });

  it('parses recognised mode values', () => {
    expect(readArtifactStubGuardConfigFromEnv({ OD_ARTIFACT_STUB_GUARD: 'reject' }).mode).toBe('reject');
    expect(readArtifactStubGuardConfigFromEnv({ OD_ARTIFACT_STUB_GUARD: 'WARN' }).mode).toBe('warn');
    expect(readArtifactStubGuardConfigFromEnv({ OD_ARTIFACT_STUB_GUARD: 'off' }).mode).toBe('off');
  });

  it('falls back to default when mode is unrecognised', () => {
    expect(readArtifactStubGuardConfigFromEnv({ OD_ARTIFACT_STUB_GUARD: 'maybe' }).mode).toBe(
      DEFAULT_ARTIFACT_STUB_GUARD_CONFIG.mode,
    );
  });

  it('honours numeric overrides within range', () => {
    const config = readArtifactStubGuardConfigFromEnv({
      OD_ARTIFACT_STUB_GUARD_MIN_RATIO: '0.35',
      OD_ARTIFACT_STUB_GUARD_MIN_PRIOR_BYTES: '8192',
    });
    expect(config.minRetainedRatio).toBeCloseTo(0.35);
    expect(config.minPriorBytes).toBe(8_192);
  });

  it('accepts ratio = 1 to reject any shrinkage', () => {
    const config = readArtifactStubGuardConfigFromEnv({
      OD_ARTIFACT_STUB_GUARD_MIN_RATIO: '1',
    });
    expect(config.minRetainedRatio).toBe(1);
  });

  it('rejects out-of-range numeric overrides', () => {
    const config = readArtifactStubGuardConfigFromEnv({
      OD_ARTIFACT_STUB_GUARD_MIN_RATIO: '5',
      OD_ARTIFACT_STUB_GUARD_MIN_PRIOR_BYTES: '-12',
    });
    expect(config.minRetainedRatio).toBe(DEFAULT_ARTIFACT_STUB_GUARD_CONFIG.minRetainedRatio);
    expect(config.minPriorBytes).toBe(DEFAULT_ARTIFACT_STUB_GUARD_CONFIG.minPriorBytes);
  });
});

describe('ArtifactRegressionError', () => {
  it('carries identifier, sizes, and prior name in details', () => {
    const err = new ArtifactRegressionError('regression', {
      identifier: 'dashboard',
      newSize: 100,
      priorSize: 50_000,
      priorName: 'dashboard.html',
    });
    expect(err.code).toBe('ARTIFACT_REGRESSION');
    expect(err.name).toBe('ArtifactRegressionError');
    expect(err.identifier).toBe('dashboard');
    expect(err.newSize).toBe(100);
    expect(err.priorSize).toBe(50_000);
    expect(err.priorName).toBe('dashboard.html');
  });
});
