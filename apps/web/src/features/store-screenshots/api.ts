import type {
  ApplyStoreScreenshotChangeSetRequest,
  CreateStoreScreenshotDocumentRequest,
  ExportStoreScreenshotRequest,
  GenerateStoreScreenshotPlanRequest,
  StoreScreenshotJob,
  StoreScreenshotChangeSetPreviewResponse,
  StoreScreenshotDocumentResponse,
  StoreScreenshotJobResponse,
  StoreScreenshotValidationResult,
  StoreScreenshotVersion,
} from '@open-design/contracts';
import {
  StoreScreenshotChangeSetPreviewResponseSchema,
  StoreScreenshotDocumentResponseSchema,
  StoreScreenshotJobResponseSchema,
  StoreScreenshotValidationResultSchema,
  StoreScreenshotVersionsResponseSchema,
} from '@open-design/contracts';

export type StoreScreenshotDocument = StoreScreenshotDocumentResponse['document'];
export type StoreScreenshotPlatform = 'appStore' | 'googlePlay';

export class StoreScreenshotApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'StoreScreenshotApiError';
  }
}

function storeScreenshotUrl(projectId: string, suffix = ''): string {
  return `/api/projects/${encodeURIComponent(projectId)}/store-screenshots${suffix}`;
}

async function readApiError(response: Response, fallback: string): Promise<Error> {
  let message = fallback;
  let code: string | null = null;
  try {
    const body = await response.json() as { error?: unknown };
    if (
      body.error
      && typeof body.error === 'object'
      && 'message' in body.error
      && typeof body.error.message === 'string'
      && body.error.message.trim()
    ) {
      message = body.error.message;
    }
    if (
      body.error
      && typeof body.error === 'object'
      && 'code' in body.error
      && typeof body.error.code === 'string'
      && body.error.code.trim()
    ) {
      code = body.error.code;
    }
  } catch {
    // Keep the stable fallback for empty or non-JSON error responses.
  }
  return new StoreScreenshotApiError(message, response.status, code);
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

export function previewStoreScreenshotChangeSet(
  projectId: string,
  changeSet: ApplyStoreScreenshotChangeSetRequest,
): Promise<StoreScreenshotChangeSetPreviewResponse> {
  return requestJson<StoreScreenshotChangeSetPreviewResponse>(
    storeScreenshotUrl(projectId, '/changes/preview'),
    jsonRequest(changeSet),
    'Could not preview the store screenshot changes',
    StoreScreenshotChangeSetPreviewResponseSchema,
  );
}

export async function applyStoreScreenshotChangeSet(
  projectId: string,
  changeSet: ApplyStoreScreenshotChangeSetRequest,
): Promise<StoreScreenshotDocument> {
  const response = await requestJson<StoreScreenshotDocumentResponse>(
    storeScreenshotUrl(projectId, '/changes/apply'),
    jsonRequest(changeSet),
    'Could not apply the store screenshot changes',
    StoreScreenshotDocumentResponseSchema,
  );
  return response.document;
}

export async function fetchStoreScreenshotVersions(
  projectId: string,
): Promise<StoreScreenshotVersion[]> {
  const response = await requestJson<{ versions: StoreScreenshotVersion[] }>(
    storeScreenshotUrl(projectId, '/versions'),
    undefined,
    'Could not load store screenshot versions',
    StoreScreenshotVersionsResponseSchema,
  );
  return response.versions;
}

export async function restoreStoreScreenshotVersion(
  projectId: string,
  version: number,
): Promise<StoreScreenshotDocument> {
  const response = await requestJson<StoreScreenshotDocumentResponse>(
    storeScreenshotUrl(projectId, `/versions/${encodeURIComponent(String(version))}/restore`),
    jsonRequest({ version }),
    'Could not restore the store screenshot version',
    StoreScreenshotDocumentResponseSchema,
  );
  return response.document;
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
