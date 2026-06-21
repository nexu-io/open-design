// Live AIHubMix model catalogues for the media pickers.
//
// The static IMAGE_MODELS / VIDEO_MODELS / AUDIO_MODELS_BY_KIND registries only
// seed a couple of AIHubMix entries. AIHubMix actually exposes a much larger,
// changing catalogue per surface, so the pickers fetch the live list from the
// daemon (GET /api/media/providers/aihubmix/models?type=<catalog>, which proxies
// AIHubMix's public catalogue and prefixes ids `aihubmix-`). The fetched ids all
// render through the same OpenAI-compatible AIHubMix renderers, so no per-model
// wiring is needed.
//
//   surface image          -> type=image_generation -> caps t2i/i2i
//   surface video          -> type=video            -> caps t2v/i2v
//   surface audio (speech) -> type=tts              -> caps tts
//
// Results are cached at module scope (one fetch per catalogue per page load) and
// exposed via hooks so every picker shows the same list without each surface
// issuing its own request.
import { useEffect, useMemo, useState } from 'react';
import { IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS_BY_KIND, type MediaModel } from './models';

type FetchedModel = { id: string; label: string };

export type AIHubMixCatalogType = 'image_generation' | 'video' | 'tts';

const CAPS_BY_TYPE: Record<AIHubMixCatalogType, string[]> = {
  image_generation: ['t2i', 'i2i'],
  video: ['t2v', 'i2v'],
  tts: ['tts'],
};

function toMediaModel(m: FetchedModel, type: AIHubMixCatalogType): MediaModel {
  return {
    id: m.id,
    label: m.label,
    hint: 'AIHubMix',
    provider: 'aihubmix',
    caps: CAPS_BY_TYPE[type],
  };
}

export async function fetchAIHubMixModels(
  type: AIHubMixCatalogType,
  signal?: AbortSignal,
): Promise<MediaModel[]> {
  const res = await fetch(
    `/api/media/providers/aihubmix/models?type=${type}`,
    { signal },
  );
  if (!res.ok) throw new Error(`aihubmix ${type} catalog ${res.status}`);
  const payload = (await res.json()) as { models?: FetchedModel[] };
  const rows = Array.isArray(payload?.models) ? payload.models : [];
  return rows
    .filter((m) => typeof m?.id === 'string' && m.id)
    .map((m) => toMediaModel(m, type));
}

/** Back-compat alias: the original image-only fetch helper. */
export function fetchAIHubMixImageModels(
  signal?: AbortSignal,
): Promise<MediaModel[]> {
  return fetchAIHubMixModels('image_generation', signal);
}

/**
 * Merge a live AIHubMix list into a base registry array: drop the static
 * `aihubmix` seeds and append the fetched list. When the fetch hasn't resolved
 * (or failed), `dynamic` is empty and the base seeds are kept, so the picker is
 * never empty for AIHubMix. Surface-agnostic — keys only on provider.
 */
export function mergeAihubmixModels(
  base: MediaModel[],
  dynamic: MediaModel[],
): MediaModel[] {
  if (!dynamic.length) return base;
  const withoutSeeds = base.filter((m) => m.provider !== 'aihubmix');
  return [...withoutSeeds, ...dynamic];
}

/** Back-compat alias for the image picker call sites. */
export const mergeAihubmixImageModels = mergeAihubmixModels;

// Module-scope cache, bucketed per catalogue type, so multiple pickers mounting
// in the same session share one network request per type. The in-flight promise
// is memoized; a failed fetch clears it so a later mount can retry.
const cachedModels = new Map<AIHubMixCatalogType, MediaModel[]>();
const inFlight = new Map<AIHubMixCatalogType, Promise<MediaModel[]>>();

function loadOnce(type: AIHubMixCatalogType): Promise<MediaModel[]> {
  const cached = cachedModels.get(type);
  if (cached && cached.length) return Promise.resolve(cached);
  let pending = inFlight.get(type);
  if (!pending) {
    pending = fetchAIHubMixModels(type)
      .then((models) => {
        cachedModels.set(type, models);
        return models;
      })
      .catch((err) => {
        inFlight.delete(type); // allow retry on next mount
        throw err;
      });
    inFlight.set(type, pending);
  }
  return pending;
}

/**
 * Hook returning the live AIHubMix models for one catalogue type (empty until
 * the first fetch resolves). Safe to call from any picker; the underlying
 * request is shared across mounts.
 */
export function useAIHubMixModels(
  type: AIHubMixCatalogType,
  enabled = true,
): MediaModel[] {
  const [models, setModels] = useState<MediaModel[]>(
    () => cachedModels.get(type) ?? [],
  );
  useEffect(() => {
    // Only the AIHubMix BYOK pickers consume the live catalogue; for every
    // other provider the option hooks fall back to the static registry, so
    // there's no reason to hit the public endpoint. Skipping the fetch also
    // keeps surfaces that merely mount a picker (e.g. Settings on a non-AIHubMix
    // protocol) from issuing a catalogue request on every mount.
    if (!enabled) return;
    let active = true;
    loadOnce(type)
      .then((fetched) => {
        if (active) setModels(fetched);
      })
      .catch(() => {
        // Non-fatal: pickers fall back to the static seed models.
      });
    return () => {
      active = false;
    };
  }, [type, enabled]);
  return models;
}

/** Live AIHubMix image-generation models. */
export function useAIHubMixImageModels(enabled = true): MediaModel[] {
  return useAIHubMixModels('image_generation', enabled);
}

/** Live AIHubMix video models. */
export function useAIHubMixVideoModels(enabled = true): MediaModel[] {
  return useAIHubMixModels('video', enabled);
}

/** Live AIHubMix speech (TTS) models. */
export function useAIHubMixAudioModels(enabled = true): MediaModel[] {
  return useAIHubMixModels('tts', enabled);
}

/**
 * Shared option list for the single-provider BYOK image-model pickers (the
 * Settings "image generation model" field and the chat composer's inline
 * picker). For AIHubMix it returns the live catalogue (with static seeds as
 * fallback); for any other media provider (e.g. SenseAudio) it returns that
 * provider's static registry entries. Keeps the three picker sites from each
 * re-deriving the same merge+filter.
 */
export function useByokImageModelOptions(
  provider: string | undefined,
): MediaModel[] {
  const dynamic = useAIHubMixImageModels(provider === 'aihubmix');
  return useMemo(() => {
    if (provider === 'aihubmix') {
      return mergeAihubmixModels(IMAGE_MODELS, dynamic).filter(
        (m) => m.provider === 'aihubmix',
      );
    }
    return IMAGE_MODELS.filter((m) => m.provider === provider);
  }, [provider, dynamic]);
}

/**
 * Shared option list for the BYOK video-model pickers (Settings + the chat
 * composer's inline picker). For AIHubMix it returns the live `?type=video`
 * catalogue (with static seeds as fallback); for any other provider it returns
 * that provider's static VIDEO_MODELS entries. Mirrors useByokImageModelOptions.
 */
export function useByokVideoModelOptions(
  provider: string | undefined,
): MediaModel[] {
  const dynamic = useAIHubMixVideoModels(provider === 'aihubmix');
  return useMemo(() => {
    if (provider === 'aihubmix') {
      return mergeAihubmixModels(VIDEO_MODELS, dynamic).filter(
        (m) => m.provider === 'aihubmix',
      );
    }
    return VIDEO_MODELS.filter((m) => m.provider === provider);
  }, [provider, dynamic]);
}

/**
 * Shared option list for the BYOK speech (TTS) model picker. For AIHubMix it
 * returns the live `?type=tts` catalogue (static speech seeds as fallback); for
 * other providers, that provider's static speech entries. Mirrors the image/
 * video option hooks.
 */
export function useByokSpeechModelOptions(
  provider: string | undefined,
): MediaModel[] {
  const dynamic = useAIHubMixAudioModels(provider === 'aihubmix');
  const speechSeeds = useMemo(
    () => AUDIO_MODELS_BY_KIND.speech,
    [],
  );
  return useMemo(() => {
    if (provider === 'aihubmix') {
      return mergeAihubmixModels(speechSeeds, dynamic).filter(
        (m) => m.provider === 'aihubmix',
      );
    }
    return speechSeeds.filter((m) => m.provider === provider);
  }, [provider, dynamic, speechSeeds]);
}
