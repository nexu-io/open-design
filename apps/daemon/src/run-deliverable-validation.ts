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
 * Resolve and verify the one canonical file a successful run can deliver.
 *
 * `artifactCount` proves this run touched output; it does not prove the
 * project's declared entry still exists. The filesystem-backed file list and
 * a direct readability check are therefore authoritative.
 */
export async function validateRunDeliverable(
  input: ValidateRunDeliverableInput,
): Promise<RunDeliverableValidationResult> {
  if (input.runStatus !== 'succeeded') {
    return { valid: false, validation: 'not_succeeded' };
  }
  if (!Number.isFinite(input.artifactCount) || input.artifactCount <= 0) {
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
  const declared = safeRelativeFile(input.projectMetadata?.entryFile);
  const selected = declared
    ? files.find((file) => filePath(file) === declared) ?? null
    : inferredEntry(files, acceptedKinds);
  if (!selected) {
    return { valid: false, validation: 'entry_missing' };
  }

  const entryFile = filePath(selected);
  const facts = {
    entryFile,
    artifactKind: selected.kind,
  };
  if (input.touchedPaths) {
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
      // Export-only tasks: the declared entry is intentionally left stale, but a
      // touched artifact with a complete explicit manifest is a valid deliverable
      // regardless of the project's declared kind. The candidate must (a) be
      // touched in this run, (b) carry a persisted (non-inferred) manifest, (c)
      // have status `complete`, and (d) its manifest must be bound to the file's
      // own path. Unlike the declared-entry path, no project-kind compatibility
      // check is applied — a complete manifest is the deliverable's own contract.
      // When multiple candidates qualify the first readable one wins; this
      // matches the declared-entry strategy of always taking the single
      // compatible file rather than presenting a disambiguation UI.
      const exportCandidates = files.filter((file) => {
        const candidatePath = filePath(file);
        const manifest = file.artifactManifest;
        if (!manifest || manifest.status !== 'complete') return false;
        if (typeof manifest.entry !== 'string' || manifest.entry !== candidatePath) return false;
        // Only consider artifacts with an explicit persisted manifest, not
        // inferred legacy manifests that every .html/.md file receives.
        if (manifest.metadata?.inferred === true) return false;
        return touched.has(candidatePath);
      });

      for (const candidate of exportCandidates) {
        const candidatePath = filePath(candidate);
        const manifest = candidate.artifactManifest!;
        // Map the manifest's ArtifactKind namespace to ProjectFileKind so the
        // result field carries the user-meaningful value. ArtifactKind in
        // @open-design/contracts only enumerates the eight accepted persisted
        // kinds (html, deck, react-component, markdown-document, svg, diagram,
        // code-snippet, mini-app, design-system); the only one that maps to a
        // different ProjectFileKind is markdown-document → document. Other
        // manifests (code-snippet, html, ...) report the file-extension kind
        // directly without rewriting.
        const candidateArtifactKind: ProjectFileKind =
          manifest.kind === 'markdown-document' ? 'document' : candidate.kind;

        try {
          const target = path.resolve(projectRoot, candidatePath);
          const relative = path.relative(projectRoot, target);
          if (relative.startsWith('..') || path.isAbsolute(relative)) {
            continue;
          }
          const stat = await fs.stat(target);
          if (!stat.isFile()) {
            continue;
          }
          const handle = await fs.open(target, 'r');
          await handle.close();
          return {
            valid: true,
            validation: 'valid',
            entryFile: candidatePath,
            artifactKind: candidateArtifactKind,
          };
        } catch {
          continue;
        }
      }
      return {
        valid: false,
        validation: 'entry_not_touched',
        ...facts,
      };
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
  };
}
