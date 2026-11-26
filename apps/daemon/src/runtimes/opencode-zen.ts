// OpenCode Zen rejects outdated OpenCode clients from its free tier with an
// HTTP 426-style reply: "OpenCode 1.18.0 or newer is required to use the free
// tier." The text comes from the upstream service, not from OpenDesign, so the
// daemon recognizes it and replaces the opaque string with actionable guidance.
// (#9627)

import type { ConnectionTestErrorCode } from '@open-design/contracts';

const OPENCODE_ZEN_OUTDATED_CLIENT_RE =
  /OpenCode\s+(?:v?(\d+(?:\.\d+){1,2})\s+)?or newer is required to use the free tier/iu;

export function detectOpenCodeZenOutdatedClient(
  text: string,
): { requiredVersion: string | null } | null {
  const match = OPENCODE_ZEN_OUTDATED_CLIENT_RE.exec(text);
  if (!match) return null;
  return { requiredVersion: match[1] ?? null };
}

export function openCodeZenOutdatedDetail(
  agentId: string,
  requiredVersion: string | null,
): string {
  const versionClause = requiredVersion ? ` (it asks for ${requiredVersion} or newer)` : '';
  // Do not suggest `npm i -g opencode-ai@latest`: that npm tag still ships an
  // OpenCode 1.x build, which Zen's free tier also rejects. Upstream points
  // to OpenCode 2, whose CLI flags this daemon does not drive yet, so the one
  // remedy that works today is a model from a user-configured provider.
  if (agentId === 'byok-opencode') {
    return `OpenCode Zen's free tier rejected the OpenCode runtime OpenDesign launched for BYOK OpenCode${versionClause}. By default this is the runtime bundled with OpenDesign, so updating OpenCode Desktop does not change it. Set up an API provider with your own API key in Settings and choose one of its models instead.`;
  }
  return `OpenCode Zen's free tier rejected this OpenCode CLI${versionClause}. Choose a model from a provider configured in OpenCode with your own API key, then retry the OpenCode connection test.`;
}

// Stable code the web UI keys localized guidance on; `detail` stays English.
export function openCodeZenOutdatedErrorCode(
  agentId: 'opencode' | 'byok-opencode',
): ConnectionTestErrorCode {
  return agentId === 'byok-opencode'
    ? 'opencode_zen_outdated_byok'
    : 'opencode_zen_outdated_cli';
}
