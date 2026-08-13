export const SIFTQ_DEFAULT_BASE_URL = 'https://siftq.com/api/minimax/';
export const SIFTQ_VIDEO_MODEL = 'MiniMax-H3';

export type SiftqResolution = '768P' | '2K';
export type SiftqConcreteRatio = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
export type SiftqTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type SiftqContentItem =
  | { type: 'text'; text: string }
  | {
      type: 'image_url';
      image_url: { url: string };
      role: 'first_frame';
    };

export type SiftqCreateVideoBody = {
  model: typeof SIFTQ_VIDEO_MODEL;
  content: SiftqContentItem[];
  resolution: SiftqResolution;
  duration: number;
  ratio: SiftqConcreteRatio | 'adaptive';
};

export type SiftqTask = {
  id: string;
  status: SiftqTaskStatus;
  content: { url?: string } | undefined;
  error: { code?: string; message?: string } | undefined;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function siftqEndpoint(baseUrl: string, suffix: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('SiftQ base URL must be a valid http(s) URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('SiftQ base URL must use http or https.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('SiftQ base URL must not contain credentials, query parameters, or a fragment.');
  }
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`;
  return parsed.toString();
}

export function siftqUrls(baseUrl: string, taskId = '{task_id}') {
  const encodedTaskId = encodeURIComponent(taskId);
  return {
    createVideo: siftqEndpoint(baseUrl, 'v2/video_generation'),
    queryTask: siftqEndpoint(baseUrl, `v2/query/video_generation/${encodedTaskId}`),
    listTasks: siftqEndpoint(baseUrl, 'v2/query/video_generation'),
    deleteTask: siftqEndpoint(baseUrl, `v2/video_generation/${encodedTaskId}`),
    createContextIr: siftqEndpoint(baseUrl, 'v2/h3_context_ir'),
  };
}

export function buildSiftqVideoBody(input: {
  prompt: string;
  duration?: number | undefined;
  resolution?: string | undefined;
  ratio?: string | undefined;
  firstFrameDataUrl?: string | undefined;
}): SiftqCreateVideoBody {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error('SiftQ requires a non-empty prompt.');
  if (prompt.length > 7000) throw new Error('SiftQ prompt must be at most 7000 characters.');

  const duration = input.duration ?? 5;
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) {
    throw new Error('SiftQ duration must be an integer from 4 through 15 seconds.');
  }

  const resolution = input.resolution ?? '768P';
  if (resolution !== '768P' && resolution !== '2K') {
    throw new Error('SiftQ resolution must be 768P or 2K.');
  }

  const content: SiftqContentItem[] = [{ type: 'text', text: prompt }];
  const concreteRatios = new Set<SiftqConcreteRatio>([
    '21:9',
    '16:9',
    '4:3',
    '1:1',
    '3:4',
    '9:16',
  ]);
  let ratio: SiftqConcreteRatio | 'adaptive';
  if (input.firstFrameDataUrl) {
    if (!/^data:image\/(?:jpeg|png|webp|heic|heif);base64,/i.test(input.firstFrameDataUrl)) {
      throw new Error('SiftQ first frame must be a JPEG, PNG, WEBP, HEIC, or HEIF base64 data URL.');
    }
    content.push({
      type: 'image_url',
      image_url: { url: input.firstFrameDataUrl },
      role: 'first_frame',
    });
    ratio = 'adaptive';
  } else {
    const requested = input.ratio ?? '16:9';
    if (!concreteRatios.has(requested as SiftqConcreteRatio)) {
      throw new Error(
        'SiftQ text-to-video ratio must be one of 21:9, 16:9, 4:3, 1:1, 3:4, or 9:16.',
      );
    }
    ratio = requested as SiftqConcreteRatio;
  }

  return {
    model: SIFTQ_VIDEO_MODEL,
    content,
    resolution,
    duration,
    ratio,
  };
}

export function parseSiftqTaskId(payload: unknown): string {
  if (!isRecord(payload)) throw new Error('SiftQ create response is not a JSON object.');
  const taskId = nonEmptyString(payload.task_id);
  if (!taskId) throw new Error('SiftQ create response is missing task_id.');
  return taskId;
}

export function parseSiftqTask(payload: unknown): SiftqTask {
  if (!isRecord(payload) || !isRecord(payload.task)) {
    throw new Error('SiftQ query response is missing task.');
  }
  const raw = payload.task;
  const id = nonEmptyString(raw.id);
  if (!id) throw new Error('SiftQ task is missing id.');
  const allowed = new Set<SiftqTaskStatus>([
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled',
  ]);
  const status = nonEmptyString(raw.status);
  if (!status || !allowed.has(status as SiftqTaskStatus)) {
    throw new Error('SiftQ task has an unknown status.');
  }
  const contentUrl = isRecord(raw.content) ? nonEmptyString(raw.content.url) : null;
  const content = isRecord(raw.content)
    ? (contentUrl ? { url: contentUrl } : {})
    : undefined;
  const errorCode = isRecord(raw.error) ? nonEmptyString(raw.error.code) : null;
  const errorMessage = isRecord(raw.error) ? nonEmptyString(raw.error.message) : null;
  const taskError = isRecord(raw.error)
    ? {
        ...(errorCode ? { code: errorCode } : {}),
        ...(errorMessage ? { message: errorMessage } : {}),
      }
    : undefined;
  return { id, status: status as SiftqTaskStatus, content, error: taskError };
}

export function siftqHttpError(operation: string, status: number, payload: unknown): Error {
  if (isRecord(payload) && isRecord(payload.error)) {
    const type = nonEmptyString(payload.error.type) ?? 'api_error';
    const message = nonEmptyString(payload.error.message) ?? 'request failed';
    const requestId = nonEmptyString(payload.request_id);
    return new Error(
      `SiftQ ${operation} failed (${status}, ${type}): ${message}${requestId ? ` [request ${requestId}]` : ''}`,
    );
  }
  return new Error(`SiftQ ${operation} failed with HTTP ${status}.`);
}
