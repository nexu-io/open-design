import fs from 'node:fs';
import path from 'node:path';

import type { ProjectFileVersionPromptSource } from '@open-design/contracts';

import { ensureCurrentProjectFileVersion } from './project-file-versions.js';
import type { RunArtifactDiff } from './run-artifact-fs.js';

export interface AiHtmlVersionSnapshotInput {
  projectsRoot: string;
  projectId: string;
  projectRoot: string;
  diff: Pick<RunArtifactDiff, 'touchedPaths'>;
  prompt: string | null;
  promptSource?: ProjectFileVersionPromptSource;
  metadata?: unknown;
}

export interface AiHtmlVersionSnapshotFailure {
  fileName: string;
  message: string;
}

export class AiHtmlVersionSnapshotError extends Error {
  readonly code = 'HTML_VERSION_SNAPSHOT_FAILED';
  readonly failures: AiHtmlVersionSnapshotFailure[];

  constructor(failures: AiHtmlVersionSnapshotFailure[]) {
    super(formatAiHtmlVersionSnapshotError(failures));
    this.name = 'AiHtmlVersionSnapshotError';
    this.failures = failures;
  }
}

function formatAiHtmlVersionSnapshotError(failures: AiHtmlVersionSnapshotFailure[]): string {
  if (failures.length === 1) {
    return `HTML version snapshot failed for ${failures[0]?.fileName ?? 'unknown file'}: ${failures[0]?.message ?? 'unknown error'}`;
  }
  return `HTML version snapshots failed for ${failures.length} files`;
}

function failureMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export async function snapshotAiHtmlVersionsForRun(input: AiHtmlVersionSnapshotInput): Promise<void> {
  if (!input.projectId || input.diff.touchedPaths.length === 0) return;
  const seen = new Set<string>();
  const work = input.diff.touchedPaths.flatMap((filePath) => {
    if (!/\.html?$/i.test(filePath)) return [];
    const relativePath = path.relative(input.projectRoot, filePath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return [];
    const projectRelPath = relativePath.split(path.sep).join('/');
    if (seen.has(projectRelPath)) return [];
    seen.add(projectRelPath);
    return [{ filePath, projectRelPath }];
  });
  if (work.length === 0) return;

  const results = await Promise.allSettled(work.map(async ({ filePath, projectRelPath }) => {
    const content = await fs.promises.readFile(filePath, 'utf8');
    await ensureCurrentProjectFileVersion(
      input.projectsRoot,
      input.projectId,
      projectRelPath,
      content,
      {
        source: 'ai',
        prompt: input.prompt,
        ...(input.promptSource ? { promptSource: input.promptSource } : {}),
      },
      input.metadata,
    );
  }));
  const failures = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    const item = work[index];
    return [{
      fileName: item?.projectRelPath ?? 'unknown',
      message: failureMessage(result.reason),
    }];
  });
  if (failures.length > 0) {
    throw new AiHtmlVersionSnapshotError(failures);
  }
}
