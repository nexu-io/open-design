import type { Response } from 'express';
import type {
  ReasoningExecutionMode,
  ReasoningExecutionPolicy,
} from '@open-design/contracts/api/reasoningExecution';
import { normalizeGoogleModelId } from './integrations/google-models.js';

export type ReasoningEgressRouteKind =
  | 'proxy'
  | 'provider_models'
  | 'connection_test'
  | 'finalize';

export interface ReasoningEgressRequest {
  policy: unknown;
  routeKind: ReasoningEgressRouteKind;
  provider: string;
  resolvedBaseUrl?: string;
  model?: string;
}

export type ReasoningEgressDenial =
  | ReasoningEgressInvalidPolicyDenial
  | ReasoningEgressPolicyDenial;

export interface ReasoningEgressInvalidPolicyDenial {
  status: 400;
  code: 'reasoning_execution_invalid_policy';
  message: string;
  data: {
    routeKind: ReasoningEgressRouteKind;
    provider: string;
    resolvedBaseUrl?: string;
    model?: string;
  };
}

export interface ReasoningEgressPolicyDenial {
  status: 403;
  code: 'reasoning_execution_disabled' | 'reasoning_execution_not_allowlisted';
  message: string;
  data: {
    routeKind: ReasoningEgressRouteKind;
    provider: string;
    policyMode: Exclude<ReasoningExecutionMode, 'enabled'>;
    resolvedBaseUrl?: string;
    model?: string;
  };
}

function isReasoningPolicy(value: unknown): value is Partial<ReasoningExecutionPolicy> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function policyMode(policy: unknown): ReasoningExecutionMode | 'invalid' {
  if (policy === undefined) return 'enabled';
  if (!isReasoningPolicy(policy)) return 'invalid';
  return policy.mode === 'enabled' || policy.mode === 'disabled' || policy.mode === 'allowlist'
    ? policy.mode
    : 'invalid';
}

export function normalizeReasoningBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function invalidPolicyDenial(args: ReasoningEgressRequest): ReasoningEgressInvalidPolicyDenial {
  return {
    status: 400,
    code: 'reasoning_execution_invalid_policy',
    message: 'reasoningExecution.mode must be one of enabled, disabled, or allowlist.',
    data: {
      routeKind: args.routeKind,
      provider: args.provider,
      ...(args.resolvedBaseUrl ? { resolvedBaseUrl: args.resolvedBaseUrl } : {}),
      ...(args.model ? { model: args.model } : {}),
    },
  };
}

function disabledDenial(args: ReasoningEgressRequest): ReasoningEgressDenial {
  return {
    status: 403,
    code: 'reasoning_execution_disabled',
    message: 'Reasoning provider egress is disabled for this run.',
    data: {
      routeKind: args.routeKind,
      provider: args.provider,
      policyMode: 'disabled',
      ...(args.resolvedBaseUrl ? { resolvedBaseUrl: args.resolvedBaseUrl } : {}),
      ...(args.model ? { model: args.model } : {}),
    },
  };
}

function allowlistDenial(args: ReasoningEgressRequest): ReasoningEgressDenial {
  return {
    status: 403,
    code: 'reasoning_execution_not_allowlisted',
    message: 'Reasoning provider egress is not allowlisted for this run.',
    data: {
      routeKind: args.routeKind,
      provider: args.provider,
      policyMode: 'allowlist',
      ...(args.resolvedBaseUrl ? { resolvedBaseUrl: args.resolvedBaseUrl } : {}),
      ...(args.model ? { model: args.model } : {}),
    },
  };
}

function routeIsDeniedByFlag(policy: Partial<ReasoningExecutionPolicy>, routeKind: ReasoningEgressRouteKind): boolean {
  if (routeKind === 'provider_models') return policy.denyProviderDiscovery === true;
  if (routeKind === 'connection_test') return policy.denyConnectionTests === true;
  if (routeKind === 'finalize') return policy.denyFinalize === true;
  return false;
}

function allowedBaseUrlSet(policy: Partial<ReasoningExecutionPolicy>): Set<string> {
  const values: unknown[] = Array.isArray(policy.allowedBaseUrls) ? policy.allowedBaseUrls : [];
  return new Set(
    values
      .filter((value: unknown): value is string => typeof value === 'string')
      .map(normalizeReasoningBaseUrl)
      .filter((value: string | null): value is string => Boolean(value)),
  );
}

function normalizeReasoningModelId(provider: string, model: string): string {
  const trimmed = model.trim();
  if (provider === 'google') return normalizeGoogleModelId(trimmed);
  return trimmed;
}

function allowedModelSet(policy: Partial<ReasoningExecutionPolicy>, provider: string): Set<string> {
  const values: unknown[] = Array.isArray(policy.allowedModels) ? policy.allowedModels : [];
  return new Set(
    values
      .filter((value: unknown): value is string => typeof value === 'string')
      .map((value: string) => normalizeReasoningModelId(provider, value))
      .filter(Boolean),
  );
}

export function authorizeReasoningEgress(args: ReasoningEgressRequest): ReasoningEgressDenial | null {
  const mode = policyMode(args.policy);
  if (mode === 'enabled') return null;
  if (mode === 'invalid') return invalidPolicyDenial(args);
  if (mode === 'disabled') return disabledDenial(args);

  const policy = isReasoningPolicy(args.policy) ? args.policy : {};
  if (routeIsDeniedByFlag(policy, args.routeKind)) return allowlistDenial(args);

  const normalizedBaseUrl = args.resolvedBaseUrl
    ? normalizeReasoningBaseUrl(args.resolvedBaseUrl)
    : null;
  if (!normalizedBaseUrl || !allowedBaseUrlSet(policy).has(normalizedBaseUrl)) {
    return allowlistDenial(args);
  }

  if (
    args.model !== undefined
    && !allowedModelSet(policy, args.provider).has(normalizeReasoningModelId(args.provider, args.model))
  ) {
    return allowlistDenial(args);
  }

  return null;
}

export function sendReasoningEgressDenial(res: Response, denial: ReasoningEgressDenial): void {
  res.status(denial.status).json({
    error: {
      code: denial.code,
      message: denial.message,
      data: denial.data,
    },
  });
}
