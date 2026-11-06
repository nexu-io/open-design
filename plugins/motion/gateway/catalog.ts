import type { Model, Modality, ProviderId } from '../shared/gateway.ts';
import { apiJson, type Fetcher } from './network.ts';

export const providerLabels: Record<ProviderId, string> = { codex: 'Codex', atlascloud: 'Atlas Cloud', fal: 'fal.ai' };
export const providerIds = Object.keys(providerLabels) as ProviderId[];
export function modelKey(provider: ProviderId, modelId: string) { return `${provider}:${modelId}`; }
export function validModelId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length > 180 || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(id) || id.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid model ID');
}
function builtin(provider: ProviderId, modelId: string, label: string, modality: Modality, mode: string): Model {
  return { id: modelKey(provider, modelId), provider, modelId, label, modality, mode, source: 'builtin' };
}
/** Offline choices, not evidence of account entitlement or successful generation. */
export const builtinModels: Model[] = [
  { ...builtin('codex', 'image-generation', 'Codex Image', 'image', 'text-to-image'), supportsImageReference: true },
  builtin('atlascloud', 'google/nano-banana-2/text-to-image', 'Nano Banana 2', 'image', 'text-to-image'),
  builtin('atlascloud', 'bytedance/seedance-2.0/text-to-video', 'Seedance 2.0', 'video', 'text-to-video'),
  builtin('atlascloud', 'suno/chirp-v4', 'Suno v4', 'audio', 'text-to-audio'),
  builtin('fal', 'fal-ai/flux/schnell', 'FLUX Schnell', 'image', 'text-to-image'),
  builtin('fal', 'fal-ai/wan/v2.2-a14b/text-to-video', 'Wan 2.2', 'video', 'text-to-video'),
  builtin('fal', 'fal-ai/kokoro/american-english', 'Kokoro', 'audio', 'text-to-speech'),
];
/** Prefer explicit output/task metadata; never infer image output from image input. */
export function classifyModel(category: string, output?: string): { modality: Modality; mode: string } | null {
  const text = category.toLowerCase().replace(/_/g, '-');
  if (/to-text|transcri|speech-recognition|training|embedding|caption|detection|segmentation/.test(text)) return null;
  for (const modality of ['image', 'video', 'audio'] as Modality[]) {
    const match = text.match(new RegExp(`(?:text|image|video|audio)-to-${modality}`));
    if (match) return { modality, mode: match[0] };
  }
  if (/text-to-speech|text-to-music|music-generation|sound-effect/.test(text)) return { modality: 'audio', mode: /speech/.test(text) ? 'text-to-speech' : 'text-to-audio' };
  if (output && ['image', 'video', 'audio'].includes(output.toLowerCase())) return { modality: output.toLowerCase() as Modality, mode: `text-to-${output.toLowerCase()}` };
  return null;
}
export function normalizeModels(provider: 'atlascloud' | 'fal', rows: any[]): Model[] {
  return rows.flatMap(row => {
    if (row?.deprecated || row?.removed || row?.metadata?.status === 'deprecated') return [];
    const id = provider === 'atlascloud' ? row?.model : row?.endpoint_id ?? row?.id;
    try { validModelId(id); } catch { return []; }
    const metadata = row?.metadata ?? row;
    const category = [metadata.category, ...(Array.isArray(row.categories) ? row.categories : []), ...(Array.isArray(row.tags) ? row.tags : []), id].filter(Boolean).join(' ');
    const outputTag = row?.discovery?.tags?.find((s: unknown) => typeof s === 'string' && s.startsWith('output:'))?.slice(7);
    const classified = classifyModel(category, outputTag ?? row.output_type ?? row.type);
    if (!classified) return [];
    return [{ id: modelKey(provider, id), provider, modelId: id, label: String(row.displayName ?? metadata.display_name ?? metadata.title ?? id).slice(0, 180),
      ...classified, source: 'live' as const, description: String(row.profile ?? metadata.description ?? '').slice(0, 500) }];
  });
}
export async function discoverModels(provider: 'atlascloud' | 'fal', query: string, fetcher: Fetcher): Promise<Model[]> {
  // Catalogues are public. Listing a model must never mark the user's key as verified.
  if (provider === 'atlascloud') {
    const body = await apiJson(fetcher, 'https://api.atlascloud.ai/api/v1/models');
    if (!Array.isArray(body.data)) throw new Error('Atlas catalogue format changed');
    return normalizeModels(provider, body.data);
  }
  const models: Model[] = [];
  let cursor = '';
  for (let page = 0; page < 3; page++) {
    const params = new URLSearchParams({ limit: '100', status: 'active' });
    if (query) params.set('q', query);
    if (cursor) params.set('cursor', cursor);
    const body = await apiJson(fetcher, `https://api.fal.ai/v1/models?${params}`);
    if (!Array.isArray(body.models)) throw new Error('fal catalogue format changed');
    models.push(...normalizeModels(provider, body.models));
    if (!body.next_cursor) break;
    cursor = String(body.next_cursor);
  }
  return models;
}
