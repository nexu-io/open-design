import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkDeliverableSyntax } from '../../src/artifacts/deliverable-syntax.js';

const temporaryRoots: string[] = [];

async function projectFixture(files: Record<string, string>): Promise<string> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-deliverable-syntax-'));
  temporaryRoots.push(projectRoot);
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(projectRoot, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('deliverable syntax checker', () => {
  it('skips a non-Web canonical deliverable even when invalid TypeScript was touched', async () => {
    const projectRoot = await projectFixture({
      'report.pdf': 'not-really-a-pdf',
      'tools/broken.ts': 'const value: = ;',
    });

    await expect(checkDeliverableSyntax({
      projectRoot,
      entryFile: 'report.pdf',
      relatedPaths: ['tools/broken.ts'],
    })).resolves.toEqual({
      checker: 'web-syntax@1',
      status: 'skipped',
      reason: 'non_web_deliverable',
      candidateHash: null,
      checkedFiles: [],
      diagnostics: [],
    });
  });

  it('passes valid HTML and code while producing an order-independent content hash', async () => {
    const projectRoot = await projectFixture({
      'index.html': `<!doctype html>
<body>
  <script type="module">const answer = 42;</script>
</body>`,
      'scripts/app.js': 'export const ready = true;',
      'scripts/card.tsx': 'export const Card = ({ title }: { title: string }) => <article>{title}</article>;',
    });

    const first = await checkDeliverableSyntax({
      projectRoot,
      entryFile: 'index.html',
      relatedPaths: ['scripts/card.tsx', 'scripts/app.js'],
    });
    const second = await checkDeliverableSyntax({
      projectRoot,
      entryFile: 'index.html',
      relatedPaths: ['scripts/app.js', 'scripts/card.tsx', 'scripts/app.js'],
    });

    expect(first).toMatchObject({
      checker: 'web-syntax@1',
      status: 'pass',
      checkedFiles: ['index.html', 'scripts/app.js', 'scripts/card.tsx'],
      diagnostics: [],
    });
    expect(first.candidateHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(second.candidateHash).toBe(first.candidateHash);

    await fs.writeFile(
      path.join(projectRoot, 'scripts/card.tsx'),
      'export const Card = ({ title }: { title: string }) => <section>{title}</section>;',
      'utf8',
    );
    const changed = await checkDeliverableSyntax({
      projectRoot,
      entryFile: 'index.html',
      relatedPaths: ['scripts/app.js', 'scripts/card.tsx'],
    });
    expect(changed.candidateHash).not.toBe(first.candidateHash);
  });

  it('returns an actionable file, line and column for invalid inline JavaScript', async () => {
    const projectRoot = await projectFixture({
      'index.html': `<!doctype html>
<body>
<script>
const broken = ;
</script>
</body>`,
    });

    const result = await checkDeliverableSyntax({ projectRoot, entryFile: 'index.html' });

    expect(result.status).toBe('repairable');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'JS_UNEXPECTED_TOKEN',
        file: 'index.html',
        line: 4,
        column: 16,
        source: 'inline_script',
      }),
    ]);
  });

  it('checks related JavaScript by extension instead of ProjectFile.kind', async () => {
    const projectRoot = await projectFixture({
      'index.html': '<!doctype html><script src="scripts/app.jsx"></script>',
      'scripts/app.jsx': 'export const App = () => <main>broken</main;',
    });

    const result = await checkDeliverableSyntax({
      projectRoot,
      entryFile: 'index.html',
      relatedPaths: [path.join(projectRoot, 'scripts/app.jsx')],
    });

    expect(result.status).toBe('repairable');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'JS_UNEXPECTED_TOKEN',
        file: 'scripts/app.jsx',
        line: 1,
        source: 'file',
      }),
    ]);
  });

  it('checks a canonical TypeScript deliverable without requiring an HTML wrapper', async () => {
    const projectRoot = await projectFixture({
      'src/main.ts': 'export const count: number = ;',
    });

    const result = await checkDeliverableSyntax({
      projectRoot,
      entryFile: 'src/main.ts',
    });

    expect(result.status).toBe('repairable');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'JS_UNEXPECTED_TOKEN',
        file: 'src/main.ts',
        line: 1,
        source: 'file',
      }),
    ]);
  });

  it('accepts JSX in text/babel and TypeScript JSX in related files', async () => {
    const projectRoot = await projectFixture({
      'index.html': '<!doctype html><script type="text/babel">const App = () => <main>Ready</main>;</script>',
      'src/main.tsx': 'const count: number = 1; export const View = () => <p>{count}</p>;',
    });

    await expect(checkDeliverableSyntax({
      projectRoot,
      entryFile: 'index.html',
      relatedPaths: ['src/main.tsx'],
    })).resolves.toMatchObject({
      status: 'pass',
      checkedFiles: ['index.html', 'src/main.tsx'],
      diagnostics: [],
    });
  });

  it('ignores data scripts and remote script sources', async () => {
    const projectRoot = await projectFixture({
      'index.html': `<!doctype html>
<script type="application/ld+json">{"not": valid json}</script>
<script src="https://cdn.example.test/app.js"></script>`,
    });

    await expect(checkDeliverableSyntax({
      projectRoot,
      entryFile: 'index.html',
    })).resolves.toMatchObject({
      status: 'pass',
      checkedFiles: ['index.html'],
      diagnostics: [],
    });
  });

  it('reports a truncated HTML tag as repairable', async () => {
    const projectRoot = await projectFixture({
      'index.html': '<!doctype html><main data-label="unterminated>',
    });

    const result = await checkDeliverableSyntax({ projectRoot, entryFile: 'index.html' });

    expect(result.status).toBe('repairable');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'HTML_EOF_IN_TAG',
        file: 'index.html',
        line: 1,
        source: 'html',
      }),
    ]);
  });

  it('returns incomplete without inventing a repair when a related source is unreadable', async () => {
    const projectRoot = await projectFixture({
      'index.html': '<!doctype html><main>Ready</main>',
    });

    const result = await checkDeliverableSyntax({
      projectRoot,
      entryFile: 'index.html',
      relatedPaths: ['src/missing.ts'],
    });

    expect(result).toMatchObject({
      checker: 'web-syntax@1',
      status: 'incomplete',
      reason: 'file_unreadable',
      checkedFiles: ['index.html'],
      diagnostics: [
        {
          code: 'FILE_UNREADABLE',
          file: 'src/missing.ts',
          line: null,
          column: null,
          message: 'Source file could not be read.',
          source: 'file',
        },
      ],
    });
    expect(result.candidateHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it('returns incomplete when an applicable candidate exceeds its configured size limit', async () => {
    const projectRoot = await projectFixture({
      'index.html': '<!doctype html><main>Ready</main>',
    });

    await expect(checkDeliverableSyntax({
      projectRoot,
      entryFile: 'index.html',
      limits: { maxBytesPerFile: 8 },
    })).resolves.toMatchObject({
      status: 'incomplete',
      reason: 'limit_exceeded',
      checkedFiles: [],
      diagnostics: [
        expect.objectContaining({
          code: 'FILE_TOO_LARGE',
          file: 'index.html',
        }),
      ],
    });
  });
});
