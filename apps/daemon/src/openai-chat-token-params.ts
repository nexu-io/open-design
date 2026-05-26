export function usesMaxCompletionTokens(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  // Keep the generic OpenAI-compatible path on max_tokens by default. Only
  // switch the newer GPT-5/o-series chat-completions families that reject the
  // legacy field.
  return (
    /^gpt-5(?:[.-]|$)/.test(normalized) ||
    /^o1(?:[.-]|$)/.test(normalized) ||
    /^o3(?:[.-]|$)/.test(normalized) ||
    /^o4(?:[.-]|$)/.test(normalized)
  );
}

export function buildOpenAIChatTokenParam(
  model: string,
  maxTokens: number,
): { max_tokens: number } | { max_completion_tokens: number } {
  if (usesMaxCompletionTokens(model)) {
    return { max_completion_tokens: maxTokens };
  }
  return { max_tokens: maxTokens };
}

export function buildLegacyMaxTokensParam(
  maxTokens: number,
): { max_tokens: number } {
  return { max_tokens: maxTokens };
}

export function buildMaxCompletionTokensParam(
  maxTokens: number,
): { max_completion_tokens: number } {
  return { max_completion_tokens: maxTokens };
}

export function isUnsupportedMaxTokensError(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes('unsupported parameter') &&
    normalized.includes('max_tokens') &&
    normalized.includes('max_completion_tokens')
  );
}
