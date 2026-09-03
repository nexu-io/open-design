import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DELIVERABLE_SYNTAX_REPAIR_SCHEMA } from '@open-design/contracts';
import {
  buildHostManagedSyntaxRepairInvocation,
  unexpectedHostSyntaxRepairPaths,
} from '../../src/artifacts/deliverable-syntax-host-repair.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('buildHostManagedSyntaxRepairInvocation', () => {
  it('renders only deterministic diagnostics and a bounded local source window', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-host-syntax-repair-'));
    roots.push(root);
    await fs.writeFile(
      path.join(root, 'index.html'),
      Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join('\n'),
      'utf8',
    );

    const invocation = await buildHostManagedSyntaxRepairInvocation({
      projectRoot: root,
      result: {
        checker: 'web-syntax@1',
        status: 'repairable',
        candidateHash: 'sha256:broken',
        checkedFiles: ['index.html'],
        diagnostics: [{
          code: 'JS_UNEXPECTED_TOKEN',
          file: 'index.html',
          line: 50,
          column: 7,
          message: 'Unexpected token.',
          source: 'inline_script',
        }],
      },
      repairState: {
        schema: DELIVERABLE_SYNTAX_REPAIR_SCHEMA,
        attempt: 1,
        maxAttempts: 3,
        checker: 'web-syntax@1',
        candidateHash: 'sha256:broken',
      },
    });

    expect(invocation.expectedCandidateHash).toBe('sha256:broken');
    expect(invocation.prompt).toContain('candidate_hash="sha256:broken"');
    expect(invocation.prompt).toContain('index.html:50:7');
    expect(invocation.prompt).toContain('<file path="index.html" lines="30-70">');
    expect(invocation.prompt).toContain('50 | line 50');
    expect(invocation.prompt).not.toContain('1 | line 1');
    expect(invocation.prompt).toContain('The host will re-check');
    expect(invocation.prompt).not.toContain('deliverable-syntax check');
  });

  it('does not read a diagnostic path that escapes the project root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-host-syntax-repair-'));
    roots.push(root);

    const invocation = await buildHostManagedSyntaxRepairInvocation({
      projectRoot: root,
      result: {
        checker: 'web-syntax@1',
        status: 'repairable',
        candidateHash: 'sha256:outside',
        checkedFiles: [],
        diagnostics: [{
          code: 'JS_UNEXPECTED_TOKEN',
          file: '../secret.js',
          line: 1,
          column: 1,
          message: 'Unexpected token.',
          source: 'file',
        }],
      },
      repairState: {
        schema: DELIVERABLE_SYNTAX_REPAIR_SCHEMA,
        attempt: 1,
        maxAttempts: 3,
        checker: 'web-syntax@1',
        candidateHash: 'sha256:outside',
      },
    });

    expect(invocation.prompt).toContain('../secret.js:1:1');
    expect(invocation.prompt).not.toContain('<local_context>');
  });
});

describe('unexpectedHostSyntaxRepairPaths', () => {
  it('rejects writes outside the diagnostic file set', () => {
    expect(unexpectedHostSyntaxRepairPaths({
      touchedPaths: ['index.html', 'styles.css'],
      allowedPaths: ['index.html'],
    })).toEqual(['styles.css']);
  });

  it('normalizes platform separators before comparing paths', () => {
    expect(unexpectedHostSyntaxRepairPaths({
      touchedPaths: ['src\\app.js'],
      allowedPaths: ['src/app.js'],
    })).toEqual([]);
  });
});
