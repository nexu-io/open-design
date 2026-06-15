export const MEDIA_EXECUTION_MODES = [
  'enabled',
  'disabled',
] as const;

export type MediaExecutionMode = (typeof MEDIA_EXECUTION_MODES)[number];

export const MEDIA_SURFACES = [
  'image',
  'video',
  'audio',
] as const;

export type MediaSurface = (typeof MEDIA_SURFACES)[number];

export const MEDIA_POLICY_DENIAL_CODES = [
  'MEDIA_EXECUTION_DISABLED',
  'MEDIA_SURFACE_DENIED',
  'MEDIA_MODEL_DENIED',
] as const;

export type MediaPolicyDenialCode = (typeof MEDIA_POLICY_DENIAL_CODES)[number];

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

export interface MediaPolicyTarget {
  surface: MediaSurface;
  model?: string;
}

export interface MediaPolicyDenial {
  code: MediaPolicyDenialCode;
  message: string;
}

export function mediaExecutionPolicyDenial(
  policy: MediaExecutionPolicy,
  target: MediaPolicyTarget,
): MediaPolicyDenial | null {
  if (policy.mode === 'disabled') {
    return {
      code: 'MEDIA_EXECUTION_DISABLED',
      message: 'media generation is disabled for this run',
    };
  }
  if (
    Array.isArray(policy.allowedSurfaces) &&
    policy.allowedSurfaces.length > 0 &&
    !policy.allowedSurfaces.includes(target.surface)
  ) {
    return {
      code: 'MEDIA_SURFACE_DENIED',
      message: `media surface "${target.surface}" is not allowed for this run`,
    };
  }
  if (
    target.model &&
    Array.isArray(policy.allowedModels) &&
    policy.allowedModels.length > 0 &&
    !policy.allowedModels.includes(target.model)
  ) {
    return {
      code: 'MEDIA_MODEL_DENIED',
      message: `media model "${target.model}" is not allowed for this run`,
    };
  }
  return null;
}
