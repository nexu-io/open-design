import type {
  CreateStoreScreenshotDocumentRequest,
  ExportStoreScreenshotRequest,
  GenerateStoreScreenshotPlanRequest,
  StoreScreenshotDocumentResponse,
  StoreScreenshotJobResponse,
  StoreScreenshotValidationResult,
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
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw await readApiError(response, fallbackError);
  return await response.json() as T;
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
  );
  return response.job;
}
