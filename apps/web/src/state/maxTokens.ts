import type { AppConfig } from '../types';

// Hand-maintained per-model output cap. Keep in sync with SUGGESTED_MODELS
// in SettingsDialog.tsx and any new providers added to KNOWN_PROVIDERS.
//
// Sources:
// - claude-* 4.5: Anthropic model cards (64k default, beta extends further)
// - mimo-v2.5-pro: matches what issue #29 reports as the working ceiling
//
// Custom models or unknown ids fall through to FALLBACK_MAX_TOKENS so the
// previous hardcoded behavior is preserved for anyone we don't recognize.
export const FALLBACK_MAX_TOKENS = 8192;

const MODEL_MAX_TOKENS: Record<string, number> = {
  'claude-opus-4-5': 64000,
  'claude-sonnet-4-5': 64000,
  'claude-haiku-4-5': 64000,
  'mimo-v2.5-pro': 32768,
};

export function modelMaxTokensDefault(model: string): number {
  return MODEL_MAX_TOKENS[model] ?? FALLBACK_MAX_TOKENS;
}

// Effective cap to send upstream. User override (cfg.maxTokens) wins; if
// unset, we use the per-model default so the average user never has to
// touch Settings to avoid a mid-stream truncation.
export function effectiveMaxTokens(cfg: Pick<AppConfig, 'maxTokens' | 'model'>): number {
  return cfg.maxTokens ?? modelMaxTokensDefault(cfg.model);
}
