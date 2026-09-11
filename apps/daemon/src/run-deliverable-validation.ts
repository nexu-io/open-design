import fs from 'node:fs/promises';
import path from 'node:path';

import { HYPERFRAMES_VIDEO_MODEL } from '@open-design/contracts';
import type {
  ChatRunStatus,
  ProjectFile,
  ProjectFileKind,
  ProjectMetadata,
} from '@open-design/contracts';

import { listFiles, resolveProjectDir } from './projects.js';
import { findTouchedLinkedPage } from './artifacts/linked-page-delivery.js';

export type RunDeliverableValidation =
  | 'valid'
  | 'not_succeeded'
  | 'no_artifact'
  | 'project_missing'
  | 'entry_missing'
  | 'entry_not_touched'
  | 'entry_unreadable'
  | 'type_mismatch';

export interface RunDeliverableValidationResult {
  valid: boolean;
  validation: RunDeliverableValidation;
  entryFile?: string;
  artifactKind?: ProjectFileKind;
  /** Internal syntax-finalization input; entryFile remains the canonical entry. */
  linkedPage?: string;
}

interface ValidateRunDeliverableInput {
  projectsRoot: string;
  projectId: string | null;
  projectMetadata?: Partial<ProjectMetadata> | Record<string, unknown> | null;
  runStatus: ChatRunStatus;
  artifactCount: number;
  /** Exact artifact paths changed by this run. Undefined means the runtime
   *  could not produce a reliable per-file diff (for example contention). */
  touchedPaths?: string[];
  /** Unambiguous HTML entry observed by the host before this run wrote files. */
  baselineEntryFile?: string;
}

export function inferBaselineHtmlEntry(projectRoot: string, paths: Iterable<string>): string | undefined {
  const rootHtml = [...paths]
    .map((file) => path.relative(projectRoot, file).replaceAll(path.sep, '/'))
    .filter((file) => !file.includes('/') && /\.html?$/i.test(file));
  return rootHtml.includes('index.html') ? 'index.html' : rootHtml.length === 1 ? rootHtml[0] : undefined;
}

const PROJECT_KIND_FILE_KINDS: Partial<
  Record<ProjectMetadata['kind'], ReadonlySet<ProjectFileKind>>
> = {
  prototype: new Set(['html']),
  template: new Set(['html']),
  deck: new Set(['html', 'presentation', 'pdf']),
  brand: new Set(['html', 'document', 'pdf']),
  image: new Set(['image']),
  video: new Set(['video']),
  audio: new Set(['audio']),
};

function safeRelativeFile(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/')) return null;
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return null;
  }
  return segments.join('/');
}

function projectKind(
  metadata: ValidateRunDeliverableInput['projectMetadata'],
): ProjectMetadata['kind'] | null {
  const value = metadata?.kind;
  return value === 'prototype'
    || value === 'deck'
    || value === 'template'
    || value === 'other'
    || value === 'brand'
    || value === 'image'
    || value === 'video'
    || value === 'audio'
    ? value
    : null;
}

function isHyperFramesProject(
  metadata: ValidateRunDeliverableInput['projectMetadata'],
): boolean {
  return metadata?.videoModel === HYPERFRAMES_VIDEO_MODEL
    || metadata?.intent === 'hyperframes';
}

/**
 * The file kinds a project may deliver as its canonical entry, or `null` when
 * any kind is acceptable.
 *
 * `metadata.kind` records the Home surface a project was created from, not the
 * shape of what it delivers. For most kinds those coincide; HyperFrames breaks
 * the identity. A HyperFrames project rides on `kind: 'video'` because Video is
 * the surface that offers it, while the artifact the user authors, edits and
 * previews is an HTML composition — the MP4 is a render of that HTML, produced
 * on demand and not necessarily present in the project at all. OD Next already
 * says so on the way in: `DAEMON_OWNED_OUTPUT_KINDS.hyperframes` admits `html`
 * and `source` as supported deliverable kinds at plan time, so rejecting them
 * at completion time contradicts the plan the same daemon approved.
 *
 * Generative video projects (fal / Veo / Sora / Volcengine) keep the strict
 * video-only contract: there the provider returns a video file, and an HTML
 * "preview page" in its place is a genuine delivery failure.
 */
function acceptedDeliverableKinds(
  metadata: ValidateRunDeliverableInput['projectMetadata'],
): ReadonlySet<ProjectFileKind> | null {
  const kind = projectKind(metadata);
  if (!kind || kind === 'other') return null;
  const declared = PROJECT_KIND_FILE_KINDS[kind];
  if (!declared) return null;
  if (kind === 'video' && isHyperFramesProject(metadata)) {
    return new Set<ProjectFileKind>([...declared, 'html']);
  }
  return declared;
}

function filePath(file: ProjectFile): string {
  return typeof file.path === 'string' && file.path ? file.path : file.name;
}

function inferredEntry(
  files: ProjectFile[],
  acceptedKinds: ReadonlySet<ProjectFileKind> | null,
): ProjectFile | null {
  const rootIndex = files.find((file) => filePath(file) === 'index.html');
  if (rootIndex) return rootIndex;

  const rootHtml = files.filter((file) => {
    const candidate = filePath(file);
    return !candidate.includes('/') && file.kind === 'html';
  });
  if (rootHtml.length === 1) return rootHtml[0] ?? null;

  if (acceptedKinds) {
    const compatible = files.filter((file) => acceptedKinds.has(file.kind));
    if (compatible.length === 1) return compatible[0] ?? null;
  }

  return files.length === 1 ? files[0] ?? null : null;
}

function matchesAcceptedKinds(
  acceptedKinds: ReadonlySet<ProjectFileKind> | null,
  fileKind: ProjectFileKind,
): boolean {
  return !acceptedKinds || acceptedKinds.has(fileKind);
}

/**
 * The two questions a caller can ask about a project's canonical deliverable.
 *
 * `'run'` — did THIS run produce it? Strict on purpose: the answer decides
 * whether the host may accept an Agent's completion claim, so a turn must not
 * be able to pass by pointing at a file an earlier turn wrote.
 *
 * `'project'` — does the user have it, right now? The same filesystem checks
 * without the run-scoped gates. It answers a presentation question ("is there
 * anything to tell the user they lost?"), where the earlier turn's file counts
 * precisely because the user can open it.
 *
 * Splitting them is the whole point: one predicate used to answer both, and
 * the strict answer is the WRONG answer to the loose question. A "继续" turn
 * that verifies finished work and correctly changes nothing scores
 * `no_artifact` under `'run'` — true, and irrelevant to whether the user got
 * their deck.
 */
export type DeliverableValidationScope = 'run' | 'project';

/** Values `validateProjectDeliverable` can actually produce, narrowed to the
 *  wire union. Run-scoped outcomes are unreachable there; returning null for
 *  one keeps a future enum addition from being reported as a wire value the
 *  client's type does not admit. */
export function projectDeliverableValidation(
  validation: RunDeliverableValidation,
): 'valid' | 'project_missing' | 'entry_missing' | 'entry_unreadable' | 'type_mismatch' | null {
  switch (validation) {
    case 'valid':
    case 'project_missing':
    case 'entry_missing':
    case 'entry_unreadable':
    case 'type_mismatch':
      return validation;
    default:
      return null;
  }
}

/**
 * Does this project hold a usable canonical deliverable right now?
 *
 * Same entry resolution, kind contract and readability check as
 * `validateRunDeliverable`, minus every gate that asks about a particular run.
 * Never use it to accept a completion claim — see `DeliverableValidationScope`.
 */
export async function validateProjectDeliverable(
  input: Omit<ValidateRunDeliverableInput, 'runStatus' | 'artifactCount' | 'touchedPaths'>,
): Promise<RunDeliverableValidationResult> {
  return resolveDeliverable({
    ...input,
    runStatus: 'succeeded',
    artifactCount: 1,
    scope: 'project',
  });
}

/**
 * Resolve and verify the one canonical file a successful run can deliver.
 *
 * `artifactCount` proves this run touched output; it does not prove the
 * project's declared entry still exists. The filesystem-backed file list and
 * a direct readability check are therefore authoritative.
 */
export async function validateRunDeliverable(
  input: ValidateRunDeliverableInput,
): Promise<RunDeliverableValidationResult> {
  return resolveDeliverable({ ...input, scope: 'run' });
}

async function resolveDeliverable(
  input: ValidateRunDeliverableInput & { scope: DeliverableValidationScope },
): Promise<RunDeliverableValidationResult> {
  const runScoped = input.scope === 'run';
  if (runScoped && input.runStatus !== 'succeeded') {
    return { valid: false, validation: 'not_succeeded' };
  }
  if (
    runScoped
    && (!Number.isFinite(input.artifactCount) || input.artifactCount <= 0)
  ) {
    return { valid: false, validation: 'no_artifact' };
  }
  if (!input.projectId) {
    return { valid: false, validation: 'project_missing' };
  }

  let projectRoot: string;
  let files: ProjectFile[];
  try {
    projectRoot = resolveProjectDir(
      input.projectsRoot,
      input.projectId,
      input.projectMetadata,
    );
    files = await listFiles(input.projectsRoot, input.projectId, {
      metadata: input.projectMetadata,
    }) as ProjectFile[];
  } catch {
    return { valid: false, validation: 'project_missing' };
  }

  const acceptedKinds = acceptedDeliverableKinds(input.projectMetadata);
  const isPrototype = projectKind(input.projectMetadata) === 'prototype';
  const declared = safeRelativeFile(input.projectMetadata?.entryFile);
  const baselineEntry = isPrototype && input.touchedPaths
    ? safeRelativeFile(input.baselineEntryFile)
    : null;
  const selected = declared
    ? files.find((file) => filePath(file) === declared) ?? null
    : (baselineEntry ? files.find((file) => filePath(file) === baselineEntry) ?? null : null)
      ?? inferredEntry(files, acceptedKinds);
  if (!selected) {
    return { valid: false, validation: 'entry_missing' };
  }

  const entryFile = filePath(selected);
  const facts = {
    entryFile,
    artifactKind: selected.kind,
  };
  let linkedPage: string | null = null;
  if (runScoped && input.touchedPaths) {
    const touched = new Set(
      input.touchedPaths.flatMap((candidate) => {
        if (typeof candidate !== 'string' || !candidate) return [];
        const absolute = path.isAbsolute(candidate)
          ? path.resolve(candidate)
          : path.resolve(projectRoot, candidate);
        const relative = path.relative(projectRoot, absolute);
        if (
          !relative
          || relative.startsWith('..')
          || path.isAbsolute(relative)
        ) {
          return [];
        }
        return [relative.replaceAll(path.sep, '/')];
      }),
    );
    if (!touched.has(entryFile)) {
      if (isPrototype && selected.kind === 'html') {
        linkedPage = await findTouchedLinkedPage({
          projectRoot,
          entryFile,
          htmlPaths: new Set(files.filter((file) => file.kind === 'html').map(filePath)),
          touchedPaths: touched,
        });
      }
      if (!linkedPage) {
        return { valid: false, validation: 'entry_not_touched', ...facts };
      }
    }
  }
  if (!matchesAcceptedKinds(acceptedKinds, selected.kind)) {
    return {
      valid: false,
      validation: 'type_mismatch',
      ...facts,
    };
  }

  try {
    const target = path.resolve(projectRoot, entryFile);
    const relative = path.relative(projectRoot, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return { valid: false, validation: 'entry_unreadable', ...facts };
    }
    const stat = await fs.stat(target);
    if (!stat.isFile()) {
      return { valid: false, validation: 'entry_unreadable', ...facts };
    }
    const handle = await fs.open(target, 'r');
    await handle.close();
  } catch {
    return { valid: false, validation: 'entry_unreadable', ...facts };
  }

  return {
    valid: true,
    validation: 'valid',
    ...facts,
    ...(linkedPage ? { linkedPage } : {}),
  };
}
