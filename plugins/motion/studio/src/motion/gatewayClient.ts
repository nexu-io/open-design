import type { GatewayStatus, Model, GenerationJob, GenerateInput } from '../../../shared/gateway';
export type { GatewayStatus, Model, GenerationJob, GenerateInput, Modality, GeneratedAsset } from '../../../shared/gateway';

export async function gatewayRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/motion-api/' + path, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Model gateway request failed');
  return data as T;
}
export async function loadModels(): Promise<Model[]> {
  const models: Model[] = []; let offset: number | null = 0;
  do {
    const page: { models: Model[]; nextOffset: number | null } = await gatewayRequest(`models?offset=${offset}&limit=100`);
    models.push(...page.models); offset = page.nextOffset;
  } while (offset !== null && models.length < 5000);
  return models;
}
export async function loadGateway() {
  const [status, models] = await Promise.all([gatewayRequest<GatewayStatus>('models/capabilities'), loadModels()]);
  return { status, models };
}
/** Shared entry point for future property panels and other editor consumers. */
export function generateAsset(input: GenerateInput) {
  return gatewayRequest<{ job: GenerationJob }>('generations', 'POST', input);
}
