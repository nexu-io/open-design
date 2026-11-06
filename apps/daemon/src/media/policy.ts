import {
  DEFAULT_MEDIA_EXECUTION_POLICY,
  MEDIA_EXECUTION_MODES,
  MEDIA_SURFACES,
  mediaExecutionPolicyDenial,
  type MediaExecutionMode,
  type MediaExecutionPolicy,
  type MediaPolicyDenial,
  type MediaPolicyTarget,
  type MediaSurface,
} from '@open-design/contracts';

const MEDIA_EXECUTION_MODE_SET = new Set<MediaExecutionMode>(MEDIA_EXECUTION_MODES);
const MEDIA_SURFACE_SET = new Set<MediaSurface>(MEDIA_SURFACES);

export function defaultMediaExecutionPolicy(): MediaExecutionPolicy {
  return { ...DEFAULT_MEDIA_EXECUTION_POLICY };
}

export function normalizeMediaExecutionPolicyForRun(value: unknown): MediaExecutionPolicy {
  const parsed = parseMediaExecutionPolicyInput(value);
  return parsed.ok ? parsed.policy : defaultMediaExecutionPolicy();
}

export function parseMediaExecutionPolicyInput(value: unknown):
  | { ok: true; policy: MediaExecutionPolicy }
  | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, policy: defaultMediaExecutionPolicy() };
  }
  if (!isRecord(value)) {
    return { ok: false, message: 'mediaExecution must be an object when provided' };
  }

  const rawMode = typeof value.mode === 'string' ? value.mode : 'enabled';
  if (!MEDIA_EXECUTION_MODE_SET.has(rawMode as MediaExecutionMode)) {
    return {
      ok: false,
      message: 'mediaExecution.mode must be enabled or disabled',
    };
  }
  const mode = rawMode as MediaExecutionMode;

  const policy: MediaExecutionPolicy = { mode };

  if (value.allowedSurfaces !== undefined) {
    if (!Array.isArray(value.allowedSurfaces)) {
      return { ok: false, message: 'mediaExecution.allowedSurfaces must be an array' };
    }
    const surfaces: MediaSurface[] = [];
    for (const surface of value.allowedSurfaces) {
      const candidate = surface as MediaSurface;
      if (typeof surface !== 'string' || !MEDIA_SURFACE_SET.has(candidate)) {
        return {
          ok: false,
          message: 'mediaExecution.allowedSurfaces may only include image, video, or audio',
        };
      }
      if (!surfaces.includes(candidate)) surfaces.push(candidate);
    }
    policy.allowedSurfaces = surfaces;
  }

  if (value.allowedModels !== undefined) {
    if (!Array.isArray(value.allowedModels)) {
      return { ok: false, message: 'mediaExecution.allowedModels must be an array' };
    }
    const models: string[] = [];
    for (const rawModel of value.allowedModels) {
      if (typeof rawModel !== 'string' || rawModel.trim().length === 0) {
        return { ok: false, message: 'mediaExecution.allowedModels must contain non-empty strings' };
      }
      const model = rawModel.trim();
      if (!models.includes(model)) models.push(model);
    }
    policy.allowedModels = models;
  }

  return { ok: true, policy };
}

export function mediaPolicyDenial(
  policy: MediaExecutionPolicy,
  target: MediaPolicyTarget,
): MediaPolicyDenial | null {
  return mediaExecutionPolicyDenial(policy, target);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
