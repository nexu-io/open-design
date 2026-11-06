import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TOKEN_SCHEMA } from '@open-design/contracts/design-systems/token-schema';

import { startServer } from '../../src/server.js';

type ImportResponse = {
  designSystem: {
    id: string;
    title: string;
  };
  tokenContractRebuild?: {
    decision?: {
      recommended?: boolean;
      reason?: string;
      triggers?: string[];
    };
    job?: {
      id: string;
      kind?: string;
      status?: string;
      designSystemId?: string;
    };
  };
};

type GenerationJobResponse = {
  job: {
    id: string;
    kind?: string;
    status: string;
    designSystemId?: string;
    revisionId?: string;
  };
};

describe('design-system import token contract auto-rebuild route', () => {
  let server: http.Server;
  let baseUrl: string;
  const tempDirs: string[] = [];
  const importedDesignSystems: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(async () => {
    for (const id of importedDesignSystems.splice(0)) {
      await fetch(`${baseUrl}/api/design-systems/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Origin: baseUrl },
      }).catch(() => {});
    }
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('queues a token contract rebuild job when an imported report recommends rebuild', async () => {
    const sourceRoot = makeImportSource('auto-rebuild', ':root { --color-primary: #3366ff; }\n');

    const body = await importDesignSystem(sourceRoot);

    importedDesignSystems.push(body.designSystem.id);
    expect(body.tokenContractRebuild?.decision).toMatchObject({
      recommended: true,
    });
    expect(body.tokenContractRebuild?.decision?.triggers?.length).toBeGreaterThan(0);
    expect(body.tokenContractRebuild?.job).toMatchObject({
      kind: 'token-contract-rebuild',
      designSystemId: body.designSystem.id,
    });

    const job = await waitForGenerationJob(body.tokenContractRebuild?.job?.id ?? '');
    expect(job).toMatchObject({
      status: 'succeeded',
      kind: 'token-contract-rebuild',
      designSystemId: body.designSystem.id,
      revisionId: expect.any(String),
    });
  });

  it('returns a no-rebuild decision without a job when the imported report is excellent', async () => {
    const sourceRoot = makeImportSource('auto-rebuild-excellent', renderSchemaTokensCss());

    const body = await importDesignSystem(sourceRoot);

    importedDesignSystems.push(body.designSystem.id);
    expect(body.tokenContractRebuild?.decision).toMatchObject({
      recommended: false,
    });
    expect(body.tokenContractRebuild?.decision?.reason).toContain('no rebuild recommended');
    expect(body.tokenContractRebuild?.job).toBeUndefined();
  });

  async function importDesignSystem(sourceRoot: string): Promise<ImportResponse> {
    const res = await fetch(`${baseUrl}/api/design-systems/import/local`, {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ baseDir: sourceRoot }),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as ImportResponse;
  }

  async function waitForGenerationJob(jobId: string): Promise<GenerationJobResponse['job']> {
    expect(jobId).toBeTruthy();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const res = await fetch(`${baseUrl}/api/design-systems/generation-jobs/${encodeURIComponent(jobId)}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as GenerationJobResponse;
      if (body.job.status === 'succeeded' || body.job.status === 'failed') return body.job;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for design system generation job ${jobId}`);
  }

  function makeImportSource(namePrefix: string, tokensCss: string): string {
    const sourceRoot = mkdtempSync(path.join(tmpdir(), `od-${namePrefix}-`));
    tempDirs.push(sourceRoot);
    const name = `${namePrefix}-${randomUUID().slice(0, 8)}`;
    mkdirSync(path.join(sourceRoot, 'src', 'styles'), { recursive: true });
    writeFileSync(
      path.join(sourceRoot, 'package.json'),
      JSON.stringify({
        name,
        description: 'Imported design system auto-rebuild fixture.',
      }),
    );
    writeFileSync(path.join(sourceRoot, 'README.md'), `# ${name}\n\nAuto-rebuild route fixture.\n`);
    writeFileSync(path.join(sourceRoot, 'src', 'styles', 'tokens.css'), tokensCss);
    return sourceRoot;
  }
});

function renderSchemaTokensCss(): string {
  const values = new Map<string, string>([
    ['--bg', '#f8fafc'],
    ['--surface', '#ffffff'],
    ['--fg', '#111827'],
    ['--muted', '#6b7280'],
    ['--border', '#d1d5db'],
    ['--accent', '#2563eb'],
    ['--font-display', 'Inter, ui-sans-serif, system-ui, sans-serif'],
    ['--font-body', 'Inter, ui-sans-serif, system-ui, sans-serif'],
    ['--text-xs', '0.75rem'],
    ['--text-sm', '0.875rem'],
    ['--text-base', '1rem'],
    ['--text-lg', '1.125rem'],
    ['--text-xl', '1.375rem'],
    ['--text-2xl', '1.75rem'],
    ['--text-3xl', '2.25rem'],
    ['--text-4xl', '3rem'],
    ['--leading-body', '1.55'],
    ['--leading-tight', '1.15'],
    ['--tracking-display', '0'],
    ['--section-y-desktop', '96px'],
    ['--section-y-tablet', '68px'],
    ['--section-y-phone', '48px'],
    ['--container-max', '1120px'],
    ['--container-gutter-desktop', '32px'],
    ['--container-gutter-tablet', '24px'],
    ['--container-gutter-phone', '16px'],
  ]);

  return [
    ':root {',
    ...TOKEN_SCHEMA.map((spec) => `  ${spec.name}: ${values.get(spec.name) ?? spec.fallback ?? spec.aliasTo ?? '#111827'};`),
    '}',
    '',
  ].join('\n');
}
