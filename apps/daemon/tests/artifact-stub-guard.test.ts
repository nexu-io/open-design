import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ArtifactRegressionError,
  DEFAULT_ARTIFACT_STUB_GUARD_CONFIG,
  artifactIdentifiersMatch,
  classifyArtifactStubGuard,
  evaluateArtifactStubGuard,
  findPriorArtifactSiblings,
  readArtifactStubGuardConfigFromEnv,
  type ArtifactStubGuardConfig,
} from '../src/artifact-stub-guard.js';

// Helper: write an artifact body + the sidecar manifest the production
// write path would produce. Sibling discovery requires the sidecar to
// verify the canonical identifier, so unit fixtures must include both.
async function writeArtifactPair(dir: string, name: string, body: string, identifier: string): Promise<void> {
  await writeFile(path.join(dir, name), body);
  const manifest = {
    version: 1,
    kind: 'html',
    title: identifier,
    entry: name,
    renderer: 'html',
    status: 'complete',
    exports: ['html'],
    metadata: { identifier, artifactType: 'text/html', inferred: false },
  };
  await writeFile(path.join(dir, `${name}.artifact.json`), JSON.stringify(manifest));
}

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
    await writeArtifactPair(dir, 'report.html', 'a'.repeat(20_000), 'report');
    await writeArtifactPair(dir, 'report-2.html', 'b'.repeat(40_000), 'report');
    await writeArtifactPair(dir, 'report-3.html', 'c'.repeat(60_000), 'report');
    await writeArtifactPair(dir, 'unrelated.html', 'x'.repeat(50_000), 'unrelated');

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
    await writeArtifactPair(dir, 'landing.html', 'a'.repeat(1_000), 'landing');
    await writeArtifactPair(dir, 'landing-page.html', 'b'.repeat(1_000), 'landing-page');

    const priors = await findPriorArtifactSiblings(dir, 'landing');
    const names = priors.map((p) => p.name).sort();
    expect(names).toEqual(['landing.html']);
  });

  it('also matches .htm siblings', async () => {
    const dir = await makeDir();
    await writeArtifactPair(dir, 'overview-doc.htm', 'a'.repeat(20_000), 'overview-doc');
    await writeArtifactPair(dir, 'overview-doc-2.html', 'b'.repeat(30_000), 'overview-doc');

    const priors = await findPriorArtifactSiblings(dir, 'overview-doc');
    const names = priors.map((p) => p.name).sort();
    expect(names).toEqual(['overview-doc-2.html', 'overview-doc.htm']);
  });

  it('matches siblings using the slugified form of a non-slug identifier', async () => {
    const dir = await makeDir();
    // Frontend persistArtifact slugifies "Landing Page" -> "landing-page"
    // for the filename but keeps the raw "Landing Page" in the manifest.
    // Both forms refer to the same lineage; sidecar identity uses
    // slug-equivalence to bridge them.
    await writeArtifactPair(dir, 'landing-page.html', 'a'.repeat(40_000), 'Landing Page');

    const priors = await findPriorArtifactSiblings(dir, 'Landing Page');
    expect(priors.map((p) => p.name)).toEqual(['landing-page.html']);
  });

  it('falls back to the "artifact" basename when the identifier slugifies to empty', async () => {
    const dir = await makeDir();
    // Identifier like "测试" (or any all-non-ASCII / punctuation-only
    // string) strips to "" through the web slugifier and persistArtifact's
    // `|| 'artifact'` fallback writes it as artifact.html / artifact-2.html.
    await writeArtifactPair(dir, 'artifact.html', 'a'.repeat(40_000), '测试');
    await writeArtifactPair(dir, 'artifact-2.html', 'b'.repeat(60_000), '测试');

    const priors = await findPriorArtifactSiblings(dir, '测试');
    const names = priors.map((p) => p.name).sort();
    expect(names).toEqual(['artifact-2.html', 'artifact.html']);
  });

  it('does NOT match a fallback sibling whose sidecar identifier differs (lefarcen/mrcfps round 4)', async () => {
    const dir = await makeDir();
    // Two distinct empty-slug identifiers both land in the artifact*.html
    // namespace. A new save for "首页" must not be compared against the
    // earlier "测试" sibling — they're unrelated artifacts that just
    // happen to share a fallback basename.
    await writeArtifactPair(dir, 'artifact.html', 'a'.repeat(40_000), '测试');

    const priors = await findPriorArtifactSiblings(dir, '首页');
    expect(priors).toEqual([]);
  });

  it('skips files without a sidecar (likely not artifact-tag-authored)', async () => {
    const dir = await makeDir();
    // Bare HTML file with no .artifact.json — could be a paste-text upload
    // or a hand-edited file. Without sidecar provenance the guard can't
    // verify the identifier, so we treat it as not-a-prior to avoid
    // false-positive rejections.
    await writeFile(path.join(dir, 'dashboard.html'), 'a'.repeat(40_000));

    const priors = await findPriorArtifactSiblings(dir, 'dashboard');
    expect(priors).toEqual([]);
  });
});

describe('artifactIdentifiersMatch', () => {
  it('matches identical raw identifiers', () => {
    expect(artifactIdentifiersMatch('dashboard', 'dashboard')).toBe(true);
  });

  it('matches via slug-equivalence for non-empty slugs', () => {
    expect(artifactIdentifiersMatch('Landing Page', 'landing-page')).toBe(true);
    expect(artifactIdentifiersMatch('Landing Page', 'LANDING-PAGE')).toBe(true);
  });

  it('does not match distinct identifiers that both slugify to empty', () => {
    expect(artifactIdentifiersMatch('测试', '首页')).toBe(false);
    expect(artifactIdentifiersMatch('!!!', '???')).toBe(false);
  });

  it('matches a non-ASCII identifier with itself even when its slug is empty', () => {
    expect(artifactIdentifiersMatch('测试', '测试')).toBe(true);
  });

  it('does not match unrelated identifiers with different slugs', () => {
    expect(artifactIdentifiersMatch('dashboard', 'legacy-dashboard')).toBe(false);
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
    await writeArtifactPair(dir, 'presentation.html', 'p'.repeat(60_000), 'presentation');

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
    await writeArtifactPair(dir, 'presentation.html', 'p'.repeat(60_000), 'presentation');

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
