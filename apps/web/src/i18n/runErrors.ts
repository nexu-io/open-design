import type { Dict } from './types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

const LEGACY_AGENT_EMPTY_OUTPUT_EN =
  'Agent completed without producing any output. The model or provider may have returned an empty response — check the agent logs for upstream errors.';

const KNOWN_RUN_FAILURE_KEYS: Record<string, keyof Dict> = {
  [LEGACY_AGENT_EMPTY_OUTPUT_EN]: 'routines.errorAgentEmptyOutput',
};

export function localizeRunFailureReason(
  reason: string | null | undefined,
  t: TranslateFn,
): string | null {
  if (!reason?.trim()) return null;
  const trimmed = reason.trim();
  const key = KNOWN_RUN_FAILURE_KEYS[trimmed];
  return key ? t(key) : trimmed;
}
