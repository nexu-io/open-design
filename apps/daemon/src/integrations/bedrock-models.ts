// Amazon Bedrock BYOK model discovery.
//
// Bedrock API keys are accepted by the `bedrock` control-plane endpoint as
// well as by `bedrock-runtime` (the AmazonBedrockLimitedAccess policy a
// long-term key carries covers "describing resources"), so the API-key mode
// discovers models with two plain bearer GETs and no AWS SDK. The AWS-profile
// mode goes through the AWS CLI v2, like the profile connection test, but it
// never triggers a browser SSO login: discovery runs automatically from the
// Settings form and a surprise browser tab would be hostile. An expired SSO
// session surfaces as `auth_failed` and points at Test connection.
//
// The catalogue merges two lists: models served on demand under their bare
// id, and the account's ACTIVE system-defined inference profiles (`global.`,
// `us.`, `eu.`, ...) which are the only way newer models are served.
import type { ConnectionTestKind, ProviderModelOption, ProviderModelsResponse } from '@open-design/contracts';
import { resolveOnPath } from '../runtimes/executables.js';
import {
  AWS_CLI_BIN,
  classifyBedrockCliFailure,
  isSsoTokenExpiredError,
  runAwsCli,
  type CliRunner,
} from './bedrock-aws-cli.js';

const DISCOVERY_TIMEOUT_MS = 12_000;
const CLI_TIMEOUT_MS = 30_000;
const MAX_PAGES = 5;

export interface BedrockFoundationModelSummary {
  modelId: string;
  modelName?: string;
  providerName?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  inferenceTypesSupported?: string[];
  modelLifecycle?: { status?: string };
}

export interface BedrockInferenceProfileSummary {
  inferenceProfileId: string;
  inferenceProfileName?: string;
  status?: string;
  type?: string;
  models?: Array<{ modelArn?: string }>;
}

export interface BedrockCatalog {
  modelSummaries: BedrockFoundationModelSummary[];
  inferenceProfileSummaries: BedrockInferenceProfileSummary[];
}

export interface BedrockModelsInput {
  region: string;
  apiKey: string;
  awsProfile?: string | undefined;
  signal?: AbortSignal | undefined;
  requestInit?: Pick<RequestInit, 'dispatcher'> | undefined;
}

export interface BedrockModelsDeps {
  fetchImpl?: typeof fetch;
  resolveAwsCli?: () => string | null;
  runCli?: CliRunner;
}

export function bedrockControlPlaneEndpoint(region: string): string {
  return `https://bedrock.${region}.amazonaws.com`;
}

const PROFILE_SCOPE_LABELS: Record<string, string> = {
  global: 'global',
  us: 'US cross-region',
  eu: 'EU cross-region',
  jp: 'Japan cross-region',
  apac: 'APAC cross-region',
  au: 'Australia cross-region',
};

function isTextModel(model: BedrockFoundationModelSummary): boolean {
  const active = (model.modelLifecycle?.status ?? 'ACTIVE') === 'ACTIVE';
  // The control plane lists input modalities for every text model; a missing
  // list is an embedding or image model, so it is excluded. Output modalities
  // are omitted for some text models, so a missing list is read as text.
  const textIn = (model.inputModalities ?? []).includes('TEXT');
  const textOut = (model.outputModalities ?? ['TEXT']).includes('TEXT');
  return active && textIn && textOut;
}

function modelIdFromArn(arn: string | undefined): string | null {
  if (!arn) return null;
  const marker = 'foundation-model/';
  const index = arn.lastIndexOf(marker);
  return index >= 0 ? arn.slice(index + marker.length) : null;
}

/** Turn the two Bedrock listings into the picker options, profiles first. */
export function composeBedrockModelOptions(catalog: BedrockCatalog): ProviderModelOption[] {
  const textModels = new Map<string, BedrockFoundationModelSummary>();
  for (const model of catalog.modelSummaries) {
    if (isTextModel(model)) textModels.set(model.modelId, model);
  }

  const profileOptions: ProviderModelOption[] = [];
  const seen = new Set<string>();
  for (const profile of catalog.inferenceProfileSummaries) {
    if ((profile.status ?? 'ACTIVE') !== 'ACTIVE') continue;
    const id = profile.inferenceProfileId?.trim();
    if (!id || seen.has(id)) continue;
    const modelId = modelIdFromArn(profile.models?.[0]?.modelArn);
    const model = modelId ? textModels.get(modelId) : undefined;
    if (!model) continue;
    const scope = PROFILE_SCOPE_LABELS[id.split('.')[0] ?? ''] ?? 'cross-region';
    seen.add(id);
    profileOptions.push({ id, label: `${model.modelName ?? modelId} (${scope})` });
  }

  const onDemandOptions: ProviderModelOption[] = [];
  for (const model of textModels.values()) {
    if (!(model.inferenceTypesSupported ?? []).includes('ON_DEMAND')) continue;
    if (seen.has(model.modelId)) continue;
    seen.add(model.modelId);
    onDemandOptions.push({ id: model.modelId, label: model.modelName ?? model.modelId });
  }

  const byLabel = (a: ProviderModelOption, b: ProviderModelOption) =>
    a.label.localeCompare(b.label, 'en');
  // Global profiles resolve from any region, so they lead; then regional
  // cross-region profiles; then models served on demand under their bare id.
  const globalProfiles = profileOptions.filter((o) => o.id.startsWith('global.')).sort(byLabel);
  const regionalProfiles = profileOptions.filter((o) => !o.id.startsWith('global.')).sort(byLabel);
  return [...globalProfiles, ...regionalProfiles, ...onDemandOptions.sort(byLabel)];
}

function statusToKind(status: number): ConnectionTestKind {
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 404) return 'invalid_base_url';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_unavailable';
  return 'unknown';
}

async function fetchBedrockJsonPages(
  url: URL,
  listKey: 'modelSummaries' | 'inferenceProfileSummaries',
  input: BedrockModelsInput,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<{ items: unknown[] } | { error: { kind: ConnectionTestKind; status?: number; detail: string } }> {
  const items: unknown[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const pageUrl = new URL(url.toString());
    if (nextToken) pageUrl.searchParams.set('nextToken', nextToken);
    const response = await fetchImpl(pageUrl, {
      method: 'GET',
      headers: { authorization: `Bearer ${input.apiKey}`, accept: 'application/json' },
      ...input.requestInit,
      signal,
      redirect: 'error',
    });
    const rawText = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      return { error: { kind: 'unknown', status: response.status, detail: rawText.slice(0, 240) } };
    }
    if (!response.ok) {
      const message = typeof data.message === 'string'
        ? data.message
        : typeof data.Message === 'string'
          ? data.Message
          : rawText.slice(0, 240);
      return { error: { kind: statusToKind(response.status), status: response.status, detail: message } };
    }
    const list = data[listKey];
    if (Array.isArray(list)) items.push(...list);
    nextToken = typeof data.nextToken === 'string' && data.nextToken ? data.nextToken : undefined;
    if (!nextToken) break;
  }
  return { items };
}

async function fetchCatalogWithBearer(
  input: BedrockModelsInput,
  fetchImpl: typeof fetch,
): Promise<{ catalog: BedrockCatalog } | { error: { kind: ConnectionTestKind; status?: number; detail: string } }> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (input.signal?.aborted) controller.abort();
  else input.signal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const base = bedrockControlPlaneEndpoint(input.region);
    const modelsUrl = new URL(`${base}/foundation-models`);
    modelsUrl.searchParams.set('byOutputModality', 'TEXT');
    const profilesUrl = new URL(`${base}/inference-profiles`);
    profilesUrl.searchParams.set('typeEquals', 'SYSTEM_DEFINED');
    profilesUrl.searchParams.set('maxResults', '1000');
    const [models, profiles] = await Promise.all([
      fetchBedrockJsonPages(modelsUrl, 'modelSummaries', input, fetchImpl, controller.signal),
      fetchBedrockJsonPages(profilesUrl, 'inferenceProfileSummaries', input, fetchImpl, controller.signal),
    ]);
    if ('error' in models) return models;
    if ('error' in profiles) return profiles;
    return {
      catalog: {
        modelSummaries: models.items as BedrockFoundationModelSummary[],
        inferenceProfileSummaries: profiles.items as BedrockInferenceProfileSummary[],
      },
    };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', abortFromParent);
  }
}

async function fetchCatalogWithCli(
  input: BedrockModelsInput,
  profile: string,
  deps: BedrockModelsDeps,
): Promise<{ catalog: BedrockCatalog } | { error: { kind: ConnectionTestKind; detail: string } }> {
  const awsBin = (deps.resolveAwsCli ?? (() => resolveOnPath(AWS_CLI_BIN)))();
  if (!awsBin) {
    return {
      error: {
        kind: 'agent_not_installed',
        detail: 'AWS CLI v2 (`aws`) was not found on PATH; the AWS profile mode needs it to list Bedrock models.',
      },
    };
  }
  const runCli = deps.runCli ?? runAwsCli;
  const common = ['--profile', profile, '--region', input.region, '--output', 'json'];
  const [models, profiles] = await Promise.all([
    runCli(awsBin, [...common, 'bedrock', 'list-foundation-models', '--by-output-modality', 'TEXT'], {
      timeoutMs: CLI_TIMEOUT_MS,
      signal: input.signal,
    }),
    runCli(awsBin, [...common, 'bedrock', 'list-inference-profiles', '--type-equals', 'SYSTEM_DEFINED'], {
      timeoutMs: CLI_TIMEOUT_MS,
      signal: input.signal,
    }),
  ]);
  for (const run of [models, profiles]) {
    if (run.spawnError) return { error: { kind: 'agent_spawn_failed', detail: run.spawnError.message } };
    if (run.timedOut) return { error: { kind: 'timeout', detail: 'aws bedrock list-* timed out' } };
    if (run.code !== 0) {
      if (isSsoTokenExpiredError(run.stderr)) {
        return {
          error: {
            kind: 'auth_failed',
            detail: `The SSO session for AWS profile "${profile}" has expired. Run Test connection to sign in through the browser, then fetch models again.`,
          },
        };
      }
      const classified = classifyBedrockCliFailure(run.stderr);
      return { error: { kind: classified.kind, detail: classified.detail || `aws exited with ${run.code}` } };
    }
  }
  try {
    const modelsJson = JSON.parse(models.stdout) as { modelSummaries?: unknown[] };
    const profilesJson = JSON.parse(profiles.stdout) as { inferenceProfileSummaries?: unknown[] };
    return {
      catalog: {
        modelSummaries: (modelsJson.modelSummaries ?? []) as BedrockFoundationModelSummary[],
        inferenceProfileSummaries: (profilesJson.inferenceProfileSummaries ?? []) as BedrockInferenceProfileSummary[],
      },
    };
  } catch (err) {
    return { error: { kind: 'unknown', detail: err instanceof Error ? err.message : String(err) } };
  }
}

export async function listBedrockModels(
  input: BedrockModelsInput,
  deps: BedrockModelsDeps = {},
): Promise<ProviderModelsResponse> {
  const start = Date.now();
  const profile = input.awsProfile?.trim() ?? '';
  const apiKey = input.apiKey.trim();
  const result = profile
    ? await fetchCatalogWithCli(input, profile, deps)
    : await fetchCatalogWithBearer(input, deps.fetchImpl ?? fetch);
  const latencyMs = Date.now() - start;
  if ('error' in result) {
    const status = 'status' in result.error ? result.error.status : undefined;
    return {
      ok: false,
      kind: result.error.kind,
      latencyMs,
      ...(typeof status === 'number' ? { status } : {}),
      detail: apiKey ? result.error.detail.split(apiKey).join('***') : result.error.detail,
    };
  }
  const models = composeBedrockModelOptions(result.catalog);
  if (models.length === 0) {
    return {
      ok: false,
      kind: 'no_models',
      latencyMs,
      detail: 'Bedrock returned no text model you can invoke in this region. Request model access in the Bedrock console.',
    };
  }
  return { ok: true, kind: 'success', latencyMs, models };
}
