import { HYPERFRAMES_VIDEO_MODEL, type MediaExecutionPolicy } from '@open-design/contracts';
import type { ProjectMetadata } from '../types';

function cleanModel(model: unknown): string {
  return typeof model === 'string' ? model.trim() : '';
}

export function mediaExecutionPolicyForProjectMetadata(
  metadata: ProjectMetadata | null | undefined,
): MediaExecutionPolicy | undefined {
  if (!metadata) return undefined;
  const automaticRoute = metadata.strategyBinding?.provenance === 'automatic_default';
  const automaticMotionRenderer = automaticRoute
    && metadata.intent === 'motion-design'
    && metadata.videoModel === HYPERFRAMES_VIDEO_MODEL
    && metadata.strategyBinding?.taskProfile === 'motion-design';
  const hasSelectedModel = cleanModel(metadata.imageModel)
    || cleanModel(metadata.videoModel) || cleanModel(metadata.audioModel);
  // A creation type is a preference, not media authorization. On the automatic
  // Discovery route, a Query can request another medium or several outputs.
  // Preserve explicit model policies and let the host enforce real access.
  if (automaticRoute && (!hasSelectedModel || automaticMotionRenderer)) {
    return { mode: 'enabled' };
  }
  if (metadata.kind === 'image') {
    const model = cleanModel(metadata.imageModel);
    return model
      ? { mode: 'enabled', allowedSurfaces: ['image'], allowedModels: [model] }
      : { mode: 'enabled', allowedSurfaces: ['image'] };
  }
  if (metadata.kind === 'video') {
    const model = cleanModel(metadata.videoModel);
    return model
      ? { mode: 'enabled', allowedSurfaces: ['video'], allowedModels: [model] }
      : { mode: 'enabled', allowedSurfaces: ['video'] };
  }
  if (metadata.kind === 'audio') {
    const model = cleanModel(metadata.audioModel);
    return model
      ? { mode: 'enabled', allowedSurfaces: ['audio'], allowedModels: [model] }
      : { mode: 'enabled', allowedSurfaces: ['audio'] };
  }
  return undefined;
}
