import { setTimeout as delay } from 'node:timers/promises';
import type { GenerationJob } from '../shared/gateway.ts';
import { apiJson, ProviderError, type Fetcher } from './network.ts';

export type ProviderContext = { key: string; fetcher: Fetcher; signal: AbortSignal;
  progress: (phase: string, remoteId?: string) => Promise<void>; pollMs?: number };
export interface ProviderAdapter { generate(job: GenerationJob, context: ProviderContext): Promise<string[]> }
function outputs(body: any, modality: string): string[] {
  const raw = body?.outputs ?? (modality === 'image' ? body?.images ?? body?.image : modality === 'video' ? body?.video ?? body?.videos : body?.audio ?? body?.audio_file ?? body?.audios);
  return (Array.isArray(raw) ? raw : [raw]).flatMap(item => typeof item === 'string' ? [item] : typeof item?.url === 'string' ? [item.url] : []).slice(0, 8);
}
function atlasData(body: any) {
  if (body.code !== undefined && String(body.code) !== '200') throw new ProviderError('Atlas rejected the generation request', Number(body.code));
  return body.data ?? body;
}
const atlas: ProviderAdapter = {
  async generate(job, ctx) {
    const auth = { Authorization: `Bearer ${ctx.key}`, 'Content-Type': 'application/json' };
    const payload = { ...job.model.defaults, ...job.parameters, model: job.model.modelId, prompt: job.prompt };
    const endpoint = { image: 'generateImage', video: 'generateVideo', audio: 'generateAudio' }[job.modality];
    const data = atlasData(await apiJson(ctx.fetcher, `https://api.atlascloud.ai/api/v1/model/${endpoint}`, {
      method: 'POST', headers: auth, body: JSON.stringify(payload), signal: ctx.signal,
    }));
    if (!data.id || !/^[a-zA-Z0-9_-]+$/.test(String(data.id))) throw new Error('Atlas did not return a prediction ID');
    await ctx.progress('submitted', String(data.id));
    for (;;) {
      await delay(ctx.pollMs ?? (job.modality === 'video' ? 5000 : 2000), undefined, { signal: ctx.signal });
      const result = atlasData(await apiJson(ctx.fetcher, `https://api.atlascloud.ai/api/v1/model/prediction/${data.id}`, { headers: auth, signal: ctx.signal }));
      if (['completed', 'succeeded'].includes(result.status)) {
        const media = outputs(result, job.modality);
        if (!media.length) throw new Error('Atlas completed without media output');
        return media.map(value => !/^(https:|data:)/.test(value) && job.modality === 'image' && /^[A-Za-z0-9+/=\s]+$/.test(value) ? `data:image/png;base64,${value}` : value);
      }
      if (['failed', 'timeout', 'cancelled', 'canceled'].includes(result.status)) throw new Error(`Atlas generation ${result.status}`);
      await ctx.progress('generating');
    }
  },
};
function falUrl(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('fal did not return a queue URL');
  const url = new URL(raw);
  if (url.origin !== 'https://queue.fal.run' || url.username || url.password) throw new Error('fal returned an untrusted queue URL');
  return url.href;
}
const fal: ProviderAdapter = {
  async generate(job, ctx) {
    const headers = { Authorization: `Key ${ctx.key}`, 'Content-Type': 'application/json' };
    const promptField = job.model.mode === 'text-to-speech' ? 'text' : 'prompt';
    const payload = { ...job.model.defaults, ...job.parameters, [promptField]: job.prompt };
    const submitted = await apiJson(ctx.fetcher, `https://queue.fal.run/${job.model.modelId}`, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctx.signal });
    const statusUrl = falUrl(submitted.status_url), resultUrl = falUrl(submitted.response_url);
    const cancelUrl = submitted.cancel_url ? falUrl(submitted.cancel_url) : undefined;
    if (typeof submitted.request_id !== 'string') throw new Error('fal did not return a request ID');
    await ctx.progress('submitted', submitted.request_id);
    try {
      for (;;) {
        await delay(ctx.pollMs ?? 2000, undefined, { signal: ctx.signal });
        const status = await apiJson(ctx.fetcher, statusUrl, { headers, signal: ctx.signal });
        if (status.status === 'COMPLETED') {
          if (status.error) throw new Error('fal generation failed');
          const result = await apiJson(ctx.fetcher, resultUrl, { headers, signal: ctx.signal });
          const media = outputs(result, job.modality);
          if (!media.length) throw new Error('fal completed without media output');
          return media;
        }
        if (!['IN_QUEUE', 'IN_PROGRESS'].includes(status.status)) throw new Error('fal returned an unknown task status');
        await ctx.progress(status.status === 'IN_QUEUE' ? 'provider-queue' : 'generating');
      }
    } finally {
      if (ctx.signal.aborted && cancelUrl) {
        await ctx.fetcher(cancelUrl, { method: 'PUT', headers, redirect: 'error', signal: AbortSignal.timeout(5000) }).then(r => r.body?.cancel(), () => {});
      }
    }
  },
};
/** Add providers here without changing Studio, job persistence or the MCP contract. */
export const providerAdapters: Record<'atlascloud' | 'fal', ProviderAdapter> = { atlascloud: atlas, fal };
