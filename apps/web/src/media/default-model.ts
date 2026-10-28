import type { MediaProviderCredentials } from '../types';
import { isMediaDefaultCandidateProvider } from './provider-readiness';
import { IMAGE_MODELS, VIDEO_MODELS } from './models';

export type DefaultMediaSurface = 'image' | 'video';

/**
 * Resolve the media model seeded into new project metadata for a surface.
 * The first catalog model whose provider has stored credentials wins, so a
 * configured BYOK provider (including Custom Image API) becomes the default
 * instead of the Cloud constant. With nothing configured this returns the
 * same `default: true` catalog entry as DEFAULT_IMAGE_MODEL /
 * DEFAULT_VIDEO_MODEL, keeping fresh installs on today's behavior.
 */
export function resolveDefaultMediaModel(
  surface: DefaultMediaSurface,
  mediaProviders?: Record<string, MediaProviderCredentials>,
): string {
  const catalog = surface === 'image'
    ? IMAGE_MODELS
    : VIDEO_MODELS.filter((model) => model.id !== 'hyperframes-html');
  for (const model of catalog) {
    if (isMediaDefaultCandidateProvider(model.provider, mediaProviders)) {
      return model.id;
    }
  }
  return catalog.find((model) => model.default)?.id ?? catalog[0]!.id;
}
