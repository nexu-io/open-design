import { assertAndFetchExternalAsset } from '../connectionTest.js';
import {
  SIFTQ_DEFAULT_BASE_URL,
  buildSiftqVideoBody,
  parseSiftqTask,
  parseSiftqTaskId,
  siftqHttpError,
  siftqUrls,
} from '../integrations/siftq.js';

type SiftqVideoInput = {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  prompt: string;
  duration?: number | undefined;
  resolution?: string | undefined;
  ratio?: string | undefined;
  images: Array<{ dataUrl: string }>;
  requestInit?: Pick<RequestInit, 'dispatcher'> | undefined;
  onProgress?: ((message: string) => void) | undefined;
};

type SiftqVideoRuntime = {
  fetch?: typeof fetch;
  download?: typeof assertAndFetchExternalAsset;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 8_000;
const DEFAULT_TIMEOUT_MS = 30 * 60_000;
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function looksLikeMp4(bytes: Buffer): boolean {
  return bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
}

async function readLimitedVideo(response: Response): Promise<Buffer> {
  if (!response.body) throw new Error('SiftQ video download returned an empty body.');
  const chunks: Buffer[] = [];
  const reader = response.body.getReader();
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_VIDEO_BYTES) {
      await reader.cancel();
      throw new Error(`SiftQ video download exceeds the ${MAX_VIDEO_BYTES}-byte safety limit.`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

export async function renderSiftqVideo(
  input: SiftqVideoInput,
  runtime: SiftqVideoRuntime = {},
): Promise<{ bytes: Buffer; providerNote: string; suggestedExt: '.mp4' }> {
  if (!input.apiKey?.trim()) {
    throw new Error(
      'no SiftQ API key — configure it in Settings or set OD_SIFTQ_API_KEY',
    );
  }
  if (input.images.length > 1) {
    throw new Error('SiftQ currently supports one first-frame image; pass only one image.');
  }

  const body = buildSiftqVideoBody({
    prompt: input.prompt,
    duration: input.duration,
    resolution: input.resolution,
    ratio: input.ratio,
    firstFrameDataUrl: input.images[0]?.dataUrl,
  });
  const urls = siftqUrls(input.baseUrl || SIFTQ_DEFAULT_BASE_URL);
  const fetchFn = runtime.fetch ?? fetch;
  const headers = {
    Authorization: `Bearer ${input.apiKey.trim()}`,
    'Content-Type': 'application/json',
  };
  const createResponse = await fetchFn(urls.createVideo, {
    ...input.requestInit,
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const createPayload = await responseJson(createResponse);
  if (!createResponse.ok) {
    throw siftqHttpError('video creation', createResponse.status, createPayload);
  }
  const taskId = parseSiftqTaskId(createPayload);
  const queryUrl = siftqUrls(input.baseUrl || SIFTQ_DEFAULT_BASE_URL, taskId).queryTask;
  input.onProgress?.(`SiftQ task ${taskId} queued`);

  const now = runtime.now ?? Date.now;
  const sleep = runtime.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const pollIntervalMs = runtime.pollIntervalMs
    ?? positiveIntegerEnv('OD_SIFTQ_VIDEO_POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS);
  const timeoutMs = runtime.timeoutMs
    ?? positiveIntegerEnv('OD_SIFTQ_VIDEO_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  const deadline = now() + timeoutMs;
  let resultUrl: string | null = null;
  let lastStatus = '';

  while (now() <= deadline) {
    const queryResponse = await fetchFn(queryUrl, {
      ...input.requestInit,
      method: 'GET',
      headers: { Authorization: headers.Authorization },
    });
    const queryPayload = await responseJson(queryResponse);
    if (!queryResponse.ok) {
      throw siftqHttpError('task query', queryResponse.status, queryPayload);
    }
    const task = parseSiftqTask(queryPayload);
    if (task.id !== taskId) {
      throw new Error(`SiftQ query returned task ${task.id} while waiting for ${taskId}.`);
    }
    if (task.status !== lastStatus) {
      input.onProgress?.(`SiftQ task ${taskId}: ${task.status}`);
      lastStatus = task.status;
    }
    if (task.status === 'succeeded') {
      resultUrl = task.content?.url ?? null;
      if (!resultUrl) throw new Error('SiftQ succeeded task is missing task.content.url.');
      break;
    }
    if (task.status === 'failed' || task.status === 'cancelled') {
      const detail = task.error?.message || task.error?.code || 'no provider detail';
      throw new Error(`SiftQ task ${taskId} ${task.status}: ${detail}`);
    }
    await sleep(pollIntervalMs);
  }
  if (!resultUrl) throw new Error(`SiftQ task ${taskId} timed out.`);

  const download = runtime.download ?? assertAndFetchExternalAsset;
  const videoResponse = await download(resultUrl, {
    ...input.requestInit,
    method: 'GET',
  });
  if (!videoResponse.ok) {
    throw new Error(`SiftQ video download failed with HTTP ${videoResponse.status}.`);
  }
  const contentType = videoResponse.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'video/mp4' && contentType !== 'video/quicktime') {
    throw new Error(`SiftQ video download returned unexpected content type ${contentType || '(missing)'}.`);
  }
  const declaredLength = Number(videoResponse.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_VIDEO_BYTES) {
    throw new Error(`SiftQ video download exceeds the ${MAX_VIDEO_BYTES}-byte safety limit.`);
  }
  const bytes = await readLimitedVideo(videoResponse);
  if (!looksLikeMp4(bytes)) {
    throw new Error('SiftQ video download is empty or does not contain an MP4/MOV signature.');
  }
  return {
    bytes,
    providerNote: `SiftQ MiniMax-H3 · ${body.resolution} · ${body.duration}s`,
    suggestedExt: '.mp4',
  };
}
