import { randomUUID } from 'node:crypto';

import {
  createUserDesignSystemRevision,
  createUserDesignSystem,
  listUserDesignSystemFiles,
  readDesignSystem,
  type DesignSystemRevision,
  type DesignSystemRevisionFileChange,
  type DesignSystemSummary,
  type UserDesignSystemInput,
  type UserDesignSystemRevisionInput,
} from './design-systems.js';
import type { DesignSystemTokenContractRebuildDecision } from '@open-design/contracts';
import {
  collectDesignSystemSourceContext,
  mergeSourceContextIntoInput,
  type DesignSystemSourceContext,
} from './design-system-source-context.js';

export type DesignSystemGenerationJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed';

export type DesignSystemGenerationStepStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed';

export type DesignSystemGenerationStep = {
  id: string;
  title: string;
  status: DesignSystemGenerationStepStatus;
  message?: string;
  startedAt?: string;
  completedAt?: string;
};

export type DesignSystemGenerationJob = {
  id: string;
  kind?: 'generation' | 'revision' | 'token-contract-rebuild';
  status: DesignSystemGenerationJobStatus;
  progress: number;
  steps: DesignSystemGenerationStep[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  designSystemId?: string;
  revisionId?: string;
  error?: string;
  message?: string;
};

type MutableJob = DesignSystemGenerationJob;

type StoreOptions = {
  root: string;
  createDesignSystem?: (
    root: string,
    input: UserDesignSystemInput,
  ) => Promise<DesignSystemSummary>;
  readDesignSystem?: (root: string, id: string, options?: { idPrefix?: string }) => Promise<string | null>;
  createRevision?: (
    root: string,
    id: string,
    input: UserDesignSystemRevisionInput,
  ) => Promise<DesignSystemRevision | null>;
  collectSourceContext?: (input: UserDesignSystemInput) => Promise<DesignSystemSourceContext>;
  listFiles?: (root: string, id: string) => Promise<Array<{ path: string }> | null>;
  delayMs?: number;
  idFactory?: () => string;
};

const STEP_DEFS = [
  { id: 'explore-resources', title: 'Explore provided resources' },
  { id: 'create-draft', title: 'Create design system draft' },
  { id: 'generate-files', title: 'Generate preview cards and files' },
  { id: 'register-files', title: 'Register files for review' },
  { id: 'prepare-review', title: 'Prepare review workspace' },
] as const;

const REVISION_STEP_DEFS = [
  { id: 'read-draft', title: 'Read current draft' },
  { id: 'apply-feedback', title: 'Apply requested changes' },
  { id: 'create-revision', title: 'Create pending revision' },
  { id: 'prepare-review', title: 'Prepare updated review' },
] as const;

const TOKEN_CONTRACT_REBUILD_STEP_DEFS = [
  { id: 'read-token-report', title: 'Read token quality report' },
  { id: 'assess-evidence', title: 'Assess schema evidence' },
  { id: 'draft-contract-review', title: 'Draft contract rebuild review' },
  { id: 'create-revision', title: 'Create pending revision' },
  { id: 'prepare-review', title: 'Prepare token review' },
] as const;

export type DesignSystemRevisionInput = {
  designSystemId: string;
  feedback: string;
  sectionTitle?: string;
  body?: string;
};

export type DesignSystemTokenContractRebuildInput = {
  designSystemId: string;
  decision: DesignSystemTokenContractRebuildDecision;
  feedback: string;
  sectionTitle: string;
  baseBody: string;
  proposedBody: string;
  fileChanges?: DesignSystemRevisionFileChange[];
};

export function createDesignSystemGenerationJobStore(options: StoreOptions) {
  const jobs = new Map<string, MutableJob>();
  const createDesignSystem = options.createDesignSystem ?? createUserDesignSystem;
  const readExistingDesignSystem = options.readDesignSystem ?? readDesignSystem;
  const createRevision = options.createRevision ?? createUserDesignSystemRevision;
  const collectSourceContext = options.collectSourceContext ?? collectDesignSystemSourceContext;
  const listFiles = options.listFiles ?? listUserDesignSystemFiles;
  const delayMs = options.delayMs ?? 280;
  const idFactory = options.idFactory ?? randomUUID;

  function start(input: UserDesignSystemInput): DesignSystemGenerationJob {
    const now = new Date().toISOString();
    const job: MutableJob = {
      id: idFactory(),
      kind: 'generation',
      status: 'queued',
      progress: 0,
      steps: STEP_DEFS.map((step) => ({ ...step, status: 'pending' })),
      createdAt: now,
      updatedAt: now,
      message: 'Queued',
    };
    jobs.set(job.id, job);
    void run(job, input);
    return snapshot(job);
  }

  function revise(input: DesignSystemRevisionInput): DesignSystemGenerationJob {
    const now = new Date().toISOString();
    const job: MutableJob = {
      id: idFactory(),
      kind: 'revision',
      status: 'queued',
      progress: 0,
      steps: REVISION_STEP_DEFS.map((step) => ({ ...step, status: 'pending' })),
      createdAt: now,
      updatedAt: now,
      designSystemId: input.designSystemId,
      message: 'Queued revision',
    };
    jobs.set(job.id, job);
    void runRevision(job, input);
    return snapshot(job);
  }

  function rebuildTokenContract(input: DesignSystemTokenContractRebuildInput): DesignSystemGenerationJob {
    const now = new Date().toISOString();
    const job: MutableJob = {
      id: idFactory(),
      kind: 'token-contract-rebuild',
      status: 'queued',
      progress: 0,
      steps: TOKEN_CONTRACT_REBUILD_STEP_DEFS.map((step) => ({ ...step, status: 'pending' })),
      createdAt: now,
      updatedAt: now,
      designSystemId: input.designSystemId,
      message: 'Queued token contract rebuild',
    };
    jobs.set(job.id, job);
    void runTokenContractRebuild(job, input);
    return snapshot(job);
  }

  function get(id: string): DesignSystemGenerationJob | null {
    const job = jobs.get(id);
    return job ? snapshot(job) : null;
  }

  async function run(job: MutableJob, input: UserDesignSystemInput): Promise<void> {
    try {
      markJob(job, 'running', 'Starting generation');
      let created: DesignSystemSummary | null = null;
      let enrichedInput = input;
      await runStep(job, 'explore-resources', async () => {
        await sleep(delayMs);
        const sourceContext = await safeCollectSourceContext(collectSourceContext, input);
        enrichedInput = mergeSourceContextIntoInput(input, sourceContext);
        setStepMessage(job, 'explore-resources', sourceSummary(input, sourceContext));
      });
      await runStep(job, 'create-draft', async () => {
        created = await createDesignSystem(options.root, enrichedInput);
        job.designSystemId = created.id;
        setStepMessage(job, 'create-draft', `Created ${created.title}`);
      });
      await runStep(job, 'generate-files', async () => {
        await sleep(delayMs);
        setStepMessage(job, 'generate-files', 'Generated DESIGN.md, README.md, SKILL.md, tokens, previews, and context files');
      });
      await runStep(job, 'register-files', async () => {
        const designSystemId = created?.id;
        const files = designSystemId ? await listFiles(options.root, designSystemId) : [];
        setStepMessage(job, 'register-files', `Registered ${files?.length ?? 0} files`);
      });
      await runStep(job, 'prepare-review', async () => {
        await sleep(delayMs);
        setStepMessage(job, 'prepare-review', 'Review workspace is ready');
      });
      completeJob(job, 'succeeded', 'Design system ready for review');
    } catch (err) {
      failJob(job, err instanceof Error ? err.message : String(err));
    }
  }

  async function runRevision(job: MutableJob, input: DesignSystemRevisionInput): Promise<void> {
    try {
      markJob(job, 'running', 'Starting revision');
      const feedback = cleanFeedback(input.feedback);
      if (!feedback) throw new Error('Revision feedback is required');
      let body = input.body;
      let proposedBody = '';
      await runStep(job, 'read-draft', async () => {
        if (!body) {
          body = await readExistingDesignSystem(options.root, input.designSystemId, {
            idPrefix: 'user:',
          }) ?? undefined;
        }
        if (!body) throw new Error('Editable design system not found');
        setStepMessage(job, 'read-draft', `Loaded ${input.designSystemId}`);
      });
      await runStep(job, 'apply-feedback', async () => {
        await sleep(delayMs);
        proposedBody = applyRevisionToBody(body ?? '', {
          feedback,
          ...(input.sectionTitle ? { sectionTitle: input.sectionTitle } : {}),
        });
        setStepMessage(job, 'apply-feedback', input.sectionTitle ? `Updated ${input.sectionTitle}` : 'Updated DESIGN.md');
      });
      await runStep(job, 'create-revision', async () => {
        if (!body) throw new Error('Editable design system not found');
        const revision = await createRevision(options.root, input.designSystemId, {
          feedback,
          baseBody: body,
          proposedBody,
          ...(input.sectionTitle ? { sectionTitle: input.sectionTitle } : {}),
          jobId: job.id,
        });
        if (!revision) throw new Error('Could not create revision');
        job.revisionId = revision.id;
        setStepMessage(job, 'create-revision', `Created pending revision ${revision.id}`);
      });
      await runStep(job, 'prepare-review', async () => {
        await sleep(delayMs);
        setStepMessage(job, 'prepare-review', 'Updated review is ready');
      });
      completeJob(job, 'succeeded', 'Revision ready for review');
    } catch (err) {
      failJob(job, err instanceof Error ? err.message : String(err));
    }
  }

  async function runTokenContractRebuild(
    job: MutableJob,
    input: DesignSystemTokenContractRebuildInput,
  ): Promise<void> {
    try {
      markJob(job, 'running', 'Starting token contract rebuild');
      await runStep(job, 'read-token-report', async () => {
        await sleep(delayMs);
        setStepMessage(
          job,
          'read-token-report',
          `${input.decision.reportPath ?? 'source/token-contract.report.json'} (${input.decision.grade ?? 'unknown'} grade)`,
        );
      });
      await runStep(job, 'assess-evidence', async () => {
        await sleep(delayMs);
        const triggers = input.decision.triggers.length > 0
          ? input.decision.triggers.slice(0, 3).join('; ')
          : input.decision.forced
            ? 'Forced rebuild'
            : 'No quality trigger';
        setStepMessage(job, 'assess-evidence', triggers);
      });
      await runStep(job, 'draft-contract-review', async () => {
        await sleep(delayMs);
        const weakCount = input.decision.weakTokens?.length ?? 0;
        setStepMessage(job, 'draft-contract-review', `Prepared TOKEN_SCHEMA rebuild request (${weakCount} weak token(s))`);
      });
      await runStep(job, 'create-revision', async () => {
        const revision = await createRevision(options.root, input.designSystemId, {
          feedback: input.feedback,
          baseBody: input.baseBody,
          proposedBody: input.proposedBody,
          sectionTitle: input.sectionTitle,
          jobId: job.id,
          ...(input.fileChanges?.length ? { fileChanges: input.fileChanges } : {}),
        });
        if (!revision) throw new Error('Could not create token contract revision');
        job.revisionId = revision.id;
        setStepMessage(job, 'create-revision', `Created pending token revision ${revision.id}`);
      });
      await runStep(job, 'prepare-review', async () => {
        await sleep(delayMs);
        setStepMessage(job, 'prepare-review', 'Token contract rebuild is ready for review');
      });
      completeJob(job, 'succeeded', 'Token contract rebuild ready for review');
    } catch (err) {
      failJob(job, err instanceof Error ? err.message : String(err));
    }
  }

  return { start, revise, rebuildTokenContract, get };
}

async function runStep(
  job: MutableJob,
  stepId: string,
  task: () => Promise<void>,
): Promise<void> {
  const step = job.steps.find((candidate) => candidate.id === stepId);
  if (!step) throw new Error(`Unknown generation step: ${stepId}`);
  step.status = 'running';
  step.startedAt = new Date().toISOString();
  touch(job);
  try {
    await task();
    step.status = 'succeeded';
    step.completedAt = new Date().toISOString();
    job.progress = Math.round(
      (job.steps.filter((candidate) => candidate.status === 'succeeded').length / job.steps.length) * 100,
    );
    touch(job);
  } catch (err) {
    step.status = 'failed';
    step.completedAt = new Date().toISOString();
    step.message = err instanceof Error ? err.message : String(err);
    touch(job);
    throw err;
  }
}

function markJob(
  job: MutableJob,
  status: DesignSystemGenerationJobStatus,
  message: string,
): void {
  job.status = status;
  job.message = message;
  touch(job);
}

function completeJob(
  job: MutableJob,
  status: Extract<DesignSystemGenerationJobStatus, 'succeeded'>,
  message: string,
): void {
  job.status = status;
  job.progress = 100;
  job.message = message;
  job.completedAt = new Date().toISOString();
  touch(job);
}

function failJob(job: MutableJob, message: string): void {
  job.status = 'failed';
  job.error = message;
  job.message = 'Generation failed';
  job.completedAt = new Date().toISOString();
  touch(job);
}

function setStepMessage(job: MutableJob, stepId: string, message: string): void {
  const step = job.steps.find((candidate) => candidate.id === stepId);
  if (step) step.message = message;
  touch(job);
}

function touch(job: MutableJob): void {
  job.updatedAt = new Date().toISOString();
}

function snapshot(job: MutableJob): DesignSystemGenerationJob {
  return {
    ...job,
    steps: job.steps.map((step) => ({ ...step })),
  };
}

async function safeCollectSourceContext(
  collectSourceContext: (input: UserDesignSystemInput) => Promise<DesignSystemSourceContext>,
  input: UserDesignSystemInput,
): Promise<DesignSystemSourceContext> {
  try {
    return await collectSourceContext(input);
  } catch (err) {
    return {
      github: [],
      notes: `Source context fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function sourceSummary(input: UserDesignSystemInput, context?: DesignSystemSourceContext): string {
  const provenance = input.provenance;
  const counts = [
    provenance?.githubUrls?.length ? `${provenance.githubUrls.length} GitHub link(s)` : '',
    provenance?.localCodeFiles?.length ? `${provenance.localCodeFiles.length} local code reference(s)` : '',
    provenance?.figFiles?.length ? `${provenance.figFiles.length} Figma file(s)` : '',
    provenance?.assetFiles?.length ? `${provenance.assetFiles.length} asset(s)` : '',
  ].filter(Boolean);
  const base = counts.length > 0 ? counts.join(', ') : 'Using company context and notes';
  if (!context?.github.length) return base;
  const readable = context.github.filter((repo) => !repo.error).length;
  if (readable === 0) return `${base}; GitHub context unavailable`;
  return `${base}; read ${readable} GitHub repo(s)`;
}

function cleanFeedback(value: string): string {
  return value.trim().replace(/\n{3,}/g, '\n\n');
}

function applyRevisionToBody(
  body: string,
  input: { feedback: string; sectionTitle?: string },
): string {
  const section = input.sectionTitle?.trim();
  const title = section ? `Revision Request: ${section}` : 'Revision Request';
  const stamp = new Date().toISOString();
  return `${body.trim()}\n\n## ${title}\n\n${input.feedback}\n\n_Revision job applied at ${stamp}._\n`;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
