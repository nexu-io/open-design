// Shared agent-install helpers.
//
// Extracted out of `components/SettingsDialog.tsx` so the onboarding flow can
// reuse the same agent metadata when rendering install cards in the
// "no agents detected" empty state (see issue #4662). Keeping these in one
// place prevents drift between Settings and Onboarding when the supported
// agent roster grows.
//
// These helpers are deliberately pure (no React, no i18n, no analytics): the
// onboarding panel and the settings panel both wrap them with their own
// click-tracking and i18n strings. Adding a new agent only needs an entry in
// `AGENT_SHORT_DESCRIPTIONS` here plus the same agent record in
// `apps/daemon` agent registration.

import type { AgentInfo } from '../types';

/**
 * Accept an install/docs URL only when it is a syntactically valid HTTPS URL.
 * The unavailable-agent cards render external links; rejecting non-HTTPS keeps
 * us from following misconfigured `http://` or `javascript:` URLs out of a
 * compromised agent registration into a sensitive-permissions browser context.
 */
export function sanitizeHttpsUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * One-line descriptions shown next to the agent name on install cards.
 *
 * Kept terse on purpose — the install card is dense (icon + name + docs +
 * install) and long copy crowds the right-aligned action buttons. Translation
 * is intentionally not wired here: these are vendor-marketing-style labels
 * that change rarely and read identically across locales for the supported
 * CLI brands.
 */
export const AGENT_SHORT_DESCRIPTIONS: Record<string, string> = {
  claude: 'Anthropic official CLI',
  codex: 'OpenAI official CLI',
  'cursor-agent': 'Cursor command line',
  gemini: 'Google official CLI',
  opencode: 'Open-source agent CLI',
  qwen: 'Qwen coding CLI',
  copilot: 'GitHub coding CLI',
  devin: 'Cognition terminal CLI',
  kimi: 'Moonshot Kimi CLI',
  qoder: 'Alibaba coding CLI',
  pi: 'Inflection chat CLI',
  kiro: 'Kiro agent CLI',
  kilo: 'Kilo Code CLI',
  vibe: 'Mistral open-source CLI',
  deepseek: 'DeepSeek terminal UI',
  hermes: 'ACP agent CLI',
  'grok-build': 'xAI coding CLI',
  reasonix: 'DeepSeek native coding CLI',
};

/**
 * Resolve the user-visible label for an agent. AMR is a special case — its
 * registered name in the daemon is internal (`amr`), but the onboarding and
 * settings UIs display the user-marketing name "Open Design AMR".
 */
export function displayAgentName(agent: Pick<AgentInfo, 'id' | 'name'>): string {
  return agent.id === 'amr' ? 'Open Design AMR' : agent.name;
}
