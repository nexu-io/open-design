import { validateBaseUrl } from '@open-design/contracts/api/connectionTest';
import type { ApiProtocol, ProviderModelOption } from '../../types';

export type ByokDraftField = 'api_key' | 'base_url' | 'model';

export type ByokDraftIssueLevel = 'error' | 'warn';

export type ByokDraftIssueCode =
  | 'api_key_required'
  | 'api_key_extra_whitespace'
  | 'api_key_malformed'
  | 'api_key_wrong_protocol'
  | 'base_url_required'
  | 'base_url_invalid'
  | 'model_required';

export type ByokDraftAction =
  | 'focus_api_key'
  | 'focus_base_url'
  | 'focus_model'
  | 'select_provider';

export interface ByokDraftIssue {
  field: ByokDraftField;
  level: ByokDraftIssueLevel;
  code: ByokDraftIssueCode;
  message: string;
  action?: ByokDraftAction;
  detectedProtocol?: ApiProtocol;
}

export interface ByokDraftValidation {
  ok: boolean;
  issues: ByokDraftIssue[];
}

interface ValidateByokDraftOptions {
  requiresApiKey?: boolean;
  requireModel?: boolean;
  keyValidationBaseUrl?: string;
}

interface ByokDraftConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface NormalizedByokBaseUrl {
  value: string;
  changed: boolean;
  addedProtocol: boolean;
  addedOpenAiVersionPath: boolean;
}

export type ByokModelPreferenceSource =
  | 'explicit'
  | 'account'
  | 'provider_preferred'
  | 'empty';

export interface ByokModelPreference {
  model: string;
  source: ByokModelPreferenceSource;
}

const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF]/g;
const GOOGLE_GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

export function cleanByokApiKey(value: string): string {
  return value
    .replace(ZERO_WIDTH_CHARS, '')
    .replace(/[\r\n\t]+/g, '')
    .trim();
}

export function normalizeByokBaseUrl(
  value: string,
  protocol: ApiProtocol,
): NormalizedByokBaseUrl {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      value: '',
      changed: value !== '',
      addedProtocol: false,
      addedOpenAiVersionPath: false,
    };
  }

  const addedProtocol = !/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const withProtocol = addedProtocol ? `https://${trimmed}` : trimmed;
  const withoutTrailingSlash = withProtocol.replace(/\/+$/, '');

  let normalized = withoutTrailingSlash;
  let addedOpenAiVersionPath = false;
  try {
    const parsed = new URL(withoutTrailingSlash);
    if (
      protocol === 'openai' &&
      parsed.hostname.toLowerCase() === 'api.openai.com' &&
      (parsed.pathname === '' || parsed.pathname === '/')
    ) {
      parsed.pathname = '/v1';
      normalized = parsed.toString().replace(/\/+$/, '');
      addedOpenAiVersionPath = true;
    }
  } catch {
    normalized = withoutTrailingSlash;
  }

  return {
    value: normalized,
    changed: normalized !== value,
    addedProtocol,
    addedOpenAiVersionPath,
  };
}

export function validateByokDraft(
  protocol: ApiProtocol,
  config: ByokDraftConfig,
  options: ValidateByokDraftOptions = {},
): ByokDraftValidation {
  const requiresApiKey = options.requiresApiKey ?? true;
  const requireModel = options.requireModel ?? true;
  const issues: ByokDraftIssue[] = [];
  const cleanedApiKey = cleanByokApiKey(config.apiKey);
  const baseUrl = config.baseUrl.trim();
  const model = config.model.trim();

  if (requiresApiKey && !cleanedApiKey) {
    issues.push({
      field: 'api_key',
      level: 'error',
      code: 'api_key_required',
      message: 'API key is required.',
      action: 'focus_api_key',
    });
  } else if (requiresApiKey) {
    if (cleanedApiKey !== config.apiKey) {
      issues.push({
        field: 'api_key',
        level: 'warn',
        code: 'api_key_extra_whitespace',
        message: 'API key contains extra whitespace.',
        action: 'focus_api_key',
      });
    }
    const keyIssue = validateApiKeyShape(
      protocol,
      cleanedApiKey,
      options.keyValidationBaseUrl?.trim() || baseUrl,
    );
    if (keyIssue) issues.push(keyIssue);
  }

  if (!baseUrl) {
    issues.push({
      field: 'base_url',
      level: 'error',
      code: 'base_url_required',
      message: 'Base URL is required.',
      action: 'focus_base_url',
    });
  } else {
    // #3225 — a `forbidden` result is a syntactically-valid URL that points at
    // an internal address. Don't block it here: the Test / model-fetch actions
    // gate on these issues, and the daemon owns the OD_ALLOWED_INTERNAL_HOSTS
    // decision. Only genuinely malformed / non-http URLs are a client blocker.
    const baseUrlCheck = validateBaseUrl(baseUrl);
    if (baseUrlCheck.error && !baseUrlCheck.forbidden) {
      issues.push({
        field: 'base_url',
        level: 'error',
        code: 'base_url_invalid',
        message: 'Base URL must be a valid public http:// or https:// URL.',
        action: 'focus_base_url',
      });
    } else if (protocol === 'google' && baseUrl) {
      const host = baseUrlHostname(baseUrl);
      if (host === 'api.anthropic.com' || host === 'api.openai.com') {
        issues.push({
          field: 'base_url',
          level: 'error',
          code: 'base_url_invalid',
          message: `Base URL points to ${host}. For Google Gemini use ${GOOGLE_GEMINI_DEFAULT_BASE_URL}.`,
          action: 'focus_base_url',
        });
      }
    }
  }

  if (requireModel && !model) {
    issues.push({
      field: 'model',
      level: 'error',
      code: 'model_required',
      message: 'Model is required.',
      action: 'focus_model',
    });
  }

  return {
    ok: !issues.some((issue) => issue.level === 'error'),
    issues,
  };
}

export function blockingByokDraftIssues(
  validation: ByokDraftValidation,
): ByokDraftIssue[] {
  return validation.issues.filter((issue) => issue.level === 'error');
}

export function blockingByokDraftFields(
  validation: ByokDraftValidation,
): ByokDraftField[] {
  return Array.from(
    new Set(blockingByokDraftIssues(validation).map((issue) => issue.field)),
  );
}

export function resolveByokModelPreference({
  currentModel,
  accountModels,
  providerPreferredModels = [],
}: {
  currentModel: string;
  accountModels: readonly ProviderModelOption[];
  providerPreferredModels?: readonly string[];
}): ByokModelPreference {
  const explicit = currentModel.trim();
  if (explicit) return { model: explicit, source: 'explicit' };
  const enabledAccountModels = accountModels.filter(
    (model) => model.enabled !== false && model.id.trim(),
  );
  const enabledAccountModelIds = new Set(
    enabledAccountModels.map((model) => model.id.trim()),
  );
  const providerPreferred = providerPreferredModels
    .map((model) => model.trim())
    .find((model) => model && enabledAccountModelIds.has(model));
  if (providerPreferred) {
    return { model: providerPreferred, source: 'provider_preferred' };
  }
  if (accountModels.length === 0) {
    const fallback = providerPreferredModels.find((model) => model.trim())?.trim() ?? '';
    if (fallback) {
      return { model: fallback, source: 'provider_preferred' };
    }
  }
  if (enabledAccountModels.length === 1) {
    return { model: enabledAccountModels[0]!.id.trim(), source: 'account' };
  }
  return { model: '', source: 'empty' };
}

function validateApiKeyShape(
  protocol: ApiProtocol,
  apiKey: string,
  baseUrl: string,
): ByokDraftIssue | null {
  if (!apiKey) return null;
  const detectedProtocol = detectByokApiKeyProtocol(apiKey);

  if (protocol === 'anthropic' && isAnthropicFirstPartyBaseUrl(baseUrl)) {
    if (apiKey.startsWith('sk-ant-')) return null;
    return {
      field: 'api_key',
      level: 'error',
      code: detectedProtocol === 'openai'
        ? 'api_key_wrong_protocol'
        : 'api_key_malformed',
      message: detectedProtocol === 'openai'
        ? 'This looks like an OpenAI key, not an Anthropic key.'
        : 'This API key does not match the expected Anthropic format.',
      action: 'focus_api_key',
      ...(detectedProtocol ? { detectedProtocol } : {}),
    };
  }

  if (protocol === 'openai' && isOpenAiFirstPartyBaseUrl(baseUrl)) {
    if (apiKey.startsWith('sk-') && !apiKey.startsWith('sk-ant-')) return null;
    return {
      field: 'api_key',
      level: 'error',
      code: detectedProtocol === 'anthropic'
        ? 'api_key_wrong_protocol'
        : 'api_key_malformed',
      message: detectedProtocol === 'anthropic'
        ? 'This looks like an Anthropic key, not an OpenAI-compatible key.'
        : 'This API key does not match the expected OpenAI-compatible format.',
      action: 'focus_api_key',
      ...(detectedProtocol ? { detectedProtocol } : {}),
    };
  }

  if (protocol === 'google' && isGoogleFirstPartyBaseUrl(baseUrl)) {
    if (isGoogleGeminiApiKeyShape(apiKey)) return null;
    return {
      field: 'api_key',
      level: 'error',
      code: detectedProtocol
        ? 'api_key_wrong_protocol'
        : 'api_key_malformed',
      message: detectedProtocol
        ? 'This key does not look like a Google Gemini API key.'
        : 'This API key does not match the expected Google Gemini format.',
      action: 'focus_api_key',
      ...(detectedProtocol ? { detectedProtocol } : {}),
    };
  }

  return null;
}

function detectByokApiKeyProtocol(apiKey: string): ApiProtocol | null {
  if (apiKey.startsWith('sk-ant-')) return 'anthropic';
  if (isGoogleGeminiApiKeyShape(apiKey)) return 'google';
  if (apiKey.startsWith('sk-')) return 'openai';
  return null;
}

/** Legacy AI Studio keys (AIza…) and service-account-bound keys (AQ.…). */
function isGoogleGeminiApiKeyShape(apiKey: string): boolean {
  if (apiKey.startsWith('AIza')) return true;
  // https://docs.cloud.google.com/docs/authentication/api-keys#api-keys-bound-sa
  return /^AQ\.[A-Za-z0-9_-]{20,}$/.test(apiKey);
}

function isAnthropicFirstPartyBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.anthropic.com';
  } catch {
    return false;
  }
}

function isOpenAiFirstPartyBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.openai.com';
  } catch {
    return false;
  }
}

function isGoogleFirstPartyBaseUrl(baseUrl: string): boolean {
  return baseUrlHostname(baseUrl) === 'generativelanguage.googleapis.com';
}

function baseUrlHostname(baseUrl: string): string | undefined {
  const trimmed = baseUrl.trim();
  if (!trimmed) return undefined;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}
