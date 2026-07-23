import type { ChatSessionMode } from '@open-design/contracts';

export const DEFAULT_ROUTER_PLUGIN_ID = 'od-default';

type ResolvedSurface = 'deck' | 'image' | 'video' | 'audio' | null;

const FORM_ANSWERS_HEADER_RE = /^\s*\[form answers\s+(?:\u2014|-)\s*([^\]\r\n]+)\]/i;

export interface DefaultRouterContextInput {
  sessionMode: ChatSessionMode;
  resolvedSurface: ResolvedSurface;
  isInitialConversationTurn: boolean;
  submittedFormId?: string | null | undefined;
}

/**
 * Read the host's leading form-answer marker without scanning arbitrary prose.
 * The same parser drives both prompt transition wording and default-router
 * lifecycle, so the router cannot disappear on the answer turn it owns.
 */
export function submittedFormIdFromPrompt(
  prompt: string | null | undefined,
): string | null {
  if (typeof prompt !== 'string') return null;
  const match = FORM_ANSWERS_HEADER_RE.exec(prompt);
  if (!match) return null;
  const rawFormId = (match[1] || 'form').trim() || 'form';
  return rawFormId.replace(/[^\w.-]/g, '') || 'form';
}

/**
 * The hidden default router is conversation bootstrap context, not a standing
 * skill. Keep it on the first turn and on the direct answer to a form it may
 * emit; after that, conversation history carries the resolved route.
 */
export function shouldIncludeDefaultRouterSkill({
  sessionMode,
  resolvedSurface,
  isInitialConversationTurn,
  submittedFormId,
}: DefaultRouterContextInput): boolean {
  if (sessionMode === 'chat') return false;
  if (resolvedSurface !== null) return false;
  if (isInitialConversationTurn) return true;
  const normalizedFormId = submittedFormId?.trim().toLowerCase();
  return normalizedFormId === 'task-type' || normalizedFormId === 'discovery';
}

/**
 * Ask stays light by excluding craft attached only by an automatic scenario.
 * Explicit skills and future design-system craft are tracked separately and
 * remain available as requested context.
 */
export function shouldIncludeAutomaticScenarioCraft(
  sessionMode: ChatSessionMode,
): boolean {
  return sessionMode !== 'chat';
}
