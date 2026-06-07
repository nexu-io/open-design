import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prepareDesignTokenContractRebuild } from '../src/design-token-contract-rebuild.js';

describe('prepareDesignTokenContractRebuild', () => {
  let root: string;
  let systemDir: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-token-rebuild-'));
    systemDir = path.join(root, 'imported-system');
    await mkdir(path.join(systemDir, 'source'), { recursive: true });
    await writeFile(path.join(systemDir, 'DESIGN.md'), '# Imported System\n\n> Category: Imported\n', 'utf8');
    await writeFile(
      path.join(systemDir, 'manifest.json'),
      `${JSON.stringify({
        schemaVersion: 'od-design-system-project/v1',
        id: 'imported-system',
        name: 'Imported System',
        category: 'Imported',
        files: {
          design: 'DESIGN.md',
          tokens: 'tokens.css',
          components: 'components.html',
        },
        sourceFiles: {
          evidence: 'source/evidence.md',
          tokens: 'source/tokens.source.json',
          report: 'source/token-contract.report.json',
        },
      }, null, 2)}\n`,
      'utf8',
    );
    await writeFile(path.join(systemDir, 'source', 'evidence.md'), '# Evidence\n\n- CSS variables: 2\n', 'utf8');
    await writeFile(path.join(systemDir, 'source', 'tokens.source.json'), '{"tokens":[]}\n', 'utf8');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('prepares a review revision when the token report is weak', async () => {
    await writeReport({
      summary: {
        score: 38,
        grade: 'needs-rebuild',
        recommendRebuild: true,
        sourceBackedA1: 1,
        requiredA1: 6,
        fallbackTokens: 30,
        declaredTokens: 50,
      },
      selfCheck: { ok: true, errors: [], warnings: [] },
      tokens: [
        {
          name: '--accent',
          layer: 'A1-identity',
          confidence: 'low',
          reason: 'No source-backed A1 value found.',
          sources: [],
        },
      ],
    });

    const prepared = await prepareDesignTokenContractRebuild(root, 'user:imported-system', {
      now: new Date('2026-05-21T12:00:00.000Z'),
    });

    expect(prepared.decision).toMatchObject({
      available: true,
      recommended: true,
      grade: 'needs-rebuild',
      reportPath: 'source/token-contract.report.json',
    });
    expect(prepared.decision.triggers.join('\n')).toContain('quality report recommends rebuild');
    expect(prepared.revision?.sectionTitle).toBe('Token Contract');
    expect(prepared.revision?.proposedBody).toContain('## Token Contract Rebuild Review');
    expect(prepared.revision?.fileChanges[0]).toMatchObject({
      path: 'source/token-contract.rebuild-request.md',
    });
  });

  it('does not prepare a revision when the report is usable unless forced', async () => {
    await writeReport({
      summary: {
        score: 82,
        grade: 'excellent',
        recommendRebuild: false,
        sourceBackedA1: 6,
        requiredA1: 6,
        fallbackTokens: 4,
        declaredTokens: 50,
      },
      selfCheck: { ok: true, errors: [], warnings: [] },
      tokens: [],
    });

    const skipped = await prepareDesignTokenContractRebuild(root, 'imported-system');
    expect(skipped.decision).toMatchObject({
      available: true,
      recommended: false,
      forced: false,
    });
    expect(skipped.revision).toBeUndefined();

    const forced = await prepareDesignTokenContractRebuild(root, 'imported-system', { force: true });
    expect(forced.decision).toMatchObject({
      available: true,
      recommended: false,
      forced: true,
    });
    expect(forced.revision?.feedback).toContain('Forced rebuild');
  });

  async function writeReport(report: Record<string, unknown>) {
    await writeFile(
      path.join(systemDir, 'source', 'token-contract.report.json'),
      `${JSON.stringify({ schemaVersion: 1, contract: 'TOKEN_SCHEMA', ...report }, null, 2)}\n`,
      'utf8',
    );
  }
});
