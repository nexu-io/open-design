export type MediaCloudDemoSurface = 'image' | 'video';

export type MediaBillingMode = 'cloud' | 'byok';

export interface MediaCloudDemoModel {
  id: string;
  label: string;
  provider: string;
  iconSrc: string;
  summary: string;
  resolutions: readonly string[];
  aspects: readonly string[];
  durations?: readonly number[];
  /** Deterministic review-fixture price for one image or five seconds of video. */
  basePriceUsd: Readonly<Record<string, number | null>>;
  /** Optional five-second price when native audio generation is enabled. */
  audioPriceUsd?: Readonly<Record<string, number | null>>;
}

export interface MediaCloudDemoValue {
  mode: MediaBillingMode;
  modelId: string;
  resolution: string;
  aspect: string;
  duration: number;
  quantity: number;
  generateAudio: boolean;
}

export const COMMON_MEDIA_ASPECTS = [
  '1:1',
  '1:2',
  '2:1',
  '9:16',
  '16:9',
  '3:4',
  '4:3',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
  '9:21',
] as const;

export const MEDIA_ASPECT_DESCRIPTIONS: Readonly<Record<string, string>> = {
  '1:1': 'Instagram feed · Amazon product images',
  '1:2': 'Pinterest pins · tall product storytelling',
  '2:1': 'Facebook link previews · website banners',
  '9:16': 'Instagram Reels · TikTok · Stories',
  '16:9': 'YouTube · Facebook video · web heroes',
  '3:4': 'Instagram portraits · marketplace listings',
  '4:3': 'Facebook posts · editorial graphics',
  '3:2': 'Amazon lifestyle images · photography',
  '2:3': 'Pinterest content · poster layouts',
  '5:4': 'Product detail images · Facebook feed',
  '4:5': 'Instagram portrait posts · Meta ads',
  '21:9': 'Cinematic banners · ultra-wide displays',
  '9:21': 'Full-screen mobile ads · vertical stories',
};

/**
 * Product-review fixtures only. The production version should replace this
 * catalogue with the OpenDesign Cloud model/entitlement response without
 * changing the panel contract.
 */
export const MEDIA_CLOUD_DEMO_MODELS: Readonly<
  Record<MediaCloudDemoSurface, readonly MediaCloudDemoModel[]>
> = {
  image: [
    {
      id: 'cloud/seedream-5-lite',
      label: 'Seedream 5 Lite',
      provider: 'ByteDance',
      iconSrc: '/model-icons/bytedance-lobe.svg',
      summary: 'Fast, cost-efficient high-resolution image generation',
      resolutions: ['2k', '4k'],
      aspects: COMMON_MEDIA_ASPECTS,
      basePriceUsd: { '2k': 0.035, '4k': 0.035 },
    },
    {
      id: 'cloud/seedream-5-pro',
      label: 'Seedream 5 Pro',
      provider: 'ByteDance',
      iconSrc: '/model-icons/bytedance-lobe.svg',
      summary: 'Flagship photorealism, detail, and text fidelity',
      resolutions: ['1.5k', '2k'],
      aspects: COMMON_MEDIA_ASPECTS,
      basePriceUsd: { '1.5k': 0.0675, '2k': 0.135 },
    },
    {
      id: 'cloud/nano-banana-2',
      label: 'Nano Banana 2',
      provider: 'Google',
      iconSrc: '/model-icons/nanobanana-lobe.svg',
      summary: 'Reliable text rendering and precise image edits',
      resolutions: ['0.5k', '1k', '2k', '4k'],
      aspects: COMMON_MEDIA_ASPECTS,
      basePriceUsd: { '0.5k': 0.06, '1k': 0.08, '2k': 0.12, '4k': 0.16 },
    },
    {
      id: 'cloud/gpt-image-2',
      label: 'GPT Image 2',
      provider: 'OpenAI',
      iconSrc: '/model-icons/openai-lobe.svg',
      summary: 'Premium multimodal generation and editing',
      resolutions: ['2k', '4k'],
      aspects: COMMON_MEDIA_ASPECTS,
      basePriceUsd: { '2k': 0.05, '4k': 0.1 },
    },
  ],
  video: [
    {
      id: 'cloud/seedance-2.5',
      label: 'Seedance 2.5',
      provider: 'ByteDance',
      iconSrc: '/model-icons/bytedance-lobe.svg',
      summary: 'Cinematic motion · pricing to be announced',
      resolutions: ['720p', '1080p'],
      aspects: COMMON_MEDIA_ASPECTS,
      durations: [5, 10],
      basePriceUsd: { '720p': null, '1080p': null },
    },
    {
      id: 'cloud/minimax-h3',
      label: 'MiniMax H3',
      provider: 'MiniMax',
      iconSrc: '/model-icons/minimax-lobe.svg',
      summary: '2K character motion with multimodal references',
      resolutions: ['2k'],
      aspects: COMMON_MEDIA_ASPECTS,
      durations: [5, 10, 15],
      basePriceUsd: { '2k': 1.3 },
    },
    {
      id: 'cloud/kling-3-standard',
      label: 'Kling 3.0 Standard',
      provider: 'Kling',
      iconSrc: '/model-icons/kling-lobe.svg',
      summary: 'Multi-shot video with native audio and voice control',
      resolutions: ['720p', '1080p'],
      aspects: COMMON_MEDIA_ASPECTS,
      durations: [5, 10],
      basePriceUsd: { '720p': 0.42, '1080p': 0.42 },
      audioPriceUsd: { '720p': 0.63, '1080p': 0.63 },
    },
    {
      id: 'cloud/kling-3-pro',
      label: 'Kling 3.0 Pro',
      provider: 'Kling',
      iconSrc: '/model-icons/kling-lobe.svg',
      summary: 'High-quality multi-shot video and camera control',
      resolutions: ['1080p'],
      aspects: COMMON_MEDIA_ASPECTS,
      durations: [5, 10],
      basePriceUsd: { '1080p': 0.56 },
      audioPriceUsd: { '1080p': 0.84 },
    },
    {
      id: 'cloud/kling-3-turbo-standard',
      label: 'Kling 3.0 Turbo Standard',
      provider: 'Kling',
      iconSrc: '/model-icons/kling-lobe.svg',
      summary: 'Faster iteration for everyday video generation',
      resolutions: ['720p', '1080p'],
      aspects: COMMON_MEDIA_ASPECTS,
      durations: [5, 10],
      basePriceUsd: { '720p': 0.56, '1080p': 0.56 },
      audioPriceUsd: { '720p': 0.56, '1080p': 0.56 },
    },
    {
      id: 'cloud/kling-3-turbo-pro',
      label: 'Kling 3.0 Turbo Pro',
      provider: 'Kling',
      iconSrc: '/model-icons/kling-lobe.svg',
      summary: 'Faster generation with higher visual quality',
      resolutions: ['1080p'],
      aspects: COMMON_MEDIA_ASPECTS,
      durations: [5, 10],
      basePriceUsd: { '1080p': 0.7 },
      audioPriceUsd: { '1080p': 0.7 },
    },
    {
      id: 'cloud/kling-3-4k',
      label: 'Kling 3.0 4K',
      provider: 'Kling',
      iconSrc: '/model-icons/kling-lobe.svg',
      summary: 'Native 4K video output with optional audio',
      resolutions: ['4k'],
      aspects: COMMON_MEDIA_ASPECTS,
      durations: [5, 10],
      basePriceUsd: { '4k': 2.1 },
      audioPriceUsd: { '4k': 2.1 },
    },
  ],
};

export const MEDIA_CLOUD_DEMO_WALLET_USD = 24.8;

export function defaultMediaCloudDemoModel(
  surface: MediaCloudDemoSurface,
): MediaCloudDemoModel {
  return MEDIA_CLOUD_DEMO_MODELS[surface][0]!;
}

export function defaultMediaCloudDemoValue(
  surface: MediaCloudDemoSurface,
): MediaCloudDemoValue {
  const model = defaultMediaCloudDemoModel(surface);
  return {
    mode: 'cloud',
    modelId: model.id,
    resolution: model.resolutions[0]!,
    aspect: surface === 'video' ? '16:9' : '1:1',
    duration: model.durations?.[0] ?? 5,
    quantity: 1,
    generateAudio: false,
  };
}

export function findMediaCloudDemoModel(
  surface: MediaCloudDemoSurface,
  modelId: string,
): MediaCloudDemoModel | null {
  return MEDIA_CLOUD_DEMO_MODELS[surface].find((model) => model.id === modelId) ?? null;
}

export function mediaCloudDemoPriceUsd(input: {
  surface: MediaCloudDemoSurface;
  mode: MediaBillingMode;
  modelId: string;
  resolution: string;
  duration?: number;
  quantity?: number;
  generateAudio?: boolean;
}): number | null {
  if (input.mode !== 'cloud') return null;
  const model = findMediaCloudDemoModel(input.surface, input.modelId);
  if (!model) return null;
  const base = input.generateAudio
    ? model.audioPriceUsd?.[input.resolution] ?? model.basePriceUsd[input.resolution]
    : model.basePriceUsd[input.resolution];
  if (base == null) return null;
  const quantity = Math.max(1, Math.min(4, Math.floor(input.quantity ?? 1)));
  if (input.surface === 'image') return base * quantity;
  const duration = model.durations?.includes(input.duration ?? 5)
    ? input.duration ?? 5
    : model.durations?.[0] ?? 5;
  return base * (duration / 5) * quantity;
}

export function formatMediaCloudDemoUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatMediaCloudDemoUnitPrice(
  surface: MediaCloudDemoSurface,
  value: number,
  duration = 5,
): string {
  return surface === 'image'
    ? `${formatMediaCloudDemoUsd(value)} / image`
    : `${formatMediaCloudDemoUsd(value)} / ${duration} sec`;
}
