import type { ArtifactOrigin, ProjectFileVersion } from '@open-design/contracts';
import type { ArtifactExportResultProps } from '@open-design/contracts/analytics';

const CONTENT_DIGEST_RE = /^[a-f0-9]{64}$/u;
const ORIGIN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const EXTERNAL_PLUGIN_IDS = new Set(['open-design']);

export type ArtifactExportOriginProps = Pick<
  ArtifactExportResultProps,
  | 'entry_surface'
  | 'artifact_origin_status'
  | 'artifact_version_id'
  | 'origin_entry_surface'
  | 'origin_external_plugin_id'
  | 'origin_plugin_workflow_id'
  | 'origin_run_id'
>;

function safeOriginId(value: unknown): value is string {
  return typeof value === 'string' && ORIGIN_ID_RE.test(value);
}

function isValidArtifactOrigin(origin: ArtifactOrigin): boolean {
  if (
    origin.entrySurface !== 'open_design_ui'
    && origin.entrySurface !== 'od_cli'
    && origin.entrySurface !== 'external_mcp'
    && origin.entrySurface !== 'unknown'
  ) {
    return false;
  }
  if (
    origin.externalPluginId !== undefined
    && !EXTERNAL_PLUGIN_IDS.has(origin.externalPluginId)
  ) {
    return false;
  }
  if (origin.pluginWorkflowId !== undefined && !safeOriginId(origin.pluginWorkflowId)) {
    return false;
  }
  if (origin.runId !== undefined && !safeOriginId(origin.runId)) return false;
  return true;
}

export async function artifactVersionContentDigest(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(String(content ?? ''));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function matchingArtifactVersionId(
  content: string,
  version: ProjectFileVersion | null | undefined,
): Promise<string | undefined> {
  if (!version?.contentDigest || !CONTENT_DIGEST_RE.test(version.contentDigest)) {
    return undefined;
  }
  return await artifactVersionContentDigest(content) === version.contentDigest
    ? version.id
    : undefined;
}

export async function artifactExportOriginProps(
  content: string,
  version: ProjectFileVersion | null | undefined,
): Promise<ArtifactExportOriginProps> {
  const unknownBase = {
    entry_surface: 'open_design_ui' as const,
    origin_entry_surface: 'unknown' as const,
  };
  if (!version) {
    return { ...unknownBase, artifact_origin_status: 'missing_version' };
  }
  if (!version.contentDigest || !CONTENT_DIGEST_RE.test(version.contentDigest)) {
    return { ...unknownBase, artifact_origin_status: 'unknown' };
  }
  const actualDigest = await artifactVersionContentDigest(content);
  if (actualDigest !== version.contentDigest) {
    return { ...unknownBase, artifact_origin_status: 'digest_mismatch' };
  }
  const artifactVersion = { artifact_version_id: version.id };
  if (!version.origin) {
    return {
      ...unknownBase,
      ...artifactVersion,
      artifact_origin_status: 'unknown',
    };
  }
  if (!isValidArtifactOrigin(version.origin)) {
    return {
      ...unknownBase,
      ...artifactVersion,
      artifact_origin_status: 'invalid_origin',
    };
  }
  return {
    entry_surface: 'open_design_ui',
    artifact_origin_status: version.origin.entrySurface === 'unknown' ? 'unknown' : 'matched',
    ...artifactVersion,
    origin_entry_surface: version.origin.entrySurface,
    ...(version.origin.externalPluginId
      ? { origin_external_plugin_id: version.origin.externalPluginId }
      : {}),
    ...(version.origin.pluginWorkflowId
      ? { origin_plugin_workflow_id: version.origin.pluginWorkflowId }
      : {}),
    ...(version.origin.runId ? { origin_run_id: version.origin.runId } : {}),
  };
}
