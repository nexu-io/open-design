// Transport home for the design-system-workspace-audit cluster: finalizing a
// brand project into its derived design-system kit after a run, auditing the
// packaged output, and persisting the project's active `designSystemId`.
// `finalizeBrandProject`/`patchProject` already live as shared best-effort
// transport in `runtime/brands`/`state/projects` (consumed by other
// components too); `fetchProjectDesignSystemPackageAudit` lives in the
// daemon registry. This file narrows them to what the project-view slice's
// port needs so the slice itself never imports those modules directly.
import {
  finalizeBrandProject as finalizeBrandProjectTransport,
  type ExtractBrandFromHtmlOutcome,
} from '../../runtime/brands';
import { fetchProjectDesignSystemPackageAudit as fetchProjectDesignSystemPackageAuditTransport } from '../registry';
import { patchProject } from '../../state/projects';
import type { DesignSystemPackageAudit } from '@open-design/contracts';

/** Finalize a brand project into its derived design-system kit. */
export async function finalizeBrandProject(
  brandId: string,
  projectId: string,
): Promise<ExtractBrandFromHtmlOutcome> {
  return finalizeBrandProjectTransport(brandId, projectId);
}

/** Fetch a project's design-system package audit. Resolves `null` on failure. */
export async function fetchDesignSystemPackageAudit(
  projectId: string,
): Promise<DesignSystemPackageAudit | null> {
  return fetchProjectDesignSystemPackageAuditTransport(projectId);
}

/** Persist a project's active `designSystemId`. Best-effort: swallows a
 *  failed request, matching the orchestrator's pre-extraction
 *  `void patchProject(...)` fire-and-forget usage. */
export async function patchProjectDesignSystemId(
  projectId: string,
  designSystemId: string | null,
): Promise<void> {
  await patchProject(projectId, { designSystemId });
}
