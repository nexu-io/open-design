import type {
  CreateStoreScreenshotDocumentRequest,
  ExportStoreScreenshotRequest,
  GenerateStoreScreenshotPlanRequest,
  StoreScreenshotJob,
  StoreScreenshotDocumentResponse,
  StoreScreenshotJobResponse,
  StoreScreenshotValidationResult,
} from '@open-design/contracts';
import {
  StoreScreenshotDocumentResponseSchema,
  StoreScreenshotJobResponseSchema,
  StoreScreenshotValidationResultSchema,
} from '@open-design/contracts';

export type StoreScreenshotDocument = StoreScreenshotDocumentResponse['document'];
export type StoreScreenshotPlatform = 'appStore' | 'googlePlay';

function storeScreenshotUrl(projectId: string, suffix = ''): string {
  return `/api/projects/${encodeURIComponent(projectId)}/store-screenshots${suffix}`;
}

async function readApiError(response: Response, fallback: string): Promise<Error> {
  try {
    const body = await response.json() as { error?: unknown };
    if (
      body.error
      && typeof body.error === 'object'
      && 'message' in body.error
      && typeof body.error.message === 'string'
      && body.error.message.trim()
    ) {
      return new Error(body.error.message);
    }
  } catch {
    // Keep the stable fallback for empty or non-JSON error responses.
  }
  return new Error(fallback);
}

async function requestJson<T>(
  url: string,
  init: RequestInit | undefined,
  fallbackError: string,
  schema: RuntimeSchema<T>,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw await readApiError(response, fallbackError);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Invalid store screenshot API response');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error('Invalid store screenshot API response');
  }
  return parsed.data;
}

interface RuntimeSchema<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false };
}

function jsonRequest(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function createStoreScreenshotDocument(
  projectId: string,
  input: CreateStoreScreenshotDocumentRequest,
): Promise<StoreScreenshotDocument> {
  const response = await requestJson<StoreScreenshotDocumentResponse>(
    storeScreenshotUrl(projectId),
    jsonRequest(input),
    'Could not create the store screenshot document',
    StoreScreenshotDocumentResponseSchema,
  );
  return response.document;
}

export async function fetchStoreScreenshotDocument(
  projectId: string,
): Promise<StoreScreenshotDocument> {
  const response = await requestJson<StoreScreenshotDocumentResponse>(
    storeScreenshotUrl(projectId),
    undefined,
    'Could not load the store screenshot document',
    StoreScreenshotDocumentResponseSchema,
  );
  return response.document;
}

export function validateStoreScreenshotDocument(
  projectId: string,
  platforms: StoreScreenshotPlatform[],
): Promise<StoreScreenshotValidationResult> {
  return requestJson<StoreScreenshotValidationResult>(
    storeScreenshotUrl(projectId, '/validate'),
    jsonRequest({ platforms }),
    'Could not validate the store screenshots',
    StoreScreenshotValidationResultSchema,
  );
}

export async function generateStoreScreenshots(
  projectId: string,
  input: GenerateStoreScreenshotPlanRequest,
): Promise<StoreScreenshotJobResponse['job']> {
  const response = await requestJson<StoreScreenshotJobResponse>(
    storeScreenshotUrl(projectId, '/generate'),
    jsonRequest(input),
    'Could not start store screenshot generation',
    StoreScreenshotJobResponseSchema,
  );
  return response.job;
}

export async function exportStoreScreenshots(
  projectId: string,
  input: ExportStoreScreenshotRequest,
): Promise<StoreScreenshotJobResponse['job']> {
  const response = await requestJson<StoreScreenshotJobResponse>(
    storeScreenshotUrl(projectId, '/export'),
    jsonRequest(input),
    'Could not start store screenshot export',
    StoreScreenshotJobResponseSchema,
  );
  return response.job;
}

export async function fetchStoreScreenshotJob(
  projectId: string,
  jobId: string,
): Promise<StoreScreenshotJob> {
  const response = await requestJson<StoreScreenshotJobResponse>(
    storeScreenshotUrl(projectId, `/jobs/${encodeURIComponent(jobId)}`),
    undefined,
    'Could not load the store screenshot job',
    StoreScreenshotJobResponseSchema,
  );
  return response.job;
}

export function storeScreenshotJobDownloadUrl(
  projectId: string,
  jobId: string,
): string {
  return storeScreenshotUrl(
    projectId,
    `/jobs/${encodeURIComponent(jobId)}/download`,
  );
}
