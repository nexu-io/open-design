export const MEDIA_EXECUTION_MODES = [
  'enabled',
  'disabled',
] as const;

export type MediaExecutionMode = (typeof MEDIA_EXECUTION_MODES)[number];

export type MediaSurface = 'image' | 'video' | 'audio';

/**
 * Run-scoped policy controlling Open Design-owned media generation only.
 *
 * `allowedSurfaces` and `allowedModels` apply solely to `/api/tools/media/generate`
 * and in-run `od media generate`. External MCP media tools are intentionally
 * unaffected: provider policy for those belongs to the MCP server / orchestrator.
 */
export interface MediaExecutionPolicy {
  mode: MediaExecutionMode;
  allowedSurfaces?: MediaSurface[];
  allowedModels?: string[];
}

export const DEFAULT_MEDIA_EXECUTION_POLICY: MediaExecutionPolicy = {
  mode: 'enabled',
};
