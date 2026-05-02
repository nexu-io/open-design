import type { AppConfig } from '../types';
import litellmData from './litellm-models.json';

// Per-model output cap, used to default `max_tokens` so users on supported
// models don't have to find Settings to avoid mid-stream truncation.
//
// Source of truth: vendored slice of BerriAI/litellm's
// model_prices_and_context_window.json (MIT). Regenerate with:
//   node --experimental-strip-types scripts/sync-litellm-models.ts
//
// Anything LiteLLM doesn't track (or where its value is wrong for our
// usage) goes in OVERRIDES; unknown models fall through to FALLBACK.
export const FALLBACK_MAX_TOKENS = 8192;

const LITELLM_MODELS = litellmData.models as Record<string, number>;

const OVERRIDES: Record<string, number> = {
  // LiteLLM lists MiMo via OpenRouter and Novita aliases (16k / 32k) but
  // not the canonical `mimo-v2.5-pro` id we hand to Xiaomi's direct API.
  // 32k matches what issue #29 reports as the working ceiling.
  'mimo-v2.5-pro': 32768,
};

export function modelMaxTokensDefault(model: string): number {
  return OVERRIDES[model] ?? LITELLM_MODELS[model] ?? FALLBACK_MAX_TOKENS;
}

export function effectiveMaxTokens(cfg: Pick<AppConfig, 'maxTokens' | 'model'>): number {
  return cfg.maxTokens ?? modelMaxTokensDefault(cfg.model);
}
