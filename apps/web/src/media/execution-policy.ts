import type { MediaExecutionPolicy } from '@open-design/contracts';
import type { ProjectMetadata } from '../types';

function cleanModel(model: unknown): string {
  return typeof model === 'string' ? model.trim() : '';
}

export function mediaExecutionPolicyForProjectMetadata(
  metadata: ProjectMetadata | null | undefined,
): MediaExecutionPolicy | undefined {
  if (!metadata) return undefined;
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
