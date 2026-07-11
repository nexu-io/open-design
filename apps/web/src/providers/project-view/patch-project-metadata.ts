// Transport home for persisting a project's `metadata` field. Narrows the
// shared `patchProject` transport in `state/projects` (consumed by several
// other components too) to the one field the project-view slice's port
// needs, so the slice itself never imports `state/projects` directly.
import { patchProject } from '../../state/projects';
import type { ProjectMetadata } from '@open-design/contracts';

/** Persist a project's `metadata` field. Best-effort: swallows a failed
 *  request, matching the orchestrator's pre-extraction `void patchProject(...)`
 *  fire-and-forget usage. */
export async function patchProjectMetadata(
  projectId: string,
  metadata: ProjectMetadata,
): Promise<void> {
  await patchProject(projectId, { metadata });
}

/** Persist a project's `name` (and optionally `metadata`) fields. Best-effort:
 *  swallows a failed request, matching the orchestrator's pre-extraction
 *  `void patchProject(...)` fire-and-forget rename usage. */
export async function patchProjectName(
  projectId: string,
  patch: { name: string; metadata?: ProjectMetadata },
): Promise<void> {
  await patchProject(projectId, patch);
}
