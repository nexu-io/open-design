import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createDesignSystemGenerationJobStore,
  type DesignSystemGenerationJob,
} from '../src/design-system-generation-jobs.js';
import {
  createUserDesignSystem,
  listUserDesignSystemRevisions,
  readDesignSystem,
  type UserDesignSystemInput,
  updateUserDesignSystemRevisionStatus,
} from '../src/design-systems.js';

describe('design system generation jobs', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-design-system-jobs-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates a pollable job that produces a user design system draft', async () => {
    const store = createDesignSystemGenerationJobStore({
      root,
      delayMs: 0,
      idFactory: () => 'job-1',
      collectSourceContext: async () => ({ github: [], notes: '' }),
    });

    const started = store.start({
      title: 'Acme Product',
      summary: 'Dense product UI.',
      category: 'Custom',
      status: 'draft',
      provenance: {
        companyBlurb: 'Acme builds dense product UI.',
        githubUrls: ['https://github.com/acme/product'],
      },
    });

    expect(started).toMatchObject({
      id: 'job-1',
      status: 'running',
      progress: 0,
    });

    const done = await waitForJob(store, 'job-1');

    expect(done).toMatchObject({
      id: 'job-1',
      status: 'succeeded',
      progress: 100,
      designSystemId: 'user:acme-product',
    });
    expect(done.steps.map((step) => step.status)).toEqual([
      'succeeded',
      'succeeded',
      'succeeded',
      'succeeded',
      'succeeded',
    ]);
    expect(done.steps.map((step) => step.message).join('\n')).toContain(
      '1 GitHub link(s)',
    );
  });

  it('merges collected source context into the generated draft', async () => {
    let capturedInput: UserDesignSystemInput | undefined;
    const store = createDesignSystemGenerationJobStore({
      root,
      delayMs: 0,
      idFactory: () => 'job-context',
      collectSourceContext: async () => ({
        github: [{
          url: 'https://github.com/acme/product',
          owner: 'acme',
          repo: 'product',
          description: 'Acme repository.',
        }],
        notes: 'Fetched GitHub context:\n- acme/product: README excerpt: Dense editor primitives.',
      }),
      createDesignSystem: async (targetRoot, input) => {
        capturedInput = input;
        return createUserDesignSystem(targetRoot, input);
      },
    });

    store.start({
      title: 'Context Product',
      sourceNotes: 'GitHub/code: https://github.com/acme/product',
      provenance: {
        githubUrls: ['https://github.com/acme/product'],
        sourceNotes: 'GitHub/code: https://github.com/acme/product',
      },
    });

    const done = await waitForJob(store, 'job-context');
    const body = await readDesignSystem(root, done.designSystemId ?? '', { idPrefix: 'user:' });

    expect(done.steps.find((step) => step.id === 'explore-resources')?.message).toContain('read 1 GitHub repo');
    expect(capturedInput?.sourceNotes).toContain('GitHub/code: https://github.com/acme/product');
    expect(capturedInput?.sourceNotes).toContain('Fetched GitHub context');
    expect(capturedInput?.provenance?.sourceNotes).toContain('Dense editor primitives');
    expect(capturedInput?.provenance?.sourceNotes).not.toContain('GitHub/code:');
    expect(body).toContain('Dense editor primitives');
  });

  it('exposes failed generation status when draft creation fails', async () => {
    const store = createDesignSystemGenerationJobStore({
      root,
      delayMs: 0,
      idFactory: () => 'job-fail',
      createDesignSystem: async () => {
        throw new Error('draft write failed');
      },
    });

    store.start({ title: 'Broken System' });

    const done = await waitForJob(store, 'job-fail');

    expect(done).toMatchObject({
      id: 'job-fail',
      status: 'failed',
      error: 'draft write failed',
    });
    expect(done.steps.find((step) => step.id === 'create-draft')?.status).toBe('failed');
  });

  it('runs a revision job against an existing user design system', async () => {
    const store = createDesignSystemGenerationJobStore({
      root,
      delayMs: 0,
      idFactory: () => 'revision-1',
    });
    const created = await createUserDesignSystem(root, {
      title: 'Revision Product',
      summary: 'Initial system.',
      status: 'draft',
    });

    const started = store.revise({
      designSystemId: created.id,
      sectionTitle: 'Visual Foundations',
      feedback: 'Make the palette warmer and reduce decorative effects.',
    });

    expect(started).toMatchObject({
      id: 'revision-1',
      kind: 'revision',
      designSystemId: created.id,
    });

    const done = await waitForJob(store, 'revision-1');
    const body = await readDesignSystem(root, created.id, { idPrefix: 'user:' });
    const revisions = await listUserDesignSystemRevisions(root, created.id);

    expect(done).toMatchObject({
      id: 'revision-1',
      status: 'succeeded',
      progress: 100,
      designSystemId: created.id,
      revisionId: expect.any(String),
    });
    expect(body).not.toContain('## Revision Request: Visual Foundations');
    expect(revisions?.[0]).toMatchObject({
      status: 'pending',
      feedback: 'Make the palette warmer and reduce decorative effects.',
      sectionTitle: 'Visual Foundations',
    });
    expect(revisions?.[0]?.proposedBody).toContain('## Revision Request: Visual Foundations');

    const accepted = await updateUserDesignSystemRevisionStatus(
      root,
      created.id,
      revisions?.[0]?.id ?? '',
      'accepted',
    );
    const acceptedBody = await readDesignSystem(root, created.id, { idPrefix: 'user:' });

    expect(accepted?.status).toBe('accepted');
    expect(acceptedBody).toContain('## Revision Request: Visual Foundations');
  });

  it('creates a review-gated token contract rebuild revision with file changes', async () => {
    const store = createDesignSystemGenerationJobStore({
      root,
      delayMs: 0,
      idFactory: () => 'token-rebuild-1',
    });
    const created = await createUserDesignSystem(root, {
      title: 'Token Product',
      summary: 'Initial system.',
      status: 'draft',
    });
    const baseBody = await readDesignSystem(root, created.id, { idPrefix: 'user:' });

    const started = store.rebuildTokenContract({
      designSystemId: created.id,
      decision: {
        designSystemId: created.id,
        available: true,
        recommended: true,
        forced: false,
        reason: 'Token contract rebuild recommended.',
        triggers: ['quality report recommends rebuild'],
        reportPath: 'source/token-contract.report.json',
        grade: 'needs-review',
        score: 42,
      },
      feedback: 'Rebuild TOKEN_SCHEMA slots from evidence.',
      sectionTitle: 'Token Contract',
      baseBody: baseBody ?? '',
      proposedBody: `${baseBody ?? ''}\n\n## Token Contract Rebuild Review\n\nPending.\n`,
      fileChanges: [{
        path: 'source/token-contract.rebuild-request.md',
        baseContent: '',
        proposedContent: '# Token Contract Rebuild Request\n',
      }],
    });

    expect(started).toMatchObject({
      id: 'token-rebuild-1',
      kind: 'token-contract-rebuild',
      designSystemId: created.id,
    });

    const done = await waitForJob(store, 'token-rebuild-1');
    const revisions = await listUserDesignSystemRevisions(root, created.id);
    expect(done).toMatchObject({
      status: 'succeeded',
      revisionId: expect.any(String),
    });
    expect(revisions?.[0]).toMatchObject({
      status: 'pending',
      sectionTitle: 'Token Contract',
      fileChanges: [
        expect.objectContaining({
          path: 'source/token-contract.rebuild-request.md',
        }),
      ],
    });

    await expect(readFile(path.join(root, 'token-product', 'source', 'token-contract.rebuild-request.md'), 'utf8'))
      .rejects.toThrow();
    const accepted = await updateUserDesignSystemRevisionStatus(
      root,
      created.id,
      revisions?.[0]?.id ?? '',
      'accepted',
    );
    expect(accepted?.status).toBe('accepted');
    await expect(readFile(path.join(root, 'token-product', 'source', 'token-contract.rebuild-request.md'), 'utf8'))
      .resolves.toContain('Token Contract Rebuild Request');
  });
});

async function waitForJob(
  store: ReturnType<typeof createDesignSystemGenerationJobStore>,
  id: string,
): Promise<DesignSystemGenerationJob> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const job = store.get(id);
    if (job && (job.status === 'succeeded' || job.status === 'failed')) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${id}`);
}
