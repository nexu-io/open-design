import type {
  DeploymentProviderConfigResponse,
  ProviderCredentialSource,
} from '@open-design/contracts/api/providerCredential';
import type { ConnectionTestProtocol, ParsedBaseUrl } from '@open-design/contracts/api/connectionTest';

const DEFAULT_LABEL = 'Provider orchestrator';

export interface DeploymentProviderProfile {
  credentialSource: 'deployment';
  protocol: 'openai';
  baseUrl: string;
  apiKey: string;
  label: string;
  allowPrivateNetworkBaseUrl: true;
  defaultModel?: string;
  runSessionUrl?: string;
  runCostCapUsd?: number;
  runMaxTotalCostUsd?: number;
  runTtlSeconds?: number;
}

export type DeploymentProviderResolution =
  | { ok: true; profile: DeploymentProviderProfile }
  | {
      ok: false;
      status: 400;
      code: 'BAD_REQUEST';
      message: string;
      config: DeploymentProviderConfigResponse;
    };

function cleanEnvValue(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function displayHost(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return undefined;
  }
}

function optionalPositiveNumber(value: string | undefined): number | undefined {
  const raw = cleanEnvValue(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function optionalPositiveInteger(value: string | undefined): number | undefined {
  const raw = cleanEnvValue(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function validateDeploymentBaseUrl(baseUrl: string): { parsed?: ParsedBaseUrl; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(String(baseUrl).replace(/\/+$/, ''));
  } catch {
    return { error: 'Invalid baseUrl' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Only http/https allowed' };
  }
  if (parsed.username || parsed.password) {
    return { error: 'Deployment provider base URL must not include user info.' };
  }
  return { parsed };
}

function invalidRunSessionDetail(env: NodeJS.ProcessEnv): string | null {
  const runSessionUrl = cleanEnvValue(env.OD_PROVIDER_ORCHESTRATOR_RUN_SESSION_URL);
  if (!runSessionUrl) return null;

  try {
    const parsed = new URL(runSessionUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Deployment provider run-session URL must use http or https.';
    }
    if (parsed.username || parsed.password) {
      return 'Deployment provider run-session URL must not include user info.';
    }
  } catch {
    return 'Deployment provider run-session URL is invalid.';
  }

  const rawRunCostCap = cleanEnvValue(env.OD_PROVIDER_ORCHESTRATOR_RUN_COST_CAP_USD);
  if (!rawRunCostCap) {
    return 'Deployment provider run sessions require OD_PROVIDER_ORCHESTRATOR_RUN_COST_CAP_USD.';
  }
  if (optionalPositiveNumber(rawRunCostCap) === undefined) {
    return 'Deployment provider run-session cost cap must be a non-negative number.';
  }

  const rawMaxTotalCost = cleanEnvValue(env.OD_PROVIDER_ORCHESTRATOR_RUN_MAX_TOTAL_COST_USD);
  if (rawMaxTotalCost && optionalPositiveNumber(rawMaxTotalCost) === undefined) {
    return 'Deployment provider run-session max total cost must be a non-negative number.';
  }

  const rawTtlSeconds = cleanEnvValue(env.OD_PROVIDER_ORCHESTRATOR_RUN_TTL_SECONDS);
  if (rawTtlSeconds && optionalPositiveInteger(rawTtlSeconds) === undefined) {
    return 'Deployment provider run-session TTL must be a positive integer.';
  }

  return null;
}

export function deploymentProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): DeploymentProviderConfigResponse {
  const baseUrl = cleanEnvValue(env.OD_PROVIDER_ORCHESTRATOR_BASE_URL);
  const apiKey = cleanEnvValue(env.OD_PROVIDER_ORCHESTRATOR_API_KEY);
  const label = cleanEnvValue(env.OD_PROVIDER_ORCHESTRATOR_LABEL) || DEFAULT_LABEL;
  const defaultModel = cleanEnvValue(env.OD_PROVIDER_ORCHESTRATOR_DEFAULT_MODEL);

  if (!baseUrl && !apiKey) {
    return {
      available: false,
      credentialSource: 'deployment',
      protocol: 'openai',
      label,
      kind: 'not_configured',
      ...(defaultModel ? { defaultModel } : {}),
    };
  }

  if (!baseUrl || !apiKey) {
    const host = baseUrl ? displayHost(baseUrl) : undefined;
    return {
      available: false,
      credentialSource: 'deployment',
      protocol: 'openai',
      label,
      kind: 'missing_config',
      detail: 'Deployment provider requires both base URL and credential.',
      ...(defaultModel ? { defaultModel } : {}),
      ...(host ? { displayHost: host } : {}),
    };
  }

  const validated = validateDeploymentBaseUrl(baseUrl);
  if (validated.error || !validated.parsed) {
    const host = displayHost(baseUrl);
    return {
      available: false,
      credentialSource: 'deployment',
      protocol: 'openai',
      label,
      kind: 'invalid_base_url',
      detail: validated.error ?? 'Invalid deployment provider base URL.',
      ...(defaultModel ? { defaultModel } : {}),
      ...(host ? { displayHost: host } : {}),
    };
  }

  const runSessionDetail = invalidRunSessionDetail(env);
  if (runSessionDetail) {
    return {
      available: false,
      credentialSource: 'deployment',
      protocol: 'openai',
      label,
      kind: 'invalid_run_session_config',
      detail: runSessionDetail,
      ...(defaultModel ? { defaultModel } : {}),
      displayHost: validated.parsed.hostname,
    };
  }

  return {
    available: true,
    credentialSource: 'deployment',
    protocol: 'openai',
    label,
    kind: 'available',
    displayHost: validated.parsed.hostname,
    ...(defaultModel ? { defaultModel } : {}),
  };
}

export function resolveProviderCredentialSource(value: unknown): ProviderCredentialSource | null {
  if (value === undefined || value === 'user') return 'user';
  if (value === 'deployment') return 'deployment';
  return null;
}

export function resolveDeploymentProviderProfile(
  protocol: ConnectionTestProtocol,
  env: NodeJS.ProcessEnv = process.env,
): DeploymentProviderResolution {
  const config = deploymentProviderConfig(env);
  if (protocol !== 'openai') {
    return {
      ok: false,
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Deployment provider mode currently supports OpenAI-compatible provider routes only.',
      config,
    };
  }
  if (!config.available) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_REQUEST',
      message: config.detail ?? 'Deployment provider is not configured.',
      config,
    };
  }

  const profile: DeploymentProviderProfile = {
    credentialSource: 'deployment',
    protocol: 'openai',
    baseUrl: cleanEnvValue(env.OD_PROVIDER_ORCHESTRATOR_BASE_URL),
    apiKey: cleanEnvValue(env.OD_PROVIDER_ORCHESTRATOR_API_KEY),
    label: config.label,
    allowPrivateNetworkBaseUrl: true,
  };
  if (config.defaultModel) profile.defaultModel = config.defaultModel;
  const runSessionUrl = cleanEnvValue(env.OD_PROVIDER_ORCHESTRATOR_RUN_SESSION_URL);
  if (runSessionUrl) profile.runSessionUrl = runSessionUrl;
  const runCostCapUsd = optionalPositiveNumber(env.OD_PROVIDER_ORCHESTRATOR_RUN_COST_CAP_USD);
  if (runCostCapUsd !== undefined) profile.runCostCapUsd = runCostCapUsd;
  const runMaxTotalCostUsd = optionalPositiveNumber(env.OD_PROVIDER_ORCHESTRATOR_RUN_MAX_TOTAL_COST_USD);
  if (runMaxTotalCostUsd !== undefined) profile.runMaxTotalCostUsd = runMaxTotalCostUsd;
  const runTtlSeconds = optionalPositiveInteger(env.OD_PROVIDER_ORCHESTRATOR_RUN_TTL_SECONDS);
  if (runTtlSeconds !== undefined) profile.runTtlSeconds = runTtlSeconds;

  return {
    ok: true,
    profile,
  };
}
